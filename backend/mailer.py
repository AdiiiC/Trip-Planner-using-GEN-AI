"""Outgoing email for password reset and address verification.

SMTP is configured entirely through settings; with no SMTP_HOST the app still
works — links are logged instead of sent (see `send_email`). Nothing here raises:
a mail server having a bad day must never turn into a failed API request.
"""
from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from urllib.parse import quote

from config import settings

logger = logging.getLogger(__name__)

# Long enough for a slow relay, short enough that a background task can't pile up.
_TIMEOUT = 10

_SIGNATURE = "— Wayfare"


def build_link(path: str, token: str) -> str:
    """Absolute frontend URL for an emailed token."""
    return f"{settings.app_base_url.rstrip('/')}{path}?token={quote(token)}"


def send_email(to: str, subject: str, body_text: str, body_html: str | None = None) -> bool:
    """Deliver one message. Returns False on any failure, never raises.

    Call this from a background task — it blocks on the network.
    """
    if not settings.has_smtp:
        if settings.debug:
            # Dev convenience: the body carries the link, so this makes the flow
            # usable with no mail server at all.
            logger.info("email not configured — would send to %s: %s\n%s", to, subject, body_text)
        else:
            # Never log the body here; it contains a single-use token.
            logger.warning("email not configured (SMTP_HOST unset) — dropped %r", subject)
        return False

    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body_text)
    if body_html:
        message.add_alternative(body_html, subtype="html")

    try:
        _deliver(message)
    except Exception as exc:
        logger.warning("email send failed (%s): %s", subject, exc)
        return False
    return True


def _deliver(message: EmailMessage) -> None:
    context = ssl.create_default_context()
    host, port = settings.smtp_host, settings.smtp_port

    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=_TIMEOUT, context=context) as smtp:
            _login_and_send(smtp, message)
        return

    with smtplib.SMTP(host, port, timeout=_TIMEOUT) as smtp:
        smtp.starttls(context=context)
        _login_and_send(smtp, message)


def _login_and_send(smtp: smtplib.SMTP, message: EmailMessage) -> None:
    if settings.smtp_user and settings.smtp_password:
        smtp.login(settings.smtp_user, settings.smtp_password)
    smtp.send_message(message)


# ── message bodies ────────────────────────────────────────────────────────────

def password_reset_email(link: str) -> tuple[str, str, str]:
    """Subject, plain text and HTML for the reset mail."""
    subject = "Reset your Wayfare password"
    text = (
        "Someone asked to reset the password on your Wayfare account.\n\n"
        f"{link}\n\n"
        "The link works once and expires in an hour. If this wasn't you, ignore\n"
        "this email — your password stays as it is.\n\n"
        f"{_SIGNATURE}"
    )
    html = _html(
        "Reset your password",
        "Someone asked to reset the password on your Wayfare account.",
        link,
        "Reset password",
        "The link works once and expires in an hour. If this wasn't you, ignore this "
        "email — your password stays as it is.",
    )
    return subject, text, html


def email_verification_email(link: str) -> tuple[str, str, str]:
    subject = "Confirm your Wayfare email address"
    text = (
        "Welcome to Wayfare. Confirm this address so we can reach you about your\n"
        "saved trips:\n\n"
        f"{link}\n\n"
        "The link expires in 24 hours. If you didn't sign up, ignore this email.\n\n"
        f"{_SIGNATURE}"
    )
    html = _html(
        "Confirm your email",
        "Welcome to Wayfare. Confirm this address so we can reach you about your saved trips.",
        link,
        "Confirm email",
        "The link expires in 24 hours. If you didn't sign up, ignore this email.",
    )
    return subject, text, html


def send_password_reset(to: str, link: str) -> bool:
    return send_email(to, *password_reset_email(link))


def send_email_verification(to: str, link: str) -> bool:
    return send_email(to, *email_verification_email(link))


def _html(heading: str, intro: str, link: str, cta: str, footer: str) -> str:
    # Inline styles only — every mail client strips <style> blocks. The raw URL is
    # repeated below the button for clients that hide link targets.
    return (
        '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;'
        'max-width:520px;margin:0 auto;padding:24px;color:#111">'
        f'<h1 style="font-size:20px;margin:0 0 12px">{heading}</h1>'
        f'<p style="margin:0 0 20px;line-height:1.5">{intro}</p>'
        f'<p style="margin:0 0 20px"><a href="{link}" '
        'style="background:#10b981;color:#000;text-decoration:none;padding:10px 18px;'
        f'border-radius:8px;display:inline-block;font-weight:600">{cta}</a></p>'
        f'<p style="margin:0 0 20px;font-size:12px;color:#666;word-break:break-all">{link}</p>'
        f'<p style="margin:0;font-size:12px;color:#666">{footer}</p>'
        "</div>"
    )
