const API = '';

const urlInput = document.getElementById('url-input');
const clearBtn = document.getElementById('clear-btn');
const fetchBtn = document.getElementById('fetch-btn');
const errorMsg = document.getElementById('error-msg');
const preview = document.getElementById('preview');
const thumbnail = document.getElementById('thumbnail');
const videoTitle = document.getElementById('video-title');
const uploaderEl = document.getElementById('uploader');
const durationEl = document.getElementById('duration');
const formatSection = document.getElementById('format-section');
const formatSelect = document.getElementById('format-select');
const downloadBtn = document.getElementById('download-btn');
const progressWrap = document.getElementById('progress-wrap');
const progressFill = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');
const cancelBtn = document.getElementById('cancel-btn');

let currentFileId = null;
let currentAbort = null;
let currentSse = null;

cancelBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }

  if (currentSse) {
    currentSse.close();
    currentSse = null;
  }

  if (currentFileId) {
    fetch(`${API}/cancel/${currentFileId}`, { method: 'POST' }).catch(() => {});
    currentFileId = null;
  }

  progressWrap.style.display = 'none';
  setProgress(0, '');
  setLoading(downloadBtn, false);
});

function resetUI() {
  urlInput.value = '';
  clearBtn.style.display = 'none';
  errorMsg.style.display = 'none';
  preview.style.display = 'none';
  formatSection.style.display = 'none';
  downloadBtn.style.display = 'none';
  progressWrap.style.display = 'none';
  thumbnail.src = '';
}

window.addEventListener('pageshow', resetUI);

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = 'block';
}

function hideError() {
  errorMsg.style.display = 'none';
}

function setLoading(btn, loading, text) {
  btn.disabled = loading;
  btn.style.opacity = loading ? '0.6' : '1';
  btn.style.cursor = loading ? 'wait' : '';

  if (text) {
    btn.dataset.label = btn.dataset.label || btn.textContent.trim();
  }

  if (loading && text) {
    btn.textContent = text;
  } else if (!loading && btn.dataset.label) {
    if (btn.id === 'download-btn') {
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download`;
    } else {
      btn.textContent = btn.dataset.label;
    }
    delete btn.dataset.label;
  }
}

function formatDuration(secs) {
  if (!secs) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;

  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function formatCount(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

function formatBytes(bytes) {
  if (!bytes) return null;
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  return (bytes / 1e3).toFixed(0) + ' KB';
}

function formatLabel(f) {
  const parts = [];
  const res = f.resolution || '';

  if (res && res !== 'unknown') parts.push(res);
  if (f.ext) parts.push(f.ext.toUpperCase());

  const hasVideo = f.vcodec && f.vcodec !== 'none';
  const hasAudio = f.acodec && f.acodec !== 'none';

  if (!hasVideo && hasAudio) parts.push('audio only');
  if (f.fps && hasVideo) parts.push(`${f.fps}fps`);

  const size = formatBytes(f.filesize);
  if (size) parts.push(`~${size}`);

  return parts.join(' · ') || f.format_id;
}

function setProgress(pct, label) {
  progressFill.style.width = pct + '%';
  progressLabel.innerHTML = label;
}

function formatEta(secs) {
  if (secs == null || secs < 0) return '';
  if (secs < 60) return `ETA ${secs}s`;

  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `ETA ${m}m ${s}s`;
}

urlInput.addEventListener('input', () => {
  clearBtn.style.display = urlInput.value ? 'flex' : 'none';
});

clearBtn.addEventListener('click', () => {
  resetUI();
  urlInput.focus();
});

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchBtn.click();
});

fetchBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();

  if (!url) {
    showError('Please paste a video URL first.');
    return;
  }

  hideError();
  preview.style.display = 'none';
  formatSection.style.display = 'none';
  downloadBtn.style.display = 'none';
  progressWrap.style.display = 'none';
  setLoading(fetchBtn, true, 'Fetching…');

  try {
    const res = await fetch(`${API}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || 'Failed to fetch video info.');
    }

    renderPreview(data);
    renderFormats(data.formats || []);
    preview.style.display = 'flex';
    formatSection.style.display = 'flex';
    downloadBtn.style.display = 'flex';
  } catch (err) {
    showError(err.message || 'Failed to fetch video info.');
  } finally {
    setLoading(fetchBtn, false);
  }
});

