#!/usr/bin/env python3
"""Génère l'icône Meetra (tuile sombre + marque blanche) pour macOS / Windows / favicon / landing."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "desktop" / "build"

# Brand mark paths in viewBox 0 0 200 100
MARK_ARCH = [
    (4, 96),
    (4, 50),
    (46, 8),
    (54, 4),
    (146, 4),
    (154, 8),
    (196, 50),
    (196, 96),
    (108, 20),
    (92, 20),
]
MARK_TRI = [(54, 66), (146, 66), (100, 96)]
MARK_VB_W, MARK_VB_H = 200.0, 100.0

# Frame: rounded dark tile + white stroke on a 100×100 canvas.
FILL = (0x23, 0x23, 0x23, 255)
STROKE = (255, 255, 255, 255)
MARK_FILL = (255, 255, 255, 255)

ICON_SVG = """\
<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="1.25" y="1.25" width="97.5" height="97.5" rx="23.75" fill="#232323"/>
  <rect x="1.25" y="1.25" width="97.5" height="97.5" rx="23.75" stroke="white" stroke-width="2.5"/>
  <g fill="#FFFFFF" transform="translate(18 34) scale(0.32)">
    <path d="M4 96 L4 50 L46 8 L54 4 H146 L154 8 L196 50 L196 96 L108 20 H92 Z"/>
    <path d="M54 66 H146 L100 96 Z"/>
  </g>
</svg>
"""

MARK_SVG_WHITE = """\
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" role="img" aria-label="Meetra mark">
  <g fill="#FFFFFF">
    <path d="M4 96 L4 50 L46 8 L54 4 H146 L154 8 L196 50 L196 96 L108 20 H92 Z"/>
    <path d="M54 66 H146 L100 96 Z"/>
  </g>
</svg>
"""


def _map_mark_points(
    points: list[tuple[float, float]],
    *,
    ox: float,
    oy: float,
    scale: float,
) -> list[tuple[float, float]]:
    return [(ox + x * scale, oy + y * scale) for x, y in points]


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

    # Mark: same transform as SVG — translate(18,34) scale(0.32) in 100×100 space
    mark_scale = 0.32 * scale
    ox = 18 * scale
    oy = 34 * scale
    draw.polygon(_map_mark_points(MARK_ARCH, ox=ox, oy=oy, scale=mark_scale), fill=MARK_FILL)
    draw.polygon(_map_mark_points(MARK_TRI, ox=ox, oy=oy, scale=mark_scale), fill=MARK_FILL)
    return img


def _write(path: Path, data: str | bytes, *, binary: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if binary:
        path.write_bytes(data)  # type: ignore[arg-type]
    else:
        path.write_text(data, encoding="utf-8")


def _save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Canonical SVGs
    svg_targets = [
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
    ]
    for path in svg_targets:
        _write(path, ICON_SVG)

    mark_targets = [
        ROOT / "frontend" / "public" / "meetra-mark.svg",
        ROOT / "frontend" / "public" / "brandmark-40-preview.svg",
        ROOT / "brand" / "meetra-mark.svg",
    ]
    for path in mark_targets:
        _write(path, MARK_SVG_WHITE)

    master = draw_icon(1024)
    _save_png(master, OUT_DIR / "icon.png")
    _save_png(draw_icon(512), OUT_DIR / "icon-512.png")
    icon_256 = draw_icon(256)
    _save_png(icon_256, OUT_DIR / "icon-256.png")

    # Multi-size .ico for Windows exe / desktop / Start Menu shortcuts.
    # bitmap_format="bmp" is required: rcedit (electron-builder) silently ignores
    # PNG-compressed ICO entries and leaves the default Electron icon embedded.
    ico_path = OUT_DIR / "icon.ico"
    icon_256.save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
        bitmap_format="bmp",
    )

    landing_128 = draw_icon(128)
    for path in (
        ROOT / "landing" / "icon.png",
        ROOT / "landing" / "public" / "icon.png",
    ):
        _save_png(landing_128, path)

    favicon_png_targets = [
        ROOT / "frontend" / "public" / "favicon.png",
        ROOT / "frontend" / "public" / "apple-touch-icon.png",
        ROOT / "landing" / "app" / "favicon.png",
        ROOT / "landing" / "public" / "app" / "favicon.png",
    ]
    for path in favicon_png_targets:
        _save_png(master, path)

    print(f"Icons generated in {OUT_DIR}")
    print(f"  icon.png / icon-512.png / icon-256.png / icon.ico / icon.svg")
    print(f"  favicon + apple-touch + landing icons updated")
    print(f"  white mark: frontend/public/meetra-mark.svg")


if __name__ == "__main__":
    main()
