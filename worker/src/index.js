// ---------------------------------------------------------------------------
// Instagram AI auto-reply — Cloudflare Worker + D1.
// Runs 24/7 with no PC and no VPS. Same behaviour as the local FastAPI bot:
// signature-checked webhook, de-duplication, per-thread debounce, persona +
// knowledge grounded replies, handoff queue, 24h window, token auto-refresh.
// ---------------------------------------------------------------------------

import { systemPrompt } from './prompt.js';
import { PANEL_HTML } from './panel.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// --- tiny helpers ---------------------------------------------------------- //

async function setting(env, key) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

async function putSetting(env, key, value) {
  await env.DB.prepare(
    'INSERT INTO settings(key, value) VALUES (?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
    .bind(key, String(value))
    .run();
}

const accessToken = async (env) => (await setting(env, 'ig_access_token')) || env.IG_ACCESS_TOKEN;

// Master switch, flipped from the phone panel. Default is OFF: the bot stays
// quiet until the operator deliberately turns it on from the panel.
async function autoReplyEnabled(env) {
  return (await setting(env, 'enabled')) === 'true';
}

// The panel gets its own token so a link opened on a phone can never send DMs.
function panelOk(env, url, request) {
  const given = String(url.searchParams.get('token') || (request.headers.get('authorization') || '').replace(/^Bearer /, ''));
  if (!given) return false;
  if (env.PANEL_TOKEN && timingSafeEqual(given, env.PANEL_TOKEN)) return true;
  return adminOk(env, url, request);
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function validSignature(env, rawBody, header) {
  if (!env.IG_APP_SECRET) return true; // local/dev: no secret configured
  if (!header || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.IG_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, rawBody);
  return timingSafeEqual(toHex(mac), header.slice(7));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Instagram API --------------------------------------------------------- //

async function igPost(env, payload) {
  const token = await accessToken(env);
  if (!token) throw new Error('no access token configured');
  const url = `${env.IG_HOST}/${env.IG_API_VERSION}/me/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) {
    const err = new Error(`IG ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    err.windowClosed = /outside|window|not allowed/i.test(body);
    throw err;
  }
  return JSON.parse(body || '{}');
}

// Send a reply. `replyToMid` threads it onto the message being answered, so the
// person can see which of their messages this answers. The Instagram Login path
// is not documented to accept `reply_to`, so a failure falls back to a plain
// send rather than losing the reply.
async function sendText(env, igsid, text, replyToMid) {
  if (replyToMid) {
    try {
      return await igPost(env, {
        recipient: { id: igsid },
        message: { text },
        reply_to: { mid: replyToMid },
      });
    } catch (err) {
      console.warn(`reply_to rejected (${err.message.slice(0, 120)}), sending plain`);
    }
  }
  return igPost(env, { recipient: { id: igsid }, message: { text } });
}

async function sendAction(env, igsid, action) {
  return igPost(env, { recipient: { id: igsid }, sender_action: action });
}

async function fetchProfile(env, igsid) {
  const token = await accessToken(env);
  for (const fields of ['name,username,profile_pic', 'name,username']) {
    try {
      const res = await fetch(
        `${env.IG_HOST}/${env.IG_API_VERSION}/${igsid}?fields=${fields}&access_token=${token}`
      );
      if (res.ok) return await res.json();
    } catch {
      /* best effort only */
    }
  }
  return {};
}

// --- LLM ------------------------------------------------------------------- //

// Models sometimes truncate mid-JSON (hit max_tokens) or append junk after the
// object. Dumping that raw into a customer's DM is the worst failure this bot
// can have, so: parse strictly, then salvage the reply field, then fall back to
// whatever prose is left once every JSON fragment is stripped out.
// Exported for tools/test_parsing.mjs — the JSON salvage path is the one place a
// parsing accident could reach a customer, so it is tested directly.
export function extractJson(raw) {
  const text = String(raw || '')
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, '')
    .trim();
  if (!text) return null;

  const start = text.indexOf('{');
  if (start !== -1) {
    const end = text.lastIndexOf('}');
    const slice = end > start ? text.slice(start, end + 1) : text.slice(start);
    let obj = null;
    try {
      obj = JSON.parse(slice);
    } catch {
      // Truncated object: pull the reply field out by hand.
      const m = slice.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)/);
      if (m) {
        let reply = m[1];
        try {
          reply = JSON.parse('"' + reply + '"');
        } catch {
          /* keep the raw capture */
        }
        const lang = slice.match(/"lang"\s*:\s*"([a-zA-Z]+)"/);
        obj = { reply, handoff: /"handoff"\s*:\s*true/.test(slice), lang: lang ? lang[1] : '?', salvaged: true };
      }
    }

    if (obj && typeof obj === 'object') {
      if (String(obj.reply == null ? '' : obj.reply).trim()) return obj;
      // The object carries flags only. A real sentence may still sit outside it,
      // and throwing that away would lose a perfectly good reply.
      const prose = deJson(text).trim();
      if (prose) {
        return { reply: prose, handoff: Boolean(obj.handoff), lang: obj.lang || '?', salvaged: true };
      }
      return obj;
    }
  }

  // No JSON at all: the whole thing is the reply (tidy strips any debris).
  return { reply: text, handoff: false, lang: '?', salvaged: true };
}

