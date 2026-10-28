"""Prompt image editing."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.ai.image_edit import ImageEditError, edit_image
from app.core.auth_deps import require_firebase_user
from app.core.firebase import FirebaseUser

router = APIRouter(prefix="/api", tags=["images"])

_MAX_IMAGE_BYTES = 12 * 1024 * 1024
_SAFE_NAME = re.compile(r"^[\w.-]+\.(png|jpe?g|webp|gif)$", re.I)


def _filename(upload: UploadFile) -> str:
    name = (upload.filename or "").split("/")[-1].split("\\")[-1]
    if _SAFE_NAME.match(name):
        return name
    content = (upload.content_type or "").lower()
    if "jpeg" in content or "jpg" in content:
        return "image.jpg"
    if "webp" in content:
        return "image.webp"
    if "gif" in content:
        return "image.gif"
    return "image.png"


@router.post("/images/edit")
async def api_edit_image(
    file: UploadFile = File(...),
    prompt: str = Form(""),
    user: FirebaseUser = Depends(require_firebase_user),
):
    data = await file.read()
    if not data:
        raise HTTPException(400, "Image vide.")
    if len(data) > _MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image trop volumineuse.")
    content = (file.content_type or "").lower()
    if content and not content.startswith("image/"):
        raise HTTPException(400, "Le fichier joint n'est pas une image.")

    try:
        mime, encoded = await edit_image(
            data,
            filename=_filename(file),
            mime=file.content_type or "image/png",
            prompt=prompt,
            uid=user.uid,
        )
    except ImageEditError as exc:
        raise HTTPException(503, str(exc)) from exc

    return {"mime": mime, "data_b64": encoded}
