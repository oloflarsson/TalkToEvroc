# What?

- A Pipecat voice bot
- Port 7860 (Pipecat default)
- Local: http://localhost:7860
- Prod: https://talktoevroc.olof.tech
- Simple Swedish chatbot using Evroc services
- Single instance Kamal deployment

## Services

- **STT**: Evroc KBLab Whisper (`KBLab/kb-whisper-large`)
- **LLM**: Evroc GPT-OSS-120B (`openai/gpt-oss-120b`)
- **TTS**: Piper (`sv_SE-nst-medium`) - Swedish voice by KB-labb (local, no API key required)

## Environment Variables (Required)

```bash
export EVROC_API_KEY_STT="..."  # Speech-to-Text
export EVROC_API_KEY_LLM="..."  # LLM
```
