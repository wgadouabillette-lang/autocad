"""Noyau geometrique parametrique.

Rejoue l'historique de features d'un `Document` et produit un solide
(trimesh.Trimesh) via des operations booleennes reelles (CSG) fournies par
manifold3d. Le solide est ensuite tessellise pour le frontend.

Operations booleennes : engine='manifold' (robuste, sans compilation native).
Pour les conges/chanfreins reels (B-Rep) un noyau OpenCascade/CadQuery
optionnel peut etre branche ici ; en son absence ils sont signales.
"""
from __future__ import annotations

import math
from typing import List, Optional, Tuple

import numpy as np
import trimesh
from shapely.geometry import Polygon
from shapely import affinity

from app.models.schemas import (
    BBox,
    Document,
    Feature,
    MassProps,
    Mesh,
    RebuildResult,
)

# Densites (g/mm^3)
MATERIAL_DENSITY = {
    "aluminium": 0.00270,
    "acier": 0.00785,
    "inox": 0.00800,
    "abs": 0.00104,
    "pla": 0.00124,
    "petg": 0.00127,
    "titane": 0.00451,
    "laiton": 0.00850,
    "nylon": 0.00114,
}

# Limite elastique approximative (MPa) pour l'estimation de contrainte
MATERIAL_YIELD_MPA = {
    "aluminium": 240.0,
    "acier": 250.0,
    "inox": 215.0,
    "titane": 880.0,
    "laiton": 200.0,
    "abs": 40.0,
    "pla": 50.0,
    "petg": 50.0,
    "nylon": 45.0,
}


# --------------------------------------------------------------------------- #
#  Profils 2D (esquisses)
# --------------------------------------------------------------------------- #
def profile_to_polygon(profile: dict) -> Polygon:
    """Convertit une description de profil 2D en polygone shapely."""
    shape = (profile or {}).get("shape", "rectangle")

    if shape == "rectangle":
        w = float(profile.get("w", profile.get("width", 50)))
        d = float(profile.get("d", profile.get("height", 30)))
        cx = float(profile.get("cx", 0))
        cy = float(profile.get("cy", 0))
        poly = Polygon([
            (cx - w / 2, cy - d / 2),
            (cx + w / 2, cy - d / 2),
            (cx + w / 2, cy + d / 2),
            (cx - w / 2, cy + d / 2),
        ])

    elif shape == "circle":
        r = float(profile.get("r", profile.get("radius", 25)))
        cx = float(profile.get("cx", 0))
        cy = float(profile.get("cy", 0))
        poly = Polygon([
            (cx + r * math.cos(t), cy + r * math.sin(t))
            for t in np.linspace(0, 2 * math.pi, 72, endpoint=False)
        ])

    elif shape == "polygon":
        # polygone regulier a n cotes OU liste de points explicite
        if "points" in profile:
            poly = Polygon([(float(p[0]), float(p[1])) for p in profile["points"]])
        else:
            n = int(profile.get("sides", 6))
            r = float(profile.get("r", 25))
            cx = float(profile.get("cx", 0))
            cy = float(profile.get("cy", 0))
            poly = Polygon([
                (cx + r * math.cos(2 * math.pi * i / n + math.pi / 2),
                 cy + r * math.sin(2 * math.pi * i / n + math.pi / 2))
                for i in range(n)
            ])

    elif shape == "slot":
        # lumiere (oblong) : deux demi-cercles relies
        length = float(profile.get("length", 40))
        r = float(profile.get("r", 8))
        cx = float(profile.get("cx", 0))
        cy = float(profile.get("cy", 0))
        half = max(length / 2 - r, 0.0)
        pts = []
        for t in np.linspace(-math.pi / 2, math.pi / 2, 24):
            pts.append((cx + half + r * math.cos(t), cy + r * math.sin(t)))
        for t in np.linspace(math.pi / 2, 3 * math.pi / 2, 24):
            pts.append((cx - half + r * math.cos(t), cy + r * math.sin(t)))
        poly = Polygon(pts)

    elif shape == "points":
        poly = Polygon([(float(p[0]), float(p[1])) for p in profile.get("points", [])])

    else:
        raise ValueError(f"Profil inconnu: {shape}")

    if not poly.is_valid:
        poly = poly.buffer(0)
    return poly


def _extrude(polygon: Polygon, distance: float, z0: float = 0.0) -> trimesh.Trimesh:
    mesh = trimesh.creation.extrude_polygon(polygon, height=abs(distance))
    if distance < 0:
        mesh.apply_translation([0, 0, -abs(distance)])
    mesh.apply_translation([0, 0, z0])
    return mesh


