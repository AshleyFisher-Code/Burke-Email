import { STUDENT_UID, PARENT_UID, STUDENT_NAME, MOM_EMAIL, APP_VERSION } from './config.js';
import { ask, shrink, isMock } from './coach.js';
import { ROLES, roleLabel, TITLES, displayName, others, momOnEmail, correctReplyType, replyFeedback, ccMomFeedback,
  greetingOptions, signoffOptions, shuffle, assemble, applyFix, usableIssues, LEVELS, NEED_CLEAN, NEED_EACH, WINDOW, KINDS, standing, tagsFor, isClean, nextProgress,
  PURPOSES, purposeLabel, PLAN_HINTS, ccChoices, ccFeedback, NEW_PRACTICE } from './rules.js';

/* ---------- tiny DOM helper ---------- */
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) { if (k == null || k === false) continue; e.append(k.nodeType ? k : document.createTextNode(String(k))); }
  return e;
};
const app = document.getElementById('app');
const show = (...nodes) => { app.replaceChildren(...nodes.flat().filter(n => n != null && n !== false)); window.scrollTo(0, 0); };
const net = document.getElementById('net');
const setNet = () => { net.hidden = navigator.onLine; };
window.addEventListener('online', setNet); window.addEventListener('offline', setNet); setNet();

/* ---------- who's signed in ---------- */
let user = null, role = null, preview = false, progress = { level: 1, recent: [] }, parentData = null;
let S = null;            // the email being worked on
const runKey = () => 'email-run-' + (user && user.uid);
const saveRun = () => { try { if (S) localStorage.setItem(runKey(), JSON.stringify(S)); else localStorage.removeItem(runKey()); } catch (e) {} };
const loadRun = () => { try { return JSON.parse(localStorage.getItem(runKey()) || 'null'); } catch (e) { return null; } };

async function start() {
  if (isMock) {
    const as = new URLSearchParams(location.search).get('as');
    return signedIn({ uid: as === 'parent' ? PARENT_UID : STUDENT_UID });
  }
  const f = await import('./firebase.js');
  f.onAuthStateChanged(f.auth, u => u ? signedIn(u) : (user = null, renderLogin(f)));
}
async function signedIn(u) {
  user = u;
  role = u.uid === PARENT_UID ? 'parent' : u.uid === STUDENT_UID ? 'student' : 'other';
  if (role === 'other') return show(card(h('h2', { text: 'This account isn\'t set up for the Email Coach.' }), signOutBtn()));
  S = loadRun();
  show(h('p', { class: 'muted loading', text: 'Loading…' }));
  try { const r = await ask('progress'); progress = r.progress || progress; parentData = r.sessions || null; } catch (e) { console.warn(e); }
  route();
}
function signOutBtn() {
  return h('button', { class: 'linkbtn', onclick: async () => { if (isMock) return; const f = await import('./firebase.js'); f.signOut(f.auth); } }, 'Sign out');
}
function renderLogin(f) {
  const email = h('input', { type: 'email', autocomplete: 'username', autocapitalize: 'off', placeholder: 'Email' });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Password' });
  const err = h('p', { class: 'err', hidden: true });
  const btn = h('button', { class: 'main', type: 'submit' }, 'Sign in');
  show(h('form', { class: 'card', onsubmit: async e => {
    e.preventDefault(); btn.disabled = true; err.hidden = true;
    try { await f.signInWithEmailAndPassword(f.auth, email.value.trim(), pw.value); }
    catch (x) { err.hidden = false; err.textContent = x.code === 'auth/network-request-failed' ? 'No connection. Try again with signal.' : 'That email or password didn\'t work.'; btn.disabled = false; }
  } }, h('div', { class: 'eyebrow', text: 'Email Coach' }), h('h1', { text: 'Hi!' }), h('p', { class: 'muted', text: 'Same email and password as Latin Practice.' }),
    h('label', { class: 'f' }, 'Email', email), h('label', { class: 'f' }, 'Password', pw), err, btn));
}

/* ---------- small pieces ---------- */
const card = (...k) => h('section', { class: 'card' }, ...k);
const top = (label, onBack) => h('div', { class: 'top' }, h('button', { class: 'back', onclick: onBack }, '‹ ' + label), h('span', { class: 'chip', text: S && S.mode === 'practice' ? 'Practice' : 'Real email' }));
const fb = (ok, title, ...body) => h('div', { class: 'fb ' + (ok ? 'ok' : 'bad'), role: 'status' }, h('h3', { text: title }), ...body.map(b => typeof b === 'string' ? h('p', { text: b }) : b));
const spinner = text => h('div', { class: 'think', role: 'status' }, h('i'), h('span', { text }));
const sender = () => displayName(S.mail.sender);
const level = () => S ? S.level : progress.level || 1;
const tree = (title, rows) => {
  const body = h('div', { class: 'tree' }, h('div', { class: 'eyebrow', text: title }), ...rows);
  if (level() === 1) return body;
  return h('details', { class: 'treewrap' }, h('summary', { text: level() === 2 ? 'Show the rule' : 'Need the rule?' }), body);
};
const branch = (q, a, cls = '') => h('div', { class: 'branch ' + cls }, h('span', { text: q }), h('b', { text: a }));

/* ---------- routing ---------- */
const isNew = () => !!(S && S.kind === 'new');
const STEP_ORDER = () => {
  const lv = level();
  if (isNew()) {
    const write = lv === 1 ? ['greeting', 'thanks', 'body', 'closing', 'signoff'] : ['whole'];
    return [...(S.mode === 'practice' ? ['cSituation'] : []), 'cWho', 'cExisting', 'cWhy', 'cPlan', 'cCc', 'subject', ...write, 'polish', 'final'];
  }
  const base = ['add', 'show', 'who', 'understand', 'needReply'];
  if (S && S.noReply) return [...base, 'noreply'];
  const write = lv === 1 ? ['greeting', 'thanks', 'body', 'closing', 'signoff'] : ['whole'];
  return [...base, 'replyType', 'ccMom', ...write, 'polish', 'final'];
};
function next() {
  const o = STEP_ORDER(); S.step = o[o.indexOf(S.step) + 1] || 'final';
  if (S.step === 'ccMom' && momOnEmail(S.mail, MOM_EMAIL)) { S.momAlreadyOn = true; return next(); }
  saveRun(); route();
}
function back() {
  const o = STEP_ORDER(); let i = o.indexOf(S.step) - 1;
  if (o[i] === 'ccMom' && S.momAlreadyOn) i--;
  if (i < (isNew() ? 0 : 1)) return quit();
  S.step = o[i]; saveRun(); route();
}
function quit() {
  if (S && S.step !== 'add' && S.step !== 'cWho' && S.step !== 'cSituation' && !confirm('Stop this email? Your work on it will be lost.')) return;
  S = null; saveRun(); route();
}
function route() {
  if (role === 'parent' && !preview) return renderParent();
  if (!S) return renderHome();
  ({ add: renderAdd, show: renderShow, who: renderWho, understand: () => renderWrite('understand'), needReply: renderNeedReply,
    noreply: renderNoReply, replyType: renderReplyType, ccMom: renderCcMom, greeting: renderGreeting,
    thanks: () => renderWrite('thanks'), body: () => renderWrite('body'), closing: () => renderWrite('closing'),
    cSituation: renderSituation, cWho: renderCWho, cExisting: renderCExisting, cExistingYes: renderCExistingYes, cWhy: renderCWhy, cPlan: renderCPlan, cCc: renderCCc,
    subject: () => renderWrite('subject'),
    signoff: renderSignoff, loadPractice, whole: renderWhole, polish: renderPolish, final: renderFinal, done: renderDone }[S.step] || renderHome)();
}
function newCompose(mode) {
  S = { id: Date.now().toString(36), kind: 'new', mode, level: progress.level || 1, step: mode === 'practice' ? 'cSituation' : 'cWho',
    mail: { compose: true, sender: null, recipients: [], asks: [] }, roles: {}, taps: {}, firstTry: {}, tries: {}, parts: {}, startedAt: Date.now() };
  if (mode === 'practice') {
    let n = 0; try { n = Number(localStorage.getItem('email-newpractice-n') || 0); localStorage.setItem('email-newpractice-n', n + 1); } catch (e) {}
    const sc = NEW_PRACTICE[n % NEW_PRACTICE.length];
    S.scenario = sc;
    S.mail.sender = { name: `${sc.to.title} ${sc.to.lastName}`, title: sc.to.title, lastName: sc.to.lastName, email: '', isGroup: false };
    S.mail.toRole = sc.to.role; S.mail.about = sc.to.about;
  }
  saveRun(); route();
}
function newSession(mode) {
  S = { id: Date.now().toString(36), mode, level: progress.level || 1, step: mode === 'practice' ? 'loadPractice' : 'add',
    mail: null, roles: {}, taps: {}, firstTry: {}, tries: {}, parts: {}, startedAt: Date.now() };
  saveRun();
  if (mode === 'practice') return loadPractice();
  route();
}

