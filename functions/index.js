// The only place the Claude key lives. The app calls this one function; it answers only
// Burke's and Mom's logins, keeps a daily cap so a bug can't run up the bill, and does all
// database writes for the email coach (so the Latin app's Firestore rules don't need to change).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as P from './prompts.js';

initializeApp();
const db = getFirestore();
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

const STUDENT_UID = 'mhP5pRPUlXg3nooLBIsjMyHvF6j2';
const PARENT_UID = 'xFqJAFGGioUUadmrgbY7Fpbixwm2';
const MODEL = 'claude-sonnet-5-5';
const DAILY_CAP = 250;                       // Claude calls per day, both accounts together

const progressDoc = () => db.doc('emailCoach/progress');
const sessions = () => db.collection('emailCoachSessions');

// Every object in a schema must say additionalProperties:false for guaranteed-shape JSON.
export function strict(schema) {
  if (Array.isArray(schema)) return schema.map(strict);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) out[k] = k === 'properties' ? Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, strict(pv)])) : strict(v);
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}

// Sonnet 5.5 rejects forced tool use, so answers come back as JSON matching the schema (structured outputs).
export async function callClaude(key, { content, tool, maxTokens = 2000, system = P.SYSTEM }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens + 6000, system,
      messages: [{ role: 'user', content }],
      output_config: { format: { type: 'json_schema', schema: strict(tool.input_schema) } },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Claude error', res.status, JSON.stringify(data).slice(0, 800));
    throw new HttpsError('unavailable', res.status === 401 ? 'The Claude key isn\'t working. Ask Mom.' : 'The coach couldn\'t answer. Try again in a minute.');
  }
  const block = (data.content || []).filter(b => b.type === 'text').at(-1);
  try { return JSON.parse(block.text); }
  catch (e) {
    console.error('Bad JSON', data.stop_reason, block && block.text && block.text.slice(0, 300));
    throw new HttpsError('internal', 'The coach gave a garbled answer. Try again.');
  }
}

async function countCall() {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const ref = db.doc(`emailCoachUsage/${day}`);
  const n = await db.runTransaction(async t => {
    const snap = await t.get(ref); const c = (snap.exists ? snap.data().calls : 0) + 1;
    t.set(ref, { calls: c }, { merge: true }); return c;
  });
  if (n > DAILY_CAP) throw new HttpsError('resource-exhausted', 'The coach has hit today\'s limit. Try again tomorrow.');
}

const str = (v, max) => { if (typeof v !== 'string') return ''; return v.slice(0, max); };
const emailBlock = m => `THE EMAIL BURKE RECEIVED (as read earlier):\n${JSON.stringify({
  subject: m.subject, sender: m.sender, recipients: m.recipients, body: m.body, asks: m.asks,
}, null, 1).slice(0, 12000)}`;
const contextBlock = m => m && m.compose ? P.composeBlock(m) : emailBlock(m);
const rolesBlock = r => r && Object.keys(r).length ? `\nWho Burke says each person is: ${JSON.stringify(r).slice(0, 2000)}` : '';

