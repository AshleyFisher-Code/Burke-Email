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
    // two fixes on overlapping words would cancel each other: keep the first
    const s0 = text.indexOf(x.fragment), s1 = s0 + x.fragment.length;
    if (out.some(y => y.part === x.part && y._at < s1 && s0 < y._at + y.fragment.length)) continue;
    out.push({ ...x, options: opts, _at: s0 });
  }
  return out.slice(0, 10);
}

/* ---------- levels: the help fades as he gets it right ---------- */
export const LEVELS = {
  1: { name: 'Step by step', blurb: 'Every part of the email, one at a time.' },
  2: { name: 'Draft it, then check', blurb: 'You write the whole email, then the coach checks each part.' },
  3: { name: 'Final check', blurb: 'You write it your way. The coach only looks it over.' },
};
// Move up after 15 clean emails out of the last 20 at this level, with variety, so rushing through
// easy ones doesn't count. A sloppy one costs him but doesn't wipe out his progress.
export const WINDOW = 20, NEED_CLEAN = 15, NEED_EACH = 3;
export const KINDS = [['replyAll', 'needed Reply all'], ['ccMom', 'needed CC Mom'], ['multi', 'had 2+ questions'], ['new', 'new emails you started']];
export function tagsFor(mail, momAlreadyOn = false) {
  if (mail.compose) return { replyAll: false, ccMom: !!mail.ccMom, multi: false, new: true };
  return { replyAll: correctReplyType(mail) === 'reply_all', ccMom: !!mail.ccMom && !momAlreadyOn, multi: (mail.asks || []).length >= 2, new: false };
}
/** Where he stands at this level. */
export function standing(p) {
  const recent = (p && p.recent) || [], clean = recent.filter(r => r.c);
  const kinds = Object.fromEntries(KINDS.map(([k]) => [k, clean.filter(r => r[k]).length]));
  const ready = clean.length >= NEED_CLEAN && KINDS.every(([k]) => kinds[k] >= NEED_EACH);
  return { clean: clean.length, of: recent.length, kinds, ready };
}

/** A session is clean when every tap decision was right the first time and no writing step needed 3+ tries. */
export function isClean(s) {
  return !!s && s.finished && Object.values(s.firstTry || {}).every(Boolean) && Object.values(s.tries || {}).every(n => n < 3);
}

/** Progress after a finished session. No-reply emails don't count either way. */
export function nextProgress(p, clean, tags, counts = true) {
  const level = p.level || 1;
  if (!counts) return { ...p, level, movedUp: false };
  const recent = [...(p.recent || []), { c: !!clean, ...tags }].slice(-WINDOW);
  const np = { ...p, level, recent, movedUp: false };
  if (level < 3 && standing(np).ready) return { ...np, level: level + 1, recent: [], movedUp: true };
  return np;
}

/* ---------- new emails Burke starts himself ---------- */
export const PURPOSES = [
  ['missed', 'I missed a class', 'Find out what you missed'],
  ['testHelp', 'Help before a test', 'Ask for extra help or a time to meet'],
  ['meeting', 'Set up a meeting', 'For another reason'],
  ['extension', 'More time or missing work', 'Ask for an extension or say it\'s coming'],
  ['question', 'A question about an assignment', ''],
  ['injury', 'I\'m hurt or sick', 'Can\'t play or practice'],
  ['other', 'Something else', ''],
];
export const purposeLabel = id => (PURPOSES.find(p => p[0] === id) || [, 'Something else'])[1];
export const PLAN_HINTS = {
  missed: 'Which day did you miss, and what do you need? (What you missed, the homework, a time to make up a quiz)',
  testHelp: 'Which test is it, when is it, and when could you meet?',
  meeting: 'What do you want to talk about, and when are you free?',
  extension: 'Which assignment, and what do you need? (More time, or when you\'ll turn it in)',
  question: 'Which assignment, and what\'s your question?',
  injury: 'What happened, and what will you miss?',
  other: 'What happened, and what do you need from them?',
};

