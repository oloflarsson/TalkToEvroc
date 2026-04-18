#!/usr/bin/env bash
# Start Piper TTS HTTP server
#
# This script is designed to be SOURCED, not executed.
# It starts Piper in the background and sets PIPER_PID.
#
# Must be run from project root directory.
#
# Usage:
#   source ./piper-start.sh
#   # Now PIPER_PID is set and Piper is running
#
# On failure: returns 1 (does not exit, since we're sourced)

VOICE_MODEL="./piper-voices/sv_SE-nst-medium.onnx"

# Download voice model if missing
if [ ! -f "$VOICE_MODEL" ]; then
    ./piper-download-voice.sh || return 1
fi

# Speech speed factor (1.5 = 50% faster)
# Piper uses length_scale where lower = faster, so we invert: 1/1.5 ≈ 0.67
SPEED_FACTOR=1.5
LENGTH_SCALE=$(LC_ALL=C awk "BEGIN {printf \"%.3f\", 1 / $SPEED_FACTOR}")

echo "Starting Piper TTS (${SPEED_FACTOR}x speed)..." >&2

uv run python -m piper.http_server \
    --host 127.0.0.1 \
    --port 5000 \
    --length-scale "$LENGTH_SCALE" \
    -m "$VOICE_MODEL" >&2 &

PIPER_PID=$!

# Wait for Piper to be ready
for i in {1..30}; do
    if curl -sf http://127.0.0.1:5000/voices > /dev/null 2>&1; then
        echo "Piper TTS ready!" >&2
        return 0 2>/dev/null || true
    fi
    if [ $i -eq 30 ]; then
        echo "ERROR: Piper TTS failed to start" >&2
        kill $PIPER_PID 2>/dev/null || true
        PIPER_PID=""
        return 1 2>/dev/null || true
    fi
    sleep 0.5
done
