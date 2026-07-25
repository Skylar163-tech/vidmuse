from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List


def is_configured() -> bool:
    return bool(os.environ.get("DEEPSEEK_API_KEY", "").strip())


def _client():
    from openai import OpenAI

    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not key:
        raise RuntimeError("未配置 DEEPSEEK_API_KEY，请在 apps/api/.env 中设置后重启后端")
    return OpenAI(api_key=key, base_url="https://api.deepseek.com")


def _model() -> str:
    return os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash").strip() or "deepseek-v4-flash"


def _extract_json(text: str) -> Any:
    text = (text or "").strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        try:
            return json.loads(fence.group(1).strip())
        except json.JSONDecodeError:
            pass
    # Object
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass
    # Array
    start = text.find("[")
    end = text.rfind("]")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return None
    return None


def chat_json(system: str, user: str, timeout: float = 120.0) -> Any:
    client = _client()
    # DeepSeek V4 默认开启 thinking，content 会为空；总结/翻译关闭思考以拿到正文
    resp = client.chat.completions.create(
        model=_model(),
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.3,
        timeout=timeout,
        extra_body={"thinking": {"type": "disabled"}},
    )
    msg = resp.choices[0].message
    content = (msg.content or "").strip()
    if not content:
        # 兼容仍返回 reasoning 的情况
        content = (getattr(msg, "reasoning_content", None) or "").strip()
    if not content:
        raise RuntimeError("DeepSeek 返回空内容，请检查模型与额度后重试")
    parsed = _extract_json(content)
    if parsed is not None:
        return parsed
    return {"_raw": content}


def summarize_from_transcript(title: str, transcript: str) -> Dict[str, Any]:
    system = (
        "你是面向内容创作者与知识工作者的视频学习助手。"
        "输入可能是带时间戳的字幕，或视频标题/简介/文案。"
        "输出严格 JSON（不要 Markdown 围栏），字段："
        '{"summary":"一段中文总述",'
        '"bullets":["要点1","要点2"],'
        '"chapters":[{"start":"mm:ss或hh:mm:ss","title":"章节名","points":["要点"]}]}。'
        "若无真实时间轴，chapters 的 start 可用 00:00 或按步骤编号省略精确时间；"
        "要点简洁，方便创作者复用到选题/笔记/食谱步骤。"
    )
    user = f"视频标题：{title}\n\n内容：\n{transcript}"
    data = chat_json(system, user)
    if not isinstance(data, dict):
        return {"summary": str(data), "bullets": [], "chapters": []}
    if "_raw" in data:
        return {
            "summary": data["_raw"],
            "bullets": [],
            "chapters": [],
        }
    return data


def translate_cues(
    cues: List[Dict[str, str]],
    language_to: str = "zh",
) -> List[Dict[str, str]]:
    """Translate a batch of cues; each dict has start, end, original."""
    if not cues:
        return []
    system = (
        "你是字幕翻译助手。将用户给出的 JSON 字幕数组翻译为目标语言。"
        f"目标语言代码：{language_to}。"
        "只返回 JSON 数组，每项："
        '{"start":"...","end":"...","original":"...","translated":"..."}。'
        "保留 start/end/original，填写 translated。不要额外说明。"
    )
    user = json.dumps(cues, ensure_ascii=False)
    data = chat_json(system, user)
    if isinstance(data, list):
        return data  # type: ignore[return-value]
    if isinstance(data, dict):
        if "_raw" in data:
            # fallback: no structured translate
            return [
                {
                    **c,
                    "translated": c.get("original", ""),
                }
                for c in cues
            ]
        for key in ("lines", "data", "items", "translations"):
            if isinstance(data.get(key), list):
                return data[key]
    return [
        {**c, "translated": c.get("original", "")}
        for c in cues
    ]
