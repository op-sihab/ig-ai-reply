# Cloudflare Worker version — 24/7, no PC, no VPS

The same Instagram auto-reply bot, running as a Cloudflare Worker with a D1
(serverless SQLite) database. Your computer can be off; the bot still answers.

**Live at:** `https://ig-autoreply.ms-sihab-543.workers.dev`

| What | Command |
|---|---|
| Deploy after edits | `npx wrangler deploy` |
| Read the DB | `npx wrangler d1 execute ig-autoreply --remote --command "SELECT * FROM messages ORDER BY id DESC LIMIT 10"` |
| Apply schema | `npx wrangler d1 execute ig-autoreply --remote --file=./schema.sql` |
| Live logs | `npx wrangler tail` |
| Secrets (list) | `npx wrangler secret list` |
| Test end to end | `python worker_test.py` |

## Endpoints

| Endpoint | Auth | What |
|---|---|---|
| `GET /webhook` | verify token | Meta's subscription handshake |
| `POST /webhook` | `X-Hub-Signature-256` | incoming DMs, comments, reactions |
| `GET /health` | none | dry-run flag, master switch, counters |
| **`GET /panel?token=…`** | **panel token** | **phone control panel — ON/OFF switch** |
| `GET /panel-state?token=…` | panel token | JSON behind the panel |
| `POST /toggle?token=…` | panel token | `{"enabled":true|false}` — the master switch |
| `GET /threads?token=…` | admin token | who wrote, how many messages, last message |
| `GET /handoffs?token=…` | admin token | threads deliberately left for you |
| `POST /send?token=…` | admin token | manual reply: `{"thread":"<IGSID>","text":"…"}` |
| `POST /refresh?token=…` | admin token | refresh the 60-day Instagram token now |

The admin token lives in `admin_token.txt` (also stored as the `ADMIN_TOKEN`
secret). Rotate it with `npx wrangler secret put ADMIN_TOKEN`.

## The ON/OFF panel (why there are two tokens)

Open on the phone: `https://ig-autoreply.ms-sihab-543.workers.dev/panel?token=<PANEL_TOKEN>`
(panel token in `panel_token.txt`). Bookmark it; it is the whole UI.

- Big switch: **AI is answering** / **AI is OFF**. Turning it OFF stops every
  automated reply immediately — messages are still stored, nothing is sent.
- Turning it back ON does not lose anything: the per-minute sweep answers any
  thread from the last 24h that is still unanswered.
- Shows live counters (inbound / replied / waiting / handoffs), the dry-run
  warning when `DRY_RUN=true`, and the last 8 conversations with each person's
  `@username`.
- **Two tokens on purpose:** the panel URL will end up on a phone, in a browser
  history and in screenshots. `PANEL_TOKEN` can only read state and flip the
  switch. Sending DMs, reading threads and refreshing tokens need `ADMIN_TOKEN`,
  which never leaves the operator's machine (`/send` with the panel token → 403,
  verified).

## How it behaves

1. **Handshake + signature** — the GET echo, and HMAC-SHA256 over the raw body for
   every POST, fail closed. A forged request never reaches the parser.
2. **De-duplicate** — every `message.mid` is inserted into `seen`; Meta's retries
   and duplicate deliveries are dropped.
3. **Debounce** — after a message arrives the worker waits `DEBOUNCE_SECONDS`,
   then answers only if that message is still the newest one, so "hi / price? /
   koto?" becomes one answer instead of three.
4. **Answer** — persona + knowledge + last 12 turns go to the LLM; the reply is
   sent through the Instagram Send API (skipped while `DRY_RUN=true`).
5. **Sweep (cron, every minute)** — self-healing: any thread whose last message is
   still unanswered inside the 24h window gets answered. This covers a lost
   debounce job, a redeploy, or an eviction.
6. **Token refresh (cron, 1st & 15th of the month)** — exchanges the long-lived
   token for a fresh 60-day one and stores it in `settings.ig_access_token`
   (which takes precedence over the `IG_ACCESS_TOKEN` secret). The bot stops
   dying at day 60.
7. **Master switch (the operator's own ON/OFF)** — an operator who is online
   wants the bot quiet while they answer by hand and active while they are away.
   `src/panel.js` + the `/panel`, `/panel-state`, `/toggle` routes put that switch
   on a phone-sized web page. It is stored as a `settings` row (absent = enabled),
   checked at the top of `answerThread` and `sweep` and before a webhook queues a
   reply job — so OFF is genuinely free, not a no-op that still burns CPU. Messages
   keep being recorded while OFF, and the sweep catches up on re-enable.
   **Send it with a second, lesser token** (`PANEL_TOKEN`): the panel URL ends up
   on a phone and in screenshots, so it may only read state and flip the switch,
   while `/send`, `/threads` and `/refresh` keep requiring `ADMIN_TOKEN`.

## Editing the bot's personality

`src/prompt.js` — `PERSONA` (how it sounds) and `KNOWLEDGE` (the only facts it
may state). Then `npx wrangler deploy`. When `KNOWLEDGE` is empty the bot answers
generically and flags a handoff for anything concrete — safe, but thin.

## Gotchas learned the hard way

- **`error code: 1010`** = Cloudflare's managed rules blocked the default
  `Python-urllib` User-Agent. Send a real `User-Agent` in every test script.
- **`error code: 1042`** for a few seconds right after `wrangler deploy` — the
  edge is still warming. Retry; it goes away.
- `workers.dev` subdomain is derived from the account email
  (`ms.sihab.543@gmail.com` → `ms-sihab-543`).
- Secrets must be piped in, never typed on a command line:
  `printf '%s' "$VALUE" | npx wrangler secret put NAME`.
- Free plan is enough: 100k requests/day, and the per-request CPU limit only
  counts CPU — waiting on the LLM and sleeping do not consume it.

## The local FastAPI bot

`E:\ig-ai-reply\app` + `run.py` still exist and still work (handy for debugging
with `python tools/test_pipeline.py`), but once the Meta dashboard callback URL
points at the Worker, only one of the two receives events — the dashboard has a
single callback URL. Run one at a time.
