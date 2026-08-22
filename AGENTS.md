# What?

- A Pipecat voice bot
- Port 7860 (Pipecat default)
- Local: http://localhost:7860
- Prod: https://talktoevroc.olof.tech
- Simple Swedish chatbot using Evroc services
- Deployed as a single container image; `commands/talktoevroc-release` builds and pushes it

## Services

- **STT**: Evroc KBLab Whisper (`KBLab/kb-whisper-large`)
- **LLM**: Evroc GPT-OSS-120B (`openai/gpt-oss-120b`)
- **TTS**: Piper (`sv_SE-nst-medium`) - Swedish voice by KB-labb (local, no API key required)

## Network Binding

- **Local dev**: Binds to `127.0.0.1` (localhost only) for security
- **Docker/Prod**: Binds to `0.0.0.0` (all interfaces) for port forwarding

Set `HOST` env var to override (e.g., `HOST=0.0.0.0` for network access during local dev).

## Environment Variables (Required)

```bash
export EVROC_API_KEY="..."  # Used for both STT and LLM
```