// Strip anything JSON-shaped out of a would-be reply, so a parsing accident can
// never reach the customer as {"handoff":true,...} glued to a sentence.
export function deJson(text) {
  return String(text || '')
    .replace(/\{[^{}]*\}/g, ' ')     // complete flat objects anywhere
    .replace(/\{[\s\S]*$/, ' ')      // an unterminated object: cut the tail only
    .replace(/^\s*"?(reply|handoff|lang)"?\s*:\s*/i, '')
    .replace(/[{}\\]/g, ' ');
}

export function tidy(env, text) {
  let out = deJson(text).trim().replace(/^```[a-z]*\s*|\s*```$/g, '').trim();
  out = out.replace(/^"+|"+$/g, '').replace(/"\s*,?\s*$/, '');
  // Collapse stray newlines: a DM is one short line, not a paragraph.
  out = out.replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const cap = num(env.REPLY_MAX_CHARS, 200);
  if (out.length > cap) {
    const cut = out.slice(0, cap);
    const space = cut.lastIndexOf(' ');
    out = (space > cap * 0.5 ? cut.slice(0, space) : cut).replace(/[,;:\-–]$/, '') + '…';
  }
  return out;
}

async function chat(env, model, messages) {
  const payload = {
    model,
    messages,
    max_tokens: num(env.LLM_MAX_TOKENS, 400),
    temperature: 0.65,
    response_format: { type: 'json_object' },
  };
  // Disable reasoning latency on models that support reasoning_effort
  if (model.includes('luna') || model.includes('gemini-3.7')) {
    payload.reasoning_effort = 'none';
  }

  const res = await fetch(`${env.LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.LLM_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${model} HTTP ${res.status}: ${body.slice(0, 200)}`);
  const data = JSON.parse(body);
  const choice = (data.choices || [{}])[0];
  const content = choice.message && choice.message.content;
  if (!content) {
    throw new Error(`${model} returned empty content (finish_reason=${choice.finish_reason})`);
  }
  return content;
}

async function generateReply(env, history, incoming, who) {
  const messages = [{ role: 'system', content: systemPrompt(who) }, ...history];
  messages.push({ role: 'user', content: incoming });

  const models = [env.LLM_MODEL, env.LLM_FALLBACK_MODEL].filter(
    (m, i, a) => m && a.indexOf(m) === i
  );
  let lastErr = null;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await chat(env, model, messages);
        const parsed = extractJson(raw);
        const reply = parsed && String(parsed.reply || '').trim() ? tidy(env, parsed.reply) : '';
        if (!reply) {
          // Nothing usable came back; the caller turns this into a handoff.
          return { reply: '', handoff: true, lang: '?', model, raw };
        }
        return {
          reply,
          handoff: Boolean(parsed.handoff),
          lang: String(parsed.lang || '?').slice(0, 12),
          model,
          raw,
        };
      } catch (err) {
        lastErr = err;
        if (attempt === 0) await sleep(1500);
      }
    }
  }
  throw lastErr || new Error('all models failed');
}

