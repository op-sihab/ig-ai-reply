// Try the REAL system prompt (src/prompt.js) against the real model, on the
// kinds of messages the bot actually gets. Prints each reply plus the things
// that made the old replies bad: length, care-desk phrasing, re-greeting.
//
//   node tools/try_prompt.mjs

import { systemPrompt } from '../src/prompt.js';

const BASE = 'https://api-gateway.merge.dev/v1/chat/completions';
const KEY = process.env.HERMES_CUSTOM_MERGE_GATWAY_API_KEY;
const MODEL = process.env.TRY_MODEL || 'openai/gpt-6-luna';

const WHO = { handle: '@rakib_empireee', name: 'Rakib', messages: 6 };

const CASES = [
  { label: 'first contact, just a greeting', history: [], text: 'hi' },
  { label: 'price question (knowledge is empty)', history: [], text: 'bhai dam koto' },
  { label: 'banter', history: [], text: 'ko sala' },
  { label: 'rude-ish complaint', history: [], text: 'Yar speed kom korehe' },
  {
    label: 'turn 4 of a convo — must not re-greet or repeat itself',
    history: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Ki obostha bhai, bolen ki lagbe?' },
      { role: 'user', content: 'dam koto' },
      { role: 'assistant', content: 'Kon product ta bhai, naam bolen?' },
      { role: 'user', content: 'oi juta ta' },
    ],
    text: 'oi juta ta',
    useHistoryOnly: true,
  },
  { label: 'angry about money', history: [], text: 'taka niyeche kintu product dey nai, ki ei bepar' },
];

const CARE_PHRASES = [
  'sahajjo korte pari', 'sahajjo korbo', 'jonojjogitar jonno', 'kivabe sahajjo',
  'dhonnobad', 'how can i help', 'how may i help',
];

async function call(history, text) {
  const messages = [
    { role: 'system', content: systemPrompt(WHO) },
    ...history,
    ...(history.length && history[history.length - 1].content === text ? [] : [{ role: 'user', content: text }]),
  ];
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 200, temperature: 0.6 }),
  });
  const body = await res.text();
  if (!res.ok) return { error: `HTTP ${res.status}: ${body.slice(0, 160)}` };
  const data = JSON.parse(body);
  const raw = (data.choices?.[0]?.message?.content || '').trim();
  let parsed = null;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    /* keep raw for inspection */
  }
  return { raw, parsed, ptokens: data.usage?.completion_tokens };
}

let failures = 0;
for (const c of CASES) {
  const out = await call(c.history, c.text);
  console.log('\n' + '─'.repeat(70));
  console.log('CASE   : ' + c.label);
  console.log('THEY   : ' + c.text);
  if (out.error) {
    console.log('ERROR  : ' + out.error);
    failures++;
    continue;
  }
  const reply = out.parsed?.reply ?? out.raw;
  const flags = [];
  if (!out.parsed) flags.push('NOT JSON');
  if (reply.length > 200) flags.push(`TOO LONG (${reply.length})`);
  if (/\n/.test(reply)) flags.push('HAS NEWLINES');
  const low = String(reply).toLowerCase();
  for (const p of CARE_PHRASES) if (low.includes(p)) flags.push(`CARE-DESK: "${p}"`);
  if (c.history.length && /^(hi|hello|salam|assalam|ki obostha|kmn acho)/i.test(reply.trim())) {
    flags.push('RE-GREETED mid-conversation');
  }
  console.log(`BOT    : ${reply}`);
  console.log(`         ${reply.length} chars · ${out.ptokens} out-tokens · handoff=${out.parsed?.handoff} · lang=${out.parsed?.lang}`);
  console.log('VERDICT: ' + (flags.length ? '⚠ ' + flags.join(' | ') : 'ok'));
  if (flags.length) failures++;
}

console.log('\n' + '='.repeat(70));
console.log(failures ? `${failures}/${CASES.length} case(s) need a look` : `all ${CASES.length} cases clean`);