/** Who can be copied, given who he's writing to. */
export function ccChoices(toRole) {
  return [['mom', 'Mom'], ['advisor', 'My advisor'], ['trainer', 'The trainer']]
    .filter(([id]) => !(id === 'advisor' && toRole === 'advisor') && !(id === 'trainer' && toRole === 'trainer') && !(id === 'mom' && toRole === 'parent'));
}
/** Grade his Cc picks against what the coach decided. picked: array of ids ('mom','advisor','trainer'); [] = nobody. */
export function ccFeedback(mail, picked, toRole) {
  const want = { mom: !!mail.ccMom, advisor: !!mail.ccAdvisor && toRole !== 'advisor', trainer: !!mail.ccTrainer && toRole !== 'trainer' };
  const why = { mom: mail.ccMomWhy, advisor: mail.ccAdvisorWhy, trainer: mail.ccTrainerWhy };
  const name = { mom: 'Mom', advisor: 'Your advisor', trainer: 'The trainer' };
  const set = new Set(picked), notes = [];
  for (const [id] of ccChoices(toRole)) {
    if (want[id] && !set.has(id)) notes.push(`${name[id]} should be on this. ${why[id] || ''}`.trim());
    if (!want[id] && set.has(id)) notes.push(`${name[id]} doesn't need this one. ${why[id] || ''}`.trim());
  }
  const wanted = ccChoices(toRole).filter(([id]) => want[id]).map(([, l]) => l.replace('My ', 'your ').replace('The ', 'the '));
  if (!notes.length) return { ok: true, title: wanted.length ? `Right: Cc ${wanted.join(' and ')}.` : 'Right: nobody else.',
    why: ccChoices(toRole).filter(([id]) => want[id]).map(([id]) => why[id]).filter(Boolean).join(' ') || 'This one is just between you and them.' };
  return { ok: false, title: 'Not quite.', why: notes.join(' ') };
}

/** Practice situations for starting a new email (no Claude needed to make them). */
export const NEW_PRACTICE = [
  { text: 'You were out sick on Tuesday and missed Mrs. Lee\'s science class. You want to know what you missed and whether there was homework.',
    to: { title: 'Mrs.', lastName: 'Lee', role: 'teacher', about: 'science' }, purpose: 'missed', existing: false },
  { text: 'You have a math test with Mr. Patel next Thursday, and you\'re stuck on solving inequalities. You\'re free Monday or Tuesday before school.',
    to: { title: 'Mr.', lastName: 'Patel', role: 'teacher', about: 'math' }, purpose: 'testHelp', existing: false },
  { text: 'You want to talk to your advisor, Mrs. Ortiz, about how to keep track of your homework better. You\'re free during lunch on Wednesday or Friday.',
    to: { title: 'Mrs.', lastName: 'Ortiz', role: 'advisor', about: '' }, purpose: 'meeting', existing: false },
  { text: 'Mrs. Lee already emailed you yesterday about your missing lab worksheet. Now you have a question about it.',
    to: { title: 'Mrs.', lastName: 'Lee', role: 'teacher', about: 'science' }, purpose: 'question', existing: true },
  { text: 'You missed Mr. Grant\'s history class on Friday for a doctor\'s appointment, and there was a quiz. You need to find out when you can make it up.',
    to: { title: 'Mr.', lastName: 'Grant', role: 'teacher', about: 'history' }, purpose: 'missed', existing: false },
  { text: 'You rolled your ankle at recess and can\'t practice today. You need to tell Coach Diaz.',
    to: { title: 'Coach', lastName: 'Diaz', role: 'coach', about: 'baseball' }, purpose: 'injury', existing: false },
  { text: 'Your English test with Mrs. Kent is on Monday. You want to come in for extra help on Friday after school.',
    to: { title: 'Mrs.', lastName: 'Kent', role: 'teacher', about: 'English' }, purpose: 'testHelp', existing: false },
  { text: 'You want to meet with Mr. Patel to talk about your grade on the last math quiz. You\'re free Thursday after school.',
    to: { title: 'Mr.', lastName: 'Patel', role: 'teacher', about: 'math' }, purpose: 'meeting', existing: false },
];