# --------------------------------------------------------------------------- #
#  Operations booleennes
# --------------------------------------------------------------------------- #
def _boolean(a: Optional[trimesh.Trimesh], b: trimesh.Trimesh, op: str) -> trimesh.Trimesh:
    if a is None:
        return b
    try:
        if op == "cut":
            return trimesh.boolean.difference([a, b], engine="manifold")
        if op == "intersect":
            return trimesh.boolean.intersection([a, b], engine="manifold")
        return trimesh.boolean.union([a, b], engine="manifold")
    except Exception:
        # repli : concatenation simple (le maillage reste affichable)
        return trimesh.util.concatenate([a, b])


# --------------------------------------------------------------------------- #
#  Construction d'un solide a partir d'une feature individuelle
# --------------------------------------------------------------------------- #
def _mesh_from_import_params(p: dict) -> Optional[trimesh.Trimesh]:
    positions = p.get("positions")
    indices = p.get("indices")
    if not positions or not indices:
        return None
    verts = np.asarray(positions, dtype=np.float64).reshape(-1, 3)
    faces = np.asarray(indices, dtype=np.int64).reshape(-1, 3)
    if len(verts) == 0 or len(faces) == 0:
        return None
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=True)
    return mesh


def _build_primitive(feat: Feature) -> Tuple[Optional[trimesh.Trimesh], str]:
    """Retourne (solide, operation) ou solide=None si non geometrique."""
    p = feat.params
    t = feat.type

    if t == "box":
        w = float(p.get("w", p.get("width", 50)))
        d = float(p.get("d", p.get("depth", 50)))
        h = float(p.get("h", p.get("height", 50)))
        m = trimesh.creation.box(extents=[w, d, h])
        cx, cy, cz = p.get("cx", 0), p.get("cy", 0), p.get("cz", h / 2)
        m.apply_translation([cx, cy, cz])
        return m, p.get("operation", "add")

    if t == "cylinder":
        r = float(p.get("r", p.get("radius", 25)))
        h = float(p.get("h", p.get("height", 50)))
        m = trimesh.creation.cylinder(radius=r, height=h, sections=64)
        cx, cy, cz = p.get("cx", 0), p.get("cy", 0), p.get("cz", h / 2)
        m.apply_translation([cx, cy, cz])
        return m, p.get("operation", "add")

    if t == "sphere":
        r = float(p.get("r", p.get("radius", 25)))
        m = trimesh.creation.icosphere(subdivisions=3, radius=r)
        cx, cy, cz = p.get("cx", 0), p.get("cy", 0), p.get("cz", r)
        m.apply_translation([cx, cy, cz])
        return m, p.get("operation", "add")

    if t == "extrude":
        poly = profile_to_polygon(p.get("profile", {}))
        dist = float(p.get("distance", 10))
        z0 = float(p.get("z0", 0))
        m = _extrude(poly, dist, z0)
        return m, p.get("operation", "add")

    if t == "hole":
        x = float(p.get("x", 0))
        y = float(p.get("y", 0))
        dia = float(p.get("diameter", 6))
        depth = float(p.get("depth", 1000 if p.get("through", True) else 10))
        m = trimesh.creation.cylinder(radius=dia / 2, height=depth + 0.2, sections=48)
        # perce depuis le haut (z descendant). z_top fourni ou grand.
        z_top = float(p.get("z_top", 1000))
        m.apply_translation([x, y, z_top - depth / 2])
        return m, "cut"

    return None, "noop"


def _apply_pattern(feat: Feature) -> List[Tuple[trimesh.Trimesh, str]]:
    """Replique une sous-feature (lineaire ou circulaire)."""
    p = feat.params
    template = Feature(**p["feature"]) if isinstance(p.get("feature"), dict) else None
    out: List[Tuple[trimesh.Trimesh, str]] = []
    if template is None:
        return out

    base, op = _build_primitive(template)
    if base is None:
        return out

    count = int(p.get("count", 1))
    if feat.type == "pattern_linear":
        dx, dy, dz = p.get("dx", 0), p.get("dy", 0), p.get("dz", 0)
        for i in range(count):
            inst = base.copy()
            inst.apply_translation([dx * i, dy * i, dz * i])
            out.append((inst, op))

    elif feat.type == "pattern_circular":
        angle = math.radians(float(p.get("angle", 360)))
        cx, cy = float(p.get("cx", 0)), float(p.get("cy", 0))
        full = abs(angle - 2 * math.pi) < 1e-6 or p.get("full", True)
        step = angle / (count if full else max(count - 1, 1))
        for i in range(count):
            inst = base.copy()
            a = step * i
            # rotation autour de l'axe Z passant par (cx, cy)
            T = trimesh.transformations.rotation_matrix(a, [0, 0, 1], point=[cx, cy, 0])
            inst.apply_transform(T)
            out.append((inst, op))

    return out


