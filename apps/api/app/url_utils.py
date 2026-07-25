from __future__ import annotations

import re
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse


def normalize_url(url: str) -> str:
    """Strip tracking params; keep Bilibili video URLs clean."""
    raw = (url or "").strip()
    if not raw:
        return raw

    parsed = urlparse(raw)
    host = (parsed.netloc or "").lower()

    # Xiaohongshu often needs xsec_token etc. — keep full query
    if "xiaohongshu.com" in host or "xhslink.com" in host:
        return urlunparse(
            (parsed.scheme or "https", parsed.netloc, parsed.path, "", parsed.query, "")
        )

    # Bilibili share links often carry spm_id_from / trackId etc.
    if "bilibili.com" in host or "b23.tv" in host:
        path = parsed.path or ""
        bv = re.search(r"(BV[\w]+)", path, re.I)
        if bv and "bilibili.com" in host:
            clean_path = f"/video/{bv.group(1)}"
            return urlunparse(("https", "www.bilibili.com", clean_path, "", "", ""))
        # Keep path, drop query/fragment for other bilibili pages
        return urlunparse((parsed.scheme or "https", parsed.netloc, path, "", "", ""))

    # Generic: drop common trackers, keep meaningful query if any
    if not parsed.query:
        return raw

    drop = {
        "spm_id_from",
        "trackid",
        "track_id",
        "vd_source",
        "share_source",
        "share_medium",
        "share_plat",
        "share_session_id",
        "share_tag",
        "timestamp",
        "unique_k",
        "from_spmid",
        "bbid",
        "ts",
    }
    qs = parse_qs(parsed.query, keep_blank_values=False)
    kept = {k: v for k, v in qs.items() if k.lower() not in drop}
    new_query = urlencode(kept, doseq=True)
    return urlunparse(
        (parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, "")
    )
