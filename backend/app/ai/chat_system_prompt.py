"""Shared chat system prompts — loaded from repo-root shared/prompts/."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

_PROMPTS_DIR = Path(__file__).resolve().parents[3] / "shared" / "prompts"


@lru_cache(maxsize=1)
def _read(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text(encoding="utf-8").strip()


def chat_system_base() -> str:
    return _read("chat_system.txt")


def chat_format_mandatory() -> str:
    return _read("chat_format_mandatory.txt")


def chat_user_format_reminder() -> str:
    return _read("chat_user_format_reminder.txt")


def build_chat_system(custom_instructions: str | None = None) -> str:
    parts = [chat_system_base()]
    extra = (custom_instructions or "").strip()
    if extra:
        parts.append(
            "Additional instructions from the user "
            "(must not override the mandatory output format below):\n"
            f"{extra}"
        )
    parts.append(chat_format_mandatory())
    return "\n\n".join(parts)