# --------------------------------------------------------------------------- #
#  Rebuild complet
# --------------------------------------------------------------------------- #
def rebuild(document: Document, material: str = "aluminium") -> RebuildResult:
    res = RebuildResult()
    body: Optional[trimesh.Trimesh] = None
    has_imported_mesh = any(
        f.type == "imported_mesh" and not f.suppressed for f in document.features
    )

    for feat in document.features:
        if feat.suppressed:
            continue
        try:
            if feat.type in ("pattern_linear", "pattern_circular"):
                for inst, op in _apply_pattern(feat):
                    body = _boolean(body, inst, op)
                continue

            if feat.type in ("fillet", "chamfer"):
                res.warnings.append(
                    f"'{feat.type}' approximatif : le congé/chanfrein B-Rep exact "
                    "nécessite le noyau optionnel CadQuery (voir README)."
                )
                continue

            if feat.type == "shell":
                if body is not None:
                    th = float(feat.params.get("thickness", 2))
                    try:
                        inner = body.copy()
                        inner.apply_scale(max(1 - 2 * th / max(body.extents), 0.05))
                        body = _boolean(body, inner, "cut")
                    except Exception:
                        res.warnings.append("Coque (shell) non applicable a ce solide.")
                continue

            if feat.type == "imported_mesh":
                solid = _mesh_from_import_params(feat.params)
                if solid is None:
                    res.errors.append(f"Feature '{feat.name or feat.id}': maillage importé invalide.")
                    continue
                body = solid if body is None else _boolean(body, solid, "add")
                continue

            solid, op = _build_primitive(feat)
            if solid is not None:
                body = _boolean(body, solid, op)

        except Exception as exc:  # noqa: BLE001
            res.errors.append(f"Feature '{feat.name or feat.id}': {exc}")

    if body is None or len(body.faces) == 0:
        res.ok = len(res.errors) == 0
        return res

    if has_imported_mesh:
        res.warnings.append(
            "Imported part (mesh): AI does not modify the original parametric feature tree."
        )

    body.process(validate=True)
    res.mesh = _to_mesh(body)
    res.bbox = BBox(min=list(body.bounds[0]), max=list(body.bounds[1]))
    res.mass = _mass_props(body, material)
    res.ok = len(res.errors) == 0
    return res


def _to_mesh(body: trimesh.Trimesh) -> Mesh:
    body = body.copy()
    # faces lisses + normales par sommet
    verts = body.vertices.astype(np.float32)
    faces = body.faces.astype(np.int64)
    normals = body.vertex_normals.astype(np.float32)
    return Mesh(
        positions=verts.flatten().tolist(),
        normals=normals.flatten().tolist(),
        indices=faces.flatten().tolist(),
    )


def _mass_props(body: trimesh.Trimesh, material: str) -> MassProps:
    density = MATERIAL_DENSITY.get(material.lower(), MATERIAL_DENSITY["aluminium"])
    vol = float(abs(body.volume))
    try:
        com = list(body.center_mass)
    except Exception:
        com = list(body.bounds.mean(axis=0))
    return MassProps(
        volume_mm3=vol,
        area_mm2=float(body.area),
        mass_g=vol * density,
        material=material,
        center_of_mass=[float(c) for c in com],
        watertight=bool(body.is_watertight),
    )


def build_trimesh(document: Document) -> Optional[trimesh.Trimesh]:
    """Helper : reconstruit et renvoie le trimesh brut (pour export)."""
    body: Optional[trimesh.Trimesh] = None
    for feat in document.features:
        if feat.suppressed:
            continue
        if feat.type in ("pattern_linear", "pattern_circular"):
            for inst, op in _apply_pattern(feat):
                body = _boolean(body, inst, op)
            continue
        if feat.type in ("fillet", "chamfer"):
            continue
        if feat.type == "shell" and body is not None:
            th = float(feat.params.get("thickness", 2))
            try:
                inner = body.copy()
                inner.apply_scale(max(1 - 2 * th / max(body.extents), 0.05))
                body = _boolean(body, inner, "cut")
            except Exception:
                pass
            continue
        if feat.type == "imported_mesh":
            solid = _mesh_from_import_params(feat.params)
            if solid is not None:
                body = solid if body is None else _boolean(body, solid, "add")
            continue
        solid, op = _build_primitive(feat)
        if solid is not None:
            body = _boolean(body, solid, op)
    return body
