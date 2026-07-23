from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from .models import FormatInfo, JobStatus, ParseResponse


ROOT = Path(__file__).resolve().parent.parent
TEMP_DIR = ROOT / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

JOB_TTL_SECONDS = 30 * 60
MAX_DURATION_SECONDS = 3 * 60 * 60  # soft limit: 3 hours

_jobs: Dict[str, Dict[str, Any]] = {}
_lock = threading.Lock()


def _which(cmd: str) -> Optional[str]:
    return shutil.which(cmd)


def yt_dlp_bin() -> str:
    # Prefer bundled / local binary (keeps latest engine even on older Python)
    root = Path(__file__).resolve().parent.parent
    candidates = [
        root / "bin" / "yt-dlp.exe",
        root / "bin" / "yt-dlp",
        root / ".venv" / "Scripts" / "yt-dlp.exe",
        root / ".venv" / "bin" / "yt-dlp",
    ]
    for local in candidates:
        if local.exists():
            return str(local)
    found = _which("yt-dlp")
    if found:
        return found
    # Fallback: python -m yt_dlp
    return ""


def run_yt_dlp(args: List[str], timeout: Optional[int] = 120) -> subprocess.CompletedProcess:
    bin_path = yt_dlp_bin()
    if bin_path:
        cmd = [bin_path, *args]
    else:
        cmd = [os.sys.executable, "-m", "yt_dlp", *args]
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        encoding="utf-8",
        errors="replace",
    )


def get_yt_dlp_version() -> Optional[str]:
    try:
        result = run_yt_dlp(["--version"], timeout=30)
        if result.returncode == 0:
            return (result.stdout or "").strip() or None
        return None
    except Exception:
        return None


def has_ffmpeg() -> bool:
    return _which("ffmpeg") is not None


def _format_resolution(fmt: dict) -> Optional[str]:
    height = fmt.get("height")
    width = fmt.get("width")
    if height and width:
        return f"{width}x{height}"
    if height:
        return f"{height}p"
    note = fmt.get("format_note") or fmt.get("resolution")
    if note and note != "audio only":
        return str(note)
    if fmt.get("vcodec") in (None, "none") and fmt.get("acodec") not in (None, "none"):
        return "音频"
    return None


def _is_useful_format(fmt: dict) -> bool:
    # Skip storyboard / images
    if fmt.get("vcodec") == "none" and fmt.get("acodec") == "none":
        return False
    ext = (fmt.get("ext") or "").lower()
    if ext in ("mhtml", "jpg", "png", "webp"):
        return False
    return True


def parse_url(url: str) -> ParseResponse:
    result = run_yt_dlp(
        ["--dump-json", "--no-playlist", "--no-warnings", url],
        timeout=90,
    )
    if result.returncode != 0:
        err = (result.stderr or result.stdout or "解析失败").strip()
        # Keep message short for UI
        raise RuntimeError(err.splitlines()[-1] if err else "解析失败，请检查链接或平台限制")

    info = json.loads(result.stdout)
    duration = info.get("duration")
    if duration and float(duration) > MAX_DURATION_SECONDS:
        raise RuntimeError("视频过长（超过 3 小时），请换更短的内容")

    formats: List[FormatInfo] = []
    seen = set()
    for fmt in info.get("formats") or []:
        if not _is_useful_format(fmt):
            continue
        fid = str(fmt.get("format_id") or "")
        if not fid or fid in seen:
            continue
        seen.add(fid)
        formats.append(
            FormatInfo(
                format_id=fid,
                ext=str(fmt.get("ext") or "mp4"),
                resolution=_format_resolution(fmt),
                fps=fmt.get("fps"),
                vcodec=None if fmt.get("vcodec") in (None, "none") else str(fmt.get("vcodec")),
                acodec=None if fmt.get("acodec") in (None, "none") else str(fmt.get("acodec")),
                filesize=fmt.get("filesize"),
                filesize_approx=fmt.get("filesize_approx"),
                tbr=fmt.get("tbr"),
                note=fmt.get("format"),
                format_note=fmt.get("format_note"),
            )
        )

    # Prefer higher quality first: has video, then height/tbr
    def sort_key(f: FormatInfo):
        has_video = 1 if f.vcodec else 0
        height = 0
        if f.resolution and f.resolution.endswith("p") and f.resolution[:-1].isdigit():
            height = int(f.resolution[:-1])
        elif f.resolution and "x" in f.resolution:
            try:
                height = int(f.resolution.split("x")[-1])
            except ValueError:
                height = 0
        return (has_video, height, f.tbr or 0)

    formats.sort(key=sort_key, reverse=True)

    # Cap list for UI
    formats = formats[:40]

    return ParseResponse(
        id=str(info.get("id") or ""),
        title=str(info.get("title") or "未命名视频"),
        thumbnail=info.get("thumbnail"),
        duration=float(duration) if duration is not None else None,
        uploader=info.get("uploader"),
        webpage_url=info.get("webpage_url") or url,
        extractor=info.get("extractor"),
        formats=formats,
    )


