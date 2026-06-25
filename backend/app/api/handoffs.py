"""Création et validation des handoffs conversationnels."""
from __future__ import annotations

import time
import uuid
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.ai.usage import user_has_ai_access
from app.core.auth_deps import require_firebase_user
from app.core.firebase import FirebaseUser

router = APIRouter(prefix="/api/handoffs", tags=["handoffs"])

HANDOFF_MAX_MESSAGES = 20
HANDOFF_MAX_NOTE_HTML = 200_000


class HandoffMessageInput(BaseModel):
    role: str
    text: str


class CreateHandoffRequest(BaseModel):
    kind: Literal["ai-segment", "manual-note"]
    target_type: Literal["dm", "group"] = Field(alias="targetType")
    recipient_uid: Optional[str] = Field(default=None, alias="recipientUid")
    group_id: Optional[str] = Field(default=None, alias="groupId")
    message_indices: Optional[List[int]] = Field(default=None, alias="messageIndices")
    messages: Optional[List[HandoffMessageInput]] = None
    note_title: Optional[str] = Field(default=None, alias="noteTitle")
    note_body_html: Optional[str] = Field(default=None, alias="noteBodyHtml")
    source_session_id: Optional[str] = Field(default=None, alias="sourceSessionId")
    title: Optional[str] = None

    model_config = {"populate_by_name": True}


class CreateHandoffResponse(BaseModel):
    handoff_id: str = Field(alias="handoffId")
    inbox_text: str = Field(alias="inboxText")
    title: str
    preview: str

    model_config = {"populate_by_name": True}


def _load_group_participants(group_id: str) -> List[str]:
    from app.core.firebase import _db, _ensure_db

    _ensure_db()
    if _db is None:
        return []
    try:
        snap = _db.collection("groupChats").document(group_id).get()
        if not snap.exists:
            return []
        data = snap.to_dict() or {}
        participants = data.get("participants")
        if not isinstance(participants, list):
            return []
        return [str(uid) for uid in participants if isinstance(uid, str) and uid.strip()]
    except Exception:
        return []


def _assert_sender_can_handoff_ai_segment(
    sender_uid: str,
    *,
    recipient_uid: Optional[str],
    group_id: Optional[str],
    target_type: str,
) -> None:
    sender_has_ai = user_has_ai_access(sender_uid)

    if target_type == "dm":
        if not recipient_uid:
            raise HTTPException(400, "recipientUid is required for DM handoffs.")
        if user_has_ai_access(recipient_uid):
            return
        if not sender_has_ai:
            raise HTTPException(
                403,
                "Un abonnement Pro (ou Entreprise) est requis pour transmettre un extrait IA à un utilisateur sans accès IA.",
            )
        return

    if not group_id:
        raise HTTPException(400, "groupId is required for group handoffs.")

    participants = _load_group_participants(group_id)
    if not participants:
        raise HTTPException(404, "Group not found.")

    if all(user_has_ai_access(uid) for uid in participants):
        return
    if not sender_has_ai:
        raise HTTPException(
            403,
            "Un abonnement Pro (ou Entreprise) est requis : ce groupe contient au moins un membre sans accès IA.",
        )


def _build_preview(kind: str, messages: List[Dict[str, str]], note_title: str, note_html: str) -> str:
    if kind == "manual-note":
        plain = note_title.strip()
        if plain:
            return plain[:160]
        stripped = note_html.replace("<", " <").split()
        text = " ".join(stripped)[:160]
        return text or "Note partagée"

    for message in messages:
        text = (message.get("text") or "").strip()
        if text:
            return text[:160]
    return "Extrait de conversation"


def _write_handoff_doc(payload: Dict[str, Any]) -> str:
    from app.core.firebase import _db, _ensure_db

    _ensure_db()
    if _db is None:
        raise HTTPException(503, "Database unavailable.")

    handoff_id = f"handoff-{uuid.uuid4().hex[:16]}"
    try:
        _db.collection("handoffs").document(handoff_id).set(payload)
    except Exception as exc:
        raise HTTPException(500, "Unable to save handoff.") from exc
    return handoff_id


