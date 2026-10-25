// Phone-size walkthrough with the stand-in coach: node tests/ui.mjs (serves the folder itself).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
mkdirSync(root + 'tests/shots', { recursive: true });
const srv = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const browser = await chromium.launch();
const errors = [];
const page = async (q) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`http://localhost:8765/?mock=1${q || ''}`);
  return p;
};
const shot = (p, name) => p.screenshot({ path: `${root}tests/shots/${name}.png`, fullPage: true });
const noSideScroll = async (p, where) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'side scroll on ' + where);
const tap = (p, name) => p.getByRole('button', { name, exact: false }).first().click();
const write = async (p, text) => { await p.locator('textarea:visible').fill(text); await tap(p, 'Check it'); };
const see = (p, text) => p.getByText(text, { exact: false }).first().waitFor({ timeout: 4000 });

const polishAll = async (p, snap) => {
  for (let i = 0; i < 8; i++) {
    await p.waitForTimeout(400);
    if (await p.getByText('See your email').count()) return;
    await p.locator('.ctx').waitFor({ timeout: 4000 });
    if (snap && i === 0) await shot(p, '10-polish');
    const opts = p.locator('button.opt.big');
    const texts = await opts.allTextContents();
    const mark = await p.locator('.ctx mark').textContent();
    const right = texts.find(t => t !== mark);
    await opts.filter({ hasText: new RegExp('^' + right.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first().click();
    await p.waitForTimeout(1300);
  }
};

try {
  /* ---------- level 1, the athletic-director email ---------- */
  let p = await page();
  await see(p, 'Answer an email'); await shot(p, '01-home'); await noSideScroll(p, 'home');
  await tap(p, 'Answer an email');
  await see(p, 'Add the email'); await shot(p, '02-add');
  // collapsed recipients get sent back
  await p.getByText('Paste text instead').click();
  await p.locator('textarea').fill('collapsed email'); await tap(p, 'Read it');
  await see(p, 'Tap the little arrow');
  await p.locator('textarea').fill('AD email'); await tap(p, 'Read it');
  await see(p, 'Is this the email?'); await shot(p, '03-show'); await noSideScroll(p, 'show');
  await tap(p, 'Yes, that');
  await see(p, 'Who\'s on this email?');
  const persons = p.locator('.person');
  await persons.nth(0).getByRole('button', { name: 'Coach / AD' }).click();
  await persons.nth(1).getByRole('button', { name: 'Trainer' }).click();
  await shot(p, '04-who'); await tap(p, 'Next');
  await see(p, 'What is Mr. Grant asking you?');
  await write(p, 'he wants to know if i will play saturday'); await see(p, 'Not yet');
  await write(p, 'he wants to know if i will play saturday and how my ankle feels'); await see(p, 'Good.');
  await tap(p, 'Next');
  await see(p, 'Does this need an answer?'); await p.getByRole('button', { name: 'Yes, it needs an answer' }).click(); await tap(p, 'Next');
  await see(p, 'Which button will you tap?');
  await p.getByRole('button', { name: /^Reply Goes only/ }).click();
  await see(p, 'Look at the CC line'); await see(p, 'Mrs. Kent (trainer)');
  await shot(p, '05-reply-wrong'); await noSideScroll(p, 'reply');
  await p.getByRole('button', { name: /^Reply all/ }).click(); await see(p, 'copied on purpose'); await tap(p, 'Next');
  await see(p, 'Should you copy Mom?'); await p.getByRole('button', { name: 'Yes, CC Mom' }).click(); await see(p, 'injury'); await shot(p, '06-ccmom'); await tap(p, 'Next');
  await see(p, 'Pick the greeting.'); await shot(p, '07-greeting');
  await p.locator('button.opt', { hasText: /^Hey Mr\. Grant,$/ }).click(); await see(p, 'Not that one');
  await p.locator('button.opt', { hasText: /^(Dear|Hello) Mr\. Grant,$/ }).click(); await tap(p, 'Next');
  await see(p, 'Start by thanking Mr. Grant.');
  await write(p, 'thx'); await see(p, 'Not yet');
  await write(p, 'thx'); await see(p, 'Not yet');
  await see(p, 'See an example'); await tap(p, 'See an example'); await see(p, 'Example from a different email'); await shot(p, '08-example');
  await write(p, 'thank you for checking on me'); await see(p, 'Good.'); await tap(p, 'Next');
  await see(p, 'Now answer.'); await see(p, 'Make sure you answer');
  await write(p, 'my ankle feels better becuase i iced it and i will play saturday'); await see(p, 'Good.'); await shot(p, '09-body'); await tap(p, 'Next');
  await see(p, 'Wrap it up.'); await write(p, 'see you at practice'); await see(p, 'Good.'); await tap(p, 'Next');
  await see(p, 'Pick a sign-off.'); { const all = await p.locator('button.opt').allTextContents(); const bad = all.find(t => !/^(Thank you|Best|Sincerely), \/ Burke$/.test(t));
    await p.locator('button.opt').nth(all.indexOf(bad)).click(); await see(p, 'Not that one'); }
  await p.locator('button.opt', { hasText: /^(Thank you|Best|Sincerely), \/ Burke$/ }).first().click(); await tap(p, 'Next');
  // polish: becuase, then end periods (the two " i " are skipped: same spot twice)
  await see(p, 'Last check');
  await polishAll(p, true);
  await see(p, 'See your email'); await tap(p, 'See your email');
  await see(p, 'Your email is ready');
  const final = await p.locator('pre.final').textContent();
  assert.equal(final.split('\n\n').length, 4, final);
  assert.match(final, /^(Dear|Hello) Mr\. Grant,\n\nthank you for checking on me\. my ankle feels better because i iced it and i will play saturday\.\n\nsee you at practice\.\n\n(Thank you|Best|Sincerely),\nBurke$/);
  await see(p, 'Reply all'); await see(p, 'ashley@ashleyfisher.com');
  await shot(p, '11-final'); await noSideScroll(p, 'final');
  await tap(p, 'I sent it'); await see(p, 'Done.');
  const saved = await p.evaluate(() => window.__saved);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].decisions.replyType.firstTry, false);
  assert.deepEqual(saved[0].decisions.replyType.picks, ['reply', 'reply_all']);
  assert.equal(saved[0].decisions.ccMom.firstTry, true);
  assert.equal(saved[0].clean, false);
  assert.equal(saved[0].replyWanted, 'reply_all');
  await shot(p, '12-done');
  // resume: reload mid-way keeps the work
  await tap(p, 'Home'); await p.getByRole('button', { name: 'Answer one' }).click(); await see(p, 'Your practice email'); await tap(p, 'Start');
  await see(p, 'Who\'s on this email?'); await p.reload(); await see(p, 'Who\'s on this email?');

  /* ---------- parent view, then level 2 as Burke ---------- */
  p = await page('&as=parent');
  await see(p, 'Burke\'s emails'); await shot(p, '13-parent'); await noSideScroll(p, 'parent');
  await p.getByRole('button', { name: /^2\. Draft it/ }).click(); await p.waitForTimeout(300);
  await tap(p, 'Try it as Burke'); await p.getByRole('button', { name: 'Answer one' }).click(); await see(p, 'Your practice email'); await tap(p, 'Start');
  const ps = p.locator('.person'); await ps.nth(0).getByRole('button', { name: 'Coach / AD' }).click(); await ps.nth(1).getByRole('button', { name: 'Trainer' }).click(); await tap(p, 'Next');
  await write(p, 'if i will play saturday and how my ankle feels'); await see(p, 'Good.'); await tap(p, 'Next');
  await p.getByRole('button', { name: 'Yes, it needs an answer' }).click(); await tap(p, 'Next');
  await see(p, 'Show the rule');   // trees fold away at level 2
  await p.getByRole('button', { name: /^Reply all/ }).click(); await tap(p, 'Next');
  await p.getByRole('button', { name: 'Yes, CC Mom' }).click(); await tap(p, 'Next');
  await see(p, 'Write your email to Mr. Grant.'); await shot(p, '14-level2');
  await write(p, 'hey mr grant my ankle is better and i will play saturday\n\nBurke'); await see(p, '✗ Greeting'); await shot(p, '15-level2-check');
  await write(p, 'Dear Mr. Grant,\n\nThank you for checking on me. My ankle feels better and I will play Saturday.\n\nSee you at practice.\n\nThank you,\nBurke');
  await see(p, '✓ Answer'); await tap(p, 'Next');
  await see(p, 'Last check'); await polishAll(p); await tap(p, 'See your email');
  await see(p, 'Your finished email'); await see(p, 'If this were real');
  await tap(p, 'Done'); await see(p, 'Clean email.');

  /* ---------- new email, level 1 practice (Mrs. Lee, missed class) ---------- */
  p = await page();
  await see(p, 'Write a new email');
  await p.evaluate(() => localStorage.setItem('email-newpractice-n', '0'));
  await p.getByRole('button', { name: 'Write one' }).click();
  await see(p, 'Practice: write a new email'); await see(p, 'out sick on Tuesday'); await shot(p, '16-new-situation'); await tap(p, 'Start');
  await see(p, 'Who are you writing to?'); await p.locator('.card b', { hasText: 'Mrs. Lee' }).waitFor(); await tap(p, 'Next');
  await see(p, 'Is there already an email about this?');
  await p.getByRole('button', { name: /already an email/ }).click(); await see(p, 'Look again');
  await p.getByRole('button', { name: /something new/ }).click(); await tap(p, 'Next');
  await see(p, 'Why are you writing?'); await p.getByRole('button', { name: /^Help before a test/ }).click(); await see(p, 'Read the situation again');
  await p.getByRole('button', { name: /^I missed a class/ }).click(); await tap(p, 'Next');
  await see(p, 'What happened, and what do you need from Mrs. Lee?'); await see(p, 'Which day did you miss');
  await write(p, 'i was sick'); await see(p, 'Which day did you miss?');
  await write(p, 'i was out sick tuesday and need to know what i missed and the homework'); await see(p, 'Good plan.'); await shot(p, '17-new-plan'); await tap(p, 'Next');
  await see(p, 'Who else goes on Cc?'); await shot(p, '18-new-cc');
  await p.getByRole('button', { name: 'Check' }).click(); await see(p, 'Pick who goes on Cc');
  await p.getByRole('button', { name: /My advisor/ }).click(); await p.getByRole('button', { name: 'Check' }).click();
  await see(p, 'Your advisor doesn\'t need this one'); await see(p, 'Mom should be on this');
  await p.getByRole('button', { name: /My advisor/ }).click(); await p.getByRole('button', { name: /☐ Mom/ }).click(); await p.getByRole('button', { name: 'Check' }).click();
  await see(p, 'Right: Cc Mom.'); await tap(p, 'Next');
  await see(p, 'Write a subject line.'); await write(p, 'question'); await see(p, 'Not yet');
  await write(p, 'missed science tuesday'); await see(p, 'Good.'); await tap(p, 'Next');
  await see(p, 'Pick the greeting.'); await p.locator('button.opt', { hasText: /^(Dear|Hello) Mrs\. Lee,$/ }).click(); await tap(p, 'Next');
  await see(p, 'Say why you\'re writing.'); await write(p, 'i was absent on tuesday becuase i was sick'); await see(p, 'Good.'); await tap(p, 'Next');
  await see(p, 'Now ask for what you need.'); await see(p, 'Make sure you say'); await write(p, 'could you tell me what i missed and the homework?'); await see(p, 'Good.'); await tap(p, 'Next');
  await see(p, 'Wrap it up.'); await write(p, 'thank you for your help'); await see(p, 'Good.'); await tap(p, 'Next');
  await see(p, 'Pick a sign-off.'); await p.locator('button.opt', { hasText: /^(Thank you|Best|Sincerely), \/ Burke$/ }).first().click(); await tap(p, 'Next');
  await see(p, 'Last check'); await polishAll(p); await tap(p, 'See your email');
  await see(p, 'Your finished email'); await see(p, 'New message'); await see(p, 'Cc: add Mom');
  const subj = await p.locator('pre.final').first().textContent();
  assert.equal(subj, 'missed science tuesday');
  const body = await p.locator('pre.final').nth(1).textContent();
  assert.match(body, /^(Dear|Hello) Mrs\. Lee,\n\n[iI] was absent on tuesday because [iI] was sick\. could you tell me what [iI] missed and the homework\?\n\nthank you for your help\.\n\n(Thank you|Best|Sincerely),\nBurke$/);
  await shot(p, '19-new-final'); await noSideScroll(p, 'new final');
  await tap(p, 'Done'); await see(p, 'Done.');
  const saved2 = await p.evaluate(() => window.__saved);
  const last = saved2.at(-1);
  assert.equal(last.kind, 'new'); assert.deepEqual(last.copied, ['mom']); assert.equal(last.decisions.cc.firstTry, false); assert.match(last.final, /^Subject: missed science tuesday/);

  /* ---------- new email: "already an email" practice ends early and doesn't count ---------- */
  await p.evaluate(() => localStorage.setItem('email-newpractice-n', '3'));
  await tap(p, 'Home'); await p.getByRole('button', { name: 'Write one' }).click();
  await see(p, 'already emailed you yesterday'); await tap(p, 'Start'); await tap(p, 'Next');
  await p.getByRole('button', { name: /already an email/ }).click(); await see(p, 'Right. Answer that email.'); await tap(p, 'Next');
  await see(p, 'Answer that email instead.'); await tap(p, 'Done');

  /* ---------- new email, real, level 2 draft ---------- */
  p = await page('&as=parent');
  await p.getByRole('button', { name: /^2\. Draft it/ }).click(); await p.waitForTimeout(300);
  await tap(p, 'Try it as Burke'); await tap(p, 'Write a new email');
  await see(p, 'Who are you writing to?');
  await p.getByRole('button', { name: 'Teacher' }).click(); await p.getByRole('button', { name: 'Mrs.', exact: true }).click();
  await p.getByPlaceholder('Last name').fill('lee'); await p.getByPlaceholder(/Science/).fill('science');
  await shot(p, '20-new-who'); await tap(p, 'Next');
  await p.getByRole('button', { name: /something new/ }).click(); await tap(p, 'Next');
  await p.getByRole('button', { name: /^I missed a class/ }).click(); await tap(p, 'Next');
  await write(p, 'out sick tuesday, need what i missed'); await see(p, 'Good plan.'); await tap(p, 'Next');
  await p.getByRole('button', { name: /☐ Mom/ }).click(); await p.getByRole('button', { name: 'Check' }).click(); await see(p, 'Right: Cc Mom.'); await tap(p, 'Next');
  await write(p, 'Missed science Tuesday'); await see(p, 'Good.'); await tap(p, 'Next');
  await see(p, 'Write your email to Mrs. Lee.'); await see(p, 'Why you\'re writing');
  await write(p, 'Dear Mrs. Lee,\n\nI was absent on Tuesday. Could you tell me what I missed?\n\nThank you for your help.\n\nThank you,\nBurke');
  await see(p, '✓ What you need'); await tap(p, 'Next');
  await see(p, 'Last check'); await polishAll(p); await tap(p, 'See your email');
  await see(p, 'Your email is ready'); await see(p, 'Copy subject');

  assert.deepEqual(errors.filter(e => !/fonts|ERR_FAILED|net::/.test(e)), []);
  console.log('Walkthrough passed.');
} finally { await browser.close(); srv.kill(); }
