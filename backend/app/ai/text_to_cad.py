"""Generation d'un modele parametrique a partir d'une description textuelle.

Reconnait quelques familles de pieces courantes (plaque, bride, equerre,
boitier, support VESA) et instancie un historique de features coherent.
C'est le moteur du workflow #4 (« Cree un support mural VESA… »).
"""
from __future__ import annotations

import itertools
from typing import List

from app.ai.knowledge import (
    METRIC_CLEARANCE,
    detect_material,
    detect_thread,
    find_count,
    find_dimensions,
    find_named,
    inches_from_text,
)
from app.models.schemas import Document, Feature

_counter = itertools.count(1)


def _fid(prefix: str) -> str:
    return f"{prefix}-{next(_counter)}"


def _hole(x: float, y: float, dia: float, z_top: float, name: str) -> Feature:
    return Feature(
        id=_fid("hole"),
        type="hole",
        name=name,
        params={"x": x, "y": y, "diameter": dia, "through": True, "z_top": z_top},
    )


# --------------------------------------------------------------------------- #
def generate(prompt: str, material: str = "aluminium") -> Document:
    low = prompt.lower()
    mat = detect_material(prompt) or material

    if any(k in low for k in ["vesa", "support mural", "support d'ecran", "support ecran", "wall mount", "monitor mount"]):
        doc = _vesa_mount(prompt)
    elif any(k in low for k in ["bride", "flange"]):
        doc = _flange(prompt)
    elif any(k in low for k in ["equerre", "équerre", "bracket", " l ", "cornière", "corniere"]):
        doc = _l_bracket(prompt)
    elif any(k in low for k in ["boit", "boît", "box", "cube", "carter", "enclosure"]):
        doc = _box(prompt)
    elif any(k in low for k in ["cylindre", "tube", "axe", "rond", "disque", "disc"]):
        doc = _cylinder(prompt)
    elif any(k in low for k in ["boule", "sphere", "sphère", "spher", "ball"]):
        doc = _sphere(prompt)
    else:
        doc = _plate(prompt)

    doc.meta["material"] = mat
    doc.meta["generated_from"] = prompt
    return doc


# --------------------------------------------------------------------------- #
def _plate(prompt: str) -> Document:
    dims = find_dimensions(prompt)
    w = dims[0] if len(dims) >= 1 else (find_named(prompt, "largeur", "width") or 100)
    d = dims[1] if len(dims) >= 2 else (find_named(prompt, "profondeur", "longueur", "depth", "length") or 60)
    t = (dims[2] if len(dims) >= 3 else None) or find_named(prompt, "epaisseur", "épaisseur", "thickness") or 8

    feats: List[Feature] = [
        Feature(id=_fid("base"), type="extrude", name="Plate",
                params={"profile": {"shape": "rectangle", "w": w, "d": d}, "distance": t, "operation": "add"})
    ]
    thread = detect_thread(prompt)
    if thread or "trou" in prompt.lower() or "perç" in prompt.lower():
        dia = thread[1] if thread else 6.6
        m = 10
        for x in (-w / 2 + m, w / 2 - m):
            for y in (-d / 2 + m, d / 2 - m):
                feats.append(_hole(x, y, dia, t, f"Hole {thread[0] if thread else 'Ø6.6'}"))
    return Document(name="Plate", features=feats)


def _box(prompt: str) -> Document:
    dims = find_dimensions(prompt)
    w = dims[0] if len(dims) >= 1 else 80
    d = dims[1] if len(dims) >= 2 else 60
    h = dims[2] if len(dims) >= 3 else (find_named(prompt, "hauteur", "height") or 40)
    feats = [Feature(id=_fid("box"), type="box", name="Enclosure", params={"w": w, "d": d, "h": h})]
    if any(k in prompt.lower() for k in ["creux", "evid", "évid", "shell", "carter", "enclosure"]):
        feats.append(Feature(id=_fid("shell"), type="shell", name="Shell",
                             params={"thickness": find_named(prompt, "paroi", "wall", "epaisseur", "épaisseur") or 2.5}))
    return Document(name="Enclosure", features=feats)


def _sphere(prompt: str) -> Document:
    dia = find_named(prompt, "diametre", "diamètre", "diameter")
    r = find_named(prompt, "rayon", "radius") or (dia / 2 if dia else None) or 25
    feats = [Feature(id=_fid("sph"), type="sphere", name="Sphere", params={"r": r})]
    return Document(name="Sphere", features=feats)


