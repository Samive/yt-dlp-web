import sys
import json
import uuid
import asyncio
import httpx
import urllib.parse
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import yt_dlp

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})

DOWNLOAD_DIR = Path(__file__).parent / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

FORMAT_PRESETS = {
    "best":  "bestvideo+bestaudio/bestvideo/best",
    "1080p": "bestvideo[height<=1080]+bestaudio/bestvideo[height<=1080]/best",
    "720p":  "bestvideo[height<=720]+bestaudio/bestvideo[height<=720]/best",
    "480p":  "bestvideo[height<=480]+bestaudio/bestvideo[height<=480]/best",
    "audio": "bestaudio/best",
}

# file_id -> { status, percent, eta, speed, filepath, ... }
_progress: dict[str, dict] = {}
# file_id -> asyncio.Task
_tasks: dict[str, asyncio.Task] = {}


class InfoRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    preset: str = "best"
    format_id: str | None = None
    file_id: str | None = None


@app.get("/")
async def index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.post("/info")
async def get_info(req: InfoRequest):
    ydl_opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    info = None
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = await asyncio.to_thread(ydl.extract_info, req.url, download=False)
    except Exception:
        pass
    if not info:
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = await asyncio.to_thread(ydl.extract_info, req.url, download=False)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
    if not info:
        raise HTTPException(status_code=400, detail="Could not extract video info.")

    thumbnails = info.get("thumbnails") or []
    thumbnail_url = None
    if thumbnails:
        ranked = sorted(
            (t for t in thumbnails if t.get("url")),
            key=lambda t: (t.get("width") or 0) * (t.get("height") or 0),
            reverse=True,
        )
        thumbnail_url = ranked[0]["url"] if ranked else None
    thumbnail_url = thumbnail_url or info.get("thumbnail")

    formats = [
        {
            "format_id": f.get("format_id"),
            "ext": f.get("ext"),
            "resolution": f.get("resolution") or f.get("format_note") or "unknown",
            "filesize": f.get("filesize") or f.get("filesize_approx"),
            "vcodec": f.get("vcodec"),
            "acodec": f.get("acodec"),
            "fps": f.get("fps"),
            "height": f.get("height") or 0,
            "tbr": f.get("tbr") or 0,
        }
        for f in (info.get("formats") or [])
        if f.get("ext") != "mhtml"
        and f.get("protocol") != "mhtml"
        and (f.get("vcodec", "none") != "none" or f.get("acodec", "none") != "none")
    ]
    formats.sort(key=lambda f: (f["height"], f["tbr"]), reverse=True)

    if not formats:
        raise HTTPException(status_code=400, detail="No downloadable formats found.")

    return {
        "title": info.get("title"),
        "thumbnail": f"/thumbnail?url={thumbnail_url}" if thumbnail_url else None,
        "duration": info.get("duration"),
        "uploader": info.get("uploader"),
        "view_count": info.get("view_count"),
        "like_count": info.get("like_count"),
        "upload_date": info.get("upload_date"),
        "formats": formats,
    }


@app.get("/thumbnail")
async def proxy_thumbnail(url: str):
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
        return Response(content=r.content, media_type=r.headers.get("content-type", "image/jpeg"))
    except Exception:
        raise HTTPException(status_code=502, detail="Could not fetch thumbnail")