/* ---------- home ---------- */
function renderHome() {
  const lv = progress.level || 1, st = standing(progress);
  show(
    h('div', { class: 'spread' }, h('div', { class: 'eyebrow', text: 'Email Coach' }), preview ? h('button', { class: 'linkbtn', onclick: () => { preview = false; S = null; route(); } }, 'Back to parent view') : signOutBtn()),
    h('h1', { text: `Hi, ${STUDENT_NAME}.` }),
    h('button', { class: 'btn hero', onclick: () => newSession('real') }, h('b', { text: 'Answer an email' }), h('span', { text: 'Take a screenshot of it first' })),
    h('button', { class: 'btn', onclick: () => newCompose('real') }, h('b', { text: 'Write a new email' }), h('span', { text: 'Missed a class, need help, want to meet' })),
    card(h('div', { class: 'eyebrow', text: 'Practice' }), h('div', { class: 'actions two' },
      h('button', { class: 'ghost', onclick: () => newSession('practice') }, 'Answer one'),
      h('button', { class: 'ghost', onclick: () => newCompose('practice') }, 'Write one'))),
    card(h('div', { class: 'spread' }, h('div', { class: 'eyebrow', text: `Level ${lv} of 3` }), h('span', { class: 'chip', text: LEVELS[lv].name })),
      h('p', { text: LEVELS[lv].blurb }),
      lv < 3 ? levelMeter(st)
        : h('p', { class: 'small muted', text: 'Top level. You know how to do this.' })),
    card(h('h2', { text: 'Every good school email' }),
      h('ol', { class: 'recipe' },
        h('li', {}, h('b', { text: 'Greeting' }), ' Dear Mr. Lee,'),
        h('li', {}, h('b', { text: 'Thank you' }), ' for their email (or say why you\'re writing)'),
        h('li', {}, h('b', { text: 'Your answer' }), ' to everything they asked (or what you need)'),
        h('li', {}, h('b', { text: 'Closing line' }), ' a short wrap-up'),
        h('li', {}, h('b', { text: 'Sign-off' }), ' Thank you, then your name'))),
    h('p', { class: 'small muted center', text: `v${APP_VERSION}` }));
}

function levelMeter(st) {
  return h('div', { class: 'meter' },
    h('div', { class: 'bar' }, h('i', { style: `width:${Math.min(100, Math.round(100 * st.clean / NEED_CLEAN))}%` })),
    h('p', { class: 'small', text: `${st.clean} of ${NEED_CLEAN} clean emails` + (st.of > st.clean ? ` (out of your last ${Math.min(st.of, WINDOW)})` : '') }),
    h('ul', { class: 'kinds' }, KINDS.map(([k, label]) => h('li', { class: st.kinds[k] >= NEED_EACH ? 'got' : '' }, `${Math.min(st.kinds[k], NEED_EACH)}/${NEED_EACH} ${label}`))),
    h('p', { class: 'small muted', text: `Clean means every choice right the first time. You need ${NEED_CLEAN} clean out of your last ${WINDOW}, including some of each kind.` }));
}

/* ---------- 1. add the email ---------- */
let pending = [];        // screenshots picked but not read yet (kept out of localStorage)
function renderAdd() {
  const err = h('p', { class: 'err', hidden: !S.readProblem, text: S.readProblem || '' });
  const thumbs = h('div', { class: 'thumbs' });
  const paste = h('textarea', { rows: 6, placeholder: 'Or paste the email here, including who it\'s from and who\'s on it.', oninput: () => { S.pasted = paste.value; saveRun(); } });
  paste.value = S.pasted || '';
  const go = h('button', { class: 'main' }, 'Read it');
  const drawThumbs = () => {
    thumbs.replaceChildren(...pending.map((p, i) => h('div', { class: 'thumb' }, h('img', { src: p.url, alt: `Screenshot ${i + 1}` }),
      h('button', { class: 'x', 'aria-label': 'Remove', onclick: () => { URL.revokeObjectURL(p.url); pending.splice(i, 1); drawThumbs(); } }, '×'))));
  };
  const file = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr', id: 'shot', onchange: () => {
    for (const f of file.files) if (pending.length < 4) pending.push({ file: f, url: URL.createObjectURL(f) });
    file.value = ''; drawThumbs();
  } });
  drawThumbs();
  go.onclick = async () => {
    if (!pending.length && !paste.value.trim()) { err.hidden = false; err.textContent = 'Add a screenshot (or paste the email) first.'; return; }
    go.disabled = true; err.hidden = true; go.replaceWith(spinner('Reading the email…'));
    try {
      const images = await Promise.all(pending.map(p => shrink(p.file)));
      const mail = await ask('read', { images, text: paste.value });
      if (!mail.readable || !mail.recipientsComplete) { S.readProblem = mail.problem || 'I couldn\'t read that. Try a clearer screenshot.'; saveRun(); return route(); }
      pending.forEach(p => URL.revokeObjectURL(p.url)); pending = [];
      S.mail = mail; S.readProblem = null; S.pasted = ''; S.step = 'show'; saveRun(); route();
    } catch (e) { S.readProblem = e.message; saveRun(); route(); }
  };
  show(top('Home', quit),
    h('h1', { text: 'Add the email' }),
    card(h('div', { class: 'eyebrow', text: 'Take the screenshot' }),
      h('ol', { class: 'howto' },
        h('li', { text: 'Open the email.' }),
        h('li', {}, 'Tap the little arrow ', h('b', { text: '⌄' }), ' next to the names at the top, so ', h('b', { text: 'everyone' }), ' on the email shows.'),
        h('li', { text: 'Take a screenshot. If the email is long, scroll and take a second one.' }),
        h('li', { text: 'Email on your iPad? Take a photo of the iPad screen with your phone.' }))),
    card(file, h('label', { for: 'shot', class: 'ghost center' }, '＋ Add screenshot'), thumbs,
      h('details', { open: !!S.pasted }, h('summary', { text: 'Paste text instead' }), paste), err, go));
}

async function loadPractice() {
  show(top('Home', () => { S = null; saveRun(); route(); }), h('h1', { text: 'Practice email' }), card(spinner('Writing you a practice email…')));
  try {
    const n = Number(localStorage.getItem('email-practice-n') || 0); localStorage.setItem('email-practice-n', n + 1);
    S.mail = await ask('practice', { scenario: n }); S.step = 'show'; saveRun(); route();
  } catch (e) { show(top('Home', () => { S = null; saveRun(); route(); }), card(h('p', { class: 'err', text: e.message }), h('button', { class: 'main', onclick: loadPractice }, 'Try again'))); }
}

