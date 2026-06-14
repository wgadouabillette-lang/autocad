#!/usr/bin/env python3
"""Génère l'icône Forma (fond noir) pour macOS / Windows / landing."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "desktop" / "build"
LANDING_ICON = ROOT / "landing" / "icon.png"

BG = (8, 8, 8, 255)
PANEL = (14, 14, 14, 255)
MARK = (235, 235, 235, 255)


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)
    margin = max(8, size // 16)
    radius = max(12, size // 6)
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill=PANEL,
    )

    # Monogramme « F » minimal
    bar = max(2, size // 26)
    x0 = int(size * 0.36)
    y0 = int(size * 0.27)
    y1 = int(size * 0.73)
    x_mid = int(size * 0.58)
    draw.rectangle([x0, y0, x0 + bar, y1], fill=MARK)
    draw.rectangle([x0, y0, x_mid, y0 + bar], fill=MARK)
    draw.rectangle([x0, int(size * 0.47), int(size * 0.54), int(size * 0.47) + bar], fill=MARK)
    return img


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    master = draw_icon(1024)
    master.save(OUT_DIR / "icon.png")
    draw_icon(512).save(OUT_DIR / "icon-512.png")
    draw_icon(256).save(OUT_DIR / "icon-256.png")
    draw_icon(128).save(LANDING_ICON)
    print(f"Icons generated in {OUT_DIR}")


if __name__ == "__main__":
    main()
