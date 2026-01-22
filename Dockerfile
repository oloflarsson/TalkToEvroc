# TalkToEvroc - Pipecat Voice Bot
#
# Uses pre-built frontend (built locally with Bun, uses local context)
# Custom base because dailyco/pipecat-base only supports arm64, not amd64
#
# Based on: https://github.com/daily-co/pipecat-cloud-images/blob/main/pipecat-base/Dockerfile

FROM ghcr.io/astral-sh/uv:python3.12-trixie

WORKDIR /app

# Install system dependencies (matching pipecat-base)
# Added espeak-ng and curl for Piper TTS
RUN apt update && apt install -y \
    ffmpeg \
    libopenblas-dev \
    libresample1 \
    libresample-dev \
    libgl1 \
    libglib2.0-0 \
    espeak-ng \
    curl \
    && apt clean

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy from the cache instead of linking since it's a mounted volume
ENV UV_LINK_MODE=copy

# Install the project's dependencies using the lockfile and settings
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev

# Pre-download NLTK data to avoid runtime download issues
RUN /app/.venv/bin/python -m nltk.downloader punkt_tab -d /usr/local/share/nltk_data && \
    /app/.venv/bin/python -c "import nltk; nltk.data.find('tokenizers/punkt_tab')"

# Set up Krisp symlink in the virtual environment's site-packages
RUN VENV_SITE_PACKAGES=$(/app/.venv/bin/python -c "import site; print(site.getsitepackages()[0])") && \
    ln -s /krisp/python/pipecat_ai_krisp ${VENV_SITE_PACKAGES}/pipecat_ai_krisp && \
    echo "/opt/krisp_viva/krisp_audio" > ${VENV_SITE_PACKAGES}/krisp_viva.pth

# Copy voice model download script and download the model
COPY piper-download-voice.sh /app/piper-download-voice.sh
RUN chmod +x /app/piper-download-voice.sh && ./piper-download-voice.sh

# Copy pre-built frontend (built locally with `bun run build` in client/)
COPY client/dist/ /app/static/

# Copy application code
COPY app/ .

# Copy startup scripts
COPY piper-start.sh /app/piper-start.sh
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/*.sh

# Place executables in the environment at the front of the path
ENV PATH="/app/.venv/bin:$PATH"

# Reset the entrypoint, don't invoke `uv`
ENTRYPOINT []

EXPOSE 7860

# Run entrypoint script (starts Piper HTTP server + main app)
CMD ["/app/entrypoint.sh"]