/* ---------- 2. check what was read ---------- */
function emailCard(m) {
  const names = f => (m.recipients || []).filter(r => r.field === f).map(r => r.isMe ? 'you' : (r.name || r.email)).join(', ');
  return h('article', { class: 'mail' },
    h('div', { class: 'mh' }, h('span', { text: 'From' }), h('b', { text: (m.sender.name || m.sender.email) + (m.sender.email && m.sender.name ? ` <${m.sender.email}>` : '') })),
    h('div', { class: 'mh' }, h('span', { text: 'To' }), h('b', { text: names('to') || '—' })),
    names('cc') ? h('div', { class: 'mh cc' }, h('span', { text: 'Cc' }), h('b', { text: names('cc') })) : null,
    m.subject ? h('div', { class: 'mh' }, h('span', { text: 'Subject' }), h('b', { text: m.subject })) : null,
    h('div', { class: 'mb', text: m.body }));
}
function renderShow() {
  show(top(S.mode === 'practice' ? 'Home' : 'Back', S.mode === 'practice' ? quit : () => { S.step = 'add'; saveRun(); route(); }),
    h('h1', { text: S.mode === 'practice' ? 'Your practice email' : 'Is this the email?' }),
    emailCard(S.mail),
    S.mode === 'practice' ? h('p', { class: 'muted small', text: 'Read it all the way through, including who is on the To and Cc lines.' }) : null,
    h('div', { class: 'actions' },
      S.mode === 'practice' ? null : h('button', { class: 'ghost', onclick: () => { S.step = 'add'; saveRun(); route(); } }, 'Something\'s wrong'),
      h('button', { class: 'main', onclick: next }, S.mode === 'practice' ? 'Start' : 'Yes, that\'s it')));
}

/* ---------- 3. who's on it ---------- */
function renderWho() {
  const m = S.mail;
  const people = [{ ...m.sender, field: 'from' }, ...others(m).filter(r => !r.isGroup)];
  const groups = others(m).filter(r => r.isGroup);
  const key = p => p.email || p.name;
  const go = h('button', { class: 'main' }, 'Next');
  const check = () => { go.disabled = !people.every(p => S.roles[key(p)]); };
  const rows = people.map(p => {
    const box = h('div', { class: 'choices tight' }, ROLES.map(([id, label]) => {
      const b = h('button', { class: 'opt chipopt' + (S.roles[key(p)] === id ? ' sel' : ''), onclick: () => {
        S.roles[key(p)] = id; box.querySelectorAll('button').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); saveRun(); check();
      } }, label);
      return b;
    }));
    return h('div', { class: 'person' }, h('div', { class: 'pname' }, h('b', { text: p.name || p.email }),
      h('span', { class: 'small muted', text: p.field === 'from' ? ' wrote the email' : p.field === 'cc' ? ' is on Cc' : ' is on To' })), box);
  });
  go.onclick = next; check();
  show(top('Back', back), h('h1', { text: 'Who\'s on this email?' }),
    h('p', { class: 'muted', text: people.length > 1 ? 'Everyone here was put on the email on purpose. Tap who each person is.' : 'Just one person wrote to you. Tap who they are.' }),
    card(...rows, ...groups.map(g => h('p', { class: 'small muted', text: `${g.name || g.email} is a group list, not one person.` }))), go);
}

/* ---------- writing steps: understand / thanks / body / closing ---------- */
const WRITE_NEW = {
  subject: () => ({ title: 'Write a subject line.', sub: 'A few words that say what it\'s about, like a label. Name the class, test, or day.', rows: 1, ph: '', label: 'Subject line' }),
  thanks: () => ({ title: 'Say why you\'re writing.', sub: 'One or two sentences. You can start with "I\'m writing to ask…" or say what happened.', rows: 2, ph: '', label: 'Why you\'re writing' }),
  body: () => ({ title: 'Now ask for what you need.', sub: 'Give the details they need, like a day, the test, or when you\'re free. Then ask politely.', rows: 6, ph: '', label: 'What you need' }),
  closing: () => ({ title: 'Wrap it up.', sub: 'One sentence. Thank them for their help or time.', rows: 2, ph: '', label: 'Closing line' }),
};
const WRITE = {
  understand: () => ({ title: `What is ${sender()} asking you?`, sub: 'Say it in your own words. If there\'s more than one thing, list them all.', rows: 3, ph: 'They want me to…', label: 'Understand it' }),
  thanks: () => ({ title: `Start by thanking ${sender()}.`, sub: 'One sentence. Thank them for the email, for letting you know, or for the specific thing.', rows: 2, ph: 'Thank you for…', label: 'Thank-you opener' }),
  body: () => ({ title: 'Now answer.', sub: 'Answer everything they asked. Give the details they need, like a day, a time, or what you\'ll do.', rows: 6, ph: '', label: 'Your answer' }),
  closing: () => ({ title: 'Wrap it up.', sub: 'One sentence. Thank them again, say you\'ll do it, or say you\'ll see them.', rows: 2, ph: '', label: 'Closing line' }),
};
function sandwich(current) {
  if (level() !== 1) return null;
  const slots = isNew() ? [['greeting', 'Greeting'], ['thanks', 'Why'], ['body', 'What you need'], ['closing', 'Closing line'], ['signoff', 'Sign-off']]
    : [['greeting', 'Greeting'], ['thanks', 'Thank you'], ['body', 'Your answer'], ['closing', 'Closing line'], ['signoff', 'Sign-off']];
  return h('div', { class: 'sandwich', 'aria-label': 'Your email so far' }, slots.map(([k, label]) => {
    const v = S.parts[k];
    return h('div', { class: 'slot' + (k === current ? ' now' : v ? ' done' : '') }, h('span', { class: 'eyebrow', text: label }),
      h('div', { class: 'stext', text: v || (k === current ? 'Writing this now' : '…') }));
  }));
}
function renderWrite(step) {
  const w = (isNew() ? WRITE_NEW : WRITE)[step](); const isU = step === 'understand';
  const rule = isNew() ? 'new_' + step : step;
  S.tries[step] = S.tries[step] || 0;
  const ta = h('textarea', { rows: w.rows, placeholder: w.ph, autocapitalize: 'sentences', 'aria-label': w.label });
  ta.value = (isU ? S.understood : S.parts[step]) || '';
  const out = h('div', { class: 'out' });
  const btn = h('button', { class: 'main' }, 'Check it');
  const extra = h('div', { class: 'actions' });
  const asks = (S.mail.asks || []);
  const helpers = () => {
    extra.replaceChildren();
    if (S.tries[step] >= 2) extra.append(h('button', { class: 'ghost', onclick: () => showExample(rule, out) }, 'See an example'));
    if (S.tries[step] >= 3) extra.append(h('button', { class: 'linkbtn', onclick: () => {
      if (isU) { out.replaceChildren(fb(false, `Here's what ${sender()} asked:`, h('ul', {}, asks.map(a => h('li', { text: a }))))); btn.textContent = 'Next'; btn.onclick = next; S.understood = ta.value; saveRun(); return; }
      S.parts[step] = ta.value.trim(); saveRun(); next();
    } }, isU ? 'Show me what they asked' : 'Keep mine and move on'));
  };
  btn.onclick = async () => {
    const answer = ta.value.trim();
    if (answer.length < 3) { out.replaceChildren(fb(false, 'Write something first.')); return; }
    btn.disabled = true; out.replaceChildren(spinner('Checking…'));
    try {
      const r = await ask('check', { step: rule, mail: S.mail, roles: S.roles, answer, sofar: isU ? null : { greeting: S.parts.greeting, thanks: S.parts.thanks, body: S.parts.body } });
      S.tries[step]++;
      if (isU) S.understood = answer; else S.parts[step] = answer;
      saveRun();
      if (r.ok) { out.replaceChildren(fb(true, 'Good.', r.feedback)); btn.textContent = 'Next'; btn.disabled = false; btn.onclick = next; ta.readOnly = true; extra.replaceChildren(); }
      else { out.replaceChildren(fb(false, 'Not yet.', r.feedback, h('p', { class: 'small', text: 'Change it and check again.' }))); btn.disabled = false; helpers(); }
    } catch (e) { out.replaceChildren(fb(false, 'The coach didn\'t answer.', e.message)); btn.disabled = false; }
  };
  show(top('Back', back), sandwich(step),
    h('h1', { text: w.title }), h('p', { class: 'muted', text: w.sub }),
    isNew() && S.mode === 'practice' && step !== 'subject' ? situationPeek() : null,
    step === 'body' && asks.length ? card(h('div', { class: 'eyebrow', text: isNew() ? 'Make sure you say' : 'Make sure you answer' }), h('ul', { class: 'checks' }, asks.map(a => h('li', { text: a })))) : null,
    isU ? h('details', { class: 'peek' }, h('summary', { text: 'Look at the email again' }), emailCard(S.mail)) : null,
    card(ta, h('p', { class: 'small muted tip', text: 'Tip: you can tap the microphone on the keyboard and say it.' }), out, btn, extra));
  helpers();
}
async function showExample(step, out) {
  out.replaceChildren(spinner('Finding an example…'));
  try {
    const ex = await ask('example', { step, mail: { topic: S.mail.topic } });
    out.replaceChildren(h('div', { class: 'example' }, h('div', { class: 'eyebrow', text: 'Example from a different email' }), h('p', { class: 'small muted', text: ex.situation }), h('p', { class: 'extext', text: ex.text }),
      h('p', { class: 'small', text: 'Use the pattern, but write about your email.' })));
  } catch (e) { out.replaceChildren(fb(false, 'No example right now.', e.message)); }
}

