"""HTTP routes for third-party connector OAuth."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse

from app.connectors.oauth import create_authorize_session, exchange_code, pop_state
from app.connectors.registry import (
    CONNECTOR_IDS,
    CONNECTORS,
    connector_configured,
    frontend_app_url,
    frontend_origin,
)
from app.connectors.tokens import connection_account_label
from app.connectors.user_store import get_connection, is_connected, remove_connection
from app.core.auth_deps import require_firebase_user
from app.core.firebase import FirebaseUser

router = APIRouter(prefix="/api/connectors", tags=["connectors"])


def _request_public_origin(request: Request) -> str | None:
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    forwarded_host = request.headers.get("x-forwarded-host", "").split(",")[0].strip()
    host = forwarded_host or request.headers.get("host", "").split(",")[0].strip()
    if not host:
        return None
    scheme = forwarded_proto or request.url.scheme
    return f"{scheme}://{host}".rstrip("/")


@router.get("")
def list_connectors(user: FirebaseUser = Depends(require_firebase_user)):
    items = []
    for connector_id in CONNECTOR_IDS:
        spec = CONNECTORS[connector_id]
        entry = get_connection(user.uid, connector_id)
        configured = connector_configured(connector_id)
        items.append(
            {
                "id": connector_id,
                "label": spec.label,
                "provider": spec.provider,
                "connected": configured and is_connected(user.uid, connector_id),
                "configured": configured,
                "accountLabel": connection_account_label(entry),
            }
        )
    return {"connectors": items}


@router.get("/{connector_id}/authorize")
def authorize_connector(
    connector_id: str,
    request: Request,
    return_origin: Optional[str] = Query(default=None),
    return_path: Optional[str] = Query(default=None),
    user: FirebaseUser = Depends(require_firebase_user),
):
    if connector_id not in CONNECTORS:
        raise HTTPException(404, "Unknown connector.")
    if not connector_configured(connector_id):
        raise HTTPException(
            400,
            f"OAuth credentials missing for {CONNECTORS[connector_id].label}. "
            "Add client id/secret to backend/.env (see .env.example).",
        )
    safe_origin = return_origin.strip().rstrip("/") if return_origin else None
    safe_path = return_path.strip() if return_path else None
    _, url = create_authorize_session(
        connector_id,
        user.uid,
        return_origin=safe_origin,
        return_path=safe_path,
        request_origin=_request_public_origin(request),
    )
    return {"url": url}


@router.get("/oauth/callback")
async def oauth_callback(
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
):
    default_origin = frontend_origin()
    if error:
        return HTMLResponse(_callback_html(default_origin, None, None, "error", None, error))
    if not code or not state:
        raise HTTPException(400, "Missing OAuth code or state.")
    popped = pop_state(state)
    if not popped:
        return HTMLResponse(
            _callback_html(
                default_origin,
                None,
                None,
                "error",
                None,
                "Invalid or expired OAuth state.",
            )
        )
    connector_id, uid, return_origin, return_path, redirect_base = popped
    try:
        await exchange_code(connector_id, uid, code, redirect_base)
    except Exception as exc:  # noqa: BLE001 — surface provider errors to UI
        return HTMLResponse(
            _callback_html(
                default_origin,
                return_origin,
                return_path,
                "error",
                connector_id,
                str(exc),
            )
        )
    return HTMLResponse(
        _callback_html(
            default_origin,
            return_origin,
            return_path,
            "success",
            connector_id,
            None,
        )
    )


@router.delete("/{connector_id}")
def disconnect_connector(
    connector_id: str,
    user: FirebaseUser = Depends(require_firebase_user),
):
    if connector_id not in CONNECTORS:
        raise HTTPException(404, "Unknown connector.")
    remove_connection(user.uid, connector_id)
    return JSONResponse({"ok": True, "id": connector_id})


def _callback_html(
    default_origin: str,
    return_origin: Optional[str],
    return_path: Optional[str],
    status: str,
    connector_id: Optional[str],
    message: Optional[str],
) -> str:
    payload = {
        "type": "forma-connector-oauth",
        "status": status,
        "connectorId": connector_id,
        "message": message,
    }
    import json

    data = json.dumps(payload)
    opener_origin = (return_origin or default_origin).rstrip("/")
    query_parts = [f"connector_oauth={status}"]
    if connector_id:
        query_parts.append(f"connector_id={connector_id}")
    if message:
        from urllib.parse import quote

        query_parts.append(f"connector_oauth_message={quote(message)}")
    redirect = frontend_app_url(
        "&".join(query_parts),
        origin=return_origin or default_origin,
        base_path=return_path,
    )
    return f"""<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Connector OAuth</title></head>
<body>
<script>
  const payload = {data};
  if (window.opener && !window.opener.closed) {{
    window.opener.postMessage(payload, "{opener_origin}");
    window.close();
  }} else {{
    window.location.replace("{redirect}");
  }}
</script>
<p>Connexion en cours… Vous pouvez fermer cette fenêtre.</p>
</body>
</html>"""
