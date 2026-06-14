"""Analyse de dessins techniques et reconstruction parametrique.

Pipeline (workflows #1 et #2) :
  fichier (PDF / image / scan)
    -> rasterisation
    -> pretraitement (niveaux de gris, seuil, Canny)
    -> detection du contour exterieur (profil) + cercles (trous)
    -> mise a l'echelle (mm)
    -> construction d'un Document : extrusion du profil + perçages

Renvoie aussi un apercu annote (PNG base64) pour le frontend.
"""
from __future__ import annotations

import base64
import io
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import cv2
import numpy as np

from app.ai.text_to_cad import _fid
from app.core.theme import ANNOT_HOLE_BGR, ANNOT_OUTER_BGR, ANNOT_PROFILE_BGR
from app.models.schemas import Document, Feature


@dataclass
class VisionReport:
    width_px: int = 0
    height_px: int = 0
    scale_mm_per_px: float = 1.0
    profile_points: int = 0
    holes: int = 0
    detected_size_mm: List[float] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    preview_png_b64: str = ""


# --------------------------------------------------------------------------- #
def rasterize(data: bytes, filename: str) -> np.ndarray:
    """Convertit n'importe quel fichier d'entree en image BGR (OpenCV)."""
    name = filename.lower()
    if name.endswith(".pdf"):
        try:
            import fitz  # PyMuPDF
        except Exception as exc:  # noqa: BLE001
            raise ValueError("PyMuPDF required for PDF files (pip install PyMuPDF).") from exc
        doc = fitz.open(stream=data, filetype="pdf")
        page = doc.load_page(0)
        pix = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5))
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 4:
            img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
        elif pix.n == 1:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        else:
            img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        return img

    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Unreadable image / unsupported format.")
    return img


# --------------------------------------------------------------------------- #
def analyze(
    data: bytes,
    filename: str,
    real_width_mm: Optional[float] = None,
    thickness_mm: float = 5.0,
    extrude: bool = True,
) -> Tuple[Document, VisionReport]:
    img = rasterize(data, filename)
    h_px, w_px = img.shape[:2]
    report = VisionReport(width_px=w_px, height_px=h_px)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    # binarisation adaptative robuste aux scans
    thr = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    thr = cv2.morphologyEx(thr, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=2)

    contours, _ = cv2.findContours(thr, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise ValueError("No contour detected in the drawing.")

    # plus grand contour = profil exterieur
    outer = max(contours, key=cv2.contourArea)
    x, y, bw, bh = cv2.boundingRect(outer)

    # echelle : largeur reelle fournie, sinon 1px = 0.25mm (defaut raisonnable)
    if real_width_mm and bw > 0:
        scale = real_width_mm / bw
        report.notes.append(f"Scale calibrated from real width = {real_width_mm} mm.")
    else:
        scale = 0.25
        report.notes.append("Default scale 0.25 mm/px (provide 'real_width_mm' to calibrate).")
    report.scale_mm_per_px = scale
    report.detected_size_mm = [round(bw * scale, 2), round(bh * scale, 2)]

    cx_px = x + bw / 2.0
    cy_px = y + bh / 2.0

    # simplification du contour -> polygone du profil
    peri = cv2.arcLength(outer, True)
    approx = cv2.approxPolyDP(outer, 0.01 * peri, True)
    pts_mm: List[List[float]] = []
    for p in approx.reshape(-1, 2):
        px, py = float(p[0]), float(p[1])
        pts_mm.append([round((px - cx_px) * scale, 3), round((cy_px - py) * scale, 3)])
    report.profile_points = len(pts_mm)

    # detection des trous (cercles)
    holes: List[Tuple[float, float, float]] = []
    circles = cv2.HoughCircles(
        gray, cv2.HOUGH_GRADIENT, dp=1.2, minDist=max(bw, bh) * 0.05 + 5,
        param1=120, param2=30, minRadius=3, maxRadius=int(min(bw, bh) * 0.25),
    )
    if circles is not None:
        for c in np.round(circles[0]).astype(int):
            hx, hy, hr = c
            mx = (hx - cx_px) * scale
            my = (cy_px - hy) * scale
            holes.append((round(mx, 3), round(my, 3), round(hr * 2 * scale, 3)))
    report.holes = len(holes)

    # construit le document
    doc = Document(name=f"Reconstructed · {filename}")
    if extrude and len(pts_mm) >= 3:
        doc.features.append(Feature(
            id=_fid("profile"), type="extrude", name="Extruded profile",
            params={"profile": {"shape": "points", "points": pts_mm},
                    "distance": thickness_mm, "operation": "add"},
        ))
        for (mx, my, dia) in holes:
            doc.features.append(Feature(
                id=_fid("hole"), type="hole", name=f"Hole Ø{dia:g}",
                params={"x": mx, "y": my, "diameter": dia, "through": True, "z_top": thickness_mm},
            ))
    doc.meta["source"] = "vision"
    doc.meta["filename"] = filename

    report.preview_png_b64 = _annotate(img, outer, approx, holes, cx_px, cy_px, scale)
    return doc, report


def _annotate(img, outer, approx, holes, cx_px, cy_px, scale) -> str:
    vis = img.copy()
    cv2.drawContours(vis, [outer], -1, ANNOT_OUTER_BGR, 2)
    cv2.drawContours(vis, [approx], -1, ANNOT_PROFILE_BGR, 2)
    for (mx, my, dia) in holes:
        px = int(cx_px + mx / scale)
        py = int(cy_px - my / scale)
        r = int((dia / 2) / scale)
        cv2.circle(vis, (px, py), r, ANNOT_HOLE_BGR, 2)
        cv2.circle(vis, (px, py), 2, ANNOT_HOLE_BGR, 3)
    # redimensionne pour l'apercu
    maxw = 700
    if vis.shape[1] > maxw:
        s = maxw / vis.shape[1]
        vis = cv2.resize(vis, (maxw, int(vis.shape[0] * s)))
    ok, buf = cv2.imencode(".png", vis)
    if not ok:
        return ""
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode()