/* ---------- tap decisions ---------- */
function tapStep({ key, title, sub, treeNode, extra, options, grade, after }) {
  const t = S.taps[key] = S.taps[key] || { picks: [], done: false };
  const out = h('div', { class: 'out' });
  const nextBtn = h('button', { class: 'main', hidden: !t.done, onclick: () => after ? after() : next() }, 'Next');
  const box = h('div', { class: 'choices long' });
  const draw = () => {
    box.replaceChildren(...options.map(o => {
      const picked = t.picks.includes(o.id), last = t.picks.at(-1) === o.id;
      const res = picked ? grade(o.id) : null;
      return h('button', { class: 'opt' + (last ? ' sel' : '') + (picked ? (res.ok ? ' right' : ' wrong') : ''), disabled: t.done || (picked && !res.ok),
        onclick: () => {
          t.picks.push(o.id); const r = grade(o.id);
          if (!(key in S.firstTry)) S.firstTry[key] = r.ok;
          if (r.ok) t.done = true;
          saveRun(); draw();
          out.replaceChildren(fb(r.ok, r.title, r.why || '', r.ok ? null : h('p', { class: 'small', text: 'Pick again.' })));
          nextBtn.hidden = !t.done;
        } }, h('b', { text: o.label }), o.sub ? h('span', { text: o.sub }) : null);
    }));
  };
  draw();
  if (t.picks.length) { const r = grade(t.picks.at(-1)); out.append(fb(r.ok, r.title, r.why || '')); }
  show(top('Back', back), h('h1', { text: title }), sub ? h('p', { class: 'muted', text: sub }) : null, extra || null, treeNode || null, card(box, out), nextBtn);
}

function renderNeedReply() {
  const m = S.mail;
  tapStep({ key: 'needReply', title: 'Does this need an answer?',
    treeNode: tree('How to decide', [
      branch('Does it ask you a question?', 'Yes'),
      branch('Does it ask you to do, bring, or confirm something?', 'Yes'),
      branch('Did a person write just to you, even to say thanks?', 'Yes, a short one'),
      branch('Is it an automatic notice or a newsletter?', 'No')]),
    options: [{ id: 'yes', label: 'Yes, it needs an answer' }, { id: 'no', label: 'No answer needed' }],
    grade: id => {
      const want = m.replyNeeded ? 'yes' : 'no';
      if (id === want) return { ok: true, title: id === 'yes' ? 'Yes, answer it.' : 'Right, no answer needed.', why: m.replyWhy };
      return id === 'no' ? { ok: false, title: 'This one needs an answer.', why: m.replyWhy } : { ok: false, title: 'No answer needed here.', why: m.replyWhy };
    },
    after: () => { S.noReply = !m.replyNeeded; next(); } });
}
function renderNoReply() {
  show(top('Back', back), h('h1', { text: 'Nothing to send.' }), card(h('p', { text: S.mail.replyWhy || 'This email doesn\'t need an answer.' }),
    h('p', { class: 'muted', text: 'Knowing when not to answer is part of email too.' })), h('button', { class: 'main', onclick: () => finish() }, 'Done'));
}

function renderReplyType() {
  const m = S.mail;
  const names = h('div', { class: 'onit' }, h('div', { class: 'eyebrow', text: 'On this email' }),
    h('div', {}, h('b', { text: 'From: ' }), sender()),
    ...['to', 'cc'].map(f => { const r = (m.recipients || []).filter(x => x.field === f); return r.length ? h('div', {}, h('b', { text: f === 'to' ? 'To: ' : 'Cc: ' }), r.map(x => x.isMe ? 'you' : (x.name || x.email) + (S.roles[x.email || x.name] ? ` (${roleLabel(S.roles[x.email || x.name]).toLowerCase()})` : '')).join(', ')) : null; }));
  tapStep({ key: 'replyType', title: 'Which button will you tap?', sub: `You'll open ${sender()}'s email and tap one of these.`, extra: card(names),
    treeNode: tree('How to decide', [
      branch('Answering the person who wrote?', 'Not New message. Answer from inside their email.'),
      branch('Anyone else on To or Cc besides you?', 'Reply all. They were added on purpose.', 'key'),
      branch('Just you?', 'Reply'),
      branch('Sent to a whole group list?', 'Reply, so only the sender gets it'),
      branch('Someone NOT on it needs to see it?', 'Forward')]),
    options: [
      { id: 'reply', label: 'Reply', sub: `Goes only to ${sender()}` },
      { id: 'reply_all', label: 'Reply all', sub: 'Goes to everyone on the email' },
      { id: 'forward', label: 'Forward', sub: 'Sends it to someone new' },
      { id: 'new', label: 'New message', sub: 'Start a fresh email' }],
    grade: id => replyFeedback(m, id, S.roles) });
}

function renderCcMom() {
  tapStep({ key: 'ccMom', title: 'Should you copy Mom?',
    treeNode: tree('Copy Mom when it\'s about', [
      branch('Meeting with a teacher or advisor', 'CC Mom'), branch('Moving a test, quiz, or deadline', 'CC Mom'),
      branch('Missing or late work, or grades', 'CC Mom'), branch('An injury, being sick, or missing school', 'CC Mom'),
      branch('Any problem', 'CC Mom'), branch('A quick thank-you, "got it," or a simple reminder', 'Skip it', 'key')]),
    options: [{ id: 'yes', label: 'Yes, CC Mom' }, { id: 'no', label: 'No, not this one' }],
    grade: id => ccMomFeedback(S.mail, id === 'yes') });
}

