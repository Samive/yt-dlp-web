FROM python:3.14-slim

# Install ffmpeg for merging video+audio streams
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
RUN pip install --no-cache-dir yt-dlp fastapi "uvicorn[standard]" httpx

# Copy web app
COPY web/backend ./web/backend
COPY web/frontend ./web/frontend

RUN mkdir -p /app/web/backend/downloads

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "web.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
