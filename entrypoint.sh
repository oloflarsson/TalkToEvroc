#!/bin/bash
# Entrypoint script for TalkToEvroc Docker container
# Starts Piper TTS HTTP server and main application

set -e

# Start Piper TTS (sources script, sets PIPER_PID)
source ./start-piper.sh

# Cleanup on exit
trap "kill $PIPER_PID 2>/dev/null || true" EXIT

# Docker must bind to 0.0.0.0 for port forwarding to work.
# Local dev uses 127.0.0.1 by default (see server.py) for security.
export HOST=${HOST:-0.0.0.0}

echo "Starting main application..."

# Start main application (runs in foreground)
exec python server.py
