"""Purge complète d'un compte utilisateur (Firestore, Storage, Stripe, Auth)."""
from __future__ import annotations

import logging
import os
from typing import Iterable, Optional

from app.core.config import settings
from app.core import firebase as firebase_core

logger = logging.getLogger(__name__)


def _safe(label: str, fn) -> None:
    try:
        fn()
    except Exception as exc:
        logger.warning("Account delete step failed (%s): %s", label, exc)


def _db():
    firebase_core._ensure_db()
    return firebase_core._db


def _recursive_delete(ref) -> None:
    db = _db()
    if db is None or ref is None:
        return
    db.recursive_delete(ref)


def _delete_query_docs(query, *, recursive: bool = False) -> int:
    db = _db()
    if db is None:
        return 0
    deleted = 0
    while True:
        docs = list(query.limit(100).stream())
        if not docs:
            break
        for doc in docs:
            if recursive:
                _recursive_delete(doc.reference)
            else:
                doc.reference.delete()
            deleted += 1
        if len(docs) < 100:
            break
    return deleted


def _purge_stripe_for_user(uid: str, email: Optional[str], owned_workspace_ids: Iterable[str]) -> None:
    if not settings.stripe_secret_key.strip():
        return
    from app.billing import stripe_service
    from app.core.firebase import load_workspace_billing

    stripe_service.purge_stripe_for_deleted_account(uid, email)

    stripe = stripe_service._stripe()
    for wid in owned_workspace_ids:
        ws_billing = load_workspace_billing(wid)
        ws_customer = str(ws_billing.get("stripeCustomerId") or "").strip()
        if not ws_customer:
            continue
        try:
            subs = stripe.Subscription.list(customer=ws_customer, status="all", limit=100)
            for sub in subs.get("data") or []:
                sub_id = str(sub.get("id") or "").strip()
                status = str(sub.get("status") or "").strip()
                if not sub_id or status in {"canceled", "incomplete_expired"}:
                    continue
                try:
                    stripe.Subscription.cancel(sub_id)
                except Exception as exc:
                    logger.warning("Stripe cancel enterprise %s failed: %s", sub_id, exc)
            stripe.Customer.delete(ws_customer)
        except Exception as exc:
            logger.warning("Stripe workspace customer purge failed for %s: %s", wid, exc)


def _owned_workspace_ids(uid: str) -> list[str]:
    db = _db()
    if db is None:
        return []
    ids: list[str] = []
    try:
        docs = (
            db.collection("workspacesShared")
            .where("ownerId", "==", uid)
            .stream()
        )
        for doc in docs:
            ids.append(doc.id)
    except Exception as exc:
        logger.warning("Owned workspace scan failed for %s: %s", uid, exc)
    return ids


def _purge_owned_workspaces(uid: str, workspace_ids: list[str]) -> None:
    db = _db()
    if db is None:
        return
    for wid in workspace_ids:
        _safe(f"workspace:{wid}", lambda w=wid: _recursive_delete(db.collection("workspacesShared").document(w)))
        _safe(f"workspace-storage:{wid}", lambda w=wid: _delete_storage_prefix(f"workspaces/{w}/"))


def _remove_memberships_elsewhere(uid: str) -> None:
    db = _db()
    if db is None:
        return
    # Collection-group query on members/{uid} docs when doc id == uid
    try:
        refs = db.collection_group("members").where("uid", "==", uid).stream()
        for doc in refs:
            parent = doc.reference.parent
            # workspacesShared/{wid}/members/{uid}
            if parent and parent.parent and parent.parent.parent and parent.parent.parent.id == "workspacesShared":
                doc.reference.delete()
    except Exception as exc:
        logger.warning("Membership cleanup failed for %s: %s", uid, exc)
        # Fallback: try deleting member docs under known shape via users memberships list
        try:
            memberships = (
                db.collection("users")
                .document(uid)
                .collection("memberships")
                .stream()
            )
            for mem in memberships:
                data = mem.to_dict() or {}
                wid = str(data.get("workspaceId") or mem.id or "").strip().lower()
                if not wid:
                    continue
                member_ref = (
                    db.collection("workspacesShared")
                    .document(wid)
                    .collection("members")
                    .document(uid)
                )
                if member_ref.get().exists:
                    member_ref.delete()
        except Exception as inner:
            logger.warning("Membership fallback cleanup failed for %s: %s", uid, inner)


def _purge_friend_and_group_chats(uid: str) -> None:
    db = _db()
    if db is None:
        return

    def purge_chat(coll_name: str, chat_id: str) -> None:
        chat_ref = db.collection(coll_name).document(chat_id)
        _recursive_delete(chat_ref)

    for coll_name in ("friendChats", "groupChats"):
        try:
            docs = db.collection(coll_name).where("participants", "array_contains", uid).stream()
            for doc in docs:
                data = doc.to_dict() or {}
                participants = list(data.get("participants") or [])
                if coll_name == "friendChats":
                    _safe(
                        f"{coll_name}:{doc.id}",
                        lambda d=doc, c=coll_name: purge_chat(c, d.id),
                    )
                    continue
                # Groups: delete if creator or last remaining participant, else remove uid
                creator = str(data.get("creatorUid") or "").strip()
                others = [p for p in participants if p != uid]
                if creator == uid or len(others) == 0:
                    _safe(
                        f"{coll_name}:{doc.id}",
                        lambda d=doc, c=coll_name: purge_chat(c, d.id),
                    )
                else:
                    member_names = dict(data.get("memberNames") or {})
                    member_names.pop(uid, None)
                    doc.reference.update(
                        {
                            "participants": others,
                            "memberNames": member_names,
                        }
                    )
        except Exception as exc:
            logger.warning("Chat purge failed for %s (%s): %s", uid, coll_name, exc)


