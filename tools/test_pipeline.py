"""End-to-end local test of the whole webhook -> LLM -> reply path.

Runs the real app in-process with DRY_RUN on and a throwaway database, and
posts genuinely signed webhook payloads at it exactly like Meta would.

    python tools/test_pipeline.py

It proves:
  1. the GET handshake echoes the challenge and rejects a wrong verify token
  2. an unsigned POST is rejected with 403
  3. a Bangla message gets a Bangla reply that uses the KNOWLEDGE facts
  4. a duplicate mid is never answered twice
  5. an English message gets an English reply
  6. a handoff keyword is held, not answered
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import pathlib
import re
import shutil
import sys
import threading
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

PORT = 8099
VERIFY = "test-verify-token"
SECRET = "test-app-secret"
TEST_DIR = ROOT / "data" / "test"
TEST_DB = TEST_DIR / "test.db"

# A throwaway persona + knowledge base containing one distinctive fact, so we
# can prove the model actually used the knowledge file rather than improvising.
TEST_DIR.mkdir(parents=True, exist_ok=True)
(TEST_DIR / "knowledge.md").write_text(
    "# Test knowledge\n\n## Prices\n- Portrait session: 8500 BDT\n\n"
    "## Hours\n- Open Saturday to Thursday, 10am-8pm. Closed Friday.\n",
    encoding="utf-8",
)
(TEST_DIR / "persona.md").write_text(
    "You handle DMs for a portrait studio. Warm and brief.\n", encoding="utf-8"
)

# Environment must be set BEFORE app.config is imported: the real environment
# win over .env, which is how this test overrides your live settings.
os.environ.update(
    {
        "IG_VERIFY_TOKEN": VERIFY,
        "IG_APP_SECRET": SECRET,
        "IG_ACCESS_TOKEN": "-",
        "DRY_RUN": "true",
        "DB_PATH": str(TEST_DB),
        "PERSONA_FILE": str(TEST_DIR / "persona.md"),
        "KNOWLEDGE_FILE": str(TEST_DIR / "knowledge.md"),
        "BIND": "127.0.0.1",
        "PORT": str(PORT),
        "DEBOUNCE_SECONDS": "1.0",
        "IG_TYPING": "false",
        "HANDOFF_MODE": "auto",  # full auto, as requested
        "HANDOFF_KEYWORDS": "refund,lawyer",
        "LLM_MODEL": os.environ.get("LLM_MODEL", "google/gemini-3.7-flash"),
        "LOG_LEVEL": "info",
    }
)

for stale in TEST_DIR.glob("test.db*"):
    stale.unlink()

import uvicorn  # noqa: E402

from app import store  # noqa: E402
from app.webhook import app  # noqa: E402

PASS: list[str] = []
FAIL: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    (PASS if ok else FAIL).append(name)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{(' — ' + detail) if detail else ''}")


def base(path: str) -> str:
    return f"http://127.0.0.1:{PORT}{path}"


def get(path: str) -> tuple[int, str]:
    try:
        with urllib.request.urlopen(base(path), timeout=20) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def post_webhook(payload: dict, sign: bool = True) -> int:
    raw = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if sign:
        headers["X-Hub-Signature-256"] = "sha256=" + hmac.new(
            SECRET.encode(), raw, hashlib.sha256
        ).hexdigest()
    req = urllib.request.Request(base("/webhook"), data=raw, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def payload(igsid: str, text: str, mid: str) -> dict:
    return {
        "object": "instagram",
        "entry": [
            {
                "id": "17841400000000000",
                "time": int(time.time()),
                "messaging": [
                    {
                        "sender": {"id": igsid},
                        "recipient": {"id": "17841400000000000"},
                        "timestamp": int(time.time() * 1000),
                        "message": {"mid": mid, "text": text},
                    }
                ],
            }
        ],
    }


def replies_from(igsid: str) -> int:
    with store.connect() as conn:
        return int(
            conn.execute(
                "SELECT COUNT(*) FROM messages WHERE thread=? AND role='assistant'", (igsid,)
            ).fetchone()[0]
        )


def await_reply(igsid: str, timeout: float = 45.0) -> str | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with store.connect() as conn:
            row = conn.execute(
                "SELECT text FROM messages WHERE thread=? AND role='assistant' ORDER BY id DESC LIMIT 1",
                (igsid,),
            ).fetchone()
        if row:
            return row["text"]
        time.sleep(0.4)
    return None


def has_bangla(text: str) -> bool:
    return bool(re.search(r"[\u0980-\u09FF]", text or ""))


def main() -> int:
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()

    for _ in range(80):
        try:
            if get("/health")[0] == 200:
                break
        except Exception:
            pass
        time.sleep(0.25)

    print("\n1. webhook handshake")
    status, body = get(f"/webhook?hub.mode=subscribe&hub.verify_token={VERIFY}&hub.challenge=abc123")
    check("correct verify token echoes the challenge", status == 200 and body == "abc123", body[:40])
    status, _ = get("/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123")
    check("wrong verify token is refused", status == 403)

    print("\n2. signature enforcement")
    check("unsigned POST rejected", post_webhook(payload("u1", "hi", "m-unsigned"), sign=False) == 403)

    print("\n3. live reply — Bangla, using the knowledge base")
    check("signed POST accepted", post_webhook(payload("user_bn", "ভাই ছবির দাম কত?", "m-bn-1")) == 200)
    reply_bn = await_reply("user_bn")
    check("Bangla message got a reply", bool(reply_bn), (reply_bn or "")[:100])
    check("reply is in Bangla", has_bangla(reply_bn or ""))
    check(
        "reply uses the knowledge fact (8500)",
        "8500" in re.sub(r"[,\s]", "", reply_bn or ""),
        (reply_bn or "")[:100],
    )

    print("\n4. duplicate delivery is ignored")
    post_webhook(payload("user_bn", "ভাই ছবির দাম কত?", "m-bn-1"))
    time.sleep(6)
    n = replies_from("user_bn")
    check("same mid answered only once", n == 1, f"assistant messages = {n}")

    print("\n5. live reply — English")
    post_webhook(payload("user_en", "hey, do you shoot outdoors?", "m-en-1"))
    reply_en = await_reply("user_en")
    check("English message got a reply", bool(reply_en), (reply_en or "")[:100])
    check("reply is in English (no Bangla script)", not has_bangla(reply_en or ""))

    print("\n6. handoff keyword is held, not answered")
    post_webhook(payload("user_ho", "I want a refund right now", "m-ho-1"))
    time.sleep(8)
    check("no auto-reply for handoff keyword", replies_from("user_ho") == 0)
    check("thread queued for a human", any(h["thread"] == "user_ho" for h in store.open_handoffs()))

    print("\n7. operator endpoints")
    status, body = get("/handoffs")
    check("GET /handoffs returns JSON", status == 200 and "open" in body)

    print("\n8. stats")
    print("   ", store.stats())
    if reply_bn:
        print("\n   Bangla reply  ->", reply_bn)
    if reply_en:
        print("   English reply ->", reply_en)

    server.should_exit = True
    time.sleep(1.5)
    shutil.rmtree(TEST_DIR, ignore_errors=True)

    print(f"\n{'=' * 62}\n passed {len(PASS)} / {len(PASS) + len(FAIL)}")
    if FAIL:
        print(" failed:", ", ".join(FAIL))
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