/* ---------- greeting and sign-off (level 1) ---------- */
function renderGreeting() {
  const snd = S.mail.sender;
  if (!snd.title && !snd.isGroup) {
    if (!snd.lastName && snd.name) snd.lastName = snd.name.trim().split(/\s+/).at(-1);
    return show(top('Back', back), sandwich('greeting'), h('h1', { text: `What does ${snd.name || 'the sender'} go by?` }),
      h('p', { class: 'muted', text: 'Teachers go by Mr. or Mrs. and their last name.' }),
      card(h('div', { class: 'choices' }, TITLES.map(t => h('button', { class: 'opt', onclick: () => { snd.title = t; saveRun(); route(); } }, `${t} ${snd.lastName || ''}`.trim())))));
  }
  if (!S.greetOpts) { S.greetOpts = greetingOptions(snd); saveRun(); }
  const opts = S.greetOpts;
  tapStep({ key: 'greeting', title: 'Pick the greeting.', extra: sandwich('greeting'),
    options: opts.map((o, i) => ({ id: String(i), label: o.text })),
    grade: id => { const o = opts[+id]; return { ok: o.ok, title: o.ok ? 'Right.' : 'Not that one.', why: o.why }; },
    after: () => { S.parts.greeting = opts.find(o => o.ok).text; saveRun(); next(); } });
}
function renderSignoff() {
  if (!S.signOpts) { S.signOpts = signoffOptions(STUDENT_NAME); saveRun(); }
  const opts = S.signOpts;
  tapStep({ key: 'signoff', title: 'Pick a sign-off.', sub: 'The closing word goes on its own line, with your name under it.', extra: sandwich('signoff'),
    options: opts.map((o, i) => ({ id: String(i), label: o.text.replace('\n', ' / ') })),
    grade: id => { const o = opts[+id]; return { ok: o.ok, title: o.ok ? 'Good.' : 'Not that one.', why: o.ok ? '' : o.why }; },
    after: () => { S.parts.signoff = opts[+S.taps.signoff.picks.at(-1)].text; saveRun(); next(); } });
}

/* ---------- whole draft (levels 2 and 3) ---------- */
const PART_LABEL = { greeting: 'Greeting', thanks: 'Thank you', answer: 'Answer', purpose: 'Why you\'re writing', request: 'What you need', closing: 'Closing line', signoff: 'Sign-off', tone: 'Tone' };
function renderWhole() {
  S.tries.whole = S.tries.whole || 0;
  const ta = h('textarea', { rows: 12, autocapitalize: 'sentences', 'aria-label': 'Your email' });
  ta.value = S.parts.whole || '';
  const out = h('div', { class: 'out' }), btn = h('button', { class: 'main' }, 'Check it'), extra = h('div', { class: 'actions' });
  const helpers = () => { extra.replaceChildren();
    if (S.tries.whole >= 2) extra.append(h('button', { class: 'ghost', onclick: () => showExample(isNew() ? 'new_whole' : 'whole', out) }, 'See an example'));
    if (S.tries.whole >= 3) extra.append(h('button', { class: 'linkbtn', onclick: () => { S.parts.whole = ta.value; saveRun(); next(); } }, 'Keep mine and move on')); };
  btn.onclick = async () => {
    if (ta.value.trim().length < 10) { out.replaceChildren(fb(false, 'Write your email first.')); return; }
    btn.disabled = true; out.replaceChildren(spinner('Checking each part…'));
    try {
      const r = await ask('whole', { mail: S.mail, roles: S.roles, answer: ta.value });
      S.tries.whole++; S.parts.whole = ta.value; saveRun();
      const items = r.items || [], ok = items.length && items.every(i => i.ok);
      out.replaceChildren(h('ul', { class: 'checklist' }, items.map(i => h('li', { class: i.ok ? 'ok' : 'bad' }, h('b', { text: (i.ok ? '✓ ' : '✗ ') + (PART_LABEL[i.part] || i.part) }), h('span', { text: ' ' + i.note })))));
      if (ok) { btn.textContent = 'Next'; btn.onclick = next; ta.readOnly = true; extra.replaceChildren(); } else helpers();
      btn.disabled = false;
    } catch (e) { out.replaceChildren(fb(false, 'The coach didn\'t answer.', e.message)); btn.disabled = false; }
  };
  const asks = S.mail.asks || [];
  show(top('Back', back), h('h1', { text: `Write your email to ${sender()}.` }),
    level() === 2 ? card(h('div', { class: 'eyebrow', text: 'Remember' }), h('ol', { class: 'recipe' },
      h('li', { text: `Greeting (Dear ${sender()},)` }), h('li', { text: isNew() ? 'Why you\'re writing' : 'Thank you' }), h('li', { text: isNew() ? 'What you need, with details' : 'Your answer' }), h('li', { text: 'Closing line' }), h('li', { text: `Sign-off and your name` }))) : null,
    isNew() && S.mode === 'practice' ? situationPeek() : null,
    level() === 2 && asks.length ? card(h('div', { class: 'eyebrow', text: isNew() ? 'Make sure you say' : 'Make sure you answer' }), h('ul', { class: 'checks' }, asks.map(a => h('li', { text: a })))) : null,
    card(ta, h('p', { class: 'small muted tip', text: 'Tip: you can tap the microphone on the keyboard and say it.' }), out, btn, extra));
  helpers();
}


