"""Instagram Messaging API client (Instagram Login path, graph.instagram.com).

Uses urllib from the stdlib so the bot has no HTTP dependency to break.
"""

from __future__ import annotations

import asyncio
import json
import logging
import urllib.error
import urllib.request

from . import config

log = logging.getLogger("ig")


class IgError(RuntimeError):
    def __init__(self, message: str, status: int = 0, code: int = 0, subcode: int = 0):
        super().__init__(message)
        self.status = status
        self.code = code
        self.subcode = subcode

    @property
    def is_window_closed(self) -> bool:
        """Meta's "message sent outside allowed window" / permission-vs-window family.

        The 24h window is enforced server-side, so this is a normal operating
        condition (a thread went cold), not a bug worth retrying.
        """
        msg = str(self).lower()
        return (
            self.code in (10, 2018278)
            or "outside" in msg
            or "window" in msg
            or "not allowed" in msg and "message" in msg
        )


def _endpoint() -> str:
    return f"{config.IG_HOST}/{config.IG_API_VERSION}/me/messages"


def _sync_post(payload: dict) -> dict:
    if not config.IG_ACCESS_TOKEN:
        raise IgError("IG_ACCESS_TOKEN is empty — cannot call Instagram", 0, 190)
    req = urllib.request.Request(
        _endpoint(),
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {config.IG_ACCESS_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        code = subcode = 0
        message = raw[:400]
        try:
            err = json.loads(raw).get("error", {})
            message = err.get("message", message)
            code = int(err.get("code", 0) or 0)
            subcode = int(err.get("error_subcode", 0) or 0)
        except Exception:
            pass
        raise IgError(message, exc.code, code, subcode) from None


async def send_text(igsid: str, text: str) -> dict:
    payload = {"recipient": {"id": igsid}, "message": {"text": text}}
    return await asyncio.to_thread(_sync_post, payload)


async def send_action(igsid: str, action: str) -> dict:
    """sender_action: 'typing_on' | 'typing_off' | 'mark_seen'."""
    payload = {"recipient": {"id": igsid}, "sender_action": action}
    return await asyncio.to_thread(_sync_post, payload)


async def fetch_profile(igsid: str) -> dict:
    """Name / username / picture for someone who messaged us. Never fatal.

    Instagram only sets "user consent" once the person messages us, so this is
    the one place we learn who is behind an Instagram-scoped id. Field support
    varies, so the richer request falls back to the safe pair.
    """

    def _get(fields: str) -> dict:
        url = (
            f"{config.IG_HOST}/{config.IG_API_VERSION}/{igsid}"
            f"?fields={fields}&access_token={config.IG_ACCESS_TOKEN}"
        )
        with urllib.request.urlopen(url, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")

    def _run() -> dict:
        try:
            return _get("name,username,profile_pic")
        except Exception:
            try:
                return _get("name,username")
            except Exception as exc:
                log.debug("profile lookup for %s failed: %s", igsid, exc)
                return {}

    return await asyncio.to_thread(_run)
