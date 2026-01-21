#!/bin/bash
# Entrypoint script for TalkToEvroc
# Starts Piper TTS HTTP server and main application

set -e

# Piper voice model path (set in Dockerfile)
PIPER_MODEL="${PIPER_VOICE_MODEL:-/app/piper-voices/sv_SE-lisa-medium.onnx}"

# Speech speed factor (1.3 = 30% faster)
# Piper uses length_scale where lower = faster, so we invert: 1/1.3 ≈ 0.77
SPEED_FACTOR=1.3
LENGTH_SCALE=$(awk "BEGIN {printf \"%.3f\", 1 / $SPEED_FACTOR}")

echo "Starting Piper TTS HTTP server..."
echo "Voice model: $PIPER_MODEL"
echo "Speed factor: ${SPEED_FACTOR}x (length_scale: $LENGTH_SCALE)"

# Start Piper HTTP server in background
# Listens on 127.0.0.1:5000 (internal only)
python -m piper.http_server \
  --host 127.0.0.1 \
  --port 5000 \
  --length-scale "$LENGTH_SCALE" \
  -m "$PIPER_MODEL" &

PIPER_PID=$!

# Wait for Piper to be ready
echo "Waiting for Piper TTS server to be ready..."
for i in {1..30}; do
  if curl -sf http://127.0.0.1:5000/voices > /dev/null 2>&1; then
    echo "Piper TTS server is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "ERROR: Piper TTS server failed to start"
    exit 1
  fi
  sleep 0.5
done

# Trap to cleanup background process on exit
cleanup() {
  echo "Shutting down..."
  kill $PIPER_PID 2>/dev/null || true
  wait $PIPER_PID 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting main application..."

# Start main application (runs in foreground)
exec python server.py
