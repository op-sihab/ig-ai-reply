"""Time the gateway's models on a realistic DM turn, so the model choice is
made on measured latency instead of guesswork.

    python bench_llm.py

Reads the key from HERMES_CUSTOM_MERGE_GATWAY_API_KEY (never printed).
"""
import json
import os
import sys
import time
import urllib.request

BASE = "https://api-gateway.merge.dev/v1/chat/completions"
KEY = os.environ.get("HERMES_CUSTOM_MERGE_GATWAY_API_KEY", "")

SYS = (
    "You answer Instagram DMs. Return STRICT JSON only: "
    '{"reply":"<text>","handoff":false,"lang":"banglish"}. '
    "ONE short sentence, max 14 words, casual Banglish, friendly and a bit cheeky."
)

CASES = [
    ("google/gemini-3.7-flash", {}),
    ("google/gemini-3.7-flash", {"reasoning_effort": "none"}),
    ("deepseek/deepseek-v4.1-flash", {}),
    ("zai/glm-5.3-flash", {}),
    ("google/gemini-2.5-flash-lite", {}),
    ("google/gemini-3.7-flash-nothinking", {}),
]


def call(model, extra, text, max_tokens=300):
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYS},
            {"role": "user", "content": "bhai dam koto"},
        ],
        "max_tokens": max_tokens,
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
        took = time.time() - started
        choice = (body.get("choices") or [{}])[0]
        content = (choice.get("message") or {}).get("content")
        usage = body.get("usage") or {}
        return {
            "model": model,
            "variant": json.dumps(extra) if extra else "-",
            "secs": round(took, 2),
            "ok": bool(content),
            "chars": len(content or ""),
            "out_tokens": usage.get("completion_tokens"),
            "reasoning": usage.get("completion_tokens_details", {}).get("reasoning_tokens"),
            "sample": (content or "").replace("\n", " ")[:90],
        }
    except urllib.error.HTTPError as err:
        return {"model": model, "variant": json.dumps(extra) if extra else "-",
                "secs": round(time.time() - started, 2), "ok": False,
                "error": str(err.code) + " " + err.read().decode()[:110]}
    except Exception as err:  # noqa: BLE001
        return {"model": model, "variant": "-", "secs": round(time.time() - started, 2),
                "ok": False, "error": str(err)[:110]}


if not KEY:
    sys.exit("no key in HERMES_CUSTOM_MERGE_GATWAY_API_KEY")

for model, extra in CASES:
    row = call(model, extra, "bhai dam koto")
    print(json.dumps(row, ensure_ascii=False))
