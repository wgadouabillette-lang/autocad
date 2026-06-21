"""Routes HTTP de l'application Forma."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response

from app.ai import agent, analysis, chat, recap as recap_ai, text_to_cad
from app.core.auth_deps import optional_firebase_user, require_firebase_user, run_with_user_llm_keys
from app.core.config import settings
from app.core.firebase import FirebaseUser, find_user_by_email, upsert_user_directory
from app.engine import exporter, mesh_import
from app.engine.kernel import rebuild
from app.models.schemas import (
    AgentRequest,
    AgentResponse,
    AnalysisRequest,
    AnalysisResponse,
    ChatRequest,
    ChatResponse,
    Document,
    RebuildRequest,
    RebuildResult,
    TextToCadRequest,
)
from app.vision import drawing

router = APIRouter(prefix="/api")


@router.get("/health")
def health():
    return {
        "ok": True,
        "app": settings.app_name,
        "version": settings.version,
        "llm": settings.has_llm,
        "llm_provider": settings.llm_provider if settings.has_llm else "rules",
        "modelling_vision_model": settings.xai_modelling_vision_model,
        "modelling_cad_model": settings.xai_modelling_cad_model,
        "cad": True,
        "runtime": "full",
    }


@router.get("/users/lookup")
def lookup_user_by_email(
    email: str = Query(..., min_length=4, max_length=320),
    user: FirebaseUser = Depends(require_firebase_user),
):
    normalized = email.strip().lower()
    found = find_user_by_email(normalized)
    if found is None:
        raise HTTPException(404, "User not found.")
    upsert_user_directory(found)
    return {
        "uid": found.uid,
        "email": found.email,
        "displayName": found.display_name,
        "photoURL": found.photo_url,
    }


@router.post("/rebuild", response_model=RebuildResult)
def api_rebuild(req: RebuildRequest):
    return rebuild(req.document, req.material)


@router.post("/agent", response_model=AgentResponse)
def api_agent(req: AgentRequest, user: Optional[FirebaseUser] = Depends(optional_firebase_user)):
    if not req.prompt.strip():
        raise HTTPException(400, "Empty prompt.")
    images = [img.model_dump() for img in req.images]
    with run_with_user_llm_keys(user):
        return agent.run(
            req.document,
            req.prompt,
            req.material,
            req.ai_model,
            req.work_mode,
            images=images,
            uid=user.uid if user else None,
            workspace_id=req.workspace_id or None,
        )


@router.post("/text-to-cad", response_model=AgentResponse)
def api_text_to_cad(req: TextToCadRequest, user: Optional[FirebaseUser] = Depends(optional_firebase_user)):
    from app.ai import agent as agent_mod
    from app.models.schemas import Document

    with run_with_user_llm_keys(user):
        if agent_mod.llm.available():
            empty = Document(name="Untitled", units="mm", features=[], meta={})
            return agent_mod.run(
                empty,
                req.prompt,
                req.material,
                req.ai_model,
                req.work_mode or "agent",
                uid=user.uid if user else None,
                workspace_id=req.workspace_id or None,
            )
    doc = text_to_cad.generate(req.prompt, req.material)
    result = rebuild(doc, doc.meta.get("material", req.material))
    return AgentResponse(
        document=doc,
        message=f"Generated model: {doc.name}.",
        rebuild=result,
        source="rules",
    )


@router.post("/chat", response_model=ChatResponse)
def api_chat(req: ChatRequest, user: Optional[FirebaseUser] = Depends(optional_firebase_user)):
    if not req.prompt.strip():
        raise HTTPException(400, "Empty prompt.")
    with run_with_user_llm_keys(user):
        return chat.run(
            req.prompt,
            req.messages,
            req.ai_model,
            req.chat_instructions,
            uid=user.uid if user else None,
            workspace_id=req.workspace_id or None,
        )


@router.post("/analyze", response_model=AnalysisResponse)
def api_analyze(req: AnalysisRequest):
    return analysis.analyze(req.document, req.material, req.load_n, req.min_wall_mm)


@router.post("/import-mesh")
async def api_import_mesh(
    file: UploadFile = File(...),
    material: str = Form("aluminium"),
):
    """Importe une pièce 3D préfabriquée (STL, OBJ, PLY, GLB, 3MF…)."""
    data = await file.read()
    try:
        doc, _mesh = mesh_import.import_mesh_file(data, file.filename or "piece.stl", material)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    doc.meta["material"] = material
    result = rebuild(doc, material)
    return {
        "document": doc.model_dump(),
        "rebuild": result.model_dump(),
        "message": f"Imported part: {doc.name} ({len(doc.features)} feature(s)).",
    }


@router.post("/recap")
async def api_recap(
    file: UploadFile = File(...),
    title: str = Form(""),
    duration_ms: int = Form(0),
    user: Optional[FirebaseUser] = Depends(require_firebase_user),
):
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty recording file.")
    if len(data) > 100 * 1024 * 1024:
        raise HTTPException(413, "Recording too large (max 100 MB).")

    with run_with_user_llm_keys(user):
        transcript = await recap_ai.transcribe_recording(data, file.filename or "recording.webm")
        note_title, body_html = recap_ai.generate_recap_html(
            title=title.strip() or "Meeting recap",
            transcript=transcript,
            duration_ms=max(0, duration_ms),
            uid=user.uid if user else None,
        )

    return {
        "title": note_title,
        "body_html": body_html,
        "transcript": transcript or None,
    }


@router.post("/import")
async def api_import(
    file: UploadFile = File(...),
    real_width_mm: Optional[float] = Form(None),
    thickness_mm: float = Form(5.0),
    material: str = Form("aluminium"),
):
    data = await file.read()
    try:
        doc, report = drawing.analyze(data, file.filename or "dessin", real_width_mm, thickness_mm)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    doc.meta["material"] = material
    result = rebuild(doc, material)
    return {
        "document": doc.model_dump(),
        "report": report.__dict__,
        "rebuild": result.model_dump(),
        "message": f"Drawing analyzed: {report.profile_points} vertices, {report.holes} holes detected.",
    }


@router.post("/export")
def api_export(document: Document, fmt: str = "stl"):
    try:
        data, mime, filename = exporter.export_document(document, fmt)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    return Response(
        content=data,
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/examples")
def api_examples():
    """Quelques pieces de demarrage generees a la volee."""
    prompts = [
        "Flange Ø120 thickness 12 with 6 M8 holes",
        "27-inch wall mount VESA 100 monitor bracket",
        "Plate 120x80x10 with 4 M6 holes",
        "Bracket 80x80 thickness 6",
    ]
    return [
        {"prompt": p, "document": text_to_cad.generate(p).model_dump()}
        for p in prompts
    ]
