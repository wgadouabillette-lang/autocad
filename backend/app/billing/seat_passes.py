"""Lien d'invitation à usage limité pour les sièges payés."""

from __future__ import annotations

import os
import re
import secrets
import time
from typing import Any, Dict, Optional

from firebase_admin import firestore

from app.billing import stripe_service
from app.core import firebase as firebase_core
from app.core.firebase import load_user_billing

_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
_CODE_RE = re.compile(r"^st-[a-z2-9]{8}$")
_WS_RE = re.compile(r"^ws-[a-z2-9]{8}$")
_ACCENT = "#5865f2"


def _db():
    firebase_core._ensure_db()
    database = firebase_core._db
    if database is None:
        raise ValueError("Firestore est indisponible.")
    return database


def _public_origin() -> str:
    raw = (os.getenv("FORMA_PUBLIC_ORIGIN") or os.getenv("PUBLIC_APP_ORIGIN") or "https://meetra.cc").strip()
    return raw.rstrip("/") or "https://meetra.cc"


def _new_code(prefix: str) -> str:
    suffix = "".join(secrets.choice(_ALPHABET) for _ in range(8))
    return f"{prefix}-{suffix}"


def parse_seat_code(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        raise ValueError("Collez le lien d'invitation.")
    code = text
    if "seat=" in text or text.startswith("http://") or text.startswith("https://") or text.startswith("meetra:"):
        match = re.search(r"[?&]seat=([^&#]+)", text, flags=re.IGNORECASE)
        if not match:
            raise ValueError("Lien introuvable.")
        code = match.group(1)
    code = code.strip().lower()
    if not _CODE_RE.fullmatch(code):
        raise ValueError("Lien introuvable.")
    return code


def _personal_seat_count(subscription: Dict[str, Any]) -> int:
    intent = stripe_service._subscription_intent(subscription)
    quantity = 0
    for item in stripe_service._subscription_items(subscription):
        price_id = stripe_service._price_id(item)
        personal = stripe_service._is_personal_price(price_id)
        seat = intent in {"personal", "seat"} and (
            stripe_service._is_new_seat_price(item) or not stripe_service._price_map(item)
        )
        if personal or seat:
            quantity += int(item.get("quantity") or 0)
    if quantity <= 0:
        quantity = stripe_service._metadata_seat_count(subscription)
    return max(quantity, 0)


def _active_personal_subscription(uid: str, email: Optional[str]) -> Optional[Dict[str, Any]]:
    live = stripe_service.sync_user_subscription_from_stripe(uid, email)
    if str(live.get("subscriptionPlan") or "") != "pro" or not bool(live.get("billingManaged")):
        return None
    billing = load_user_billing(uid)
    sub_id = str(billing.get("stripeSubscriptionId") or "").strip()
    if not sub_id:
        return None
    stripe = stripe_service._stripe()
    subscription = stripe.Subscription.retrieve(sub_id, expand=["items.data.price"])
    if hasattr(subscription, "to_dict_recursive"):
        subscription = subscription.to_dict_recursive()
    elif not isinstance(subscription, dict):
        subscription = dict(subscription)
    return subscription


def _display_name(uid: str, email: Optional[str]) -> str:
    snap = _db().collection("users").document(uid).get()
    data = snap.to_dict() if snap.exists else {}
    name = str((data or {}).get("userDisplayName") or "").strip()
    if name:
        return name
    local = (email or "").split("@")[0].strip()
    return local or "Membre"


def _as_millis(value: Any) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    timestamp = getattr(value, "timestamp", None)
    if callable(timestamp):
        try:
            return int(timestamp() * 1000)
        except (TypeError, ValueError, OSError):
            return 0
    return 0


def _workspace_payload(data: Dict[str, Any], workspace_id: str) -> Dict[str, Any]:
    return {
        "id": workspace_id,
        "name": str(data.get("name") or "Meetra").strip() or "Meetra",
        "accent": str(data.get("accent") or _ACCENT),
        "ownerId": str(data.get("ownerId") or ""),
        "ownerName": str(data.get("ownerName") or "Membre"),
        "createdAt": _as_millis(data.get("createdAt")),
    }


def _ensure_member(workspace_id: str, uid: str, name: str, email: str) -> None:
    ref = (
        _db()
        .collection("workspacesShared")
        .document(workspace_id)
        .collection("members")
        .document(uid)
    )
    ref.set(
        {
            "uid": uid,
            "displayName": name or "Membre",
            "email": email,
            "joinedAt": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )


def _write_local_cloud_membership(
    uid: str,
    workspace: Dict[str, Any],
    *,
    role: str,
) -> None:
    database = _db()
    workspace_id = str(workspace["id"])
    database.collection("users").document(uid).collection("workspaces").document(workspace_id).set(
        {
            "id": workspace_id,
            "name": workspace["name"],
            "accent": workspace["accent"],
            "ownerId": workspace["ownerId"],
            "ownerName": workspace["ownerName"],
            "createdAt": workspace["createdAt"],
        },
        merge=True,
    )
    database.collection("users").document(uid).collection("memberships").document(
        f"{uid}:{workspace_id}"
    ).set(
        {
            "userId": uid,
            "workspaceId": workspace_id,
            "role": role,
            "joinedAt": int(time.time() * 1000),
        },
        merge=True,
    )


def _ensure_owner_workspace(uid: str, email: Optional[str]) -> Dict[str, Any]:
    database = _db()
    existing = list(
        database.collection("users").document(uid).collection("workspaces").limit(1).stream()
    )
    name = _display_name(uid, email)
    if existing:
        data = existing[0].to_dict() or {}
        workspace_id = str(data.get("id") or existing[0].id).strip().lower()
        payload = _workspace_payload({**data, "ownerId": data.get("ownerId") or uid, "ownerName": data.get("ownerName") or name}, workspace_id)
    else:
        workspace_id = _new_code("ws")
        while not _WS_RE.fullmatch(workspace_id):
            workspace_id = _new_code("ws")
        payload = _workspace_payload(
            {
                "name": f"Workspace de {name}" if name != "Membre" else "Meetra",
                "accent": _ACCENT,
                "ownerId": uid,
                "ownerName": name,
                "createdAt": int(time.time() * 1000),
            },
            workspace_id,
        )
        _write_local_cloud_membership(uid, payload, role="owner")

    database.collection("workspacesShared").document(payload["id"]).set(
        {
            "id": payload["id"],
            "name": payload["name"],
            "accent": payload["accent"],
            "ownerId": payload["ownerId"],
            "ownerName": payload["ownerName"],
            "createdAt": payload["createdAt"],
        },
        merge=True,
    )
    _ensure_member(payload["id"], uid, payload["ownerName"], (email or "").strip().lower())
    return payload


def _pass_ref(uid: str):
    return _db().collection("seatPasses").document(uid)


def _public_pass(data: Dict[str, Any], workspace: Dict[str, Any]) -> Dict[str, Any]:
    code = str(data.get("code") or "")
    remaining = int(data.get("remainingUses") or 0)
    url = f"{_public_origin()}/app/?seat={code}" if code and remaining > 0 else ""
    return {
        "code": code,
        "url": url,
        "remainingUses": remaining,
        "seatCount": int(data.get("seatCount") or 0),
        "workspace": workspace,
    }


def ensure_seat_pass(uid: str, email: Optional[str]) -> Dict[str, Any]:
    subscription = _active_personal_subscription(uid, email)
    if subscription is None:
        raise ValueError("Le paiement n'est pas actif.")
    seat_count = _personal_seat_count(subscription)
    workspace = _ensure_owner_workspace(uid, email) if seat_count > 1 else None
    ref = _pass_ref(uid)
    snap = ref.get()
    data = snap.to_dict() if snap.exists else {}
    redeemed = [str(item) for item in (data or {}).get("redeemedUids") or [] if str(item)]
    allowed = max(0, seat_count - 1)
    remaining = max(0, allowed - len(redeemed))
    code = str((data or {}).get("code") or "").strip().lower()
    if not _CODE_RE.fullmatch(code):
        code = _new_code("st")
    stored_workspace_id = str((data or {}).get("workspaceId") or "")
    workspace_id = workspace["id"] if workspace else stored_workspace_id
    payload = {
        "code": code,
        "ownerUid": uid,
        "workspaceId": workspace_id,
        "seatCount": seat_count,
        "remainingUses": remaining,
        "redeemedUids": redeemed,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }
    if not snap.exists:
        payload["createdAt"] = firestore.SERVER_TIMESTAMP
    ref.set(payload, merge=True)
    if workspace_id:
        _db().collection("workspacesShared").document(workspace_id).set(
            {"seatsPrepaid": True},
            merge=True,
        )
    if workspace is None and workspace_id:
        shared = _db().collection("workspacesShared").document(workspace_id).get()
        shared_data = shared.to_dict() if shared.exists else {}
        workspace = _workspace_payload(shared_data or {"id": workspace_id}, workspace_id)
    return _public_pass({**payload, "code": code, "remainingUses": remaining, "seatCount": seat_count}, workspace or {
        "id": "",
        "name": "",
        "accent": _ACCENT,
        "ownerId": uid,
        "ownerName": "",
        "createdAt": 0,
    })


def _find_pass_by_code(code: str):
    matches = list(_db().collection("seatPasses").where("code", "==", code).limit(1).stream())
    return matches[0] if matches else None


@firestore.transactional
def _consume_seat_pass(transaction, pass_ref, uid: str):
    snap = pass_ref.get(transaction=transaction)
    if not snap.exists:
        return "missing", 0, "", ""
    data = snap.to_dict() or {}
    owner_uid = str(data.get("ownerUid") or "")
    workspace_id = str(data.get("workspaceId") or "")
    remaining = int(data.get("remainingUses") or 0)
    if owner_uid == uid:
        return "owner", remaining, owner_uid, workspace_id
    redeemed = [str(item) for item in data.get("redeemedUids") or [] if str(item)]
    if uid in redeemed:
        return "already", remaining, owner_uid, workspace_id
    if remaining <= 0:
        return "empty", 0, owner_uid, workspace_id
    redeemed.append(uid)
    remaining -= 1
    transaction.update(
        pass_ref,
        {
            "remainingUses": remaining,
            "redeemedUids": redeemed,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        },
    )
    return "ok", remaining, owner_uid, workspace_id


def redeem_seat_pass(uid: str, email: Optional[str], raw: str) -> Dict[str, Any]:
    code = parse_seat_code(raw)
    found = _find_pass_by_code(code)
    if found is None:
        raise ValueError("Lien introuvable.")
    ref = found.reference
    database = _db()
    status, remaining, owner_uid, workspace_id = _consume_seat_pass(database.transaction(), ref, uid)
    if status == "missing":
        raise ValueError("Lien introuvable.")
    if status == "owner":
        raise ValueError("Ce lien sert à inviter vos collègues.")
    if status == "empty":
        raise ValueError("Ce lien n'a plus d'utilisation.")
    if not workspace_id:
        raise ValueError("Lien introuvable.")

    name = _display_name(uid, email)
    mail = (email or "").strip().lower()
    _ensure_member(workspace_id, uid, name, mail)
    database.collection("users").document(uid).set({"seatCovered": True}, merge=True)
    shared = database.collection("workspacesShared").document(workspace_id).get()
    workspace = _workspace_payload(shared.to_dict() if shared.exists else {"id": workspace_id}, workspace_id)
    _write_local_cloud_membership(uid, workspace, role="member")
    return {
        "ok": True,
        "alreadyJoined": status == "already",
        "remainingUses": remaining,
        "ownerUid": owner_uid,
        "workspace": workspace,
    }
