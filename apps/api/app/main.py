from __future__ import annotations

import re
from urllib.parse import urlparse

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

from .models import (
    AiRequest,
    AiSummaryResponse,
    AiTranslateResponse,
    DownloadRequest,
    DownloadResponse,
    HealthResponse,
    ParseRequest,
    ParseResponse,
    SubtitleLine,
)
from . import ytdlp_service as ytdlp

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

app = FastAPI(title="VidMuse API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    version = ytdlp.get_yt_dlp_version()
    ffmpeg = ytdlp.has_ffmpeg()
    ok = bool(version)
    msg = None
    if not ok:
        msg = "未检测到 yt-dlp，请先安装依赖"
    elif not ffmpeg:
        msg = "未检测到 ffmpeg，部分清晰度可能无法合并音视频"
    return HealthResponse(ok=ok, yt_dlp=version, ffmpeg=ffmpeg, message=msg)


@app.post("/api/parse", response_model=ParseResponse)
def parse(body: ParseRequest) -> ParseResponse:
    url = body.url.strip()
    if not re.match(r"^https?://", url, re.I):
        raise HTTPException(status_code=400, detail="请输入有效的 http(s) 链接")
    try:
        return ytdlp.parse_url(url)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"解析出错：{exc}") from exc


@app.post("/api/download", response_model=DownloadResponse)
def download(body: DownloadRequest) -> DownloadResponse:
    url = body.url.strip()
    if not re.match(r"^https?://", url, re.I):
        raise HTTPException(status_code=400, detail="请输入有效的 http(s) 链接")
    job_id = ytdlp.create_job(url, body.format_id.strip())
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
    # Some CDNs require a same-site Referer; others work better with none
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
        # Some CDNs return octet-stream; still allow if body looks like image later
        if "octet-stream" not in content_type and "json" in content_type:
            raise HTTPException(status_code=502, detail="封面地址未返回图片")

    # Cap at 8MB to keep MVP light
    data = resp.content
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=502, detail="封面过大")

    return Response(
        content=data,
        media_type=content_type.split(";")[0].strip() or "image/jpeg",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@app.post("/api/ai/summary", response_model=AiSummaryResponse)
def ai_summary(body: AiRequest) -> AiSummaryResponse:
    title = (body.title or "未知视频").strip() or "未知视频"
    return AiSummaryResponse(
        title=title,
        summary=(
            f"「{title}」的演示总结：这是一段面向学习场景的 AI 摘要占位内容。"
            "正式接入模型后，将基于字幕与画面关键信息生成结构化要点。"
        ),
        bullets=[
            "主题概览：快速抓住视频在讲什么",
            "关键时间点：方便跳转到重点片段",
            "行动建议：把内容沉淀成可执行清单",
            "升级 Pro 后解锁真实 AI 总结能力",
        ],
        pro_required=True,
    )


@app.post("/api/ai/translate-subs", response_model=AiTranslateResponse)
def ai_translate(body: AiRequest) -> AiTranslateResponse:
    title = (body.title or "未知视频").strip() or "未知视频"
    return AiTranslateResponse(
        title=title,
        language_from="en",
        language_to="zh",
        lines=[
            SubtitleLine(
                start="00:00:01",
                end="00:00:04",
                original="Welcome to this demo clip.",
                translated="欢迎来到这段演示片段。",
            ),
            SubtitleLine(
                start="00:00:05",
                end="00:00:09",
                original="VidMuse helps you save videos faster.",
                translated="VidMuse 帮你更快地保存视频。",
            ),
            SubtitleLine(
                start="00:00:10",
                end="00:00:14",
                original="Pro unlocks summary and subtitle translation.",
                translated="Pro 可解锁总结与字幕翻译能力。",
            ),
        ],
        pro_required=True,
    )
