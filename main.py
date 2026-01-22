"""TalkToEvroc Voice Bot - Swedish chatbot using Evroc services.

A Pipecat voice bot using:
- STT: Evroc KBLab Whisper (Swedish)
- LLM: Evroc GPT-OSS-120B
- TTS: Piper with Swedish NST voice (local)
- VAD: Silero + Smart Turn v3

WebSocket transport for production reliability (works through firewalls/NAT).
"""

import os
import re
from contextlib import asynccontextmanager
from pathlib import Path

import aiohttp
import emoji
import uvicorn
from fastapi import FastAPI, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.frames.frames import LLMRunFrame
from pipecat.services.piper.tts import PiperTTSService
from pipecat.services.openai.stt import OpenAISTTService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.openai.base_llm import BaseOpenAILLMService
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.turns.user_stop import TurnAnalyzerUserTurnStopStrategy
from pipecat.turns.user_turn_strategies import UserTurnStrategies
from pipecat.processors.frameworks.rtvi import RTVIConfig, RTVIObserver, RTVIProcessor
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketTransport,
    FastAPIWebsocketParams,
)
from pipecat.serializers.protobuf import ProtobufFrameSerializer
from pipecat.transcriptions.language import Language
from pipecat.processors.text_transformer import StatelessTextTransformer

# =============================================================================
# Configuration
# =============================================================================

# API keys and URLs
EVROC_API_KEY_STT = os.environ.get("EVROC_API_KEY_STT", "")
EVROC_API_KEY_LLM = os.environ.get("EVROC_API_KEY_LLM", "")
EVROC_BASE_URL = "https://models.think.cloud.evroc.com/v1"
PIPER_TTS_URL = "http://127.0.0.1:5000"

# Static files path - check both development and production locations
STATIC_DIR = Path(__file__).parent / "static"
if not STATIC_DIR.exists():
    STATIC_DIR = Path(__file__).parent / "client" / "dist"

# =============================================================================
# Pronunciation Fixes for Swedish TTS
# =============================================================================

# Maps mispronounced words to phonetic Swedish
# Handles: word boundaries, hyphenated compounds (AI-kluster, Realtids-AI), case-insensitive
PRONUNCIATION_FIXES: dict[str, str] = {
    "AI": "äj-aj",
    "GPU": "g p u",
    "API": "a p i",
    "B200": "b två hundra",
    "H100": "h ett hundra",
    "NVIDIA": "envidia",
    "Compute": "kompjut",
    "Storage": "stårridsch",
    "Kubernetes": "kubernätis",
    "Serverless": "sörverlöss",
    "hyperscale": "hajperskäjl",
    "demo": "deemå",
    "agent": "äggennt",
    "Evrocs": "Evrocks",
    "Evroc": "Evrock",
}

PRONUNCIATION_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(rf"(?:(?<=\w)(-)|\b){re.escape(word)}(?:-(\w+)|\b)", re.IGNORECASE), repl)
    for word, repl in PRONUNCIATION_FIXES.items()
]


def fix_pronunciation(text: str) -> str:
    """Fix TTS pronunciation: strip emojis and fix mispronounced words."""
    # Strip emojis (Piper can't handle them)
    text = emoji.replace_emoji(text, "")
    # Fix pronunciation of specific words
    for pattern, replacement in PRONUNCIATION_PATTERNS:
        def replace_fn(m, repl=replacement):
            prefix = m.group(1) or ""
            suffix = m.group(2)
            return f"{prefix}{repl}-{suffix}" if suffix else f"{prefix}{repl}"
        text = pattern.sub(replace_fn, text)
    return text

# =============================================================================
# System Prompt
# =============================================================================

SYSTEM_PROMPT = """
Du är en röstassistent i en teknisk demo som visar vad Evrocs molnplattform kan göra.
Detta är INTE en officiell Evroc-produkt, utan en demo byggd av en tredjepartsutvecklare
som körs på Evrocs infrastruktur för att visa plattformens kapacitet.

DIN PERSONLIGHET:
- Vänlig, avslappnad och nyfiken.
- Du ÄLSKAR att prata om Evroc och tekniken bakom denna demo.
- Du försöker naturligt styra samtalet mot Evroc, men är öppen för att prata om annat också.
- Du är stolt över att köras på europeisk infrastruktur.

VIKTIGA REGLER FÖR SVARSLÄNGD:
- Var MYCKET kortfattad i vanlig konversation.
- Korta frågor får korta svar. Ja, nej, eller en mening räcker oftast.
- Om användaren frågar om dig, Evroc eller tekniken, berätta gärna mer.
- Tänk telefonsamtal, inte föreläsning.

ÖVRIGA REGLER:
- Undvik specialtecken, din output blir tal.
- Börja med en kort hälsning och nämn att du är en demo på Evrocs plattform.

OM DENNA DEMO:
- Realtids röstkonversation som körs helt på Evrocs infrastruktur i Stockholm.
- LLM: GPT-OSS-120B, en öppen AI-modell på Evrocs Think Models-plattform.
- Tal-till-text: KBLab kb-whisper-large, svensk Whisper-modell på Evroc.
- Text-till-tal: Piper med svenska NST-rösten från KB-labb.

OM EVROC:
- Bygger Europas första äkta hyperscale-moln.
- Huvudkontor i Stockholm, utvecklingskontor i Sophia-Antipolis, Frankrike.
- Helt europeiskägt, skyddar data från utländska myndigheters åtkomst.
- All data inom EU med full GDPR-efterlevnad.
- Fokus på hållbarhet och förnybar energi.
- Mål: 10 hyperscale-datacenter till 2030.

EVROCS TJÄNSTER:
- Cloud: Compute, Storage, Kubernetes, Serverless, IAM, Databaser.
- AI: NVIDIA B200 och H100 GPU-kluster, Think Studio, Think Models.

VARFÖR EVROC:
- Europeisk datasuveränitet, inte utländska lagar.
- Över 80 procent av Europas molnmarknad är utländsk, Evroc ändrar det.

Svara på svenska om inte användaren pratar annat språk.
""".strip()

