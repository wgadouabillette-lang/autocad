#!/usr/bin/env python3
"""Génère l'icône Meetra (tuile sombre + marque blanche) pour macOS / Windows / Linux / favicon."""
from __future__ import annotations

import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "desktop" / "build"
MARK_SRC = ROOT / "brand" / "meetra-mark.svg"

FILL = (0x23, 0x23, 0x23, 255)
STROKE = (255, 255, 255, 255)
MARK_FILL = (255, 255, 255, 255)


def _load_mark() -> tuple[tuple[float, float, float, float], list[str]]:
    text = MARK_SRC.read_text(encoding="utf-8")
    vb = re.search(r'viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"', text)
    if not vb:
        raise SystemExit(f"viewBox manquant dans {MARK_SRC}")
    box = tuple(float(v) for v in vb.groups())
    paths = re.findall(r'<path d="([^"]+)"', text)
    if len(paths) < 2:
        raise SystemExit(f"marque incomplète dans {MARK_SRC}")
    return box, paths  # type: ignore[return-value]


def _sample_path(d: str, steps: int = 14) -> list[tuple[float, float]]:
    tokens = re.findall(r"[MLCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?", d)
    pts: list[tuple[float, float]] = []
    i = 0
    cx = cy = 0.0

    def num() -> float:
        nonlocal i
        value = float(tokens[i])
        i += 1
        return value

    def bezier(p0, p1, p2, p3) -> None:
        for step in range(1, steps + 1):
            t = step / steps
            u = 1 - t
            pts.append(
                (
                    u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0],
                    u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1],
                )
            )

    while i < len(tokens):
        op = tokens[i]
        i += 1
        if op == "M":
            cx, cy = num(), num()
            pts.append((cx, cy))
        elif op == "L":
            cx, cy = num(), num()
            pts.append((cx, cy))
        elif op == "C":
            c1 = (num(), num())
            c2 = (num(), num())
            end = (num(), num())
            bezier((cx, cy), c1, c2, end)
            cx, cy = end
        elif op == "Z":
            break
        else:
            raise SystemExit(f"commande SVG inattendue: {op}")
    return pts


def _icon_svg(box: tuple[float, float, float, float], paths: list[str]) -> str:
    _x, _y, vw, vh = box
    scale = 68 / vw
    x = (100 - vw * scale) / 2
    y = (100 - vh * scale) / 2
    body = "\n    ".join(f'<path d="{d}"/>' for d in paths)
    return f"""<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="1.25" y="1.25" width="97.5" height="97.5" rx="23.75" fill="#232323"/>
  <rect x="1.25" y="1.25" width="97.5" height="97.5" rx="23.75" stroke="white" stroke-width="2.5"/>
  <g fill="#FFFFFF" transform="translate({x:.3f} {y:.3f}) scale({scale:.6f})">
    {body}
  </g>
</svg>
"""


def draw_icon(size: int, box: tuple[float, float, float, float], paths: list[str]) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    scale = size / 100.0
    x0 = 1.25 * scale
    y0 = 1.25 * scale
    x1 = (1.25 + 97.5) * scale
    y1 = (1.25 + 97.5) * scale
    radius = 23.75 * scale
    stroke = max(1, round(2.5 * scale))
    tile = [x0, y0, x1, y1]
    draw.rounded_rectangle(tile, radius=radius, fill=FILL)
    draw.rounded_rectangle(tile, radius=radius, outline=STROKE, width=stroke)

    _x, _y, vw, vh = box
    mark_scale = (68 / vw) * scale
    ox = ((100 - vw * (68 / vw)) / 2) * scale
    oy = ((100 - vh * (68 / vw)) / 2) * scale
    for d in paths:
        polygon = [(ox + px * mark_scale, oy + py * mark_scale) for px, py in _sample_path(d)]
        draw.polygon(polygon, fill=MARK_FILL)
    return img


def _write(path: Path, data: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(data, encoding="utf-8")


def _save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def main() -> None:
    box, paths = _load_mark()
    mark_svg = MARK_SRC.read_text(encoding="utf-8")
    icon_svg = _icon_svg(box, paths)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for path in (
        OUT_DIR / "icon.svg",
        ROOT / "brand" / "icon.svg",
        ROOT / "frontend" / "public" / "icon.svg",
        ROOT / "frontend" / "public" / "favicon.svg",
        ROOT / "landing" / "icon.svg",
        ROOT / "landing" / "public" / "icon.svg",
        ROOT / "landing" / "app" / "icon.svg",
        ROOT / "landing" / "app" / "favicon.svg",
        ROOT / "landing" / "public" / "app" / "icon.svg",
        ROOT / "landing" / "public" / "app" / "favicon.svg",
    ):
        _write(path, icon_svg)

    for path in (
        ROOT / "frontend" / "public" / "meetra-mark.svg",
        ROOT / "landing" / "meetra-mark.svg",
        ROOT / "landing" / "public" / "meetra-mark.svg",
        ROOT / "landing" / "app" / "meetra-mark.svg",
        ROOT / "landing" / "public" / "app" / "meetra-mark.svg",
    ):
        _write(path, mark_svg)

    master = draw_icon(1024, box, paths)
    _save_png(master, OUT_DIR / "icon.png")
    _save_png(draw_icon(512, box, paths), OUT_DIR / "icon-512.png")
    icon_256 = draw_icon(256, box, paths)
    _save_png(icon_256, OUT_DIR / "icon-256.png")
    icon_256.save(
        OUT_DIR / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
        bitmap_format="bmp",
    )

    landing_128 = draw_icon(128, box, paths)
    for path in (
        ROOT / "landing" / "icon.png",
        ROOT / "landing" / "public" / "icon.png",
    ):
        _save_png(landing_128, path)

    for path in (
        ROOT / "frontend" / "public" / "favicon.png",
        ROOT / "frontend" / "public" / "apple-touch-icon.png",
        ROOT / "landing" / "app" / "favicon.png",
        ROOT / "landing" / "app" / "apple-touch-icon.png",
        ROOT / "landing" / "public" / "app" / "favicon.png",
        ROOT / "landing" / "public" / "app" / "apple-touch-icon.png",
    ):
        _save_png(master, path)

    print(f"Icons generated in {OUT_DIR}")


if __name__ == "__main__":
    main()
