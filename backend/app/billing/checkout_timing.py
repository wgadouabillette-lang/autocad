"""Timing checkout Stripe — activer avec FORMA_BILLING_TIMING=1."""
from __future__ import annotations

import logging
import os
import time
from contextlib import contextmanager
from typing import Iterator

logger = logging.getLogger(__name__)


def timing_enabled() -> bool:
    return os.getenv("FORMA_BILLING_TIMING", "").strip().lower() in {"1", "true", "yes", "on"}


@contextmanager
def checkout_step(label: str, *, uid: str = "") -> Iterator[None]:
    if not timing_enabled():
        yield
        return
    start = time.perf_counter()
    yield
    elapsed_ms = (time.perf_counter() - start) * 1000
    suffix = f" uid={uid}" if uid else ""
    logger.info("checkout timing %s=%.0fms%s", label, elapsed_ms, suffix)
