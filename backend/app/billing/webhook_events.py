"""Idempotence des webhooks Stripe — évite le double traitement des événements."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

COLLECTION = "stripeWebhookEvents"
# Stripe peut renvoyer le même événement pendant ~3 jours ; on conserve l'empreinte plus longtemps.
RETENTION_DAYS = 30


class WebhookAlreadyProcessed(Exception):
    """Événement Stripe déjà traité avec succès."""


def claim_stripe_webhook_event(event_id: str, event_type: str) -> None:
    """
    Réserve atomiquement un événement Stripe.

    Lève WebhookAlreadyProcessed si l'événement a déjà été traité.
    Lève l'exception Firestore sous-jacente si la réservation échoue (Stripe retry).
    """
    event_id = event_id.strip()
    if not event_id:
        raise ValueError("Stripe event id is required.")

    from app.core.firebase import _ensure_db, _db

    _ensure_db()
    if _db is None:
        logger.warning("Firestore unavailable — webhook idempotency skipped for %s", event_id)
        return

    from firebase_admin import firestore

    ref = _db.collection(COLLECTION).document(event_id)
    expires_at = datetime.now(timezone.utc) + timedelta(days=RETENTION_DAYS)

    @firestore.transactional
    def _claim(transaction):
        snap = ref.get(transaction=transaction)
        if snap.exists:
            data = snap.to_dict() or {}
            if data.get("status") == "processed":
                raise WebhookAlreadyProcessed(event_id)
        transaction.set(
            ref,
            {
                "eventType": event_type,
                "status": "processing",
                "claimedAt": firestore.SERVER_TIMESTAMP,
                "expiresAt": expires_at,
            },
            merge=True,
        )

    transaction = _db.transaction()
    _claim(transaction)
    logger.debug("Claimed Stripe webhook event %s (%s)", event_id, event_type)


def mark_stripe_webhook_processed(event_id: str) -> None:
    from app.core.firebase import _ensure_db, _db

    _ensure_db()
    if _db is None:
        return

    from firebase_admin import firestore

    ref = _db.collection(COLLECTION).document(event_id.strip())
    ref.set(
        {
            "status": "processed",
            "processedAt": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )


def release_stripe_webhook_claim(event_id: str) -> None:
    """Libère la réservation après échec pour permettre un retry Stripe."""
    from app.core.firebase import _ensure_db, _db

    _ensure_db()
    if _db is None:
        return

    ref = _db.collection(COLLECTION).document(event_id.strip())
    try:
        snap = ref.get()
        if not snap.exists:
            return
        data = snap.to_dict() or {}
        if data.get("status") != "processing":
            return
        ref.delete()
    except Exception as exc:
        logger.warning("Failed to release webhook claim for %s: %s", event_id, exc)
