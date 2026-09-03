"""Affiliate program application — public form → notify email."""
from __future__ import annotations

import logging
import os
import re
import smtplib
from email.message import EmailMessage
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/affiliate", tags=["affiliate"])

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
_DEFAULT_NOTIFY_TO = "wgadouabillette@gmail.com"
_MAX_ABOUT = 8000


class AffiliateApplication(BaseModel):
    firstName: str = Field(..., min_length=1, max_length=200)
    lastName: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=3, max_length=320)
    company: str = Field(..., min_length=1, max_length=300)
    channel: str = Field(..., min_length=1, max_length=500)
    about: str = Field(..., min_length=1, max_length=_MAX_ABOUT)
    referralCode: Optional[str] = Field(default=None, max_length=64)

    @field_validator("firstName", "lastName", "company", "channel", "about", mode="before")
    @classmethod
    def strip_required(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if not _EMAIL_RE.match(value):
            raise ValueError("Invalid email address.")
        return value

    @field_validator("referralCode", mode="before")
    @classmethod
    def normalize_code(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            trimmed = value.strip()
            return trimmed or None
        return value


def _notify_to() -> str:
    return (os.getenv("AFFILIATE_NOTIFY_EMAIL") or _DEFAULT_NOTIFY_TO).strip()


def _from_email() -> str:
    configured = (os.getenv("AFFILIATE_FROM_EMAIL") or "").strip()
    if configured:
        return configured
    if (os.getenv("RESEND_API_KEY") or "").strip():
        return "Meetra Affiliates <onboarding@resend.dev>"
    return "Meetra Affiliates <noreply@meetra.cc>"


def _dry_run() -> bool:
    return (os.getenv("AFFILIATE_EMAIL_DRY_RUN") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _require_real_email() -> bool:
    """Prod (Vercel) always requires a real mail provider unless dry-run is forced."""
    if _dry_run():
        return False
    if (os.getenv("AFFILIATE_REQUIRE_EMAIL") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }:
        return True
    return bool(os.getenv("VERCEL") or os.getenv("VERCEL_ENV"))


def _esc(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _build_bodies(app: AffiliateApplication) -> tuple[str, str]:
    code = app.referralCode or "(not provided)"
    text = (
        "New Meetra Affiliate Program application\n"
        "========================================\n\n"
        f"First name: {app.firstName}\n"
        f"Last name: {app.lastName}\n"
        f"Email: {app.email}\n"
        f"Company name: {app.company}\n"
        f"Website/channel: {app.channel}\n"
        f"Discount/referral code: {code}\n\n"
        f"About you:\n{app.about}\n"
    )
    html = (
        "<h2>New Meetra Affiliate Program application</h2>"
        "<table style='border-collapse:collapse;font-family:system-ui,sans-serif'>"
        f"<tr><td style='padding:4px 12px 4px 0;font-weight:600'>First name</td>"
        f"<td>{_esc(app.firstName)}</td></tr>"
        f"<tr><td style='padding:4px 12px 4px 0;font-weight:600'>Last name</td>"
        f"<td>{_esc(app.lastName)}</td></tr>"
        f"<tr><td style='padding:4px 12px 4px 0;font-weight:600'>Email</td>"
        f"<td>{_esc(app.email)}</td></tr>"
        f"<tr><td style='padding:4px 12px 4px 0;font-weight:600'>Company name</td>"
        f"<td>{_esc(app.company)}</td></tr>"
        f"<tr><td style='padding:4px 12px 4px 0;font-weight:600'>Website/channel</td>"
        f"<td>{_esc(app.channel)}</td></tr>"
        f"<tr><td style='padding:4px 12px 4px 0;font-weight:600'>Discount/referral code</td>"
        f"<td>{_esc(code)}</td></tr>"
        "</table>"
        "<p style='font-weight:600;margin:16px 0 4px'>About you</p>"
        f"<p style='white-space:pre-wrap;margin:0'>{_esc(app.about)}</p>"
    )
    return text, html


async def _send_via_resend(app: AffiliateApplication, text: str, html: str) -> None:
    api_key = (os.getenv("RESEND_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("RESEND_API_KEY not set")

    payload = {
        "from": _from_email(),
        "to": [_notify_to()],
        "reply_to": app.email,
        "subject": f"Affiliate application — {app.firstName} {app.lastName}",
        "text": text,
        "html": html,
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    if response.status_code >= 400:
        logger.error("Resend error %s: %s", response.status_code, response.text[:500])
        raise RuntimeError(f"Resend failed ({response.status_code})")


async def _send_via_sendgrid(app: AffiliateApplication, text: str, html: str) -> None:
    api_key = (os.getenv("SENDGRID_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("SENDGRID_API_KEY not set")

    from_addr = _from_email().split("<")[-1].rstrip(">").strip()
    payload = {
        "personalizations": [{"to": [{"email": _notify_to()}]}],
        "from": {"email": from_addr, "name": "Meetra Affiliates"},
        "reply_to": {"email": app.email},
        "subject": f"Affiliate application — {app.firstName} {app.lastName}",
        "content": [
            {"type": "text/plain", "value": text},
            {"type": "text/html", "value": html},
        ],
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    if response.status_code >= 400:
        logger.error("SendGrid error %s: %s", response.status_code, response.text[:500])
        raise RuntimeError(f"SendGrid failed ({response.status_code})")


def _send_via_smtp(app: AffiliateApplication, text: str, html: str) -> None:
    host = (os.getenv("SMTP_HOST") or "").strip()
    if not host:
        raise RuntimeError("SMTP_HOST not set")

    port = int(os.getenv("SMTP_PORT") or "587")
    user = (os.getenv("SMTP_USER") or "").strip()
    password = (os.getenv("SMTP_PASSWORD") or "").strip()
    use_tls = (os.getenv("SMTP_TLS") or "1").strip().lower() in {"1", "true", "yes", "on"}

    message = EmailMessage()
    message["Subject"] = f"Affiliate application — {app.firstName} {app.lastName}"
    message["From"] = _from_email()
    message["To"] = _notify_to()
    message["Reply-To"] = app.email
    message.set_content(text)
    message.add_alternative(html, subtype="html")

    with smtplib.SMTP(host, port, timeout=20) as smtp:
        if use_tls:
            smtp.starttls()
        if user:
            smtp.login(user, password)
        smtp.send_message(message)


def _provider_configured() -> str | None:
    if (os.getenv("RESEND_API_KEY") or "").strip():
        return "resend"
    if (os.getenv("SENDGRID_API_KEY") or "").strip():
        return "sendgrid"
    if (os.getenv("SMTP_HOST") or "").strip():
        return "smtp"
    return None


@router.post("/apply")
async def apply_affiliate(body: AffiliateApplication):
    """Accept an affiliate application and email it to the program inbox."""
    text, html = _build_bodies(body)
    provider = _provider_configured()

    if not provider:
        if _require_real_email():
            logger.error(
                "Affiliate apply rejected: no mail provider "
                "(set RESEND_API_KEY, SENDGRID_API_KEY, or SMTP_HOST)"
            )
            raise HTTPException(
                503,
                "Affiliate applications are temporarily unavailable. Please try again later.",
            )
        logger.info(
            "Affiliate application dry-run from %s <%s> company=%s",
            f"{body.firstName} {body.lastName}",
            body.email,
            body.company,
        )
        logger.info("Affiliate dry-run body:\n%s", text)
        return {"ok": True, "delivered": False, "mode": "dry-run"}

    if _dry_run():
        logger.info(
            "Affiliate application dry-run (provider=%s configured) from %s <%s>",
            provider,
            f"{body.firstName} {body.lastName}",
            body.email,
        )
        logger.info("Affiliate dry-run body:\n%s", text)
        return {"ok": True, "delivered": False, "mode": "dry-run"}

    try:
        if provider == "resend":
            await _send_via_resend(body, text, html)
        elif provider == "sendgrid":
            await _send_via_sendgrid(body, text, html)
        else:
            _send_via_smtp(body, text, html)
    except Exception as exc:
        logger.exception("Failed to send affiliate application email")
        raise HTTPException(
            503,
            "Unable to send your application right now. Please try again later.",
        ) from exc

    logger.info(
        "Affiliate application emailed (%s) from %s <%s>",
        provider,
        f"{body.firstName} {body.lastName}",
        body.email,
    )
    return {"ok": True, "delivered": True, "provider": provider}
