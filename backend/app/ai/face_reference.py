"""Parse les références de faces envoyées par le frontend (sélection 3D)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Tuple

FACE_BLOCK_RE = re.compile(
    r"\[(?:REFERENCE FACE|RÉFÉRENCE FACE)(?:\s+\d+/\d+)?\]\s*\n"
    r"Zone\s*:\s*(.+?)\n"
    r"(?:Normal|Normale) \(mm\)\s*:\s*\(([^)]+)\)\n"
    r"(?:Reference point|Point repère) \(mm\)\s*:\s*\(([^)]+)\)",
    re.MULTILINE,
)


@dataclass(frozen=True)
class ParsedFaceReference:
    label: str
    normal: Tuple[float, float, float]
    centroid: Tuple[float, float, float]


def _parse_triplet(s: str) -> Tuple[float, float, float]:
    parts = [float(x.strip()) for x in s.split(",")]
    if len(parts) != 3:
        raise ValueError(f"triplet invalide: {s!r}")
    return parts[0], parts[1], parts[2]


def parse_face_references(prompt: str) -> List[ParsedFaceReference]:
    faces: List[ParsedFaceReference] = []
    for m in FACE_BLOCK_RE.finditer(prompt):
        faces.append(
            ParsedFaceReference(
                label=m.group(1).strip(),
                normal=_parse_triplet(m.group(2)),
                centroid=_parse_triplet(m.group(3)),
            )
        )
    return faces


def has_face_constraint(prompt: str) -> bool:
    return (
        "[FACE CONSTRAINT" in prompt
        or "[CONSIGNE FACES" in prompt
        or len(parse_face_references(prompt)) > 0
    )


def nearest_face_xy(
    x: float, y: float, faces: List[ParsedFaceReference]
) -> Tuple[ParsedFaceReference, float]:
    best = faces[0]
    best_d = float("inf")
    for f in faces:
        cx, cy, _ = f.centroid
        d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
        if d < best_d:
            best_d = d
            best = f
    return best, best_d


def xy_near_any_face(
    x: float, y: float, faces: List[ParsedFaceReference], max_dist_mm: float
) -> bool:
    if not faces:
        return True
    _, d = nearest_face_xy(x, y, faces)
    return d <= max_dist_mm


def z_top_for_hole(face: ParsedFaceReference, bbox_max_z: float) -> float:
    """z_top pour perçage vertical (axe Z) ancré sur la face sélectionnée."""
    _, _, cz = face.centroid
    _, _, nz = face.normal
    if nz > 0.5:
        return cz + 0.1
    if nz < -0.5:
        return float(bbox_max_z) + 0.1
    return max(float(bbox_max_z), cz) + 0.1


def max_xy_tolerance_mm(bbox_min, bbox_max) -> float:
    span_x = float(bbox_max[0]) - float(bbox_min[0])
    span_y = float(bbox_max[1]) - float(bbox_min[1])
    span = max(span_x, span_y, 20.0)
    return span * 0.12 + 5.0


LOCAL_FEATURE_TYPES = frozenset({"hole", "pattern_linear", "pattern_circular"})


def _snap_hole_params(
    params: dict, face: ParsedFaceReference, bbox_max_z: float
) -> dict:
    cx, cy, _ = face.centroid
    out = dict(params)
    out["x"] = cx
    out["y"] = cy
    out["z_top"] = z_top_for_hole(face, bbox_max_z)
    return out


def filter_operations_for_faces(
    operations: List[dict],
    faces: List[ParsedFaceReference],
    bbox_min,
    bbox_max,
) -> List[dict]:
    """Ne garde que les ajouts de trous/patterns ; ancre x,y,z sur les faces sélectionnées."""
    if not faces:
        return operations
    max_dist = max_xy_tolerance_mm(bbox_min, bbox_max)
    zmax = float(bbox_max[2])
    primary = faces[0]
    out: List[dict] = []

    for op in operations or []:
        kind = op.get("op", "noop")
        if kind != "add":
            continue
        feat = op.get("feature") or {}
        ftype = feat.get("type")
        if ftype not in LOCAL_FEATURE_TYPES:
            continue

        if ftype == "hole":
            params = dict(feat.get("params") or {})
            x = float(params.get("x", 0))
            y = float(params.get("y", 0))
            face, dist = nearest_face_xy(x, y, faces)
            if dist > max_dist:
                face = primary
            params = _snap_hole_params(params, face, zmax)
            out.append(
                {
                    "op": "add",
                    "feature": {**feat, "params": params},
                }
            )
            continue

        params = dict(feat.get("params") or {})
        cx, cy, _ = primary.centroid
        if ftype == "pattern_circular":
            params["cx"] = cx
            params["cy"] = cy
            sub = dict(params.get("feature") or {})
            if sub.get("type") == "hole":
                sub_params = _snap_hole_params(
                    dict(sub.get("params") or {}), primary, zmax
                )
                bolt_r = float(sub_params.get("x", cx)) - cx
                if abs(bolt_r) < 0.5:
                    bolt_r = max(8.0, max_xy_tolerance_mm(bbox_min, bbox_max))
                sub_params["x"] = cx + bolt_r
                sub_params["y"] = cy
                sub = {**sub, "params": sub_params}
            params["feature"] = sub
        elif ftype == "pattern_linear":
            sub = dict(params.get("feature") or {})
            if sub.get("type") == "hole":
                sub_params = _snap_hole_params(
                    dict(sub.get("params") or {}), primary, zmax
                )
                pitch = float(params.get("dx") or 0) or 20.0
                n = int(params.get("count") or 1)
                sub_params["x"] = cx - pitch * (n - 1) / 2
                sub_params["y"] = cy
                sub = {**sub, "params": sub_params}
            params["feature"] = sub

        out.append({"op": "add", "feature": {**feat, "params": params}})

    return out
