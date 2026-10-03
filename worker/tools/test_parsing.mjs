// The one place a parsing accident could reach a customer: the JSON salvage
// path. Every case below is a shape a model actually produced or could produce.
//
//   node tools/test_parsing.mjs

import { extractJson, deJson, tidy } from '../src/index.js';

const env = { REPLY_MAX_CHARS: '200' };
let fails = 0;

function check(label, got, want) {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`);
}

// --- clean JSON -----------------------------------------------------------
let p = extractJson('{"reply":"Bolo bhai","handoff":false,"lang":"banglish"}');
check('clean json -> reply', p.reply, 'Bolo bhai');
check('clean json -> handoff', p.handoff, false);
check('clean json -> lang', p.lang, 'banglish');

// fenced, the way gemini answered
p = extractJson('```json\n{"reply":"Ek minute check kore bolchi","handoff":true,"lang":"banglish"}\n```');
check('fenced json -> reply', p.reply, 'Ek minute check kore bolchi');
check('fenced json -> handoff', p.handoff, true);

// --- truncated mid-JSON (the real failure seen in testing) ----------------
// A trailing {"handoff":true} leak after the sentence, cut off by max_tokens.
// The sentence must survive; the fragment must not.
p = extractJson('Kon jutata bolchen, chobita pathan—dam check kore bolchi. {"handoff":true,"lang":"banglish"}');
check('object appended after prose -> sentence kept', p.reply.trim(),
  'Kon jutata bolchen, chobita pathan—dam check kore bolchi.');
check('object appended after prose -> flags read from it', p.handoff, true);

// Properly truncated object: salvage the reply field.
p = extractJson('{"reply":"Bhai ek minute, ami check kore');
check('truncated object -> salvaged reply', p.reply, 'Bhai ek minute, ami check kore');
check('truncated object -> flagged salvaged', p.salvaged, true);

// Truncated object WITH a complete reply and a half-written handoff.
p = extractJson('{"reply":"Shundor!","handoff":tr');
check('truncated after reply -> reply kept', p.reply, 'Shundor!');

// Escaped quotes inside the reply must survive.
p = extractJson('{"reply":"Bolen \\"kemon acho\\" bhai","handoff":false}');
check('escaped quotes', p.reply, 'Bolen "kemon acho" bhai');

// --- no JSON at all: plain prose ------------------------------------------
p = extractJson('Bolo bhai ki lagbe');
check('plain prose -> reply', p.reply, 'Bolo bhai ki lagbe');

// empty
check('empty -> null', extractJson(''), null);

// --- deJson / tidy: the customer-facing side ------------------------------
check('deJson strips trailing object', deJson('Bolo bhai {"handoff":true}').trim(), 'Bolo bhai');
check('deJson strips mid-text object', deJson('Bolo {"a":1} bhai').replace(/\s+/g, ' ').trim(), 'Bolo bhai');
check('deJson cuts unterminated object', deJson('Bolo bhai {"handoff":tr').trim(), 'Bolo bhai');
check('deJson keeps text after a complete object', deJson('Bolo {"a":1} bhai ki lagbe').replace(/\s+/g, ' ').trim(),
  'Bolo bhai ki lagbe');
check('deJson keeps emoji', deJson('Bolo bhai 😄 {"x":1}').trim(), 'Bolo bhai 😄');

// The exact bug: a sentence with a leaked JSON fragment must never render as
// braces in a DM.
const leaked = tidy(env, 'Kon juta ta bolchen? {"handoff":true,"lang":"banglish"}');
check('tidy removes leaked json entirely', /[{}\\]/.test(leaked), false);
check('tidy keeps the sentence', leaked.startsWith('Kon juta ta bolchen?'), true);

// length cap: cut on a word boundary, add an ellipsis, no dangling comma
const long = tidy(env, 'a'.repeat(50) + ' ' + 'word '.repeat(80));
check('long reply capped', long.length <= 201, true);
check('long reply ends with ellipsis', long.endsWith('…'), true);

// newlines collapse
check('newlines collapse', tidy(env, 'line one\n\nline two'), 'line one line two');

// quotation marks wrapped around a whole reply are stripped
check('wrapping quotes stripped', tidy(env, '"Bolo bhai"'), 'Bolo bhai');

console.log('\n' + (fails ? `${fails} FAILING` : 'all parsing cases pass'));
process.exit(fails ? 1 : 0);
