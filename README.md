# Instagram AI auto-reply

An AI answers your Instagram DMs, in your voice, in the language the person wrote
in (Bangla / Banglish / English) — on Meta's official Messaging API, so there is
no account-ban risk.

- **Setup guide (বাংলা): [SETUP.md](SETUP.md)** ← start here
- Runs locally, no third-party service, no monthly platform fee. You pay only for
  your own LLM tokens.
- Answers only people who messaged you first; refuses to invent prices, links or
  dates it was not told about.

## What it does

```
someone DMs you  ->  Meta posts to /webhook  ->  queue (de-duplicated)
                 ->  wait for them to stop typing (debounce)
                 ->  persona + knowledge + history -> LLM -> one reply
                 ->  typing indicator, then the DM
```

## Quick start

```bash
copy .env.example .env      # fill in IG_APP_SECRET, IG_ACCESS_TOKEN, IG_VERIFY_TOKEN
python -m pip install -r requirements.txt
python run.py                        # then check http://127.0.0.1:8080/health
python tools/ig_setup.py check       # verifies token, prompts and subscription
python tools/ig_setup.py subscribe   # teaches Instagram to feed your webhook
```

Read `prompts/persona.md` (how it should sound) and `prompts/knowledge.md` (the
only facts it may state) — that pair is what makes it sound like you instead of
like a chatbot.

## Files

| Path | What it is |
|---|---|
| `run.py` | entrypoint |
| `app/webhook.py` | Meta webhook, signature check, de-dup, debounce, worker |
| `app/brain.py` | prompt assembly + LLM call + tolerant JSON parsing |
| `app/ig.py` | Instagram Graph calls (send text, typing, mark seen) |
| `app/store.py` | SQLite: history, seen ids, handoff queue |
| `app/config.py` | every setting, from `.env` |
| `tools/test_pipeline.py` | end-to-end local test (dry run, fake account, signed payloads) |
| `tools/ig_setup.py` | subscribe / token refresh / diagnostics |

## Safety defaults

- `DRY_RUN=true` out of the box: it logs the reply it *would* send and sends nothing
  until you flip it.
- Every webhook is signature-checked (`X-Hub-Signature-256`).
- Duplicate deliveries are dropped by message id.
- The 24-hour window is respected locally, and again by Meta server-side.
- `HANDOFF_KEYWORDS` keeps untouched threads (refunds, complaints…) in a queue you
  can read at `GET /handoffs`.
