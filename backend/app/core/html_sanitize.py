"""Minimal allowlist HTML sanitizer (no third-party dep)."""
from __future__ import annotations

from html.parser import HTMLParser
from typing import List

_ALLOWED_TAGS = {
    "p",
    "br",
    "div",
    "span",
    "b",
    "strong",
    "i",
    "em",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "blockquote",
    "pre",
    "code",
    "a",
    "mark",
}
_VOID = {"br"}
_ALLOWED_ATTRS = {
    "a": {"href", "title", "rel", "target"},
    "span": {"class"},
    "p": {"class"},
    "div": {"class"},
    "mark": {"class"},
    "h1": {"class"},
    "h2": {"class"},
    "h3": {"class"},
    "h4": {"class"},
}


def _escape_text(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _safe_href(value: str) -> str | None:
    href = (value or "").strip()
    lowered = href.lower()
    if lowered.startswith(("https://", "http://", "mailto:", "/", "#")):
        if lowered.startswith(("javascript:", "data:", "vbscript:")):
            return None
        return href
    return None


class _Sanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._out: List[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        name = tag.lower()
        if name in {"script", "style", "iframe", "object", "embed", "form", "link", "meta"}:
            self._skip_depth += 1
            return
        if self._skip_depth or name not in _ALLOWED_TAGS:
            return
        allowed = _ALLOWED_ATTRS.get(name, set())
        parts = [name]
        for key, raw in attrs:
            attr = (key or "").lower()
            if attr not in allowed or raw is None:
                continue
            if attr.startswith("on"):
                continue
            if name == "a" and attr == "href":
                safe = _safe_href(raw)
                if not safe:
                    continue
                parts.append(f'href="{_escape_text(safe)}"')
                continue
            if attr == "style":
                # Drop url() and expressions.
                if "url(" in raw.lower() or "expression" in raw.lower() or "javascript" in raw.lower():
                    continue
            parts.append(f'{attr}="{_escape_text(raw)}"')
        if name == "a":
            joined = " ".join(parts)
            if "rel=" not in joined:
                parts.append('rel="noopener noreferrer"')
            if "target=" not in joined:
                parts.append('target="_blank"')
        if name in _VOID:
            self._out.append(f"<{' '.join(parts)}>")
        else:
            self._out.append(f"<{' '.join(parts)}>")

    def handle_endtag(self, tag: str) -> None:
        name = tag.lower()
        if name in {"script", "style", "iframe", "object", "embed", "form", "link", "meta"}:
            if self._skip_depth:
                self._skip_depth -= 1
            return
        if self._skip_depth or name not in _ALLOWED_TAGS or name in _VOID:
            return
        self._out.append(f"</{name}>")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        self._out.append(_escape_text(data))

    def handle_entityref(self, name: str) -> None:
        if self._skip_depth:
            return
        self._out.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if self._skip_depth:
            return
        self._out.append(f"&#{name};")

    def result(self) -> str:
        return "".join(self._out)


def sanitize_note_html(html: str | None) -> str:
    raw = html or ""
    if not raw.strip():
        return ""
    parser = _Sanitizer()
    try:
        parser.feed(raw)
        parser.close()
    except Exception:
        return _escape_text(raw)
    return parser.result()