@router.post("", response_model=CreateHandoffResponse)
def create_handoff(
    body: CreateHandoffRequest,
    user: FirebaseUser = Depends(require_firebase_user),
):
    sender_name = ((user.email or "utilisateur").split("@")[0]).strip() or "Utilisateur"
    target_type = body.target_type

    if target_type == "dm" and not body.recipient_uid:
        raise HTTPException(400, "recipientUid is required.")
    if target_type == "group" and not body.group_id:
        raise HTTPException(400, "groupId is required.")
    if body.recipient_uid and body.recipient_uid == user.uid:
        raise HTTPException(400, "Cannot handoff to yourself.")

    normalized_messages: List[Dict[str, str]] = []
    note_title = (body.note_title or "").strip()
    note_html = body.note_body_html or ""

    if body.kind == "ai-segment":
        _assert_sender_can_handoff_ai_segment(
            user.uid,
            recipient_uid=body.recipient_uid,
            group_id=body.group_id,
            target_type=target_type,
        )
        source_messages = body.messages or []
        if body.message_indices is not None:
            picked = []
            for index in body.message_indices[:HANDOFF_MAX_MESSAGES]:
                if 0 <= index < len(source_messages):
                    picked.append(source_messages[index])
            source_messages = picked
        if not source_messages:
            raise HTTPException(400, "Select at least one message to handoff.")
        if len(source_messages) > HANDOFF_MAX_MESSAGES:
            raise HTTPException(400, f"Maximum {HANDOFF_MAX_MESSAGES} messages per handoff.")

        for message in source_messages:
            role = message.role if message.role in ("user", "assistant", "system") else "user"
            text = (message.text or "").strip()
            if text:
                normalized_messages.append({"role": role, "text": text})
        if not normalized_messages:
            raise HTTPException(400, "Selected messages are empty.")
    else:
        if len(note_html.encode("utf-8")) > HANDOFF_MAX_NOTE_HTML:
            raise HTTPException(413, "Note content is too large.")
        plain = note_html.replace("<", " ").replace(">", " ").strip()
        if not note_title and not plain:
            raise HTTPException(400, "Note title or body is required.")

    title = (body.title or "").strip()
    if not title:
        if body.kind == "manual-note":
            title = f"Handoff · {note_title or 'Note'}"
        else:
            first_user = next((m["text"] for m in normalized_messages if m["role"] == "user"), "")
            snippet = (first_user or normalized_messages[0]["text"])[:48]
            title = f"Handoff · {snippet}" if snippet else "Handoff · Conversation"

    preview = _build_preview(body.kind, normalized_messages, note_title, note_html)
    inbox_text = (
        f"{sender_name} vous a transmis une note"
        if body.kind == "manual-note"
        else f"{sender_name} vous a transmis un extrait de conversation"
    )

    doc: Dict[str, Any] = {
        "senderUid": user.uid,
        "senderName": sender_name,
        "targetType": target_type,
        "kind": body.kind,
        "title": title,
        "preview": preview,
        "createdAt": int(time.time() * 1000),
    }
    if body.recipient_uid:
        doc["recipientUid"] = body.recipient_uid
    if body.group_id:
        doc["groupId"] = body.group_id
    if body.source_session_id:
        doc["sourceSessionId"] = body.source_session_id
    if normalized_messages:
        doc["messages"] = normalized_messages
    if body.kind == "manual-note":
        doc["noteTitle"] = note_title or "Note"
        doc["noteBodyHtml"] = note_html

    handoff_id = _write_handoff_doc(doc)

    return CreateHandoffResponse(
        handoffId=handoff_id,
        inboxText=inbox_text,
        title=title,
        preview=preview,
    )
