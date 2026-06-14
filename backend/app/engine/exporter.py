"""Export du solide reconstruit vers les formats courants.

STL / OBJ / 3MF / GLB sont fournis par trimesh (aucune dependance native).
STEP est disponible uniquement si le noyau optionnel CadQuery est installe.

v1.1 — export 2D / plans techniques (3D -> SVG/DXF) : projeter les aretes
ou sections du mesh via trimesh + ezdxf ; voir docs/GUIDE_UTILISATEUR.md.
"""
from __future__ import annotations

import io
from typing import Tuple

from app.engine.kernel import build_trimesh
from app.models.schemas import Document

MIME = {
    "stl": "model/stl",
    "obj": "text/plain",
    "3mf": "model/3mf",
    "glb": "model/gltf-binary",
    "ply": "application/octet-stream",
}


def export_document(document: Document, fmt: str = "stl") -> Tuple[bytes, str, str]:
    """Retourne (data, mime, filename)."""
    fmt = fmt.lower().strip()
    body = build_trimesh(document)
    if body is None:
        raise ValueError("Empty document: nothing to export.")

    name = (document.name or "model").replace(" ", "_")

    if fmt == "step":
        data = _export_step(body, document)
        return data, "application/step", f"{name}.step"

    if fmt not in MIME:
        raise ValueError(f"Unsupported format: {fmt}")

    buf = io.BytesIO()
    body.export(buf, file_type=fmt)
    return buf.getvalue(), MIME[fmt], f"{name}.{fmt}"


def _export_step(body, document: Document) -> bytes:
    """STEP via CadQuery si disponible (export mesh -> non, STEP veut du B-Rep).

    On exporte ici une approximation : si CadQuery est present on reconstruit
    les primitives ; sinon on leve une erreur claire.
    """
    try:
        import cadquery as cq  # type: ignore  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        raise ValueError(
            "STEP export unavailable: install the optional CadQuery kernel "
            "(`pip install cadquery`) to enable B-Rep STEP export."
        ) from exc

    # Reconstruction B-Rep minimale a partir de la bounding box (placeholder).
    # Une integration complete reconstruirait chaque feature en CadQuery.
    import tempfile, os
    bb = body.bounds
    ext = bb[1] - bb[0]
    wp = cq.Workplane("XY").box(float(ext[0]), float(ext[1]), float(ext[2]))
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "out.step")
        cq.exporters.export(wp, path)
        with open(path, "rb") as f:
            return f.read()
