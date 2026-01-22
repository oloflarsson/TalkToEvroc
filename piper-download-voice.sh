#!/usr/bin/env bash
# Download Piper Swedish NST voice model (KB-labb)
#
# Usage:
#   ./piper-download-voice.sh [target-dir]
#
# Default target: ./piper-voices/

set -e

TARGET_DIR="${1:-./piper-voices}"
VOICE_FILE="sv_SE-nst-medium.onnx"
VOICE_MODEL="$TARGET_DIR/$VOICE_FILE"

if [ -f "$VOICE_MODEL" ]; then
    echo "Voice model already exists: $VOICE_MODEL"
    exit 0
fi

echo "Downloading Piper Swedish voice model (KB-labb NST)..."
mkdir -p "$TARGET_DIR"

curl -sL -o "$VOICE_MODEL" \
    "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/sv/sv_SE/nst/medium/sv_SE-nst-medium.onnx"
curl -sL -o "$VOICE_MODEL.json" \
    "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/sv/sv_SE/nst/medium/sv_SE-nst-medium.onnx.json"

echo "Downloaded: $VOICE_MODEL"