/* ---------- new emails he starts himself ---------- */
function situationCard() {
  return card(h('div', { class: 'eyebrow', text: 'The situation' }), h('p', { class: 'situation', text: S.scenario.text }));
}
function situationPeek() { return h('details', { class: 'peek' }, h('summary', { text: 'The situation' }), h('p', { class: 'situation', text: S.scenario.text })); }
function renderSituation() {
  show(top('Home', quit), h('h1', { text: 'Practice: write a new email' }), situationCard(),
    h('p', { class: 'muted', text: 'Read it carefully. You\'ll plan the email, then write it.' }), h('button', { class: 'main', onclick: next }, 'Start'));
}
function renderCWho() {
  const m = S.mail, practice = S.mode === 'practice';
  if (practice) {
    return show(top('Back', back), h('h1', { text: 'Who are you writing to?' }), situationPeek(),
      card(h('p', {}, 'You\'re writing to ', h('b', { text: displayName(m.sender) }), m.about ? ` (${m.about})` : '', '.')),
      h('button', { class: 'main', onclick: () => { S.roles[m.sender.name] = m.toRole; next(); } }, 'Next'));
  }
  const st = S.who = S.who || { role: '', title: '', last: '', about: '' };
  const go = h('button', { class: 'main' }, 'Next');
  const check = () => { go.disabled = !(st.role && st.title && st.last.trim()); };
  const chips = (list, key) => { const box = h('div', { class: 'choices tight' }, list.map(([id, label]) => { const b = h('button', { class: 'opt chipopt' + (st[key] === id ? ' sel' : ''), onclick: () => {
    st[key] = id; box.querySelectorAll('button').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); saveRun(); check(); } }, label); return b; })); return box; };
  const last = h('input', { type: 'text', autocapitalize: 'words', autocomplete: 'off', placeholder: 'Last name', oninput: () => { st.last = last.value; saveRun(); check(); } });
  last.value = st.last;
  const about = h('input', { type: 'text', autocapitalize: 'words', autocomplete: 'off', placeholder: 'Science, math, baseball…', oninput: () => { st.about = about.value; saveRun(); } });
  about.value = st.about;
  go.onclick = () => {
    const ln = st.last.trim().replace(/^./, c => c.toUpperCase());
    m.sender = { name: `${st.title} ${ln}`, title: st.title, lastName: ln, email: '', isGroup: false };
    m.toRole = st.role; m.about = st.about.trim(); S.roles[m.sender.name] = st.role; S.greetOpts = null; next();
  };
  check();
  show(top('Home', quit), h('h1', { text: 'Who are you writing to?' }),
    card(h('div', { class: 'f' }, 'They are your…', chips(ROLES.filter(r => r[0] !== 'parent'), 'role')),
      h('div', { class: 'f' }, 'They go by', chips(TITLES.map(t => [t, t]), 'title')),
      h('label', { class: 'f' }, 'Last name', last),
      h('label', { class: 'f' }, 'Class or team (if it\'s about one)', about)), go);
}
function renderCExisting() {
  const practice = S.mode === 'practice', name = displayName(S.mail.sender);
  const want = practice ? (S.scenario.existing ? 'yes' : 'no') : null;
  tapStep({ key: 'existing', title: 'Is there already an email about this?', sub: practice ? null : `Check your inbox for an email from ${name} about the same thing.`,
    extra: practice ? situationPeek() : null,
    treeNode: tree('How to decide', [
      branch(`${name} already emailed you about it?`, 'Answer that email. Don\'t start a new one.', 'key'),
      branch('It\'s something new?', 'Start a new email')]),
    options: [{ id: 'no', label: 'No, this is something new' }, { id: 'yes', label: 'Yes, there\'s already an email about it' }],
    grade: id => {
      if (!practice) return { ok: true, title: id === 'no' ? 'Then start a new one.' : 'Then answer that email.', why: id === 'no' ? '' : 'Answering keeps it all in one conversation, so nothing gets lost.' };
      return id === want ? { ok: true, title: id === 'no' ? 'Right, this is new.' : 'Right. Answer that email.', why: id === 'yes' ? `${name} already wrote about it, so reply to that email. A new one would split the conversation.` : '' }
        : { ok: false, title: want === 'yes' ? `Look again: ${name} already emailed you about this.` : 'Look again: nobody has emailed you about this yet.', why: '' };
    },
    after: () => { const t = S.taps.existing; if (t.picks.at(-1) === 'yes') { S.step = 'cExistingYes'; saveRun(); return route(); } next(); } });
}
function renderCExistingYes() {
  const practice = S.mode === 'practice';
  show(top('Back', () => { S.step = 'cExisting'; saveRun(); route(); }), h('h1', { text: 'Answer that email instead.' }),
    card(h('p', { text: 'Find their email, then tap Reply (or Reply all if anyone else is on it). That keeps everything in one conversation.' })),
    practice ? h('button', { class: 'main', onclick: () => finish(true) }, 'Done') : h('button', { class: 'main', onclick: () => { S = null; saveRun(); newSession('real'); } }, 'Answer that email'));
}
function renderCWhy() {
  const practice = S.mode === 'practice';
  tapStep({ key: 'purpose', title: 'Why are you writing?', extra: practice ? situationPeek() : null,
    options: PURPOSES.map(([id, label, sub]) => ({ id, label, sub })),
    grade: id => {
      if (!practice || id === S.scenario.purpose) return { ok: true, title: purposeLabel(id) + '.', why: '' };
      return { ok: false, title: 'Read the situation again.', why: '' };
    },
    after: () => { S.mail.purpose = S.taps.purpose.picks.at(-1); saveRun(); next(); } });
}
function renderCPlan() {
  const m = S.mail; S.tries.plan = S.tries.plan || 0;
  const ta = h('textarea', { rows: 4, autocapitalize: 'sentences', 'aria-label': 'Your plan' }); ta.value = m.plan || '';
  const out = h('div', { class: 'out' }), btn = h('button', { class: 'main' }, 'Check it'), extra = h('div', { class: 'actions' });
  const helpers = () => { extra.replaceChildren();
    if (S.tries.plan >= 2) extra.append(h('button', { class: 'ghost', onclick: () => showExample('plan', out) }, 'See an example'));
    if (S.tries.plan >= 3 && S.planResult) extra.append(h('button', { class: 'linkbtn', onclick: () => { applyPlan(S.planResult); next(); } }, 'Keep mine and move on')); };
  const applyPlan = r => { m.topic = r.topic; m.asks = r.mustInclude || []; m.ccMom = r.ccMom; m.ccMomWhy = r.ccMomWhy; m.ccAdvisor = r.ccAdvisor; m.ccAdvisorWhy = r.ccAdvisorWhy; m.ccTrainer = r.ccTrainer; m.ccTrainerWhy = r.ccTrainerWhy; saveRun(); };
  btn.onclick = async () => {
    const answer = ta.value.trim();
    if (answer.length < 3) { out.replaceChildren(fb(false, 'Write something first.')); return; }
    btn.disabled = true; out.replaceChildren(spinner('Checking…'));
    try {
      const r = await ask('plan', { mail: m, answer });
      S.tries.plan++; m.plan = answer; S.planResult = r; saveRun();
      if (r.ok) { applyPlan(r); out.replaceChildren(fb(true, 'Good plan.', r.feedback)); btn.textContent = 'Next'; btn.disabled = false; btn.onclick = next; ta.readOnly = true; extra.replaceChildren(); }
      else { out.replaceChildren(fb(false, 'Not yet.', r.feedback)); btn.disabled = false; helpers(); }
    } catch (e) { out.replaceChildren(fb(false, 'The coach didn\'t answer.', e.message)); btn.disabled = false; }
  };
  show(top('Back', back), h('h1', { text: `What happened, and what do you need from ${displayName(m.sender)}?` }),
    h('p', { class: 'muted', text: PLAN_HINTS[m.purpose] || PLAN_HINTS.other }),
    S.mode === 'practice' ? situationPeek() : null,
    card(ta, h('p', { class: 'small muted tip', text: 'Just a few words. This is your plan, not the email. You can tap the microphone and say it.' }), out, btn, extra));
  helpers();
}
function renderCCc() {
  const m = S.mail, opts = ccChoices(m.toRole);
  const t = S.taps.cc = S.taps.cc || { picks: [], done: false };
  let sel = new Set(S.ccSel || []);
  const out = h('div', { class: 'out' });
  const nextBtn = h('button', { class: 'main', hidden: !t.done, onclick: next }, 'Next');
  const checkBtn = h('button', { class: 'ghost', hidden: t.done }, 'Check');
  const box = h('div', { class: 'choices long' });
  const draw = () => box.replaceChildren(...[...opts, ['none', 'Nobody else']].map(([id, label]) => h('button', {
    class: 'opt' + ((id === 'none' ? sel.size === 0 && S.ccTouched : sel.has(id)) ? ' sel' : ''), disabled: t.done, 'aria-pressed': String(id === 'none' ? sel.size === 0 && !!S.ccTouched : sel.has(id)),
    onclick: () => { S.ccTouched = true; if (id === 'none') sel.clear(); else sel.has(id) ? sel.delete(id) : sel.add(id); S.ccSel = [...sel]; saveRun(); draw(); } },
    h('b', { text: (id === 'none' ? '' : (sel.has(id) ? '☑ ' : '☐ ')) + label }))));
  checkBtn.onclick = () => {
    if (!S.ccTouched) { out.replaceChildren(fb(false, 'Pick who goes on Cc, or "Nobody else."')); return; }
    const picked = [...sel]; t.picks.push(picked.join('+') || 'none');
    const r = ccFeedback(m, picked, m.toRole);
    if (!('cc' in S.firstTry)) S.firstTry.cc = r.ok;
    if (r.ok) { t.done = true; S.ccPicked = picked; checkBtn.hidden = true; nextBtn.hidden = false; draw(); }
    saveRun();
    out.replaceChildren(fb(r.ok, r.title, r.why, r.ok ? null : h('p', { class: 'small', text: 'Change your picks and check again.' })));
  };
  draw();
  if (t.done) out.append(fb(true, ccFeedback(m, S.ccPicked || [], m.toRole).title));
  show(top('Back', back), h('h1', { text: 'Who else goes on Cc?' }), h('p', { class: 'muted', text: `${displayName(m.sender)} goes on To. Tap everyone else who should get a copy.` }),
    tree('Copy them when', [
      branch('Mom: meeting, missed class, test or deadline change, missing work, grades, injury, any problem', 'Cc Mom'),
      branch('Advisor: missed test, more time or missing work, grades, a problem, missing more than a day', 'Cc advisor'),
      branch('Trainer: writing to a coach about an injury', 'Cc trainer'),
      branch('Extra help, a simple question, a thank-you', 'Nobody else', 'key')]),
    card(box, checkBtn, out), nextBtn);
}
function renderFinalNew() {
  const m = S.mail, text = finalText(), practice = S.mode === 'practice', cc = S.ccPicked || [];
  const ccNames = cc.map(id => id === 'mom' ? h('span', {}, 'Mom (', h('b', { text: MOM_EMAIL }), ')') : id === 'advisor' ? 'your advisor' : 'the trainer');
  const joinNodes = arr => arr.flatMap((x, i) => i ? [i === arr.length - 1 ? ' and ' : ', ', x] : [x]);
  show(top('Back', back), h('h1', { text: practice ? 'Your finished email' : 'Your email is ready' }),
    card(h('div', { class: 'eyebrow', text: 'Subject' }), h('pre', { class: 'final', text: S.parts.subject || '' }), practice ? null : copyBtn('Copy subject', S.parts.subject || ''),
      h('div', { class: 'eyebrow', text: 'Email' }), h('pre', { class: 'final', text }), practice ? null : copyBtn('Copy email', text)),
    card(h('div', { class: 'eyebrow', text: practice ? 'If this were real, you would…' : 'Send it' }),
      h('ol', { class: 'howto' },
        h('li', {}, 'Tap ', h('b', { text: 'New message' }), ' (the pencil button). This time a new message is right, because nobody has emailed you about it yet.'),
        h('li', { text: `To: start typing ${displayName(m.sender)}'s name and pick their school email.` }),
        cc.length ? h('li', {}, 'Cc: add ', ...joinNodes(ccNames), '.') : null,
        h('li', { text: 'Subject: paste your subject line.' }),
        h('li', { text: practice ? 'Paste your email.' : 'Paste your email (press and hold, then Paste).' }),
        h('li', { text: 'Read it once from top to bottom. Then tap Send.' })),
      cc.includes('mom') && !practice ? h('button', { class: 'ghost', onclick: async e => { try { await navigator.clipboard.writeText(MOM_EMAIL); e.target.textContent = 'Copied ✓'; } catch (x) {} } }, 'Copy Mom\'s address') : null),
    h('button', { class: 'main', onclick: () => finish() }, practice ? 'Done' : 'I sent it'));
}

