#!/usr/bin/env python3
"""Génère l'icône Hall (Frame 11) pour macOS / Windows / landing."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "desktop" / "build"
LANDING_ICON = ROOT / "landing" / "icon.png"
LANDING_PUBLIC_ICON = ROOT / "landing" / "public" / "icon.png"
FRONTEND_FAVICON = ROOT / "frontend" / "public" / "favicon.png"
FRONTEND_APPLE = ROOT / "frontend" / "public" / "apple-touch-icon.png"

# Frame 11.svg: rounded dark tile + white stroke on a 100×100 canvas.
FILL = (0x23, 0x23, 0x23, 255)
STROKE = (255, 255, 255, 255)


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    scale = size / 100.0
    x0 = 1.25 * scale
    y0 = 1.25 * scale
    x1 = (1.25 + 97.5) * scale
    y1 = (1.25 + 97.5) * scale
    radius = 23.75 * scale
    stroke = max(1, round(2.5 * scale))
    box = [x0, y0, x1, y1]
    draw.rounded_rectangle(box, radius=radius, fill=FILL)
    draw.rounded_rectangle(box, radius=radius, outline=STROKE, width=stroke)
    return img


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    master = draw_icon(1024)
    master.save(OUT_DIR / "icon.png")
    draw_icon(512).save(OUT_DIR / "icon-512.png")
    draw_icon(256).save(OUT_DIR / "icon-256.png")

    landing = draw_icon(128)
    LANDING_ICON.parent.mkdir(parents=True, exist_ok=True)
    landing.save(LANDING_ICON)
    LANDING_PUBLIC_ICON.parent.mkdir(parents=True, exist_ok=True)
    landing.save(LANDING_PUBLIC_ICON)

    FRONTEND_FAVICON.parent.mkdir(parents=True, exist_ok=True)
    master.save(FRONTEND_FAVICON)
    master.save(FRONTEND_APPLE)
    print(f"Icons generated in {OUT_DIR}")


if __name__ == "__main__":
    main()
