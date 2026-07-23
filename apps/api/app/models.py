from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class ParseRequest(BaseModel):
    url: str = Field(..., min_length=4)


class FormatInfo(BaseModel):
    format_id: str
    ext: str
    resolution: Optional[str] = None
    fps: Optional[float] = None
    vcodec: Optional[str] = None
    acodec: Optional[str] = None
    filesize: Optional[int] = None
    filesize_approx: Optional[int] = None
    tbr: Optional[float] = None
    note: Optional[str] = None
    format_note: Optional[str] = None


class ParseResponse(BaseModel):
    id: str
    title: str
    thumbnail: Optional[str] = None
    duration: Optional[float] = None
    uploader: Optional[str] = None
    webpage_url: Optional[str] = None
    extractor: Optional[str] = None
    formats: List[FormatInfo]


class DownloadRequest(BaseModel):
    url: str = Field(..., min_length=4)
    format_id: str = Field(..., min_length=1)


class DownloadResponse(BaseModel):
    job_id: str


class JobStatus(BaseModel):
    job_id: str
    status: str  # queued | running | done | error
    progress: float = 0.0
    error: Optional[str] = None
    filename: Optional[str] = None
    title: Optional[str] = None


class AiRequest(BaseModel):
    url: Optional[str] = None
    title: Optional[str] = None


class AiSummaryResponse(BaseModel):
    title: str
    summary: str
    bullets: List[str]
    pro_required: bool = True


class SubtitleLine(BaseModel):
    start: str
    end: str
    original: str
    translated: str


class AiTranslateResponse(BaseModel):
    title: str
    language_from: str
    language_to: str
    lines: List[SubtitleLine]
    pro_required: bool = True


class HealthResponse(BaseModel):
    ok: bool
    yt_dlp: Optional[str] = None
    ffmpeg: bool = False
    message: Optional[str] = None