function renderPreview(info) {
  thumbnail.src = info.thumbnail || '';
  thumbnail.alt = info.title || 'Video thumbnail';
  thumbnail.style.display = info.thumbnail ? 'block' : 'none';

  videoTitle.textContent = info.title || 'Unknown title';

  uploaderEl.textContent = info.uploader || '';
  uploaderEl.style.display = info.uploader ? '' : 'none';

  const dur = formatDuration(info.duration);
  durationEl.textContent = dur || '';
  durationEl.style.display = dur ? '' : 'none';

  const viewsEl = document.getElementById('views');
  const likesEl = document.getElementById('likes');
  const dateEl = document.getElementById('upload-date');

  viewsEl.textContent = info.view_count ? '👁 ' + formatCount(info.view_count) : '';
  viewsEl.style.display = info.view_count ? '' : 'none';

  likesEl.textContent = info.like_count ? '👍 ' + formatCount(info.like_count) : '';
  likesEl.style.display = info.like_count ? '' : 'none';

  if (info.upload_date && info.upload_date.length === 8) {
    const d = info.upload_date;
    const formatted = new Date(
      `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    ).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    dateEl.textContent = '📅 ' + formatted;
    dateEl.style.display = '';
  } else {
    dateEl.style.display = 'none';
  }
}

function renderFormats(formats) {
  formatSelect.innerHTML = '';

  const sorted = [...formats].sort(
    (a, b) => (b.height || 0) - (a.height || 0) || (b.tbr || 0) - (a.tbr || 0)
  );

  const combined = sorted.filter((f) => f.vcodec !== 'none' && f.acodec !== 'none');
  const videoOnly = sorted.filter((f) => f.vcodec !== 'none' && f.acodec === 'none');
  const audioOnly = sorted.filter((f) => f.vcodec === 'none' && f.acodec !== 'none');

  const addGroup = (label, items, transformValue = null) => {
    if (!items.length) return;

    const group = document.createElement('optgroup');
    group.label = label;

    items.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = transformValue ? transformValue(f) : f.format_id;
      opt.textContent = formatLabel(f);
      group.appendChild(opt);
    });

    formatSelect.appendChild(group);
  };

  addGroup(
    'Video only',
    videoOnly,
    (f) => `${f.format_id}+bestaudio[ext=m4a]/bestaudio`
  );

  addGroup('Video + Audio', combined);
  addGroup('Audio only', audioOnly);

  // Prefer highest MP4 video-only first, because backend can merge audio into MP4
  const bestMp4VideoOnly = videoOnly.find((f) => f.ext === 'mp4');

  // Fallback to highest combined MP4
  const bestMp4Combined = combined.find((f) => f.ext === 'mp4');

  // Fallback to any top combined format
  const bestCombined = combined[0];

  // Final fallback
  const bestDefault =
    (bestMp4VideoOnly && `${bestMp4VideoOnly.format_id}+bestaudio[ext=m4a]/bestaudio`) ||
    (bestMp4Combined && bestMp4Combined.format_id) ||
    (bestCombined && bestCombined.format_id) ||
    (sorted[0] && sorted[0].format_id);

  if (bestDefault) {
    formatSelect.value = bestDefault;
  }
}

downloadBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) return;

  hideError();
  setLoading(downloadBtn, true, 'Downloading…');
  progressWrap.style.display = 'block';
  setProgress(0, '<span class="meta">Starting…</span>');

  const fileId = crypto.randomUUID();
  currentFileId = fileId;

  const sse = new EventSource(`${API}/progress/${fileId}`);
  currentSse = sse;

  sse.onmessage = (e) => {
    const d = JSON.parse(e.data);

    if (d.status === 'starting') {
      setProgress(0, '<span class="meta">Starting…</span>');
    } else if (d.status === 'downloading') {
      const pct = d.percent || 0;
      const eta = d.eta != null ? formatEta(d.eta) : '';
      const speed = d.speed != null ? `${d.speed} MB/s` : '';
      const meta = [speed, eta].filter(Boolean).join('  ·  ');

      setProgress(
        pct,
        `<span class="pct">${pct}%</span>${meta ? `&ensp;<span class="meta">${meta}</span>` : ''}`
      );
    } else if (d.status === 'finished') {
      setProgress(
        100,
        '<span class="pct">100%</span>&ensp;<span class="meta">Processing…</span>'
      );
    } else if (d.status === 'ready') {
      sse.close();
      currentSse = null;
      currentAbort = null;

      if (currentFileId === fileId) {
        setProgress(
          100,
          '<span class="pct">✓</span>&ensp;<span class="meta">Done — saving to your downloads</span>'
        );

        window.location.href = `${API}/file/${fileId}`;

        setTimeout(() => {
          progressWrap.style.display = 'none';
        }, 2500);
      }

      currentFileId = null;
      setLoading(downloadBtn, false);
    } else if (d.status === 'cancelled') {
      sse.close();
      currentSse = null;
      currentAbort = null;
      progressWrap.style.display = 'none';
      currentFileId = null;
      setLoading(downloadBtn, false);
    } else if (d.status === 'error') {
      sse.close();
      currentSse = null;
      currentAbort = null;
      showError(d.error || 'Download failed.');
      progressWrap.style.display = 'none';
      currentFileId = null;
      setLoading(downloadBtn, false);
    }
  };

  sse.onerror = () => {
    sse.close();
    currentSse = null;
  };

  const abort = new AbortController();
  currentAbort = abort;

  try {
    const res = await fetch(`${API}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        format_id: formatSelect.value,
        file_id: fileId,
      }),
      signal: abort.signal,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.detail || 'Download failed.');
    }

    if (data.status !== 'started') {
      throw new Error('Unexpected server response.');
    }
  } catch (err) {
    if (currentSse) {
      currentSse.close();
      currentSse = null;
    }

    currentAbort = null;

    if (err.name !== 'AbortError') {
      showError(err.message || 'Download failed.');
      progressWrap.style.display = 'none';
    }

    if (currentFileId === fileId) {
      currentFileId = null;
    }

    setLoading(downloadBtn, false);
  }
});