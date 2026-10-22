// Decisions that follow fixed rules, so they're graded the same way every time
// (Claude only judges the writing). Pure functions: tested in tests/test.mjs.

export const ROLES = [
  ['teacher', 'Teacher'], ['advisor', 'Advisor'], ['coach', 'Coach / AD'], ['trainer', 'Trainer'],
  ['nurse', 'Nurse'], ['parent', 'Parent'], ['other', 'Someone else'],
];
export const roleLabel = r => (ROLES.find(x => x[0] === r) || [, ''])[1];

export const TITLES = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Coach'];

const norm = s => String(s || '').trim().toLowerCase();

/** "Mrs. Kent" if we know title + last name, else their name, else the email. */
export function displayName(p) {
  if (!p) return 'them';
  if (p.title && p.lastName) return `${p.title} ${p.lastName}`;
  return p.name || p.email || 'them';
}

/** Everyone on the email except Burke and the sender. */
export function others(mail) {
  const s = norm(mail.sender && mail.sender.email);
  return (mail.recipients || []).filter(r => !r.isMe && !(s && norm(r.email) === s));
}

export function momOnEmail(mail, momEmail) {
  const m = norm(momEmail);
  return [...(mail.recipients || []), mail.sender || {}].some(r => r.isMom || (m && norm(r.email) === m));
}

/** The right button: 'reply' or 'reply_all'. Forward and a new message are never right for answering. */
export function correctReplyType(mail) {
  const o = others(mail);
  if (o.some(r => r.isGroup)) return 'reply';      // a group list: don't send your answer to everyone
  return o.length ? 'reply_all' : 'reply';
}

const list = names => names.length <= 1 ? names.join('') : names.length === 2 ? names.join(' and ') : names.slice(0, -1).join(', ') + ', and ' + names.at(-1);