def create_job(url: str, format_id: str) -> str:
    job_id = uuid.uuid4().hex
    job_dir = TEMP_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    with _lock:
        _jobs[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "progress": 0.0,
            "error": None,
            "filename": None,
            "title": None,
            "path": None,
            "created_at": time.time(),
            "dir": str(job_dir),
        }
    thread = threading.Thread(target=_run_download, args=(job_id, url, format_id), daemon=True)
    thread.start()
    return job_id


def _parse_progress(line: str) -> Optional[float]:
    # yt-dlp progress lines like: [download]  45.2% of ...
    if "[download]" not in line or "%" not in line:
        return None
    try:
        part = line.split("%", 1)[0]
        num = part.strip().split()[-1]
        return max(0.0, min(99.0, float(num)))
    except Exception:
        return None


def _run_download(job_id: str, url: str, format_id: str) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job["status"] = "running"
        job_dir = Path(job["dir"])

    out_tmpl = str(job_dir / "%(title).80B [%(id)s].%(ext)s")
    fmt = format_id
    # Only attempt merge when ffmpeg exists and format looks video-only (no '+')
    if has_ffmpeg() and "+" not in format_id:
        fmt = f"{format_id}+bestaudio/{format_id}/best"

    bin_path = yt_dlp_bin()
    if bin_path:
        cmd = [bin_path]
    else:
        cmd = [os.sys.executable, "-m", "yt_dlp"]

    cmd.extend(
        [
            "-f",
            fmt,
            "--no-playlist",
            "--newline",
            "--no-warnings",
            "-o",
            out_tmpl,
            url,
        ]
    )
    if has_ffmpeg():
        cmd.extend(["--merge-output-format", "mp4"])

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            line = line.rstrip()
            prog = _parse_progress(line)
            if prog is not None:
                with _lock:
                    if job_id in _jobs:
                        _jobs[job_id]["progress"] = prog
        code = proc.wait(timeout=JOB_TTL_SECONDS)
        if code != 0:
            raise RuntimeError("下载失败，该平台可能限制下载或需要登录")

        files = [p for p in job_dir.iterdir() if p.is_file() and not p.name.endswith(".part")]
        if not files:
            raise RuntimeError("未找到下载文件")
        # Pick largest file
        files.sort(key=lambda p: p.stat().st_size, reverse=True)
        final = files[0]
        with _lock:
            if job_id in _jobs:
                _jobs[job_id].update(
                    {
                        "status": "done",
                        "progress": 100.0,
                        "filename": final.name,
                        "path": str(final),
                        "title": final.stem,
                    }
                )
    except Exception as exc:
        with _lock:
            if job_id in _jobs:
                _jobs[job_id].update(
                    {
                        "status": "error",
                        "error": str(exc),
                        "progress": 0.0,
                    }
                )


def get_job(job_id: str) -> Optional[JobStatus]:
    cleanup_expired()
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return None
        return JobStatus(
            job_id=job_id,
            status=job["status"],
            progress=float(job.get("progress") or 0),
            error=job.get("error"),
            filename=job.get("filename"),
            title=job.get("title"),
        )


def get_job_file(job_id: str) -> Optional[Path]:
    with _lock:
        job = _jobs.get(job_id)
        if not job or job.get("status") != "done" or not job.get("path"):
            return None
        path = Path(job["path"])
        if not path.exists():
            return None
        return path


def cleanup_expired() -> None:
    now = time.time()
    remove_ids = []
    with _lock:
        for jid, job in _jobs.items():
            if now - job.get("created_at", now) > JOB_TTL_SECONDS:
                remove_ids.append(jid)
        for jid in remove_ids:
            job = _jobs.pop(jid, None)
            if job and job.get("dir"):
                shutil.rmtree(job["dir"], ignore_errors=True)
