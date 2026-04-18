# What?

- A Pipecat voice bot
- Port 7860 (Pipecat default)
- Local: http://localhost:7860
- Prod: https://talktoevroc.olof.tech
- Simple Swedish chatbot using Berget AI or Evroc services
- Single instance Kamal deployment

## Services

- **STT**: KBLab Whisper (`KBLab/kb-whisper-large`)
- **LLM**: GPT-OSS-120B (`openai/gpt-oss-120b`)
- **TTS**: Piper (`sv_SE-nst-medium`) - Swedish voice by KB-labb (local, no API key required)

## Network Binding

- **Local dev**: Binds to `127.0.0.1` (localhost only) for security
- **Docker/Prod**: Binds to `0.0.0.0` (all interfaces) for port forwarding

Set `HOST` env var to override (e.g., `HOST=0.0.0.0` for network access during local dev).

## Environment Variables (Required)

Set **either** `BERGET_API_KEY` or `EVROC_API_KEY`:

```bash
export BERGET_API_KEY="..."  # Preferred - Berget AI (api.berget.ai/v1)
# OR
export EVROC_API_KEY="..."   # Legacy - Evroc (models.think.cloud.evroc.com/v1)
```

The bot will automatically use whichever API key is configured.