/** Feedback for the Reply / Reply all / Forward / New message tap. roles: {email|name -> role} he tapped. */
export function replyFeedback(mail, choice, roles = {}) {
  const want = correctReplyType(mail);
  const sender = displayName(mail.sender);
  const o = others(mail).filter(r => !r.isGroup);
  const tag = r => { const role = roles[r.email || r.name]; return displayName(r) + (role && role !== 'other' ? ` (${roleLabel(role).toLowerCase()})` : ''); };
  const copied = list(o.map(tag));
  if (choice === 'new') return { ok: false, title: 'Never start a new message to answer.',
    why: `Open ${sender}'s email and answer from inside it. A new message starts a separate conversation, so ${sender} has to hunt for what you're answering${o.length ? `, and ${copied} won't see it at all` : ''}.` };
  if (choice === 'forward') return { ok: false, title: 'Forward is for passing it on.',
    why: `Forward sends the email to someone who isn't on it yet. ${sender} is waiting for your answer, so tap ${want === 'reply_all' ? 'Reply all' : 'Reply'}.` };
  if (choice === want) return { ok: true, title: 'Right.',
    why: want === 'reply_all'
      ? `${copied} ${o.length === 1 ? 'was' : 'were'} copied on purpose. Reply all keeps ${o.length === 1 ? 'them' : 'everyone'} in the loop.`
      : others(mail).some(r => r.isGroup) ? 'It went to a whole group. Reply sends your answer only to ' + sender + '.' : `Only you got this email, so Reply goes straight back to ${sender}.` };
  if (choice === 'reply' && want === 'reply_all') return { ok: false, title: 'Look at the CC line.',
    why: `${copied} ${o.length === 1 ? 'was' : 'were'} copied on this. If you tap Reply, only ${sender} sees your answer and ${o.length === 1 ? 'they miss' : 'they all miss'} it. Tap Reply all.` };
  // reply_all when reply was right
  if (others(mail).some(r => r.isGroup)) return { ok: false, title: 'This went to a whole group.',
    why: `Reply all would send your answer to everyone on the list. Tap Reply so only ${sender} gets it.` };
  return { ok: true, title: 'That works.', why: `Only you got this email, so Reply and Reply all do the same thing here. Reply is the usual habit.` };
}

/** Did he get the CC-Mom call right? Claude decided mail.ccMom from the topic. */
export function ccMomFeedback(mail, saidYes) {
  const want = !!mail.ccMom, why = mail.ccMomWhy || '';
  if (saidYes === want) return { ok: true, title: want ? 'Yes, CC Mom.' : 'Right, no need.', why };
  return want
    ? { ok: false, title: 'This one needs Mom on it.', why: why || 'Asking to meet, moving a test or deadline, injuries, grades, or any problem: Mom gets a copy.' }
    : { ok: false, title: 'Mom doesn\'t need this one.', why: why || 'A quick thank-you or "got it" doesn\'t need a copy to Mom.' };
}

/** Seeded shuffle so tests are repeatable. */
export function rng(seed = Date.now()) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
export function shuffle(arr, r = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** Four greeting choices, exactly one right. Needs sender.title + sender.lastName (asked first if missing). */
export function greetingOptions(sender, r = Math.random) {
  const t = sender && sender.title, ln = sender && sender.lastName;
  if (!t || !ln) {
    return shuffle([
      { text: 'Hello,', ok: true, why: 'With no one person to name, "Hello," with a comma is right.' },
      { text: 'Hey guys,', ok: false, why: '"Hey guys" is how you talk to friends, not school staff.' },
      { text: 'hello', ok: false, why: 'Start with a capital letter and end the greeting with a comma.' },
      { text: 'Yo,', ok: false, why: 'Too casual for school email.' },
    ], r);
  }
  const name = `${t} ${ln}`;
  const first = (sender.name || '').split(/\s+/)[0];
  const right = r() < 0.5 ? `Dear ${name},` : `Hello ${name},`;
  const wrong = [
    { text: `Hey ${name},`, ok: false, why: '"Hey" is for friends. Use "Dear" or "Hello" with a teacher.' },
    { text: `${right.slice(0, -1)}`, ok: false, why: 'Almost. The greeting ends with a comma.' },
    first && first.toLowerCase() !== ln.toLowerCase() && !/^(mr|mrs|ms|dr|coach)\.?$/i.test(first)
      ? { text: `Hi ${first},`, ok: false, why: `Use ${name}, not their first name.` }
      : { text: `${right.split(' ')[0].toLowerCase()} ${t.toLowerCase()} ${ln.toLowerCase()},`, ok: false, why: 'Names and the first word of the greeting start with capital letters.' },
  ];
  return shuffle([{ text: right, ok: true, why: `"${right}" is polite and uses ${name}, with a comma at the end.` }, ...wrong], r);
}

/** Sign-off choices: two right, two wrong. */
export function signoffOptions(studentName, r = Math.random) {
  const good = shuffle([
    { text: `Thank you,\n${studentName}`, ok: true },
    { text: `Best,\n${studentName}`, ok: true },
    { text: `Sincerely,\n${studentName}`, ok: true },
  ], r).slice(0, 2);
  const bad = shuffle([
    { text: `Love,\n${studentName}`, ok: false, why: '"Love" is for family. Use "Thank you," or "Best,".' },
    { text: studentName, ok: false, why: 'Add a closing word above your name, like "Thank you,".' },
    { text: `thx\n${studentName}`, ok: false, why: 'Spell it out: "Thank you," with a capital T and a comma.' },
    { text: `Bye!\n${studentName}`, ok: false, why: 'Too casual. Use "Thank you," or "Best,".' },
  ], r).slice(0, 2);
  return shuffle([...good, ...bad], r);
}

/** The finished email, the way it will look when he pastes it. */
export function assemble({ greeting, thanks, body, closing, signoff, whole }) {
  if (whole != null) return tidy(whole);
  const middle = [thanks, body].map(s => tidy(s || '')).filter(Boolean).join(' ');
  return [greeting, middle, tidy(closing || ''), signoff].map(s => (s || '').trim()).filter(Boolean).join('\n\n');
}
const tidy = s => String(s).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();

/** Replace one spot in a piece of his writing. Returns null if that spot isn't there (so we skip the fix). */
export function applyFix(text, fragment, replacement, at = -1) {
  if (!fragment) return null;
  let i = at >= 0 && text.substr(at, fragment.length) === fragment ? at : text.indexOf(fragment);
  if (i < 0) return null;
  return text.slice(0, i) + replacement + text.slice(i + fragment.length);
}

/** Keep only polish issues we can actually show and fix: the spot must be in his text and exactly one choice right. */
export function usableIssues(issues, parts) {
  const out = [], seen = new Set();
  for (const x of issues || []) {
    const text = parts[x.part];
    if (typeof text !== 'string' || !x.fragment || !text.includes(x.fragment)) continue;
    if (text.indexOf(x.fragment) !== text.lastIndexOf(x.fragment)) continue;   // appears twice: can't tell which spot
    const opts = (x.options || []).filter(o => o && typeof o.text === 'string');
    if (opts.filter(o => o.ok).length !== 1 || opts.length < 2) continue;
    const right = opts.find(o => o.ok).text;
    if (right === x.fragment) continue;               // "fix" that changes nothing
    const key = x.part + '|' + x.fragment;
    if (seen.has(key)) continue; seen.add(key);
    out.push({ ...x, options: opts });
  }
  return out.slice(0, 10);
}

/* ---------- levels: the help fades as he gets it right ---------- */
export const LEVELS = {
  1: { name: 'Step by step', blurb: 'Every part of the email, one at a time.' },
  2: { name: 'Draft it, then check', blurb: 'You write the whole email, then the coach checks each part.' },
  3: { name: 'Final check', blurb: 'You write it your way. The coach only looks it over.' },
};
export const CLEAN_TO_MOVE_UP = 5;

/** A session is clean when every tap decision was right the first time and no writing step needed 3+ tries. */
export function isClean(s) {
  return !!s && s.finished && Object.values(s.firstTry || {}).every(Boolean) && Object.values(s.tries || {}).every(n => n < 3);
}

/** Progress after a finished session. Parent overrides (levelSetByParent) still move up on their own later. */
export function nextProgress(p, clean) {
  const level = p.level || 1, streak = clean ? (p.cleanStreak || 0) + 1 : 0;
  if (clean && streak >= CLEAN_TO_MOVE_UP && level < 3) return { ...p, level: level + 1, cleanStreak: 0, movedUp: true };
  return { ...p, level, cleanStreak: streak, movedUp: false };
}
