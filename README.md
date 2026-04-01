# yt-dlp Web UI

A beautiful, self-hosted web application for downloading YouTube (and 1000+ other sites) videos — powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp).

![yt-dlp Web UI](https://img.shields.io/badge/yt--dlp-web%20ui-6366f1?style=flat-square)
![Docker](https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker)
![Python](https://img.shields.io/badge/python-3.12-3776AB?style=flat-square&logo=python)

---

## Features

- Paste any YouTube (or supported site) URL and fetch video info instantly
- View thumbnail, title, uploader, duration, views, likes, and upload date
- Select from all available formats grouped by quality (Video+Audio, Video only, Audio only)
- Highest quality format pre-selected automatically
- Live download progress with percentage, speed, and ETA
- Cancel download at any time
- Clean dark UI with animated progress bar

---

## Quick Start with Docker

### Pull and run from Docker Hub

```bash
docker pull YOUR_DOCKERHUB_USERNAME/yt-dlp-web:latest
docker run -d -p 8000:8000 --name yt-dlp-web YOUR_DOCKERHUB_USERNAME/yt-dlp-web:latest
```

Then open **http://localhost:8000** in your browser.

### Persist downloads to your machine

```bash
docker run -d \
  -p 8000:8000 \
  -v $(pwd)/downloads:/app/web/backend/downloads \
  --name yt-dlp-web \
  YOUR_DOCKERHUB_USERNAME/yt-dlp-web:latest
```

### Stop / remove the container

```bash
docker stop yt-dlp-web
docker rm yt-dlp-web
```

---

## Build from Source

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed

### Build the image

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/yt-dlp-web.git
cd yt-dlp-web
docker build -t yt-dlp-web .
```

### Run the image

```bash
docker run -d -p 8000:8000 --name yt-dlp-web yt-dlp-web
```

Open **http://localhost:8000**.

---

## Run without Docker (Development)

### Prerequisites

- Python 3.10+
- ffmpeg installed and on PATH ([download](https://ffmpeg.org/download.html))

### Setup

```bash
# Install yt-dlp from source
pip install -e ".[default]"

# Install backend dependencies
pip install fastapi "uvicorn[standard]" httpx

# Start the server
python -m uvicorn web.backend.main:app --reload --port 8000
```

Open **http://localhost:8000**.

---

## Usage Guide

1. **Paste a URL** — Paste any YouTube (or supported site) link into the input field and click **Fetch**
2. **Review video info** — Thumbnail, title, uploader, duration, views, likes, and upload date are shown
3. **Select a format** — Choose from the dropdown (highest quality is pre-selected)
4. **Download** — Click the **Download** button and watch the live progress bar
5. **Cancel** — Click **Cancel** at any time to stop the download

### YouTube authentication (optional)

Some videos require sign-in. Export your cookies using the [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) browser extension and mount them:

```bash
docker run -d \
  -p 8000:8000 \
  -v $(pwd)/cookies.txt:/app/web/backend/cookies.txt:ro \
  --name yt-dlp-web \
  YOUR_DOCKERHUB_USERNAME/yt-dlp-web:latest
```

> **Note:** Using cookies with Chrome on Windows may cause issues due to DPAPI encryption. Firefox or Edge cookies work more reliably.

---

## Publish to Docker Hub

### 1. Create a Docker Hub account

Sign up at [hub.docker.com](https://hub.docker.com) and create a public repository named `yt-dlp-web`.

### 2. Log in from terminal

```bash
docker login
```

### 3. Build and tag the image

```bash
docker build -t YOUR_DOCKERHUB_USERNAME/yt-dlp-web:latest .
```

### 4. Push to Docker Hub

```bash
docker push YOUR_DOCKERHUB_USERNAME/yt-dlp-web:latest
```

### 5. (Optional) Tag a version

```bash
docker tag YOUR_DOCKERHUB_USERNAME/yt-dlp-web:latest YOUR_DOCKERHUB_USERNAME/yt-dlp-web:1.0.0
docker push YOUR_DOCKERHUB_USERNAME/yt-dlp-web:1.0.0
```

Anyone can now pull and run your image with:

```bash
docker pull YOUR_DOCKERHUB_USERNAME/yt-dlp-web:latest
```

---

## Tech Stack

- **Backend** — Python, [FastAPI](https://fastapi.tiangolo.com/), [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- **Frontend** — Vanilla HTML/CSS/JS (no framework)
- **Container** — Docker with ffmpeg

---

## License

This project uses yt-dlp which is licensed under [The Unlicense](LICENSE).