/* ---------- actions ---------- */
export const ACTIONS = {
  async read(key, d) {
    const imgs = Array.isArray(d.images) ? d.images.slice(0, 4) : [];
    const text = str(d.text, 20000);
    if (!imgs.length && !text.trim()) throw new HttpsError('invalid-argument', 'Add a screenshot or paste the email first.');
    const content = [];
    for (const b64 of imgs) {
      if (typeof b64 !== 'string' || b64.length > 6_000_000) throw new HttpsError('invalid-argument', 'That picture is too big. Try a regular screenshot.');
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
    }
    content.push({ type: 'text', text: P.READ_INSTRUCTIONS + (text ? `\n\nPASTED TEXT:\n${text}` : '') });
    return callClaude(key, { content, tool: P.READ_TOOL, maxTokens: 3000 });
  },

  async check(key, d) {
    const rule = P.STEP_RULES[d.step];
    if (!rule || !d.mail) throw new HttpsError('invalid-argument', 'Unknown step.');
    const before = d.sofar ? `\nWhat he has written so far (for context only, don't judge it): ${JSON.stringify(d.sofar).slice(0, 3000)}` : '';
    return callClaude(key, { tool: P.CHECK_TOOL, maxTokens: 600, content: [{ type: 'text', text:
      `${contextBlock(d.mail)}${rolesBlock(d.roles)}${before}\n\nTHE STEP: ${rule}\n\nBURKE WROTE:\n"""${str(d.answer, 4000)}"""` }] });
  },

  async whole(key, d) {
    if (!d.mail) throw new HttpsError('invalid-argument', 'Missing email.');
    const c = !!d.mail.compose;
    return callClaude(key, { tool: c ? P.NEW_WHOLE_TOOL : P.WHOLE_TOOL, maxTokens: 900, content: [{ type: 'text', text:
      `${contextBlock(d.mail)}${rolesBlock(d.roles)}\n\n${c ? P.NEW_WHOLE_RULES : P.WHOLE_RULES}\n\nBURKE'S DRAFT:\n"""${str(d.answer, 6000)}"""` }] });
  },

  async plan(key, d) {
    if (!d.mail || !d.mail.compose) throw new HttpsError('invalid-argument', 'Missing details.');
    return callClaude(key, { tool: P.PLAN_TOOL, maxTokens: 900, content: [{ type: 'text', text:
      `${P.composeBlock({ ...d.mail, plan: '' })}\n\n${P.PLAN_RULES}\n\nBURKE'S PLAN:\n"""${str(d.answer, 3000)}"""` }] });
  },

  async example(key, d) {
    const part = { new_subject: 'the subject line of a new email (a few words)', new_thanks: 'the opening of a new email that says why you\'re writing', new_body: 'the main part of a new email that asks for something, with the details', new_closing: 'the closing line of a new email', new_whole: 'a whole short new email to a teacher, greeting to sign-off', plan: 'a few words saying what happened and what you need from the teacher', thanks: 'the thank-you opener (one sentence)', body: 'the main answer', closing: 'the closing line (one sentence)', whole: 'a whole short reply, greeting to sign-off', understand: 'a one-sentence summary of what an email is asking' }[d.step];
    if (!part) throw new HttpsError('invalid-argument', 'Unknown step.');
    return callClaude(key, { tool: P.EXAMPLE_TOOL, maxTokens: 500, content: [{ type: 'text', text:
      `${P.EXAMPLE_RULES}\n\nThe part he's stuck on: ${part}.\nHis real email is about: "${str(d.mail && d.mail.topic, 200)}". Pick something clearly different.` }] });
  },

  async polish(key, d) {
    const parts = {};
    for (const [k, v] of Object.entries(d.parts || {})) if (typeof v === 'string' && v.trim()) parts[k] = v.slice(0, 6000);
    if (!Object.keys(parts).length) return { issues: [] };
    return callClaude(key, { tool: P.POLISH_TOOL, maxTokens: 2000, content: [{ type: 'text', text:
      `${P.POLISH_RULES}\n\nHIS WRITING, by part:\n${JSON.stringify(parts, null, 1)}` }] });
  },

  async practice(key, d) {
    const i = Number.isInteger(d.scenario) ? d.scenario % P.SCENARIOS.length : Math.floor(Math.random() * P.SCENARIOS.length);
    const m = await callClaude(key, { tool: P.PRACTICE_TOOL, maxTokens: 3000, content: [{ type: 'text', text:
      `${P.PRACTICE_RULES}\n\nSCENARIO: ${P.SCENARIOS[i]}` }] });
    return { ...m, scenario: i, practice: true };
  },
};

const NO_CLAUDE = {
  async progress(uid) {
    const p = (await progressDoc().get()).data() || { level: 1, recent: [] };
    if (uid !== PARENT_UID) return { progress: p };
    const q = await sessions().orderBy('at', 'desc').limit(40).get();
    return { progress: p, sessions: q.docs.map(x => ({ id: x.id, ...x.data(), at: x.data().at ? x.data().at.toMillis() : null })) };
  },
  async save(uid, d) {
    if (uid !== STUDENT_UID && !d.preview) throw new HttpsError('permission-denied', 'Only Burke\'s sessions are saved.');
    if (d.preview) return { saved: false };
    const s = d.session || {};
    const doc = JSON.parse(JSON.stringify(s)); delete doc.images;
    if (JSON.stringify(doc).length > 200_000) throw new HttpsError('invalid-argument', 'Too big to save.');
    await sessions().add({ ...doc, at: FieldValue.serverTimestamp() });
    if (d.progress && typeof d.progress.level === 'number') {
      const p = d.progress;
      const recent = (Array.isArray(p.recent) ? p.recent : []).slice(-20).map(r => ({ c: !!r.c, replyAll: !!r.replyAll, ccMom: !!r.ccMom, multi: !!r.multi, new: !!r.new }));
      await progressDoc().set({ level: Math.min(3, Math.max(1, p.level)), recent, total: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return { saved: true };
  },
  async setLevel(uid, d) {
    if (uid !== PARENT_UID) throw new HttpsError('permission-denied', 'Only Mom can change the level.');
    const level = Math.min(3, Math.max(1, Number(d.level) || 1));
    await progressDoc().set({ level, recent: [], setByParentAt: FieldValue.serverTimestamp() }, { merge: true });
    return { level };
  },
};

export const coach = onCall({ secrets: [ANTHROPIC_API_KEY], region: 'us-central1', timeoutSeconds: 120, memory: '512MiB', maxInstances: 3 }, async req => {
  const uid = req.auth && req.auth.uid;
  if (uid !== STUDENT_UID && uid !== PARENT_UID) throw new HttpsError('permission-denied', 'This account isn\'t set up for the email coach.');
  const { action, ...d } = req.data || {};
  if (NO_CLAUDE[action]) return NO_CLAUDE[action](uid, d);
  if (!ACTIONS[action]) throw new HttpsError('invalid-argument', 'Unknown action.');
  await countCall();
  return ACTIONS[action](ANTHROPIC_API_KEY.value(), d);
});
