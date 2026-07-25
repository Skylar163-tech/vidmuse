from __future__ import annotations

import re
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

from . import ytdlp_service as ytdlp
from .url_utils import normalize_url

TEMP_DIR = ytdlp.TEMP_DIR
MAX_SUBTITLE_CHARS = 24_000

# Prefer Chinese (incl. Bilibili AI captions), then English
LANG_PRIORITY = (
    "ai-zh",
    "zh-hans",
    "zh-cn",
    "zh",
    "zh-hant",
    "zh-tw",
    "en",
    "en-us",
    "en-gb",
)

SUB_LANGS_PRIMARY = "ai-zh,zh.*,zh-Hans,zh-CN,zh,zh-Hant,zh-TW,en.*,en"


@dataclass
class SubtitleCue:
    start: str
    end: str
    text: str


@dataclass
class SubtitleBundle:
    title: str
    language: str
    cues: List[SubtitleCue]
    text_for_model: str
    truncated: bool
    source: str = "subtitles"  # subtitles | description


def _ts_to_seconds(ts: str) -> float:
    ts = ts.replace(",", ".")
    parts = ts.split(":")
    if len(parts) == 3:
        h, m, s = parts
        return int(h) * 3600 + int(m) * 60 + float(s)
    if len(parts) == 2:
        m, s = parts
        return int(m) * 60 + float(s)
    return float(parts[0])


def _seconds_to_ts(sec: float) -> str:
    if sec < 0:
        sec = 0
    total = int(sec)
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def _parse_vtt(content: str) -> List[SubtitleCue]:
    cues: List[SubtitleCue] = []
    # Strip header / NOTE / STYLE blocks lightly
    blocks = re.split(r"\n\s*\n", content.strip())
    time_re = re.compile(
        r"(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}|\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*"
        r"(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}|\d{1,2}:\d{2}[.,]\d{1,3})"
    )
    for block in blocks:
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        if not lines:
            continue
        if lines[0].upper().startswith("WEBVTT") or lines[0].upper().startswith("NOTE"):
            continue
        time_line = None
        text_lines: List[str] = []
        for ln in lines:
            if "-->" in ln:
                time_line = ln
            elif time_line is not None:
                # Drop cue settings / tags
                cleaned = re.sub(r"<[^>]+>", "", ln).strip()
                if cleaned:
                    text_lines.append(cleaned)
        if not time_line or not text_lines:
            continue
        m = time_re.search(time_line)
        if not m:
            continue
        start = _seconds_to_ts(_ts_to_seconds(m.group(1)))
        end = _seconds_to_ts(_ts_to_seconds(m.group(2)))
        text = " ".join(text_lines)
        if text:
            cues.append(SubtitleCue(start=start, end=end, text=text))
    return _merge_short_cues(cues)


def _parse_srt(content: str) -> List[SubtitleCue]:
    cues: List[SubtitleCue] = []
    blocks = re.split(r"\n\s*\n", content.strip())
    time_re = re.compile(
        r"(\d{2}:\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{1,3})"
    )
    for block in blocks:
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        if len(lines) < 2:
            continue
        time_idx = 0
        if re.fullmatch(r"\d+", lines[0]):
            time_idx = 1
        if time_idx >= len(lines):
            continue
        m = time_re.search(lines[time_idx])
        if not m:
            continue
        text = " ".join(lines[time_idx + 1 :])
        text = re.sub(r"<[^>]+>", "", text).strip()
        if not text:
            continue
        start = _seconds_to_ts(_ts_to_seconds(m.group(1)))
        end = _seconds_to_ts(_ts_to_seconds(m.group(2)))
        cues.append(SubtitleCue(start=start, end=end, text=text))
    return _merge_short_cues(cues)


def _merge_short_cues(cues: List[SubtitleCue], min_chars: int = 12) -> List[SubtitleCue]:
    if not cues:
        return []
    merged: List[SubtitleCue] = []
    buf = cues[0]
    for cue in cues[1:]:
        if len(buf.text) < min_chars:
            buf = SubtitleCue(
                start=buf.start,
                end=cue.end,
                text=f"{buf.text} {cue.text}".strip(),
            )
        else:
            merged.append(buf)
            buf = cue
    merged.append(buf)
    return merged