# =============================================================================
# FastAPI Application
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle FastAPI startup and shutdown."""
    logger.info("Starting TalkToEvroc server...")
    yield
    logger.info("Shutting down TalkToEvroc server...")


app = FastAPI(lifespan=lifespan, title="TalkToEvroc")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def serve_index():
    """Serve the main client page."""
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"error": "Client not built. Run 'bun run build' in client/ directory."}


@app.post("/connect")
async def connect(request: Request):
    """Return the WebSocket URL for the client to connect to."""
    host = request.headers.get("host", "localhost:7860")
    scheme = "wss" if request.url.scheme == "https" else "ws"
    forwarded_proto = request.headers.get("x-forwarded-proto")
    if forwarded_proto:
        scheme = "wss" if forwarded_proto == "https" else "ws"
    ws_url = f"{scheme}://{host}/ws"
    logger.info(f"Client requesting connection, returning: {ws_url}")
    return {"ws_url": ws_url}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Handle WebSocket connections for voice bot."""
    await websocket.accept()
    logger.info("WebSocket connection accepted")
    try:
        await run_bot(websocket)
    except Exception as e:
        logger.error(f"Exception in WebSocket handler: {e}")
    finally:
        logger.info("WebSocket connection closed")


# Mount static files after routes (so routes take precedence)
if STATIC_DIR.exists() and (STATIC_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

# =============================================================================
# Voice Bot Pipeline
# =============================================================================

async def run_bot(websocket: WebSocket):
    """Run the voice bot pipeline with WebSocket transport."""
    logger.info("Starting WebSocket bot pipeline")

    # Create WebSocket transport with Protobuf serialization
    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=0.2)),
            serializer=ProtobufFrameSerializer(),
        ),
    )

    # Speech-to-Text service - Evroc KBLab Whisper (Swedish language)
    # Prompt helps Whisper recognize domain-specific terms like "Evroc"
    stt = OpenAISTTService(
        api_key=EVROC_API_KEY_STT,
        base_url=EVROC_BASE_URL,
        model="KBLab/kb-whisper-large",
        language=Language.SV,
        prompt="Evroc, Evrocs, KBLab, NVIDIA, GPU, B200, H100, hyperscale",
    )

    # Create aiohttp session for Piper TTS (must be created in async context)
    aiohttp_session = aiohttp.ClientSession()

    # Text-to-Speech service - Piper with Swedish NST voice from KB-labb (local, no API key)
    # sv_SE-nst-medium: Swedish voice trained on NST dataset, native 22050 Hz
    # https://kb-labb.github.io/posts/2023-05-24-swedish-text-to-speech/
    # We tell Pipecat the native rate and let it resample to match audio_out_sample_rate
    tts = PiperTTSService(
        base_url=PIPER_TTS_URL,
        aiohttp_session=aiohttp_session,
        sample_rate=22050,  # NST voice native sample rate (Pipecat will resample)
    )

    # LLM service - Evroc GPT-OSS-120B (OpenAI-compatible)
    # Using lowest reasoning effort for faster responses
    llm = OpenAILLMService(
        api_key=EVROC_API_KEY_LLM,
        base_url=EVROC_BASE_URL,
        model="openai/gpt-oss-120b",
        params=BaseOpenAILLMService.InputParams(extra={"reasoning_effort": "low"}),
    )

    # Create LLM context with system prompt
    context = LLMContext([{"role": "system", "content": SYSTEM_PROMPT}])

    # Create context aggregator pair with Smart Turn Detection
    # This enables ML-powered turn detection for natural conversation flow
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            user_turn_strategies=UserTurnStrategies(
                stop=[TurnAnalyzerUserTurnStopStrategy(
                    turn_analyzer=LocalSmartTurnAnalyzerV3()
                )]
            ),
        ),
    )
    logger.info("Smart Turn Detection v3 enabled")

    # RTVI processor for Pipecat client UI communication
    rtvi = RTVIProcessor(config=RTVIConfig(config=[]))

    # Text transformer to fix TTS pronunciation issues
    pronunciation_fixer = StatelessTextTransformer(transform_fn=fix_pronunciation)

    # Build the pipeline with Smart Turn and RTVI
    # pronunciation_fixer sits between LLM and TTS to fix mispronounced words
    pipeline = Pipeline([
        transport.input(),
        stt,
        user_aggregator,
        rtvi,
        llm,
        pronunciation_fixer,
        tts,
        transport.output(),
        assistant_aggregator,
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,  # Standard WebSocket/WebRTC rate (Pipecat resamples from 22050)
        ),
        observers=[RTVIObserver(rtvi)],
    )

    @rtvi.event_handler("on_client_ready")
    async def on_client_ready(rtvi):
        logger.info("Pipecat client ready")
        await rtvi.set_bot_ready()
        # Kick off the conversation - let bot introduce itself
        await task.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("WebSocket client connected")

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("WebSocket client disconnected")
        await task.cancel()

    runner = PipelineRunner(handle_sigint=False)
    try:
        await runner.run(task)
    finally:
        # Cleanup aiohttp session
        await aiohttp_session.close()

# =============================================================================
# Entry Point
# =============================================================================

if __name__ == "__main__":
    # Default to localhost for security (local dev). Docker sets HOST=0.0.0.0 in entrypoint.sh
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "7860"))
    logger.info(f"Starting server on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
