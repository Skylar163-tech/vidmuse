from __future__ import annotations

import os
import uuid
from datetime import date
from threading import Lock
from typing import Dict, Optional, Tuple

COOKIE_NAME = "vidmuse_did"

# client_key -> (day_iso, count)
_store: Dict[str, Tuple[str, int]] = {}
_lock = Lock()


def daily_limit() -> int:
    raw = (os.getenv("FREE_AI_DAILY_LIMIT") or "3").strip()
    try:
        n = int(raw)
    except ValueError:
        n = 3
    return max(0, n)


def _today() -> str:
    return date.today().isoformat()


def resolve_client_key(device_id: Optional[str], client_ip: Optional[str]) -> str:
    did = (device_id or "").strip()
    if did and len(did) <= 64:
        return f"did:{did}"
    ip = (client_ip or "").strip() or "unknown"
    return f"ip:{ip}"


def new_device_id() -> str:
    return uuid.uuid4().hex


def get_usage(client_key: str) -> Tuple[int, int]:
    """Return (used_today, limit)."""
    limit = daily_limit()
    today = _today()
    with _lock:
        entry = _store.get(client_key)
        if not entry or entry[0] != today:
            return 0, limit
        return entry[1], limit


def check_or_raise(client_key: str) -> Tuple[int, int]:
    """
    If under limit, do nothing and return (used, limit).
    If at/over limit, raise RuntimeError with Chinese message (caller maps to 429).
    Call consume() only after AI succeeds, or consume at entry — we consume at entry
    to prevent burst abuse of expensive DeepSeek calls.
    """
    limit = daily_limit()
    if limit <= 0:
        return 0, limit
    used, _ = get_usage(client_key)
    if used >= limit:
        raise RuntimeError(
            f"今日免费 AI 体验已用完（{limit}/{limit}）。开通 Pro 可继续使用，或明天再来。"
        )
    return used, limit


def consume(client_key: str) -> Tuple[int, int]:
    """Increment usage by 1 after check passed. Returns (used_after, limit)."""
    limit = daily_limit()
    if limit <= 0:
        return 0, limit
    today = _today()
    with _lock:
        entry = _store.get(client_key)
        if not entry or entry[0] != today:
            _store[client_key] = (today, 1)
            return 1, limit
        used = entry[1] + 1
        _store[client_key] = (today, used)
        return used, limit


def try_consume(client_key: str) -> Tuple[int, int]:
    """Atomically check + consume. Raises RuntimeError if over limit."""
    limit = daily_limit()
    if limit <= 0:
        return 0, limit
    today = _today()
    with _lock:
        entry = _store.get(client_key)
        used = 0 if (not entry or entry[0] != today) else entry[1]
        if used >= limit:
            raise RuntimeError(
                f"今日免费 AI 体验已用完（{limit}/{limit}）。开通 Pro 可继续使用，或明天再来。"
            )
        used += 1
        _store[client_key] = (today, used)
        return used, limit