def _lang_score(name: str) -> Tuple[int, str]:
    """Lower score = better. name like 'video.zh-Hans.vtt' or 'xxx.ai-zh.srt'."""
    stem = Path(name).stem.lower()
    parts = stem.replace("_", "-").split(".")
    lang = parts[-1] if parts else ""
    # Bilibili sometimes uses danmaku-looking or multi-part stems: id.lang
    for i, pref in enumerate(LANG_PRIORITY):
        pref_l = pref.lower()
        if lang == pref_l or lang.startswith(pref_l + "-"):
            return (i, lang)
        if "zh" in pref_l and (lang.startswith("zh") or lang.startswith("ai-zh")):
            return (i + 5, lang)
        if pref_l.startswith(lang) and len(lang) >= 2:
            return (i + 50, lang)
    if "zh" in lang or lang.startswith("ai-"):
        return (80, lang)
    return (1000, lang or "unknown")


def _pick_subtitle_file(files: List[Path]) -> Optional[Path]:
    candidates = [p for p in files if p.suffix.lower() in (".vtt", ".srt")]
    if not candidates:
        return None
    candidates.sort(key=lambda p: (_lang_score(p.name)[0], p.suffix.lower() != ".vtt", p.name))
    return candidates[0]


def _info_has_caption_tracks(info: dict) -> bool:
    subs = info.get("subtitles") or {}
    auto = info.get("automatic_captions") or {}
    return bool(subs) or bool(auto)


def _no_subtitles_error(url: str) -> RuntimeError:
    has_cookie = bool(ytdlp.cookies_file())
    track_hint = ""
    try:
        info = _dump_info(url)
        if _info_has_caption_tracks(info):
            track_hint = (
                "元数据里能看到字幕轨，但未能写出字幕文件；请更新 yt-dlp 或检查 Cookie 是否有效。"
            )
        else:
            track_hint = "该稿件未暴露可下载的外挂/AI 字幕轨（播放器里烧录字幕不算）。"
    except Exception:
        track_hint = "无法确认字幕轨元数据。"

    if has_cookie:
        cookie_hint = "已配置 Cookie，仍失败时请换有明确 CC/AI 字幕轨的稿件，或更新 apps/api/bin/yt-dlp.exe。"
    else:
        cookie_hint = (
            "若播放器里能开 CC/AI 字幕：请导出登录后的 Netscape cookies 到 apps/api/cookies.txt"
            "（或设置 YTDLP_COOKIES_FILE）后重启后端再试。"
        )

    return RuntimeError(
        "未获取到可用字幕，无法基于视频内容做笔记。"
        f"{track_hint}{cookie_hint}"
    )


def _build_model_text(cues: List[SubtitleCue]) -> Tuple[str, bool]:
    lines = [f"[{c.start}] {c.text}" for c in cues]
    full = "\n".join(lines)
    if len(full) <= MAX_SUBTITLE_CHARS:
        return full, False
    return full[:MAX_SUBTITLE_CHARS] + "\n…（已截断）", True


def _dump_info(url: str) -> dict:
    import json

    meta = ytdlp.run_yt_dlp(
        ["--dump-json", "--no-playlist", "--no-warnings", url],
        timeout=90,
    )
    if meta.returncode != 0 or not meta.stdout:
        err = (meta.stderr or meta.stdout or "").strip()
        tip = err.splitlines()[-1] if err else "无法解析该视频"
        if "No video formats" in tip or "Unsupported" in tip:
            raise RuntimeError(
                "无法解析该链接（可能缺少访问参数或平台限制）。请使用首页刚解析成功的完整链接再试。"
            )
        raise RuntimeError(tip)
    return json.loads(meta.stdout)


