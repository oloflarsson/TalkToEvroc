"""FastAPI WebSocket Server for TalkToEvroc Voice Bot.

Serves both the static frontend and WebSocket endpoint for voice interaction.
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from loguru import logger

from bot import run_bot_websocket


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle FastAPI startup and shutdown."""
    logger.info("Starting TalkToEvroc server...")
    yield
    logger.info("Shutting down TalkToEvroc server...")


app = FastAPI(lifespan=lifespan, title="TalkToEvroc")

# Configure CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Static files path - check both development and production locations
STATIC_DIR = Path(__file__).parent / "static"
if not STATIC_DIR.exists():
    # Fallback to parent directory for local dev with client folder
    STATIC_DIR = Path(__file__).parent.parent / "client" / "dist"


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
    # Determine the WebSocket URL based on the request
    host = request.headers.get("host", "localhost:7860")
    scheme = "wss" if request.url.scheme == "https" else "ws"
    
    # Check for forwarded headers (behind reverse proxy like Traefik)
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
        await run_bot_websocket(websocket)
    except Exception as e:
        logger.error(f"Exception in WebSocket handler: {e}")
    finally:
        logger.info("WebSocket connection closed")


# Mount static files after routes (so routes take precedence)
if STATIC_DIR.exists():
    # Mount the assets directory for JS/CSS bundles
    if (STATIC_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


def main():
    """Run the server."""
    # Default to localhost for security (local dev). Docker sets HOST=0.0.0.0 in entrypoint.sh
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "7860"))
    
    logger.info(f"Starting server on {host}:{port}")
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()
