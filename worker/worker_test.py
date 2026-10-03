"""End-to-end test of the deployed Worker (no Instagram account needed).

    python worker_test.py

Checks, against the live Worker:
  1. GET handshake echoes the challenge / rejects a wrong verify token
  2. an unsigned POST is refused
  3. a correctly signed POST is accepted
  4. the reply pipeline runs (dry run) and the thread shows up
  5. re-sending the same mid changes nothing (de-duplication)
"""

import hashlib
import hmac
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://ig-autoreply.ms-sihab-543.workers.dev"
HERE = pathlib.Path(__file__).resolve().parent
ADMIN = (HERE / "admin_token.txt").read_text(encoding="utf-8").strip()
APP_SECRET = "19270f86dc4d7d169999a877132581ad"
VERIFY = "op_sihab_verify_2026"
IG_ID = "17841439865191417"
FAKE_USER = "999000111222333"
MID = f"wtest-{int(time.time())}"

# Cloudflare's managed rules answer the default Python-urllib User-Agent with
# "error code: 1010" (banned browser signature). Always send a real one.
UA = "Mozilla/5.0 (compatible; ig-autoreply-test/1.0)"

PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{(' - ' + detail) if detail else ''}")


def get(path):
    req = urllib.request.Request(BASE + path, headers={"user-agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]


def post(payload, sign=True):
    raw = json.dumps(payload).encode()
    headers = {"content-type": "application/json", "user-agent": UA}
    if sign:
        headers["x-hub-signature-256"] = "sha256=" + hmac.new(
            APP_SECRET.encode(), raw, hashlib.sha256
        ).hexdigest()
    req = urllib.request.Request(BASE + "/webhook", data=raw, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]


def dm(text, mid):
    return {
        "object": "instagram",
        "entry": [
            {
                "id": IG_ID,
                "time": int(time.time()),
                "messaging": [
                    {
                        "sender": {"id": FAKE_USER},
                        "recipient": {"id": IG_ID},
                        "timestamp": int(time.time() * 1000),
                        "message": {"mid": mid, "text": text},
                    }
                ],
            }
        ],
    }


def stats():
    _, body = get("/health")
    return json.loads(body)["stats"]


print("1. handshake")
code, body = get(f"/webhook?hub.mode=subscribe&hub.verify_token={VERIFY}&hub.challenge=probe_x")
check("correct verify token echoes the challenge", code == 200 and body == "probe_x", body[:40])
code, _ = get("/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=probe_x")
check("wrong verify token refused", code == 403)

print("\n2. signature")
code, _ = post(dm("hi", MID + "-bad"), sign=False)
check("unsigned POST refused", code == 403)

print("\n3. real message (dry run)")
before = stats()
code, body = post(dm("ভাই ছবির দাম কত?", MID))
check("signed POST accepted", code == 200, body[:60])

print("\n4. waiting for debounce + LLM + reply path ...")
deadline = time.time() + 60
after = before
while time.time() < deadline:
    time.sleep(4)
    after = stats()
    if after["sent"] > before["sent"]:
        break
check("inbound recorded", after["inbound"] > before["inbound"], f"{before['inbound']} -> {after['inbound']}")
check("reply generated (dry run)", after["sent"] > before["sent"], f"{before['sent']} -> {after['sent']}")

code, body = get(f"/threads?token={ADMIN}")
check("/threads readable with admin token", code == 200)
try:
    threads = json.loads(body)["threads"]
    mine = [t for t in threads if t["thread"] == FAKE_USER]
    check("thread listed", bool(mine), json.dumps(mine[:1])[:200])
except Exception as exc:
    check("thread listed", False, str(exc)[:120])

code, _ = get("/threads")
check("/threads blocked without admin token", code == 403)

print("\n5. duplicate delivery")
post(dm("ভাই ছবির দাম কত?", MID))  # same mid again
time.sleep(12)
now = stats()
check(
    "same mid not answered twice",
    now["sent"] == after["sent"],
    f"sent {after['sent']} -> {now['sent']}",
)

print("\n6. final stats")
print("   ", json.dumps(now))
print(f"\n passed {len(PASS)} / {len(PASS) + len(FAIL)}")
if FAIL:
    print(" failed:", ", ".join(FAIL))
sys.exit(1 if FAIL else 0)