def fetch_metadata_bundle(url: str) -> SubtitleBundle:
    """Legacy helper (unused by summary). Kept for potential tooling."""
    clean = normalize_url(url)
    info = _dump_info(clean)
    title = str(info.get("title") or "未知视频")
    desc = (info.get("description") or "").strip()
    tags = info.get("tags") or []
    tag_line = "、".join(str(t) for t in tags[:20] if t)

    parts = [f"标题：{title}"]
    if desc:
        parts.append(f"简介/文案：\n{desc}")
    if tag_line:
        parts.append(f"标签：{tag_line}")
    text = "\n\n".join(parts).strip()
    if len(text) < 20:
        raise RuntimeError(
            "该视频无可用字幕，且页面文案过少，无法生成学习笔记。"
            "请换有字幕的视频（如多数 B站/YouTube），或先在首页确认链接可解析。"
        )
    truncated = False
    if len(text) > MAX_SUBTITLE_CHARS:
        text = text[:MAX_SUBTITLE_CHARS] + "\n…（已截断）"
        truncated = True

    cues = [SubtitleCue(start="00:00", end="00:00", text=desc or title)]
    return SubtitleBundle(
        title=title,
        language="description",
        cues=cues,
        text_for_model=text,
        truncated=truncated,
        source="description",
    )


def fetch_subtitles(url: str) -> SubtitleBundle:
    """Download subtitle tracks only; raise RuntimeError with Chinese message on failure."""
    clean = normalize_url(url)
    work_id = uuid.uuid4().hex[:12]
    work_dir = TEMP_DIR / f"subs_{work_id}"
    work_dir.mkdir(parents=True, exist_ok=True)
    out_tmpl = str(work_dir / "%(id)s.%(ext)s")

    try:
        result = ytdlp.run_yt_dlp(
            [
                "--skip-download",
                "--write-subs",
                "--write-auto-subs",
                "--sub-format",
                "vtt/srt/best",
                "--sub-langs",
                SUB_LANGS_PRIMARY,
                "--no-playlist",
                "--no-warnings",
                "-o",
                out_tmpl,
                clean,
            ],
            timeout=120,
        )

        files = list(work_dir.iterdir()) if work_dir.exists() else []
        chosen = _pick_subtitle_file(files)

        if not chosen:
            result2 = ytdlp.run_yt_dlp(
                [
                    "--skip-download",
                    "--write-subs",
                    "--write-auto-subs",
                    "--sub-format",
                    "vtt/srt/best",
                    "--sub-langs",
                    "all",
                    "--no-playlist",
                    "--no-warnings",
                    "-o",
                    out_tmpl,
                    clean,
                ],
                timeout=120,
            )
            files = list(work_dir.iterdir()) if work_dir.exists() else []
            chosen = _pick_subtitle_file(files)
            if not chosen and result.returncode != 0 and result2.returncode != 0:
                err = (result2.stderr or result.stderr or "").strip()
                last = err.splitlines()[-1] if err else ""
                if "No video formats" in last:
                    raise RuntimeError(
                        "无法拉取该视频信息，请用首页解析成功的完整链接（含 xsec_token 等参数）再试。"
                    )
                raise RuntimeError(last or "无法获取字幕")

        if not chosen:
            raise _no_subtitles_error(clean)

        content = chosen.read_text(encoding="utf-8", errors="replace")
        if chosen.suffix.lower() == ".srt":
            cues = _parse_srt(content)
        else:
            cues = _parse_vtt(content)

        if not cues:
            raise _no_subtitles_error(clean)

        _, lang = _lang_score(chosen.name)
        text_for_model, truncated = _build_model_text(cues)

        title = "未知视频"
        try:
            info = _dump_info(clean)
            title = str(info.get("title") or title)
        except Exception:
            pass

        return SubtitleBundle(
            title=title,
            language=lang,
            cues=cues,
            text_for_model=text_for_model,
            truncated=truncated,
            source="subtitles",
        )
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def fetch_for_summary(url: str) -> SubtitleBundle:
    """Require real subtitles for summary. No title/description hallucination fallback."""
    try:
        return fetch_subtitles(url)
    except RuntimeError as exc:
        msg = str(exc)
        if msg == "NO_SUBTITLES" or "无可用字幕" in msg:
            raise _no_subtitles_error(normalize_url(url)) from exc
        if "未获取到可用字幕" in msg:
            raise
        raise