async def _run_download(file_id: str, url: str, fmt: str, output_template: str):
    """Runs yt-dlp in a thread and updates _progress. Cancellable via task cancellation."""
    cancelled = asyncio.Event()

    def progress_hook(d):
        if cancelled.is_set():
            raise yt_dlp.utils.DownloadError("Cancelled")
        status = d.get("status")
        if status == "downloading":
            downloaded = d.get("downloaded_bytes", 0)
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            pct = round((downloaded / total) * 100, 1) if total else 0
            eta = d.get("eta")
            speed = d.get("speed")
            _progress[file_id].update({
                "status": "downloading",
                "percent": pct,
                "eta": int(eta) if eta else None,
                "speed": round(speed / 1024 / 1024, 2) if speed else None,
            })
        elif status == "finished":
            _progress[file_id].update({"status": "finished", "percent": 100, "eta": 0})

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "format": fmt,
        "outtmpl": output_template,
        "merge_output_format": "mp4",
        "progress_hooks": [progress_hook],
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = await asyncio.to_thread(ydl.extract_info, url, download=True)
        return info
    except asyncio.CancelledError:
        cancelled.set()
        _progress[file_id]["status"] = "cancelled"
        raise
    except Exception as e:
        _progress[file_id]["status"] = "error"
        _progress[file_id]["error"] = str(e)
        raise


@app.post("/download")
async def download_video(req: DownloadRequest):
    file_id = req.file_id or str(uuid.uuid4())
    output_template = str(DOWNLOAD_DIR / f"{file_id}.%(ext)s")
    fmt = req.format_id if req.format_id else FORMAT_PRESETS.get(req.preset, FORMAT_PRESETS["best"])

    _progress[file_id] = {
        "status": "starting", "percent": 0, "eta": None, "speed": None,
        "url": req.url, "fmt": fmt, "output_template": output_template,
    }

    task = asyncio.create_task(_run_download(file_id, req.url, fmt, output_template))
    _tasks[file_id] = task

    try:
        info = await task
    except asyncio.CancelledError:
        return JSONResponse({"file_id": file_id, "status": "cancelled"})
    except Exception as e:
        _tasks.pop(file_id, None)
        raise HTTPException(status_code=400, detail=_progress.get(file_id, {}).get("error", str(e)))

    _tasks.pop(file_id, None)

    matches = list(DOWNLOAD_DIR.glob(f"{file_id}.*"))
    if not matches:
        raise HTTPException(status_code=500, detail="Download failed: file not found")

    filepath = matches[0]
    title = info.get("title") or file_id
    filename_ascii = "".join(c for c in title if c.isascii() and (c.isalnum() or c in " ._-()")).strip()
    if not filename_ascii:
        filename_ascii = file_id
    filename_ascii += filepath.suffix
    filename_encoded = urllib.parse.quote(title + filepath.suffix)

    _progress[file_id].update({
        "status": "ready",
        "percent": 100,
        "filepath": str(filepath),
        "filename_ascii": filename_ascii,
        "filename_encoded": filename_encoded,
    })

    return JSONResponse({"file_id": file_id, "status": "ready"})


@app.post("/cancel/{file_id}")
async def cancel_download(file_id: str):
    task = _tasks.get(file_id)
    if task and not task.done():
        task.cancel()
        # Clean up partial files
        for f in DOWNLOAD_DIR.glob(f"{file_id}*"):
            f.unlink(missing_ok=True)
        _progress[file_id] = {"status": "cancelled", "percent": 0}
        return JSONResponse({"status": "cancelled"})
    return JSONResponse({"status": "not_found"})


@app.get("/file/{file_id}")
async def serve_file(file_id: str):
    meta = _progress.get(file_id)
    if not meta or meta.get("status") != "ready":
        raise HTTPException(status_code=404, detail="File not ready or already downloaded")

    filepath = Path(meta["filepath"])
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")

    filename_ascii = meta["filename_ascii"]
    filename_encoded = meta["filename_encoded"]

    def iterfile():
        with open(filepath, "rb") as f:
            yield from f
        filepath.unlink(missing_ok=True)
        _progress.pop(file_id, None)

    return StreamingResponse(
        iterfile(),
        media_type="video/mp4",
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename_ascii}\"; filename*=UTF-8''{filename_encoded}",
        },
    )


@app.get("/progress/{file_id}")
async def progress_stream(file_id: str, request: Request):
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            data = _progress.get(file_id)
            if data:
                yield f"data: {json.dumps(data)}\n\n"
                if data.get("status") in ("ready", "cancelled", "error"):
                    break
            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
