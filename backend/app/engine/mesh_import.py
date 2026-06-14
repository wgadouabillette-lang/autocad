"""Import de pièces 3D préfabriquées (mesh) vers un Document Forma."""
from __future__ import annotations

import io
import os
from typing import Tuple

import numpy as np
import trimesh

from app.models.schemas import Document, Feature

MESH_EXTENSIONS = {
    ".stl": "stl",
    ".obj": "obj",
    ".ply": "ply",
    ".off": "off",
    ".glb": "glb",
    ".gltf": "gltf",
    ".3mf": "3mf",
}

STEP_EXTENSIONS = {".step", ".stp", ".iges", ".igs"}


def _extension(filename: str) -> str:
    return os.path.splitext(filename or "")[1].lower()


def load_mesh_bytes(data: bytes, filename: str) -> trimesh.Trimesh:
    ext = _extension(filename)
    if ext in STEP_EXTENSIONS:
        raise ValueError(
            "STEP/IGES files cannot be imported directly yet. "
            "Export the part as STL or OBJ from SolidWorks, Fusion 360, FreeCAD, etc., "
            "then re-import here."
        )
    file_type = MESH_EXTENSIONS.get(ext)
    if not file_type:
        supported = ", ".join(sorted(MESH_EXTENSIONS))
        raise ValueError(f"Unsupported format ({ext or 'unknown'}). Accepted formats: {supported}.")

    try:
        loaded = trimesh.load(
            io.BytesIO(data),
            file_type=file_type,
            force="mesh",
            skip_materials=True,
        )
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Unable to read file: {exc}") from exc

    if loaded is None:
        raise ValueError("Empty or unreadable file.")

    if isinstance(loaded, trimesh.Scene):
        meshes = [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh)]
        if not meshes:
            raise ValueError("No 3D mesh found in file.")
        body = trimesh.util.concatenate(meshes) if len(meshes) > 1 else meshes[0]
    elif isinstance(loaded, trimesh.Trimesh):
        body = loaded
    else:
        raise ValueError("Unsupported geometry type.")

    body = body.copy()
    body.process(validate=True)
    # Centrer sur l'origine pour un affichage cohérent dans le viewport.
    body.apply_translation(-body.centroid)
    return body


def mesh_params(mesh: trimesh.Trimesh) -> dict:
    verts = mesh.vertices.astype(np.float64)
    faces = mesh.faces.astype(np.int64)
    return {
        "positions": verts.flatten().tolist(),
        "indices": faces.flatten().tolist(),
        "triangle_count": int(len(faces)),
        "vertex_count": int(len(verts)),
    }


def document_from_mesh(mesh: trimesh.Trimesh, filename: str) -> Document:
    base = os.path.splitext(os.path.basename(filename or "import"))[0] or "Imported part"
    safe_name = base[:80]
    return Document(
        name=safe_name,
        units="mm",
        features=[
            Feature(
                id="import-mesh-1",
                type="imported_mesh",
                name=safe_name,
                suppressed=False,
                params={
                    **mesh_params(mesh),
                    "source_file": os.path.basename(filename or ""),
                    "source_format": _extension(filename).lstrip("."),
                },
            )
        ],
        meta={"import_kind": "mesh", "source_file": os.path.basename(filename or "")},
    )


def import_mesh_file(data: bytes, filename: str, material: str = "aluminium") -> Tuple[Document, trimesh.Trimesh]:
    mesh = load_mesh_bytes(data, filename)
    doc = document_from_mesh(mesh, filename)
    doc.meta["material"] = material
    return doc, mesh
