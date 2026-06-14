"""Assistant d'ingenierie (workflow #5).

- Proprietes de masse (volume, masse selon materiau)
- Verification d'imprimabilite 3D (etancheite, parois fines, porte-a-faux,
  encombrement du plateau)
- Estimation de contrainte de premier ordre par section critique :
  on coupe le solide le long de son axe le plus long, on prend la plus
  petite section transversale, et sigma = F / A_min. Le coefficient de
  securite = limite elastique / sigma.

Estimation pedagogique de premier ordre, PAS un calcul EF normatif.
"""
from __future__ import annotations

import math
from typing import List, Optional

import numpy as np

from app.engine.kernel import (
    MATERIAL_YIELD_MPA,
    build_trimesh,
    rebuild,
)
from app.models.schemas import (
    AnalysisIssue,
    AnalysisResponse,
    Document,
)

PRINTER_BED_MM = 256.0  # plateau typique


def analyze(
    doc: Document,
    material: str = "aluminium",
    load_n: float = 0.0,
    min_wall_mm: float = 1.2,
) -> AnalysisResponse:
    body = build_trimesh(doc)
    rb = rebuild(doc, material)
    resp = AnalysisResponse(mass=rb.mass)
    issues: List[AnalysisIssue] = []
    score = 100

    if body is None or len(body.faces) == 0:
        resp.issues.append(AnalysisIssue(severity="error", message="No solid to analyze."))
        resp.printability_score = 0
        resp.summary = "Empty document."
        return resp

    ext = body.extents

    # --- etancheite (manifold) ---
    if not body.is_watertight:
        issues.append(AnalysisIssue(
            severity="warning",
            message="The mesh is not fully watertight (non-manifold).",
            suggestion="Check boolean operations / merge bodies.",
        ))
        score -= 20

    # --- encombrement plateau ---
    if max(ext[0], ext[1]) > PRINTER_BED_MM or ext[2] > PRINTER_BED_MM:
        issues.append(AnalysisIssue(
            severity="warning",
            message=f"Bounding box {ext[0]:.0f}×{ext[1]:.0f}×{ext[2]:.0f} mm exceeds bed {PRINTER_BED_MM:.0f} mm.",
            suggestion="Resize or split the part into smaller sub-assemblies.",
        ))
        score -= 15

    # --- parois fines (proxy 2V/A) ---
    thickness_proxy = 2.0 * abs(body.volume) / max(body.area, 1e-6)
    if thickness_proxy < min_wall_mm:
        issues.append(AnalysisIssue(
            severity="warning",
            message=f"Estimated average wall thickness {thickness_proxy:.2f} mm < {min_wall_mm} mm.",
            suggestion="Increase wall thickness or use a larger nozzle / more perimeters.",
        ))
        score -= 15

    # --- porte-a-faux necessitant des supports ---
    normals = body.face_normals
    areas = body.area_faces
    down_mask = normals[:, 2] < -0.5  # faces tournees vers le bas
    down_area = float(areas[down_mask].sum())
    if down_area > 0.02 * body.area:
        pct = 100 * down_area / body.area
        issues.append(AnalysisIssue(
            severity="info",
            message=f"Overhangs detected ({pct:.0f}% of surface facing downward).",
            suggestion="Add print supports, or reorient the part.",
        ))
        score -= 5

    if not issues:
        issues.append(AnalysisIssue(severity="info", message="No major printability issues detected."))

    # --- estimation de contrainte ---
    if load_n and load_n > 0:
        a_min = _min_cross_section(body)
        if a_min and a_min > 0:
            sigma = load_n / a_min  # N/mm^2 = MPa
            yld = MATERIAL_YIELD_MPA.get(material.lower(), 240.0)
            sf = yld / sigma if sigma > 0 else None
            resp.stress_estimate_mpa = round(sigma, 2)
            resp.safety_factor = round(sf, 2) if sf else None
            sev = "info" if (sf and sf >= 2) else ("warning" if (sf and sf >= 1) else "error")
            verdict = ("OK (factor > 2)" if (sf and sf >= 2)
                       else "marginal (1 < factor < 2)" if (sf and sf >= 1)
                       else "RUPTURE RISK (factor < 1)")
            issues.append(AnalysisIssue(
                severity=sev,
                message=f"Critical section {a_min:.1f} mm² → σ ≈ {sigma:.1f} MPa "
                        f"({material} yield ≈ {yld:.0f} MPa) → safety factor ≈ {sf:.2f}: {verdict}." if sf
                        else f"σ ≈ {sigma:.1f} MPa.",
                suggestion="First-order estimate (pure tension/compression). "
                           "For bending/stress concentration, run a proper FEA analysis.",
            ))

    resp.issues = issues
    resp.printability_score = max(0, min(100, score))
    resp.summary = _summary(resp, ext, material)
    return resp


def _min_cross_section(body) -> Optional[float]:
    """Plus petite aire de section transversale le long de l'axe le plus long."""
    try:
        ext = body.extents
        axis = int(np.argmax(ext))
        normal = np.zeros(3)
        normal[axis] = 1.0
        lo = body.bounds[0][axis]
        hi = body.bounds[1][axis]
        heights = np.linspace(lo + 0.1 * (hi - lo), hi - 0.1 * (hi - lo), 15)
        origin = body.bounds[0].copy()
        sections = body.section_multiplane(plane_origin=origin, plane_normal=normal, heights=heights - origin[axis])
        areas = [abs(s.area) for s in sections if s is not None]
        areas = [a for a in areas if a > 1e-6]
        return min(areas) if areas else None
    except Exception:
        return None


def _summary(resp: AnalysisResponse, ext, material: str) -> str:
    parts = [
        f"Bounding box {ext[0]:.0f}×{ext[1]:.0f}×{ext[2]:.0f} mm.",
        f"Mass ≈ {resp.mass.mass_g:.1f} g ({material}).",
        f"Printability: {resp.printability_score}/100.",
    ]
    if resp.safety_factor is not None:
        parts.append(f"Safety factor ≈ {resp.safety_factor}.")
    return " ".join(parts)
