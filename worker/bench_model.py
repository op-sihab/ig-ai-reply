"""Time candidate models on a realistic DM turn (one-shot, cheap).

    python bench_model.py [model ...]
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = "https://api-gateway.merge.dev/v1/chat/completions"
KEY = os.environ.get("HERMES_CUSTOM_MERGE_GATWAY_API_KEY", "")

SYS = (
    "You answer Instagram DMs for the account owner. Return STRICT JSON only: "
    '{"reply":"<text>","handoff":false,"lang":"banglish"}. '
    "ONE short sentence, 8-16 words, casual Banglish, friendly, a bit cheeky."
)

CASES = [
    ("openai/gpt-6-luna", {}),
    ("openai/gpt-6-luna", {"temperature": 0.7}),
]


def run(model, extra):
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYS},
            {"role": "user", "content": "bhai dam koto"},
        ],
        "max_tokens": 200,
        "temperature": 0.5,
    }
    payload.update(extra)
    req = urllib.request.Request(
        BASE,
        data=json.dumps(payload).encode(),
        headers={"authorization": "Bearer " + KEY, "content-type": "application/json"},
    )
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            body = json.loads(res.read().decode())
        choice = (body.get("choices") or [{}])[0]
        content = (choice.get("message") or {}).get("content")
        usage = body.get("usage") or {}
        return {"model": model, "extra": extra, "secs": round(time.time() - started, 2),
                "ok": bool(content), "chars": len(content or ""),
                "out_tokens": usage.get("completion_tokens"),
                "sample": (content or "").replace("\n", " ")[:160]}
    except urllib.error.HTTPError as err:
        return {"model": model, "extra": extra, "secs": round(time.time() - started, 2),
                "ok": False, "err": str(err.code) + " " + err.read().decode()[:150]}
    except Exception as err:  # noqa: BLE001
        return {"model": model, "secs": round(time.time() - started, 2), "ok": False,
                "err": str(err)[:150]}


if not KEY:
    sys.exit("no key in HERMES_CUSTOM_MERGE_GATWAY_API_KEY")

for m, e in CASES:
    print(json.dumps(run(m, e), ensure_ascii=False))