def _purge_friend_requests(uid: str, email: Optional[str]) -> None:
    db = _db()
    if db is None:
        return
    queries = [
        db.collection("friendRequests").where("fromUid", "==", uid),
        db.collection("friendRequests").where("toUid", "==", uid),
    ]
    if email:
        normalized = email.strip().lower()
        queries.append(db.collection("friendRequests").where("toEmail", "==", normalized))
        queries.append(db.collection("friendRequests").where("fromEmail", "==", normalized))
    for query in queries:
        _safe("friendRequests", lambda q=query: _delete_query_docs(q))


def _purge_handoffs(uid: str) -> None:
    db = _db()
    if db is None:
        return
    for field in ("senderUid", "recipientUid"):
        _safe(
            f"handoffs:{field}",
            lambda f=field: _delete_query_docs(db.collection("handoffs").where(f, "==", uid)),
        )


def _purge_desktop_auth_sessions(uid: str) -> None:
    db = _db()
    if db is None:
        return
    for field in ("uid", "firebaseUid"):
        try:
            _delete_query_docs(db.collection("desktopAuthSessions").where(field, "==", uid))
        except Exception:
            pass


def _storage_bucket():
    firebase_core._ensure_app()
    if firebase_core._app is None:
        return None
    try:
        from firebase_admin import storage
    except ImportError:
        return None
    bucket_name = (
        os.getenv("FIREBASE_STORAGE_BUCKET")
        or os.getenv("VITE_FIREBASE_STORAGE_BUCKET")
        or f"{firebase_core._project_id()}.firebasestorage.app"
    ).strip()
    try:
        return storage.bucket(bucket_name)
    except Exception as exc:
        logger.warning("Storage bucket unavailable (%s): %s", bucket_name, exc)
        # Legacy appspot fallback
        legacy = f"{firebase_core._project_id()}.appspot.com"
        try:
            return storage.bucket(legacy)
        except Exception as inner:
            logger.warning("Storage legacy bucket unavailable (%s): %s", legacy, inner)
            return None


def _delete_storage_prefix(prefix: str) -> None:
    bucket = _storage_bucket()
    if bucket is None or not prefix:
        return
    blobs = list(bucket.list_blobs(prefix=prefix))
    if not blobs:
        return
    for blob in blobs:
        try:
            blob.delete()
        except Exception as exc:
            logger.debug("Blob delete failed %s: %s", blob.name, exc)


def _purge_auth_user(uid: str) -> None:
    firebase_core._ensure_app()
    from firebase_admin import auth

    auth.delete_user(uid)


def _clear_local_connector_store(uid: str) -> None:
    try:
        from app.connectors import user_store

        path = user_store._local_store_path(uid)
        if path.is_file():
            path.unlink()
        user_store._invalidate_items_cache(uid)
    except Exception as exc:
        logger.debug("Local connector store cleanup failed for %s: %s", uid, exc)


def delete_user_account(uid: str, email: Optional[str] = None) -> None:
    """Supprime toutes les données liées au compte puis le user Firebase Auth."""
    normalized_uid = (uid or "").strip()
    if not normalized_uid:
        raise ValueError("Missing uid.")

    owned = _owned_workspace_ids(normalized_uid)

    _safe("stripe", lambda: _purge_stripe_for_user(normalized_uid, email, owned))
    _safe("owned-workspaces", lambda: _purge_owned_workspaces(normalized_uid, owned))
    _safe("memberships", lambda: _remove_memberships_elsewhere(normalized_uid))
    _safe("chats", lambda: _purge_friend_and_group_chats(normalized_uid))
    _safe("friend-requests", lambda: _purge_friend_requests(normalized_uid, email))
    _safe("handoffs", lambda: _purge_handoffs(normalized_uid))
    _safe("desktop-auth", lambda: _purge_desktop_auth_sessions(normalized_uid))
    def _delete_directory() -> None:
        db_client = _db()
        if db_client is None:
            return
        db_client.collection("userDirectory").document(normalized_uid).delete()

    _safe("user-directory", _delete_directory)
    _safe("user-storage", lambda: _delete_storage_prefix(f"users/{normalized_uid}/"))
    _safe("local-connectors", lambda: _clear_local_connector_store(normalized_uid))

    db = _db()
    if db is not None:
        user_ref = db.collection("users").document(normalized_uid)
        try:
            _recursive_delete(user_ref)
        except Exception as exc:
            logger.warning("Recursive user delete failed for %s: %s", normalized_uid, exc)
            try:
                user_ref.delete()
            except Exception as inner:
                raise RuntimeError(f"Unable to delete user document: {inner}") from inner

    # Auth en dernier — le token actuel devient invalide après ça.
    try:
        _purge_auth_user(normalized_uid)
    except Exception as exc:
        try:
            from firebase_admin.auth import UserNotFoundError
        except ImportError:
            UserNotFoundError = type(None)  # type: ignore[misc, assignment]
        if type(exc).__name__ == "UserNotFoundError" or isinstance(exc, UserNotFoundError):
            logger.info("Auth user already absent for %s", normalized_uid)
            return
        raise RuntimeError(f"Unable to delete auth user: {exc}") from exc