def _cylinder(prompt: str) -> Document:
    r = (find_named(prompt, "diametre", "diamètre", "diameter") or 0) / 2 or \
        find_named(prompt, "rayon", "radius") or 25
    h = find_named(prompt, "hauteur", "longueur", "height", "length") or 60
    feats = [Feature(id=_fid("cyl"), type="cylinder", name="Cylinder", params={"r": r, "h": h})]
    bore = find_named(prompt, "alésage", "alesage", "perçage central", "bore")
    if bore or "tube" in prompt.lower():
        feats.append(Feature(id=_fid("bore"), type="hole", name="Bore",
                             params={"x": 0, "y": 0, "diameter": bore or r, "through": True, "z_top": h}))
    return Document(name="Cylinder", features=feats)


def _flange(prompt: str) -> Document:
    dia = find_named(prompt, "diametre", "diamètre", "diameter") or 120
    r = dia / 2
    t = find_named(prompt, "epaisseur", "épaisseur", "thickness") or 12
    bore = find_named(prompt, "alésage", "alesage", "bore") or dia * 0.4
    n = find_count(prompt) or 6
    thread = detect_thread(prompt)
    hole_dia = thread[1] if thread else 9.0
    bolt_circle = find_named(prompt, "entraxe", "cercle de perçage", "bcd") or (r * 1.5)

    feats: List[Feature] = [
        Feature(id=_fid("disc"), type="cylinder", name="Flange", params={"r": r, "h": t}),
        Feature(id=_fid("bore"), type="hole", name="Center bore",
                params={"x": 0, "y": 0, "diameter": bore, "through": True, "z_top": t}),
        Feature(
            id=_fid("pat"), type="pattern_circular",
            name=f"{n} holes {thread[0] if thread else ''}".strip(),
            params={
                "count": n, "angle": 360, "full": True, "cx": 0, "cy": 0,
                "feature": {
                    "id": _fid("h"), "type": "hole", "name": "Hole",
                    "params": {"x": bolt_circle / 2, "y": 0, "diameter": hole_dia,
                               "through": True, "z_top": t},
                },
            },
        ),
    ]
    return Document(name="Flange", features=feats)


def _l_bracket(prompt: str) -> Document:
    dims = find_dimensions(prompt)
    a = dims[0] if len(dims) >= 1 else 80     # longueur ailes
    b = dims[1] if len(dims) >= 2 else 80
    t = find_named(prompt, "epaisseur", "épaisseur", "thickness") or 6
    width = find_named(prompt, "largeur", "width") or 60

    feats = [
        Feature(id=_fid("h"), type="extrude", name="Horizontal leg",
                params={"profile": {"shape": "rectangle", "w": a, "d": width, "cx": a / 2 - t / 2, "cy": 0},
                        "distance": t, "operation": "add"}),
        Feature(id=_fid("v"), type="extrude", name="Vertical leg",
                params={"profile": {"shape": "rectangle", "w": t, "d": width, "cx": -a / 2 + t / 2, "cy": 0},
                        "distance": b, "operation": "add"}),
    ]
    return Document(name="Bracket", features=feats)


def _vesa_mount(prompt: str) -> Document:
    """Support mural pour ecran avec fixation VESA.

    Pour un ecran 27\" -> VESA 100x100 par defaut. Plaque + 4 trous VESA M4
    + 4 trous de fixation murale M6.
    """
    inch = inches_from_text(prompt) or 27
    vesa = 75.0 if "75" in prompt else 100.0
    margin = 30.0
    plate = vesa + 2 * margin
    t = find_named(prompt, "epaisseur", "épaisseur", "thickness") or 6

    vesa_dia = METRIC_CLEARANCE["M4"]
    wall_dia = METRIC_CLEARANCE["M6"]
    half = vesa / 2
    pw = plate / 2 - 12

    feats: List[Feature] = [
        Feature(id=_fid("plate"), type="extrude", name=f"Mount plate {inch:.0f}\"",
                params={"profile": {"shape": "rectangle", "w": plate, "d": plate}, "distance": t, "operation": "add"}),
    ]
    for x in (-half, half):
        for y in (-half, half):
            feats.append(_hole(x, y, vesa_dia, t, f"VESA M4 ({vesa:.0f}×{vesa:.0f})"))
    for x in (-pw, pw):
        for y in (-pw, pw):
            feats.append(_hole(x, y, wall_dia, t, "Wall mount M6"))

    doc = Document(name=f"VESA mount {inch:.0f}\"", features=feats)
    doc.meta["vesa"] = f"{vesa:.0f}x{vesa:.0f}"
    return doc
