FROM python:3.14.3-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System packages
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        nodejs \
        npm \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN adduser --disabled-password --gecos "" appuser \
    && mkdir -p /app/web/backend/downloads \
    && mkdir -p /home/appuser/.config/yt-dlp \
    && chown -R appuser:appuser /app /home/appuser

# Copy dependency file first for better build cache
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt \
    && pip install --no-cache-dir -U "yt-dlp[default]"

# Copy yt-dlp config
COPY yt-dlp.conf /home/appuser/.config/yt-dlp/config

# Copy app
COPY web /app/web

RUN chown -R appuser:appuser /app/web/backend/downloads /home/appuser/.config/yt-dlp

USER appuser

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "web.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]