// --- D1 accessors ---------------------------------------------------------- //

async function claimMid(env, mid) {
  if (!mid) return true;
  try {
    await env.DB.prepare('INSERT INTO seen(mid, created) VALUES (?, ?)')
      .bind(mid, Math.floor(Date.now() / 1000))
      .run();
    return true;
  } catch {
    return false; // primary key clash = already handled
  }
}

const addMessage = (env, thread, role, text, mid = null) =>
  env.DB.prepare(
    'INSERT INTO messages(thread, role, text, mid, created) VALUES (?,?,?,?,?)'
  )
    .bind(thread, role, text, mid, Math.floor(Date.now() / 1000))
    .run();

// `beforeId` keeps the message being answered out of the history: the caller
// appends it as the final user turn, so including it here sent it twice and
// made the model answer its own echo.
async function history(env, thread, turns, beforeId = null) {
  const { results } = await env.DB.prepare(
    'SELECT role, text FROM messages WHERE thread = ? AND (? IS NULL OR id < ?) ' +
      'ORDER BY id DESC LIMIT ?'
  )
    .bind(thread, beforeId, beforeId, turns)
    .all();
  return (results || []).reverse().map((r) => ({ role: r.role, content: r.text }));
}

// Who is on the other side of this thread, for the system prompt.
async function whoIs(env, thread) {
  const person = await env.DB.prepare('SELECT username, name FROM people WHERE thread = ?')
    .bind(thread)
    .first();
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM messages WHERE thread = ? AND role = 'user'"
  )
    .bind(thread)
    .first();
  return {
    handle: person && person.username ? '@' + person.username : null,
    name: (person && person.name) || null,
    messages: count ? count.n : 0,
  };
}

async function handleOf(env, thread) {
  const p = await env.DB.prepare('SELECT username, name FROM people WHERE thread = ?')
    .bind(thread)
    .first();
  if (p && p.username) return '@' + p.username;
  if (p && p.name) return p.name;
  return thread;
}

async function addHandoff(env, thread, text, reason) {
  await env.DB.prepare(
    'INSERT INTO handoff(thread, text, reason, created) VALUES (?,?,?,?)'
  )
    .bind(thread, text, reason, Math.floor(Date.now() / 1000))
    .run();
}

async function rememberPerson(env, thread) {
  const fresh = await env.DB.prepare(
    'SELECT fetched FROM people WHERE thread = ? AND fetched > ?'
  )
    .bind(thread, Math.floor(Date.now() / 1000) - 7 * 86400)
    .first();
  if (fresh) return;
  const info = await fetchProfile(env, thread);
  if (!info || (!info.username && !info.name)) return;
  await env.DB.prepare(
    'INSERT INTO people(thread, username, name, pic, fetched) VALUES (?,?,?,?,?) ' +
      'ON CONFLICT(thread) DO UPDATE SET username=excluded.username, name=excluded.name, ' +
      'pic=excluded.pic, fetched=excluded.fetched'
  )
    .bind(thread, info.username || '', info.name || '', info.profile_pic || '', Math.floor(Date.now() / 1000))
    .run();
}

// --- the reply pipeline ---------------------------------------------------- //