/* ---------- polish: spelling, capitals, punctuation as taps ---------- */
function typedParts() {
  const p = level() === 1 ? { thanks: S.parts.thanks, body: S.parts.body, closing: S.parts.closing } : { whole: S.parts.whole };
  if (isNew()) p.subject = S.parts.subject;
  return p;
}
// Subject lines only get spelling fixes (no periods or sentence capitals).
const prep = issues => usableIssues((issues || []).filter(x => x.part !== 'subject' || x.kind === 'spelling'), typedParts()).map(x => ({ ...x, options: shuffle(x.options) }));
async function renderPolish() {
  if (!S.polish) {
    show(top('Back', back), h('h1', { text: 'Last check' }), card(spinner('Looking for spelling, capitals, and periods…')));
    try {
      const r = await ask('polish', { parts: typedParts() });
      S.polish = { issues: prep(r.issues), i: 0, rounds: 1, fixed: 0 }; saveRun();
    } catch (e) { return show(top('Back', back), h('h1', { text: 'Last check' }), card(fb(false, 'The coach didn\'t answer.', e.message), h('button', { class: 'main', onclick: renderPolish }, 'Try again'), h('button', { class: 'linkbtn', onclick: () => { S.polish = { issues: [], i: 0, rounds: 9, fixed: 0 }; next(); } }, 'Skip the check'))); }
  }
  const P = S.polish;
  if (P.i >= P.issues.length) {
    if (P.fixed && P.rounds < 2) {   // one more look after fixes
      show(top('Back', back), h('h1', { text: 'Last check' }), card(spinner('One more look…')));
      try { const r = await ask('polish', { parts: typedParts() }); S.polish = { issues: prep(r.issues), i: 0, rounds: P.rounds + 1, fixed: 0 }; saveRun(); return renderPolish(); }
      catch (e) { /* fine: go on */ }
    }
    return show(top('Back', back), h('h1', { text: 'Last check' }), card(fb(true, P.issues.length || S.polishTotal ? 'All fixed.' : 'Nothing to fix.', 'Spelling, capitals, and periods look good.')), h('button', { class: 'main', onclick: next }, 'See your email'));
  }
  const x = P.issues[P.i], text = (S.parts[x.part] || '');
  const at = text.indexOf(x.fragment);
  if (at < 0) { P.i++; saveRun(); return renderPolish(); }   // an earlier fix already changed this spot
  const ctxStart = Math.max(0, text.lastIndexOf('.', at - 1) + 1, at - 80), ctxEnd = Math.min(text.length, at + x.fragment.length + 60);
  const context = h('p', { class: 'ctx' }, (ctxStart > 0 ? '…' : '') + text.slice(ctxStart, at).trimStart(), h('mark', { text: x.fragment }), text.slice(at + x.fragment.length, ctxEnd) + (ctxEnd < text.length ? '…' : ''));
  const out = h('div', { class: 'out' });
  const kind = { spelling: 'Which spelling is right?', capital: 'Which is right?', punctuation: 'Which is right?' }[x.kind] || 'Which is right?';
  const box = h('div', { class: 'choices' }, x.options.map(o => { const b = h('button', { class: 'opt big', onclick: () => {
    if (o.ok) {
      const fixed = applyFix(S.parts[x.part], x.fragment, o.text, at);
      if (fixed != null) { S.parts[x.part] = fixed; P.fixed++; S.polishTotal = (S.polishTotal || 0) + 1; }
      P.i++; saveRun();
      out.replaceChildren(fb(true, 'Fixed.', x.why || ''));
      box.querySelectorAll('button').forEach(z => z.disabled = true); b.classList.add('right');
      setTimeout(renderPolish, x.why ? 1100 : 600);
    } else { b.classList.add('wrong'); b.disabled = true; out.replaceChildren(fb(false, 'Not that one.', 'Try the other choice.')); }
  } }, o.text); return b; }));
  show(top('Back', back), h('h1', { text: 'Last check' }), h('p', { class: 'muted', text: `${P.i + 1} of ${P.issues.length}` }),
    card(context, h('h2', { text: kind }), box, out));
}

/* ---------- final: copy it, and how to send it ---------- */
function finalText() { return level() === 1 ? assemble(S.parts) : assemble({ whole: S.parts.whole }); }
function copyBtn(label, text) {
  const b = h('button', { class: 'main', onclick: async () => {
    try { await navigator.clipboard.writeText(text); b.textContent = 'Copied ✓'; setTimeout(() => b.textContent = label, 2000); }
    catch (e) { b.textContent = 'Press and hold the text to copy'; }
  } }, label);
  return b;
}
function renderFinal() {
  if (isNew()) return renderFinalNew();
  const text = finalText(), want = correctReplyType(S.mail), cc = !S.momAlreadyOn && S.mail.ccMom;
  const practice = S.mode === 'practice';
  show(top('Back', back), h('h1', { text: practice ? 'Your finished email' : 'Your email is ready' }),
    card(h('pre', { class: 'final', text }), practice ? null : copyBtn('Copy email', text)),
    card(h('div', { class: 'eyebrow', text: practice ? 'If this were real, you would…' : 'Send it' }),
      h('ol', { class: 'howto' },
        h('li', { text: `Open ${sender()}'s email.` }),
        h('li', {}, 'Tap ', h('b', { text: want === 'reply_all' ? 'Reply all' : 'Reply' }), want === 'reply_all' ? ' so everyone on it sees your answer.' : '.'),
        h('li', { text: practice ? 'Paste your email.' : 'Paste your email (press and hold, then Paste).' }),
        cc ? h('li', {}, 'Tap ', h('b', { text: 'Cc' }), ' and add Mom: ', h('b', { text: MOM_EMAIL })) : null,
        h('li', { text: 'Read it once from top to bottom. Then tap Send.' })),
      cc && !practice ? h('button', { class: 'ghost', onclick: async e => { try { await navigator.clipboard.writeText(MOM_EMAIL); e.target.textContent = 'Copied ✓'; } catch (x) {} } }, 'Copy Mom\'s address') : null),
    h('button', { class: 'main', onclick: () => finish() }, practice ? 'Done' : 'I sent it'));
}

