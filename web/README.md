# yt-dlp Web UI

## Setup

**1. Install backend dependencies** (from the `web/backend` folder):
```bash
pip install -r web/backend/requirements.txt
```

**2. Install yt-dlp** (from the repo root):
```bash
pip install -e .
```

**3. Start the backend:**
```bash
uvicorn web.backend.main:app --reload --port 8000
```

**4. Open the frontend:**

Just open `web/frontend/index.html` in your browser — no build step needed.

> Make sure `ffmpeg` is installed and on your PATH for merging video+audio streams.