async function answerThread(env, thread, triggerId = null) {
  const windowHours = num(env.WINDOW_HOURS, 24);
  const nowSec = Math.floor(Date.now() / 1000);

  const last = await env.DB.prepare(
    "SELECT id, text, created, mid FROM messages WHERE thread = ? AND role = 'user' ORDER BY id DESC LIMIT 1"
  )
    .bind(thread)
    .first();
  if (!last) return { skipped: 'no inbound message' };
  if (!(await autoReplyEnabled(env))) return { skipped: 'paused (panel switch off)' };

  // A newer message arrived while we waited: let that job answer instead.
  if (triggerId && last.id !== triggerId) return { skipped: 'superseded' };

  // Idempotency. A re-delivered webhook, or the sweep racing a debounce job,
  // would otherwise send the person a second reply to the same message. If an
  // assistant message already exists past this one, the answer is done.
  const answered = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM messages WHERE thread = ? AND id > ? AND role = 'assistant'"
  )
    .bind(thread, last.id)
    .first();
  if (answered && answered.n > 0) return { skipped: 'already answered' };
  if (nowSec - last.created > windowHours * 3600) {
    await addHandoff(env, thread, last.text, 'outside 24h window');
    return { skipped: 'outside 24h window' };
  }

  const handoffWords = String(env.HANDOFF_KEYWORDS || '')
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  if (handoffWords.some((w) => last.text.toLowerCase().includes(w))) {
    await addHandoff(env, thread, last.text, 'handoff keyword');
    return { skipped: 'handoff keyword' };
  }

  const pending = await env.DB.prepare(
    'SELECT id FROM handoff WHERE thread = ? AND done = 0 LIMIT 1'
  )
    .bind(thread)
    .first();
  if (pending) return { skipped: 'already queued for a human' };

  if (String(env.IG_TYPING) === 'true' && String(env.DRY_RUN) !== 'true') {
    for (const action of ['mark_seen', 'typing_on']) {
      try {
        await sendAction(env, thread, action);
      } catch {
        /* cosmetic only */
      }
    }
  }

  const started = Date.now();
  const result = await generateReply(
    env,
    await history(env, thread, num(env.HISTORY_TURNS, 8), last.id),
    last.text,
    await whoIs(env, thread)
  );
  const took = ((Date.now() - started) / 1000).toFixed(1);

  if (!result.reply) {
    await addHandoff(env, thread, last.text, 'empty model reply');
    return { skipped: 'empty model reply' };
  }

  if (result.handoff && String(env.HANDOFF_MODE) === 'hold') {
    await addHandoff(env, thread, `${last.text}\n---\n${result.reply}`, 'model flagged handoff');
    return { held: true, reply: result.reply };
  }

  if (String(env.DRY_RUN) === 'true') {
    console.log(`[DRY RUN] ${await handleOf(env, thread)} in ${took}s: ${result.reply}`);
  } else {
    try {
      await sendText(env, thread, result.reply, last.mid);
      const handle = await handleOf(env, thread);
      console.log(
        `replied to ${handle} in ${took}s via ${result.model}` +
          ` | they said: "${String(last.text).slice(0, 60)}"` +
          ` | bot said: "${String(result.reply).slice(0, 60)}"${last.mid ? ' (threaded)' : ''}`
      );
    } catch (err) {
      if (err.windowClosed) {
        await addHandoff(env, thread, last.text, `window closed: ${err.message}`);
      }
      console.error('send failed', err.message);
      return { error: err.message };
    }
  }

  await addMessage(env, thread, 'assistant', result.reply);
  return { replied: result.reply, model: result.model, took };
}

// Same reasoning as the debounce: the sweep must not fire while a webhook job is
// still thinking, or both send a reply. It only picks up work that is well past
// due, so a lost job is answered within a minute or two instead of instantly.
const sweepGrace = (env) =>
  num(env.DEBOUNCE_SECONDS, 1) + num(env.SWEEP_GRACE_SECONDS, 20);

