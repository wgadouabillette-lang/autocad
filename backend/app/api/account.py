"""Routes compte — suppression définitive."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.account.delete_service import delete_user_account
from app.core.auth_deps import require_firebase_user
from app.core.firebase import FirebaseUser, firestore_available

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/account", tags=["account"])


@router.delete("")
def delete_account(user: FirebaseUser = Depends(require_firebase_user)):
    """Supprime le compte Firebase Auth et toutes les données associées."""
    if not firestore_available():
        raise HTTPException(503, "Database unavailable.")
    try:
        delete_user_account(user.uid, user.email)
    except Exception as exc:
        logger.exception("Account deletion failed for %s", user.uid)
        raise HTTPException(500, "Unable to delete account.") from exc
    return {"ok": True}
