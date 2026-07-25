from __future__ import annotations

from typing import List

from . import deepseek_client
from .models import (
    AiChapter,
    AiSummaryResponse,
    AiTranslateResponse,
    SubtitleLine,
)
from .subtitle_service import fetch_for_summary, fetch_subtitles


TRANSLATE_MAX_LINES = 80
TRANSLATE_BATCH = 40


def ensure_deepseek() -> None:
    if not deepseek_client.is_configured():
        raise RuntimeError("未配置 DEEPSEEK_API_KEY，请在 apps/api/.env 中设置后重启后端")


def generate_summary(url: str) -> AiSummaryResponse:
    ensure_deepseek()
    bundle = fetch_for_summary(url)
    raw = deepseek_client.summarize_from_transcript(bundle.title, bundle.text_for_model)

    summary = str(raw.get("summary") or "").strip() or "未能生成总结，请稍后重试"

    bullets_raw = raw.get("bullets") or []
    bullets = [str(b).strip() for b in bullets_raw if str(b).strip()]

    chapters: List[AiChapter] = []
    for ch in raw.get("chapters") or []:
        if not isinstance(ch, dict):
            continue
        title = str(ch.get("title") or "").strip()
        start = str(ch.get("start") or "").strip() or "00:00"
        points_raw = ch.get("points") or []
        points = [str(p).strip() for p in points_raw if str(p).strip()]
        if title or points:
            chapters.append(AiChapter(start=start, title=title or "章节", points=points))

    return AiSummaryResponse(
        title=bundle.title,
        summary=summary,
        bullets=bullets,
        chapters=chapters,
        subtitle_lang=bundle.language,
        truncated=bundle.truncated,
        pro_required=False,
    )


def translate_subs(url: str, language_to: str = "zh") -> AiTranslateResponse:
    ensure_deepseek()
    try:
        bundle = fetch_subtitles(url)
    except RuntimeError as exc:
        if str(exc) == "NO_SUBTITLES":
            raise RuntimeError(
                "该视频无可用字幕，无法翻译。若播放器能开 CC/AI 字幕，请配置 apps/api/cookies.txt 后重试。"
            ) from exc
        raise

    if bundle.source != "subtitles":
        raise RuntimeError("未获取到真实字幕，无法翻译。")

    cues = bundle.cues[:TRANSLATE_MAX_LINES]
    lang_from = bundle.language or "auto"

    payload = [
        {"start": c.start, "end": c.end, "original": c.text}
        for c in cues
    ]

    translated_all: List[dict] = []
    for i in range(0, len(payload), TRANSLATE_BATCH):
        batch = payload[i : i + TRANSLATE_BATCH]
        translated_all.extend(deepseek_client.translate_cues(batch, language_to=language_to))

    lines: List[SubtitleLine] = []
    for idx, src in enumerate(payload):
        dst = translated_all[idx] if idx < len(translated_all) else {}
        if not isinstance(dst, dict):
            dst = {}
        lines.append(
            SubtitleLine(
                start=str(dst.get("start") or src["start"]),
                end=str(dst.get("end") or src["end"]),
                original=str(dst.get("original") or src["original"]),
                translated=str(dst.get("translated") or src["original"]),
            )
        )

    note_prefix = ""
    if len(bundle.cues) > TRANSLATE_MAX_LINES:
        note_prefix = f"（仅翻译前 {TRANSLATE_MAX_LINES} 条字幕） "

    return AiTranslateResponse(
        title=f"{note_prefix}{bundle.title}".strip(),
        language_from=lang_from,
        language_to=language_to,
        lines=lines,
        pro_required=False,
    )
