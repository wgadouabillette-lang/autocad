"""Simple in-process rate limiter for public / sensitive API routes."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock
from typing import Deque, DefaultDict

from fastapi import HTTPException, Request

_lock = Lock()
_hits: DefaultDict[str, Deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def enforce_rate_limit(
    key: str,
    *,
    limit: int,
    window_sec: float,
    detail: str = "Too many requests. Please try again later.",
) -> None:
    now = time.monotonic()
    with _lock:
        bucket = _hits[key]
        cutoff = now - window_sec
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(status_code=429, detail=detail)
        bucket.append(now)


def rate_limit_request(
    request: Request,
    scope: str,
    *,
    limit: int,
    window_sec: float,
    uid: str | None = None,
) -> None:
    identity = uid or _client_ip(request)
    enforce_rate_limit(
        f"{scope}:{identity}",
        limit=limit,
        window_sec=window_sec,
    )
