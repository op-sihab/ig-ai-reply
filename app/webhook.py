"""FastAPI webhook: verify -> de-duplicate -> queue -> answer.

Two rules shape this file:
  1. Meta wants a 200 within a few seconds or it retries. So the handler does
     the minimum: verify the signature, claim the message id, hand it to the
     worker, return. All model and Graph work happens off the request path.
  2. Instagram re-delivers events. Every mid is claimed exactly once.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from . import brain, config, ig, store

log = logging.getLogger("webhook")

app = FastAPI(title="Instagram AI auto-reply", version="0.1.0")


# --------------------------------------------------------------------------- #
# Streaming worker: debounce per thread, then answer once.
# --------------------------------------------------------------------------- #
class Worker:
    def __init__(self) -> None:
        self._pending: dict[str, dict] = {}

    def submit(self, thread: str, text: str) -> None:
        entry = self._pending.get(thread)
        if entry is None:
            entry = {"texts": [], "last": 0.0, "task": None}
            self._pending[thread] = entry
        entry["texts"].append(text)
        entry["last"] = time.time()
        task: asyncio.Task | None = entry["task"]
        if task is None or task.done():
            entry["task"] = asyncio.create_task(self._run(thread))

    async def _run(self, thread: str) -> None:
        entry = self._pending[thread]
        # Wait until the person has stopped typing at us for DEBOUNCE_SECONDS,
        # so "hi" / "price?" / "koto?" becomes one sensible answer.
        while True:
            await asyncio.sleep(0.25)
            if time.time() - entry["last"] >= config.DEBOUNCE_SECONDS:
                break
        texts, entry["texts"] = entry["texts"], []
        try:
            await self._answer(thread, texts)
        except Exception:
            log.exception("worker failed for thread %s", thread)
        finally:
            entry["task"] = None

    async def _answer(self, thread: str, texts: list[str]) -> None:
        incoming = "\n".join(t for t in texts if t).strip() or "[the person sent an attachment]"

        if not store.within_window(thread):
            log.warning("thread %s is outside the 24h window — not replying", thread)
            store.add_handoff(thread, incoming, "outside 24h window")
            return

        if brain.needs_handoff(incoming):
            log.info("handoff keyword hit for thread %s", thread)
            store.add_handoff(thread, incoming, "handoff keyword")
            return

        if config.IG_TYPING:
            for action in ("mark_seen", "typing_on"):
                try:
                    await ig.send_action(thread, action)
                except ig.IgError as exc:
                    log.debug("sender_action %s skipped: %s", action, exc)

        started = time.time()
        result = await brain.generate_reply(store.history(thread, config.HISTORY_TURNS), incoming)
        elapsed = time.time() - started

        if not result["reply"]:
            log.error("empty reply for %s — dropping", thread)
            store.add_handoff(thread, incoming, "empty model reply")
            return

        if result["handoff"] and config.HANDOFF_MODE == "hold":
            store.add_handoff(thread, f"{incoming}\n---\n{result['reply']}", "model flagged handoff")
            log.info("model flagged handoff for %s — held for a human", thread)
            return

        if config.DRY_RUN:
            log.info(
                "[DRY RUN] would reply to %s in %.1fs: %s",
                store.handle(thread), elapsed, result["reply"],
            )
        else:
            try:
                await ig.send_text(thread, result["reply"])
            except ig.IgError as exc:
                if exc.is_window_closed:
                    log.warning("window closed for %s: %s", store.handle(thread), exc)
                    store.add_handoff(thread, incoming, f"window closed: {exc}")
                else:
                    log.error("send failed for %s: %s", store.handle(thread), exc)
                return
            log.info(
                "replied to %s in %.1fs via %s", store.handle(thread), elapsed, result["model"]
            )

        store.add_message(thread, "assistant", result["reply"])


worker = Worker()


async def remember_person(thread: str) -> None:
    """Learn who is behind the thread so logs read '@someone' instead of a number."""
    if not config.IG_ACCESS_TOKEN or store.person_is_fresh(thread):
        return
    info = await ig.fetch_profile(thread)
    if info.get("username") or info.get("name"):
        store.upsert_person(
            thread,
            info.get("username") or "",
            info.get("name") or "",
            info.get("profile_pic") or "",
        )
        log.info("new conversation with %s", store.handle(thread))


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.on_event("startup")
async def _startup() -> None:
    store.init()
    logging.basicConfig(
        level=getattr(logging, config.LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
    )
    log.info(
        "ready — dry_run=%s model=%s db=%s", config.DRY_RUN, config.LLM_MODEL, config.DB_PATH
    )
    if not config.IG_APP_SECRET:
        log.warning("IG_APP_SECRET is empty — webhook signatures are NOT verified")
    if not config.IG_ACCESS_TOKEN and not config.DRY_RUN:
        log.error("IG_ACCESS_TOKEN is empty and DRY_RUN is off — sends will fail")


@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "dry_run": config.DRY_RUN,
        "model": config.LLM_MODEL,
        "signature_checked": bool(config.IG_APP_SECRET),
        "stats": store.stats(),
    }


@app.get("/handoffs")
async def handoffs() -> dict:
    """Threads the bot deliberately left for you."""
    return {"open": store.open_handoffs()}


@app.get("/threads")
async def recent_threads() -> dict:
    """Who has been writing to you, newest first, and what the bot answered."""
    return {"threads": store.threads()}


@app.get("/webhook")
async def verify(request: Request):
    """Meta's subscription handshake: echo hub.challenge back verbatim."""
    q = request.query_params
    if q.get("hub.mode") == "subscribe" and q.get("hub.verify_token") == config.IG_VERIFY_TOKEN:
        log.info("webhook verified")
        return PlainTextResponse(q.get("hub.challenge", ""))
    log.warning("webhook verification rejected")
    return PlainTextResponse("forbidden", status_code=403)


def _valid_signature(raw: bytes, header: str | None) -> bool:
    if not config.IG_APP_SECRET:
        return True
    if not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(
        config.IG_APP_SECRET.encode("utf-8"), raw, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, header.split("=", 1)[1])


@app.post("/webhook")
async def receive(request: Request):
    raw = await request.body()
    if not _valid_signature(raw, request.headers.get("X-Hub-Signature-256")):
        log.warning("rejected webhook with a bad signature")
        return PlainTextResponse("bad signature", status_code=403)

    try:
        body = await request.json()
    except Exception:
        return PlainTextResponse("bad json", status_code=400)

    if body.get("object") != "instagram":
        return PlainTextResponse("EVENT_RECEIVED")

    queued = 0
    for entry in body.get("entry") or []:
        for event in entry.get("messaging") or []:
            msg = event.get("message") or {}
            sender = (event.get("sender") or {}).get("id")
            mid = msg.get("mid")

            if not sender:
                continue
            # Echoes are our own outgoing messages coming back: never answer them.
            if msg.get("is_echo") or msg.get("is_self"):
                continue
            if sender == entry.get("id"):
                continue
            if not store.claim_mid(mid):
                log.debug("duplicate mid %s ignored", mid)
                continue

            text = msg.get("text") or ""
            if not text and msg.get("attachments"):
                text = "[the person sent an attachment]"
            if not text:
                continue

            store.add_message(sender, "user", text, mid)
            asyncio.create_task(remember_person(sender))
            worker.submit(sender, text)
            queued += 1

    log.debug("queued %d message(s)", queued)
    # Always 200 fast, even when nothing was queued.
    return PlainTextResponse("EVENT_RECEIVED")


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled error on %s", request.url.path)
    return JSONResponse({"error": "internal"}, status_code=500)
