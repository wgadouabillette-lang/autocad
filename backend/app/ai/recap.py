"""Génération de notes recap à partir d'enregistrements vidéo/audio."""
from __future__ import annotations

import re
from typing import Optional

from app.ai import chat as chat_mod
from app.ai import llm
from app.ai.stt import SttError, transcribe_audio


async def transcribe_recording(data: bytes, filename: str, uid: Optional[str] = None) -> str:
    if not data:
        return ""

    name = filename or "recording.webm"
    if not re.search(r"\.[a-z0-9]{2,5}$", name, re.I):
        name = f"{name}.webm"

    try:
        return await transcribe_audio(
            data,
            filename=name,
            mime="application/octet-stream",
            uid=uid,
            timeout=300.0,
        )
    except SttError:
        return ""


def _fallback_body(title: str, duration_ms: int) -> str:
    minutes = max(1, round((duration_ms or 60_000) / 60_000))
    return (
        f"<h1>{title}</h1>"
        f"<h2>Summary</h2>"
        f"<p>Recap generated from a {minutes}-minute recording. "
        "Connect an OpenAI API key on the server to enable full transcription.</p>"
        "<h2>Next steps</h2>"
        "<p>Review the recording and add your own notes.</p>"
    )


def _build_recap_prompt(title: str, transcript: str, duration_ms: int) -> str:
    minutes = max(1, round((duration_ms or 60_000) / 60_000))
    parts = [
        "Tu rédiges une note de réunion structurée en HTML simple (pas de markdown).",
        "Utilise uniquement les balises : h1, h2, p, ul, li, strong, em.",
        "Sections : Summary, Key points, Decisions, Action items.",
        "Langue : français si la transcription est en français, sinon anglais.",
        "Réponds UNIQUEMENT avec le HTML du corps de la note (pas de ```).",
        "",
        f"Titre : {title}",
        f"Durée approximative : {minutes} min",
    ]
    if transcript.strip():
        parts.extend(["", "Transcription :", transcript.strip()])
    else:
        parts.append(
            "Aucune transcription disponible — produis un squelette de note professionnel "
            "à compléter manuellement."
        )
    return "\n".join(parts)


def generate_recap_html(
    *,
    title: str,
    transcript: str,
    duration_ms: int,
    uid: Optional[str] = None,
) -> tuple[str, str]:
    safe_title = title.strip() or "Meeting recap"
    prompt = _build_recap_prompt(safe_title, transcript, duration_ms)

    if llm.available():
        try:
            body = chat_mod.run(
                prompt,
                [],
                "auto",
                None,
                uid=uid,
            ).message.strip()
            body = re.sub(r"^```(?:html)?\s*", "", body, flags=re.I)
            body = re.sub(r"\s*```$", "", body)
            if body and "<" in body:
                return safe_title, body
        except Exception:
            pass

    if transcript.strip():
        escaped = (
            transcript.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )
        body = (
            f"<h1>{safe_title}</h1>"
            "<h2>Summary</h2>"
            f"<p>{escaped[:1200]}</p>"
            "<h2>Transcript excerpt</h2>"
            f"<p>{escaped[:4000]}</p>"
        )
        return safe_title, body

    return safe_title, _fallback_body(safe_title, duration_ms)
