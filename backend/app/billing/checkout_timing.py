"""Optional checkout performance logging (disabled by default)."""
from __future__ import annotations

import os


def timing_enabled() -> bool:
    raw = (os.getenv("FORMA_CHECKOUT_TIMING") or "").strip().lower()
    return raw in {"1", "true", "yes", "on"}
