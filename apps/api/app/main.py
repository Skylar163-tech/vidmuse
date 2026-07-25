from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response as RawResponse

from . import ai_service
from . import deepseek_client
from . import quota
from . import ytdlp_service as ytdlp
from .models import (
    AiQuotaResponse,
    AiRequest,
    AiSummaryResponse,
    AiTranslateResponse,
    DownloadRequest,
    DownloadResponse,
    HealthResponse,
    ParseRequest,
    ParseResponse,
)
from .url_utils import normalize_url

# Load apps/api/.env if present
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

app = FastAPI(title="VidMuse API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_http_url(url: str) -> str:
    cleaned = normalize_url(url.strip())
    if not re.match(r"^https?://", cleaned, re.I):
        raise HTTPException(status_code=400, detail="请输入有效的 http(s) 链接")
    return cleaned


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for") or ""
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host or "unknown"
    return "unknown"


def _ensure_device_cookie(request: Request, response: Response) -> str:
    existing = request.cookies.get(quota.COOKIE_NAME)
    if existing and len(existing) <= 64:
        return existing
    device_id = quota.new_device_id()
    response.set_cookie(
        key=quota.COOKIE_NAME,
        value=device_id,
        max_age=60 * 60 * 24 * 365,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return device_id


def _quota_client_key(request: Request, response: Response) -> str:
    device_id = _ensure_device_cookie(request, response)
    return quota.resolve_client_key(device_id, _client_ip(request))


def _quota_check(client_key: str) -> None:
    try:
        quota.check_or_raise(client_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    version = ytdlp.get_yt_dlp_version()
    ffmpeg = ytdlp.has_ffmpeg()
    deepseek = deepseek_client.is_configured()
    ok = bool(version)
    parts = []
    if not ok:
        parts.append("未检测到 yt-dlp，请先安装依赖")
    if ok and not ffmpeg:
        parts.append(
            "未检测到 ffmpeg：B站等高清常为音视频分离，下载会无声。"
            "请将 ffmpeg.exe 放到 apps/api/bin/ 后重启后端"
        )
    if not deepseek:
        parts.append("未配置 DEEPSEEK_API_KEY，学习笔记功能不可用")
    return HealthResponse(
        ok=ok,
        yt_dlp=version,
        ffmpeg=ffmpeg,
        deepseek=deepseek,
        message="；".join(parts) if parts else None,
    )


@app.post("/api/parse", response_model=ParseResponse)
def parse(body: ParseRequest) -> ParseResponse:
    url = _require_http_url(body.url)
    try:
        return ytdlp.parse_url(url)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"解析出错：{exc}") from exc


@app.post("/api/download", response_model=DownloadResponse)
def download(body: DownloadRequest) -> DownloadResponse:
    url = _require_http_url(body.url)
    try:
        job_id = ytdlp.create_job(url, body.format_id.strip())
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return DownloadResponse(job_id=job_id)


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    job = ytdlp.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")
    return job


@app.get("/api/jobs/{job_id}/file")
def job_file(job_id: str):
    path = ytdlp.get_job_file(job_id)
    if not path:
        raise HTTPException(status_code=404, detail="文件尚未就绪或不存在")
    return FileResponse(
        path=str(path),
        filename=path.name,
        media_type="application/octet-stream",
    )


@app.get("/api/thumbnail")
def thumbnail_proxy(url: str = Query(..., min_length=8)):
    """Proxy remote thumbnails to bypass CDN hotlink / Referer checks."""
    target = url.strip()
    parsed = urlparse(target)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail="无效的封面链接")

    headers = {
        "User-Agent": BROWSER_UA,
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }
    host = parsed.netloc.lower()
    if "xiaohongshu" in host or "xhscdn" in host or "xhs" in host:
        headers["Referer"] = "https://www.xiaohongshu.com/"
    elif "bilibili" in host or "hdslb" in host:
        headers["Referer"] = "https://www.bilibili.com/"
    elif "douyin" in host or "byteimg" in host or "tiktok" in host:
        headers["Referer"] = "https://www.douyin.com/"
    elif "youtube" in host or "ytimg" in host or "ggpht" in host:
        headers["Referer"] = "https://www.youtube.com/"

    try:
        resp = requests.get(target, headers=headers, timeout=15, stream=True)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"封面拉取失败：{exc}") from exc

    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"封面拉取失败（HTTP {resp.status_code}）")

    content_type = resp.headers.get("Content-Type") or "image/jpeg"
    if not content_type.startswith("image/") and "octet-stream" not in content_type:
        if "octet-stream" not in content_type and "json" in content_type:
            raise HTTPException(status_code=502, detail="封面地址未返回图片")

    data = resp.content
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=502, detail="封面过大")

    return RawResponse(
        content=data,
        media_type=content_type.split(";")[0].strip() or "image/jpeg",
        headers={"Cache-Control": "public, max-age=3600"},
    )


def _ai_http_error(exc: Exception) -> HTTPException:
    msg = str(exc)
    if "DEEPSEEK_API_KEY" in msg:
        return HTTPException(status_code=503, detail=msg)
    return HTTPException(status_code=400, detail=msg)


@app.get("/api/ai/quota", response_model=AiQuotaResponse)
def ai_quota(request: Request, response: Response) -> AiQuotaResponse:
    device_id = _ensure_device_cookie(request, response)
    client_key = quota.resolve_client_key(device_id, _client_ip(request))
    used, limit = quota.get_usage(client_key)
    remaining = max(0, limit - used) if limit > 0 else 999
    return AiQuotaResponse(used=used, limit=limit, remaining=remaining)


@app.post("/api/ai/summary", response_model=AiSummaryResponse)
def ai_summary(body: AiRequest, request: Request, response: Response) -> AiSummaryResponse:
    client_key = _quota_client_key(request, response)
    _quota_check(client_key)
    url = _require_http_url(body.url)
    try:
        result = ai_service.generate_summary(url)
    except RuntimeError as exc:
        raise _ai_http_error(exc) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"总结失败：{exc}") from exc
    quota.consume(client_key)
    return result


@app.post("/api/ai/translate-subs", response_model=AiTranslateResponse)
def ai_translate(body: AiRequest, request: Request, response: Response) -> AiTranslateResponse:
    client_key = _quota_client_key(request, response)
    _quota_check(client_key)
    url = _require_http_url(body.url)
    language_to = (body.language_to or "zh").strip() or "zh"
    try:
        result = ai_service.translate_subs(url, language_to=language_to)
    except RuntimeError as exc:
        raise _ai_http_error(exc) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"翻译失败：{exc}") from exc
    quota.consume(client_key)
    return result
