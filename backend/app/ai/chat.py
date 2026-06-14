"""Chat conversationnel — réponses naturelles sans modifier le document CAD."""
from __future__ import annotations

from typing import List, Optional

from app.ai import llm, models, quota
from app.models.schemas import ChatMessage, ChatResponse


CHAT_SYSTEM = """You are a helpful assistant in a team workspace.
Reply naturally and conversationally in the same language as the user.
Keep answers concise and friendly.
Do not mention CAD, 3D modeling, or generating models unless the user explicitly asks about them.
Do not return JSON — plain text only.

Structure every reply with clear Markdown hierarchy:
- Use ## for main sections and ### for subsections (short, descriptive titles).
- Use bullet lists (- item) or numbered lists (1. item) for steps and options.
- Use **bold** for key terms; keep body text in normal paragraphs.
- Separate major sections with a blank line. Never dump a single wall of text.

When the user @mentions people to message them in parallel, acknowledge the request in your visible reply,
then append a dispatch block on its own lines:

[DISPATCH]
@handle: personalized message for that person
[/DISPATCH]

Use one @handle: line per recipient. Handles are lowercase (e.g. @marie.dupont).
The dispatch block is stripped from the chat UI — only the lines inside are sent as direct messages."""


def _rules_reply(prompt: str) -> str:
    text = prompt.strip()
    low = text.lower()
    if low in {"hey", "hi", "hello", "yo", "salut", "bonjour", "coucou", "hola"}:
        return "Salut ! Comment puis-je t'aider ?"
    if low in {"thanks", "thank you", "merci", "thx"}:
        return "Avec plaisir !"
    if low in {"bye", "goodbye", "à bientôt", "a bientot", "au revoir"}:
        return "À bientôt !"
    return (
        "Je suis en **mode hors-ligne** pour l'instant — je ne peux pas générer de vraie réponse "
        "sans clé API LLM.\n\n"
        "Ajoute `XAI_API_KEY` (ou une autre clé) dans `backend/.env`, puis redémarre "
        "`./scripts/desktop-dev.sh`."
    )


def run(
    prompt: str,
    messages: Optional[List[ChatMessage]] = None,
    ai_model: str = "auto",
) -> ChatResponse:
    if not prompt.strip():
        return ChatResponse(message="Say something and I'll reply.", source="rules")

    history = [
        {"role": m.role, "content": m.content}
        for m in (messages or [])
        if m.role in ("user", "assistant") and m.content.strip()
    ]

    if llm.available():
        model_id = models.resolve_model(
            ai_model, prompt, has_images=False, work_mode="agent", chat_only=True
        )
        result = llm.complete_text(
            system=CHAT_SYSTEM,
            history=history,
            user_prompt=prompt.strip(),
            model_id=model_id,
        )
        result, fallback = quota.maybe_retry_auto_model(
            ai_model,
            result,
            lambda: llm.complete_text(
                system=CHAT_SYSTEM,
                history=history,
                user_prompt=prompt.strip(),
                model_id=quota.resolve_auto_model_id(prompt, work_mode="agent", chat_only=True),
            ),
        )
        provider = llm.active_provider() or "llm"
        if result.data and result.data.get("message"):
            message = str(result.data["message"]).strip()
            if fallback:
                message = quota.prepend_fallback_notice(message)
            return ChatResponse(
                message=message,
                source=provider,
                ai_model_fallback=fallback,
                effective_ai_model="auto" if fallback else ai_model,
            )
        if result.error:
            return ChatResponse(message=_rules_reply(prompt), source="rules")

    return ChatResponse(message=_rules_reply(prompt), source="rules")
