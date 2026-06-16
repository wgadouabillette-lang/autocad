"""HTTP routes for third-party connector OAuth."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse

from app.connectors.oauth import create_authorize_session, exchange_code, pop_state
from app.connectors.registry import (
    CONNECTOR_IDS,
    CONNECTORS,
    connector_configured,
    frontend_origin,
)
from app.connectors.tokens import connection_account_label
from app.connectors.user_store import get_connection, is_connected, remove_connection
from app.core.auth_deps import require_firebase_user
from app.core.firebase import FirebaseUser

router = APIRouter(prefix="/api/connectors", tags=["connectors"])


@router.get("")
def list_connectors(user: FirebaseUser = Depends(require_firebase_user)):
    items = []
    for connector_id in CONNECTOR_IDS:
        spec = CONNECTORS[connector_id]
        entry = get_connection(user.uid, connector_id)
        items.append(
            {
                "id": connector_id,
                "label": spec.label,
                "provider": spec.provider,
                "connected": is_connected(user.uid, connector_id),
                "configured": connector_configured(connector_id),
                "accountLabel": connection_account_label(entry),
            }
        )
    return {"connectors": items}


@router.get("/{connector_id}/authorize")
def authorize_connector(
    connector_id: str,
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
    _, url = create_authorize_session(connector_id, user.uid)
    return {"url": url}


@router.get("/oauth/callback")
async def oauth_callback(
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
):
    origin = frontend_origin()
    if error:
        return HTMLResponse(_callback_html(origin, "error", None, error))
    if not code or not state:
        raise HTTPException(400, "Missing OAuth code or state.")
    popped = pop_state(state)
    if not popped:
        return HTMLResponse(_callback_html(origin, "error", None, "Invalid or expired OAuth state."))
    connector_id, uid = popped
    try:
        await exchange_code(connector_id, uid, code)
    except Exception as exc:  # noqa: BLE001 — surface provider errors to UI
        return HTMLResponse(_callback_html(origin, "error", connector_id, str(exc)))
    return HTMLResponse(_callback_html(origin, "success", connector_id, None))


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
    origin: str,
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
    redirect = f"{origin}/?connector_oauth={status}"
    if connector_id:
        redirect += f"&connector_id={connector_id}"
    return f"""<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Connector OAuth</title></head>
<body>
<script>
  const payload = {data};
  if (window.opener) {{
    window.opener.postMessage(payload, "{origin}");
    window.close();
  }} else {{
    window.location.replace("{redirect}");
  }}
</script>
<p>Connecting… You can close this window.</p>
</body>
</html>"""