/* ---------- finish: save + level ---------- */
async function finish(redirected = false) {
  S.finished = true; S.endedAt = Date.now(); if (redirected) S.redirected = true;
  const clean = isClean(S);
  const np = nextProgress(progress, clean, tagsFor(S.mail, S.momAlreadyOn), !S.noReply && !redirected);
  const m = S.mail;
  const session = isNew() ? {
    kind: 'new', mode: S.mode, level: S.level, topic: m.topic || purposeLabel(m.purpose), subject: S.parts.subject || '', sender: displayName(m.sender), toRole: m.toRole || '',
    purpose: m.purpose || '', plan: m.plan || '', copied: S.ccPicked || [], ccWanted: { mom: !!m.ccMom, advisor: !!m.ccAdvisor, trainer: !!m.ccTrainer },
    decisions: Object.fromEntries(Object.entries(S.taps).map(([k, t]) => [k, { picks: t.picks, firstTry: !!S.firstTry[k] }])),
    ccMomWanted: !!m.ccMom, tries: S.tries, polishFixes: S.polishTotal || 0,
    final: (S.parts.subject ? 'Subject: ' + S.parts.subject + '\n\n' : '') + finalText(), clean, startedAt: S.startedAt, endedAt: S.endedAt, scenario: S.scenario ? S.scenario.text : null,
  } : {
    kind: 'reply', mode: S.mode, level: S.level, topic: m.topic || '', subject: m.subject || '', sender: displayName(m.sender), senderEmail: m.sender.email || '',
    roles: S.roles, copied: others(m).map(r => displayName(r)), noReply: !!S.noReply,
    decisions: Object.fromEntries(Object.entries(S.taps).map(([k, t]) => [k, { picks: t.picks, firstTry: !!S.firstTry[k] }])),
    replyWanted: correctReplyType(m), ccMomWanted: !!m.ccMom, momAlreadyOn: !!S.momAlreadyOn,
    understood: S.understood || '', tries: S.tries, polishFixes: S.polishTotal || 0,
    final: S.noReply ? '' : finalText(), clean, startedAt: S.startedAt, endedAt: S.endedAt, scenario: m.scenario ?? null,
  };
  show(card(spinner('Saving…')));
  try { await ask('save', { session, progress: np, preview: role === 'parent' }); if (role !== 'parent') progress = np; }
  catch (e) { console.warn('save failed', e); }
  S.step = 'done'; S.clean = clean; S.movedUp = np.movedUp && role !== 'parent'; saveRun(); route();
}
function renderDone() {
  const lv = progress.level;
  show(h('section', { class: 'card celebrate' },
    h('div', { class: 'big', text: S.clean ? '✓' : '•' }),
    h('h1', { text: S.movedUp ? `Level ${lv}!` : S.clean ? 'Clean email.' : 'Done.' }),
    h('p', { text: S.movedUp ? `You moved up to "${LEVELS[lv].name}." ${LEVELS[lv].blurb}` : S.clean ? 'Every choice right the first time.' : 'Every email you do makes the next one easier.' })),
    h('button', { class: 'main', onclick: () => { S = null; saveRun(); route(); } }, 'Home'));
}

/* ---------- parent view ---------- */
function renderParent() {
  const lv = progress.level || 1, list = parentData || [];
  const real = list.filter(s => s.mode === 'real'), recent = list.slice(0, 20);
  const firstRight = k => { const xs = list.filter(s => s.decisions && s.decisions[k]); return xs.length ? `${xs.filter(s => s.decisions[k].firstTry).length}/${xs.length}` : '—'; };
  const pill = (ok, label) => h('span', { class: 'pill ' + (ok ? 'ok' : 'bad'), text: label });
  show(
    h('div', { class: 'spread' }, h('div', { class: 'eyebrow', text: 'Email Coach · Parent' }), signOutBtn()),
    h('h1', { text: 'Burke\'s emails' }),
    card(h('div', { class: 'statgrid' },
      h('div', { class: 'stat' }, h('b', { text: String(real.length) }), h('span', { text: 'Real' })),
      h('div', { class: 'stat' }, h('b', { text: String(list.length - real.length) }), h('span', { text: 'Practice' })),
      h('div', { class: 'stat' }, h('b', { text: firstRight('replyType') }), h('span', { text: 'Reply button right' })),
      h('div', { class: 'stat' }, h('b', { text: firstRight('ccMom') }), h('span', { text: 'CC-Mom call right' })))),
    card(h('h2', { text: 'Level' }), h('p', { class: 'small muted', text: `Moves up on its own after ${NEED_CLEAN} clean emails out of his last ${WINDOW} at that level, with at least ${NEED_EACH} each that needed Reply all, needed CC Mom, had 2+ questions, and were new emails he started.` }),
      lv < 3 ? levelMeter(standing(progress)) : null,
      h('div', { class: 'choices long' }, [1, 2, 3].map(n => h('button', { class: 'opt' + (n === lv ? ' sel' : ''), onclick: async () => {
        try { const r = await ask('setLevel', { level: n }); progress = { ...progress, level: r.level, recent: [] }; route(); } catch (e) { alert(e.message); }
      } }, h('b', { text: `${n}. ${LEVELS[n].name}` }), h('span', { text: LEVELS[n].blurb }))))),
    card(h('h2', { text: 'Recent' }), recent.length ? h('ul', { class: 'list' }, recent.map(s => h('li', {}, h('div', {},
      h('div', { class: 'row' }, h('b', { text: s.topic || s.subject || '(no subject)' }), s.mode === 'practice' ? h('span', { class: 'pill none', text: 'Practice' }) : null),
      h('div', { class: 'small muted', text: `${s.at ? new Date(s.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''} · ${s.kind === 'new' ? 'to' : 'from'} ${s.sender}${s.copied && s.copied.length ? ' · copied: ' + s.copied.join(', ') : ''}` }),
      h('div', { class: 'row pills' },
        s.kind === 'new' ? h('span', { class: 'pill none', text: 'New email' }) : null,
        s.decisions && s.decisions.cc ? pill(s.decisions.cc.firstTry, 'Cc' + (s.decisions.cc.firstTry ? ' ✓' : ' ✗')) : null,
        s.noReply ? h('span', { class: 'pill none', text: 'No reply needed' }) : null,
        s.decisions && s.decisions.replyType ? pill(s.decisions.replyType.firstTry, (s.replyWanted === 'reply_all' ? 'Reply all' : 'Reply') + (s.decisions.replyType.firstTry ? ' ✓' : ` (picked ${s.decisions.replyType.picks[0].replace('_', ' ')} first)`)) : null,
        s.decisions && s.decisions.ccMom ? pill(s.decisions.ccMom.firstTry, 'CC Mom: ' + (s.ccMomWanted ? 'yes' : 'no') + (s.decisions.ccMom.firstTry ? ' ✓' : ' ✗')) : null,
        s.clean ? pill(true, 'Clean') : null),
      s.final ? h('details', {}, h('summary', { text: 'His email' }), h('pre', { class: 'final small', text: s.final })) : null)))) : h('p', { class: 'muted', text: 'Nothing yet.' })),
    h('button', { class: 'ghost', onclick: () => { preview = true; S = null; route(); } }, 'Try it as Burke (not saved)'),
    h('p', { class: 'small muted center', text: `v${APP_VERSION}` }));
}

start();