// Safety net: a lost debounce job, a redeploy, an eviction — the cron picks it up.
async function sweep(env) {
  if (!(await autoReplyEnabled(env))) return 0;   // paused: nothing to catch up on
  const windowHours = num(env.WINDOW_HOURS, 24);
  const since = Math.floor(Date.now() / 1000) - windowHours * 3600;
  const cut = Math.floor(Date.now() / 1000) - sweepGrace(env);

  const { results } = await env.DB.prepare(
    `SELECT m.thread AS thread, m.id AS id
       FROM messages m
      WHERE m.role = 'user' AND m.created > ? AND m.created < ?
        AND m.id = (SELECT MAX(id) FROM messages WHERE thread = m.thread)
      ORDER BY m.id DESC LIMIT 5`
  )
    .bind(since, cut)
    .all();

  for (const row of results || []) {
    try {
      await answerThread(env, row.thread, row.id);
    } catch (err) {
      console.error('sweep failed', row.thread, err.message);
    }
  }
  return (results || []).length;
}

// --- token refresh --------------------------------------------------------- //

async function refreshToken(env) {
  const token = await accessToken(env);
  if (!token) return 'no token';
  const res = await fetch(
    `${env.IG_HOST}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    console.error('token refresh failed', JSON.stringify(body).slice(0, 200));
    return 'failed';
  }
  await putSetting(env, 'ig_access_token', body.access_token);
  const days = Math.floor((body.expires_in || 0) / 86400);
  console.log(`token refreshed, valid ~${days} days`);
  return `ok (~${days} days)`;
}

// --- HTTP ------------------------------------------------------------------ //

function adminOk(env, url, request) {
  const token = url.searchParams.get('token') || (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  return Boolean(env.ADMIN_TOKEN) && timingSafeEqual(String(token || ''), env.ADMIN_TOKEN);
}

async function handleWebhookGet(url, env) {
  if (url.searchParams.get('hub.mode') === 'subscribe' &&
      timingSafeEqual(url.searchParams.get('hub.verify_token') || '', env.IG_VERIFY_TOKEN || '')) {
    console.log('webhook verified');
    return new Response(url.searchParams.get('hub.challenge') || '', { status: 200 });
  }
  console.warn('webhook verification rejected');
  return new Response('forbidden', { status: 403 });
}

async function handleWebhookPost(request, env, ctx) {
  const raw = await request.arrayBuffer();
  if (!(await validSignature(env, raw, request.headers.get('x-hub-signature-256')))) {
    console.warn('bad signature');
    return new Response('bad signature', { status: 403 });
  }

  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return new Response('bad json', { status: 400 });
  }
  if (body.object !== 'instagram') return new Response('EVENT_RECEIVED');

  const jobs = [];
  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      const msg = event.message || {};
      const sender = (event.sender || {}).id;
      const mid = msg.mid;
      if (!sender) continue;
      if (msg.is_echo || msg.is_self) continue;         // our own outgoing message
      if (sender === entry.id) continue;                // self message
      if (!(await claimMid(env, mid))) continue;        // duplicate delivery

      let text = msg.text || '';
      if (!text && msg.attachments) text = '[the person sent an attachment]';
      if (!text) continue;

      await addMessage(env, sender, 'user', text, mid);
      const row = await env.DB.prepare(
        'SELECT id FROM messages WHERE thread = ? ORDER BY id DESC LIMIT 1'
      )
        .bind(sender)
        .first();
      const id = row ? row.id : null;

      jobs.push(
        (async () => {
          ctx.waitUntil(rememberPerson(env, sender));
          if (!(await autoReplyEnabled(env))) return;   // panel switch is off
          // Debounce: wait in case more messages follow, then answer once.
          await sleep(num(env.DEBOUNCE_SECONDS, 3) * 1000);
          try {
            await answerThread(env, sender, id);
          } catch (err) {
            console.error('reply failed', err.message);
          }
        })()
      );
    }
  }

  // Answer off the request path; Meta wants its 200 within a few seconds.
  ctx.waitUntil(Promise.all(jobs));
  return new Response('EVENT_RECEIVED');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/webhook') {
      if (request.method === 'GET') return handleWebhookGet(url, env);
      if (request.method === 'POST') return handleWebhookPost(request, env, ctx);
      return new Response('method not allowed', { status: 405 });
    }

    if (url.pathname === '/health') {
      const counts = await env.DB.batch([
        env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE role='user'"),
        env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE role='assistant'"),
        env.DB.prepare('SELECT COUNT(*) AS n FROM seen'),
        env.DB.prepare('SELECT COUNT(*) AS n FROM handoff WHERE done=0'),
      ]);
      return json({
        ok: true,
        dry_run: String(env.DRY_RUN) === 'true',
        auto_reply: await autoReplyEnabled(env),
        model: env.LLM_MODEL,
        signature_checked: Boolean(env.IG_APP_SECRET),
        stats: {
          inbound: counts[0].results[0].n,
          sent: counts[1].results[0].n,
          webhooks_seen: counts[2].results[0].n,
          handoffs_open: counts[3].results[0].n,
        },
      });
    }

    if (url.pathname === '/threads' || url.pathname === '/handoffs') {
      if (!adminOk(env, url, request)) return new Response('forbidden', { status: 403 });
      if (url.pathname === '/threads') {
        const { results } = await env.DB.prepare(
          `SELECT thread, SUM(role='user') AS inbound, SUM(role='assistant') AS replies,
                  MAX(created) AS last_seen
             FROM messages GROUP BY thread ORDER BY last_seen DESC LIMIT 30`
        ).all();
        const out = [];
        for (const r of results || []) {
          const lastMsg = await env.DB.prepare(
            'SELECT text FROM messages WHERE thread = ? ORDER BY id DESC LIMIT 1'
          )
            .bind(r.thread)
            .first();
          out.push({ ...r, handle: await handleOf(env, r.thread), last_message: (lastMsg ? lastMsg.text : '').slice(0, 140) });
        }
        return json({ threads: out });
      }
      const { results } = await env.DB.prepare(
        'SELECT * FROM handoff WHERE done = 0 ORDER BY id DESC LIMIT 50'
      ).all();
      return json({ open: results || [] });
    }

    // Manual reply: POST /send?token=… with {"thread":"<IGSID>","text":"…"}
    if (url.pathname === '/send' && request.method === 'POST') {
      if (!adminOk(env, url, request)) return new Response('forbidden', { status: 403 });
      const { thread, text } = await request.json().catch(() => ({}));
      if (!thread || !text) return json({ error: 'thread and text are required' }, 400);
      try {
        const out = await sendText(env, thread, text);
        await addMessage(env, thread, 'assistant', text);
        return json({ ok: true, result: out });
      } catch (err) {
        return json({ ok: false, error: err.message }, 502);
      }
    }

    // Manual maintenance: POST /refresh?token=…
    if (url.pathname === '/refresh' && request.method === 'POST') {
      if (!adminOk(env, url, request)) return new Response('forbidden', { status: 403 });
      return json({ refresh: await refreshToken(env) });
    }

    // --- phone control panel ------------------------------------------------
    if (url.pathname === '/panel') {
      if (!panelOk(env, url, request)) return new Response('forbidden', { status: 403 });
      return new Response(PANEL_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    if (url.pathname === '/panel-state') {
      if (!panelOk(env, url, request)) return new Response('forbidden', { status: 403 });
      const counts = await env.DB.batch([
        env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE role='user'"),
        env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE role='assistant'"),
        env.DB.prepare('SELECT COUNT(*) AS n FROM handoff WHERE done=0'),
        // "waiting" = threads whose newest message is from the person, i.e. the bot
        // still owes them an answer. inbound-minus-reply is wrong the moment a
        // conversation has more than one exchange.
        env.DB.prepare(`SELECT COUNT(*) AS n FROM (
            SELECT thread,
                   (SELECT role FROM messages b WHERE b.thread = a.thread
                     ORDER BY b.id DESC LIMIT 1) AS last_role
              FROM messages a GROUP BY thread
          ) WHERE last_role = 'user'`),
      ]);
      const { results } = await env.DB.prepare(
        `SELECT thread, SUM(role='user') AS inbound, SUM(role='assistant') AS replies,
                MAX(created) AS last_seen
           FROM messages GROUP BY thread ORDER BY last_seen DESC LIMIT 8`
      ).all();
      const threads = [];
      for (const t of results || []) {
        const last = await env.DB.prepare(
          'SELECT text FROM messages WHERE thread = ? ORDER BY id DESC LIMIT 1'
        )
          .bind(t.thread)
          .first();
        threads.push({
          thread: t.thread,
          handle: await handleOf(env, t.thread),
          inbound: t.inbound,
          replies: t.replies,
          last_seen: t.last_seen,
          last_message: (last ? last.text : '').slice(0, 110),
        });
      }
      return json({
        enabled: await autoReplyEnabled(env),
        dry_run: String(env.DRY_RUN) === 'true',
        model: env.LLM_MODEL,
        account: '@op_sihab',
        stats: {
          inbound: counts[0].results[0].n,
          sent: counts[1].results[0].n,
          handoffs_open: counts[2].results[0].n,
          waiting: counts[3].results[0].n,
        },
        threads,
      });
    }

    // View specific thread's messages for in-panel conversation inspector
    if (url.pathname === '/thread-messages') {
      if (!panelOk(env, url, request)) return new Response('forbidden', { status: 403 });
      const thread = url.searchParams.get('thread');
      if (!thread) return json({ error: 'thread required' }, 400);
      const { results } = await env.DB.prepare(
        'SELECT id, role, text, created FROM messages WHERE thread = ? ORDER BY id ASC LIMIT 50'
      ).bind(thread).all();
      return json({
        thread,
        handle: await handleOf(env, thread),
        messages: results || [],
      });
    }

    // Live AI DM Simulator for testing answers directly in the browser
    if (url.pathname === '/simulate-chat' && request.method === 'POST') {
      if (!panelOk(env, url, request)) return new Response('forbidden', { status: 403 });
      const body = await request.json().catch(() => ({}));
      const text = String(body.text || '').trim();
      if (!text) return json({ error: 'text is required' }, 400);
      const hist = Array.isArray(body.history) ? body.history : [];
      const started = Date.now();
      const simWho = { handle: '@tester_boss', name: 'Boss Tester', messages: 5 };
      const res = await generateReply(env, hist.slice(-6), text, simWho);
      const took = ((Date.now() - started) / 1000).toFixed(2);
      return json({
        reply: res.reply,
        handoff: res.handoff,
        lang: res.lang,
        model: res.model,
        took,
      });
    }

    if (url.pathname === '/toggle' && request.method === 'POST') {
      if (!panelOk(env, url, request)) return new Response('forbidden', { status: 403 });
      const body = await request.json().catch(() => ({}));
      const value = body.enabled === true || String(body.enabled) === 'true';
      await putSetting(env, 'enabled', value ? 'true' : 'false');
      console.log(`auto-reply switched ${value ? 'ON' : 'OFF'} from the panel`);
      return json({ enabled: value });
    }

    return new Response('Instagram AI auto-reply is running.', { status: 200 });
  },

  async scheduled(event, env, ctx) {
    // Every minute: catch anything the webhook path missed, and keep the token alive.
    ctx.waitUntil(sweep(env).catch((err) => console.error('sweep error', err.message)));
    const day = new Date().getUTCDate();
    if (day === 1 || day === 15) {
      ctx.waitUntil(refreshToken(env).catch((err) => console.error('refresh error', err.message)));
    }
  },
};
