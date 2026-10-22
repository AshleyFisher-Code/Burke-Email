// node tests/test.mjs — every rule the app grades by itself. Must pass before publishing.
import assert from 'node:assert/strict';
import * as R from '../js/rules.js';

let n = 0; const t = (name, f) => { f(); n++; };
const me = { name: 'Burke Fisher', email: 'burke.fisher@school.example', field: 'to', isMe: true, isMom: false, isGroup: false };
const person = (name, title, last, field = 'cc', extra = {}) => ({ name, email: name.split(' ')[0].toLowerCase() + '@school.example', title, lastName: last, field, isMe: false, isMom: false, isGroup: false, ...extra });
const mail = (sender, recipients, extra = {}) => ({ sender, recipients, asks: [], replyNeeded: true, ccMom: false, ...extra });

// This week's real miss: athletic director wrote, trainer copied, Burke answered only the AD about his injury.
const AD = person('Tom Grant', 'Mr.', 'Grant', 'from');
const TRAINER = person('Dana Kent', 'Mrs.', 'Kent');
const adMail = mail(AD, [me, TRAINER], { ccMom: true, ccMomWhy: 'It\'s about an injury.' });

t('AD + trainer copied: Reply all is right', () => {
  assert.equal(R.correctReplyType(adMail), 'reply_all');
  const roles = { [TRAINER.email]: 'trainer' };
  const f = R.replyFeedback(adMail, 'reply', roles);
  assert.equal(f.ok, false);
  assert.match(f.why, /Mrs\. Kent \(trainer\)/);
  assert.match(f.why, /only Mr\. Grant sees/);
  assert.equal(R.replyFeedback(adMail, 'reply_all', roles).ok, true);
  assert.equal(R.replyFeedback(adMail, 'new', roles).ok, false);
  assert.equal(R.replyFeedback(adMail, 'forward', roles).ok, false);
  assert.match(R.replyFeedback(adMail, 'forward', roles).why, /Reply all/);
});

t('teacher + advisor copied: Reply all', () => {
  const m = mail(person('Ann Lee', 'Mrs.', 'Lee', 'from'), [me, person('Sam Doe', 'Mr.', 'Doe')]);
  assert.equal(R.correctReplyType(m), 'reply_all');
  assert.match(R.replyFeedback(m, 'reply', { 'sam@school.example': 'advisor' }).why, /Mr\. Doe \(advisor\)/);
});

t('two people copied: names listed with "and"', () => {
  const m = mail(person('Ann Lee', 'Mrs.', 'Lee', 'from'), [me, person('Sam Doe', 'Mr.', 'Doe'), person('Kim Ray', 'Mrs.', 'Ray', 'to')]);
  const f = R.replyFeedback(m, 'reply', {});
  assert.match(f.why, /Mr\. Doe and Mrs\. Ray were copied/);
});

t('only Burke: Reply is right; Reply all is harmless', () => {
  const m = mail(person('Ann Lee', 'Mrs.', 'Lee', 'from'), [me]);
  assert.equal(R.correctReplyType(m), 'reply');
  assert.equal(R.replyFeedback(m, 'reply').ok, true);
  assert.equal(R.replyFeedback(m, 'reply_all').ok, true);
  assert.equal(R.replyFeedback(m, 'new').ok, false);
});

t('group list: Reply, not Reply all', () => {
  const m = mail(person('Ann Lee', 'Mrs.', 'Lee', 'from'), [person('7th Grade', '', '', 'to', { isGroup: true, email: '7thgrade@school.example' })]);
  assert.equal(R.correctReplyType(m), 'reply');
  assert.equal(R.replyFeedback(m, 'reply_all').ok, false);
  assert.equal(R.replyFeedback(m, 'reply').ok, true);
});

t('sender who copies themselves is not counted', () => {
  const lee = person('Ann Lee', 'Mrs.', 'Lee', 'from');
  const m = mail(lee, [me, { ...lee, field: 'cc' }]);
  assert.equal(R.correctReplyType(m), 'reply');
});

t('Mom already on it', () => {
  const m = mail(AD, [me, person('Ashley Fisher', '', 'Fisher', 'cc', { email: 'ashley@ashleyfisher.com' })]);
  assert.equal(R.momOnEmail(m, 'ashley@ashleyfisher.com'), true);
  assert.equal(R.momOnEmail(m, 'ASHLEY@ashleyfisher.com '), true);
  assert.equal(R.momOnEmail(adMail, 'ashley@ashleyfisher.com'), false);
  assert.equal(R.correctReplyType(m), 'reply_all');   // Mom is copied, so Reply all includes her
});

t('CC Mom feedback both ways', () => {
  assert.equal(R.ccMomFeedback(adMail, true).ok, true);
  assert.equal(R.ccMomFeedback(adMail, false).ok, false);
  const thanks = mail(AD, [me], { ccMom: false, ccMomWhy: 'Just a thank-you.' });
  assert.equal(R.ccMomFeedback(thanks, false).ok, true);
  assert.equal(R.ccMomFeedback(thanks, true).ok, false);
});

t('greeting: always exactly one right, never duplicates, right one is "Dear/Hello Mr. X,"', () => {
  for (let seed = 1; seed < 400; seed++) {
    for (const snd of [AD, TRAINER, person('Coach Bo Diaz', 'Coach', 'Diaz', 'from'), person('Grant', 'Mr.', 'Grant', 'from')]) {
      const o = R.greetingOptions(snd, R.rng(seed));
      assert.equal(o.length, 4);
      assert.equal(o.filter(x => x.ok).length, 1);
      assert.equal(new Set(o.map(x => x.text)).size, 4, JSON.stringify(o));
      assert.match(o.find(x => x.ok).text, new RegExp(`^(Dear|Hello) ${snd.title.replace('.', '\\.')} ${snd.lastName},$`));
      o.filter(x => !x.ok).forEach(x => assert.ok(x.why));
    }
  }
});

t('greeting with no title (group/office): Hello,', () => {
  const o = R.greetingOptions({ name: 'Athletics Office', isGroup: true }, R.rng(3));
  assert.equal(o.find(x => x.ok).text, 'Hello,');
});

t('sign-off: two right, two wrong, all different', () => {
  for (let seed = 1; seed < 200; seed++) {
    const o = R.signoffOptions('Burke', R.rng(seed));
    assert.equal(o.filter(x => x.ok).length, 2);
    assert.equal(new Set(o.map(x => x.text)).size, 4);
    o.filter(x => x.ok).forEach(x => assert.match(x.text, /^(Thank you|Best|Sincerely),\nBurke$/));
  }
});

t('assemble: greeting / thanks+answer / closing / sign-off', () => {
  const e = R.assemble({ greeting: 'Dear Mr. Grant,', thanks: 'Thank you for checking on me. ', body: '  My ankle feels better and I will play Saturday.', closing: 'See you at practice.', signoff: 'Thank you,\nBurke' });
  assert.equal(e, 'Dear Mr. Grant,\n\nThank you for checking on me. My ankle feels better and I will play Saturday.\n\nSee you at practice.\n\nThank you,\nBurke');
  assert.equal(R.assemble({ greeting: 'Dear Mr. Grant,', body: 'Yes.', signoff: 'Best,\nBurke' }), 'Dear Mr. Grant,\n\nYes.\n\nBest,\nBurke');
  assert.equal(R.assemble({ whole: 'Dear Mr. Grant,  \n\n Yes.\n' }), 'Dear Mr. Grant,\n\nYes.');
});

t('applyFix', () => {
  assert.equal(R.applyFix('i will come becuase', 'becuase', 'because'), 'i will come because');
  assert.equal(R.applyFix('abc', 'zz', 'y'), null);
  assert.equal(R.applyFix('to to', 'to', 'too', 3), 'to too');
});

t('usableIssues drops anything we cannot show safely', () => {
  const parts = { body: 'i will come becuase my ankle is ok. ok', thanks: 'Thanks' };
  const got = R.usableIssues([
    { part: 'body', kind: 'spelling', fragment: 'becuase', options: [{ text: 'because', ok: true }, { text: 'becuase', ok: false }] },
    { part: 'body', kind: 'spelling', fragment: 'becuase', options: [{ text: 'because', ok: true }, { text: 'becuase', ok: false }] }, // duplicate
    { part: 'body', kind: 'spelling', fragment: 'notthere', options: [{ text: 'x', ok: true }, { text: 'y', ok: false }] },
    { part: 'body', kind: 'spelling', fragment: 'ok', options: [{ text: 'OK', ok: true }, { text: 'ok', ok: false }] },          // twice in text
    { part: 'body', kind: 'capital', fragment: 'i will', options: [{ text: 'I will', ok: true }, { text: 'I will', ok: true }] }, // two right
    { part: 'thanks', kind: 'punctuation', fragment: 'Thanks', options: [{ text: 'Thanks', ok: true }, { text: 'Thanks!', ok: false }] }, // no-op
    { part: 'nope', kind: 'spelling', fragment: 'x', options: [] },
    { part: 'body', kind: 'capital', fragment: 'i will', options: [{ text: 'I will', ok: true }, { text: 'i will', ok: false }] },
  ], parts);
  assert.deepEqual(got.map(x => x.fragment), ['becuase', 'i will']);
});

t('clean: every tap right first time, no writing step at 3+ tries', () => {
  const clean = { finished: true, firstTry: { replyType: true, ccMom: true }, tries: { body: 1 } };
  assert.equal(R.isClean(clean), true);
  assert.equal(R.isClean({ ...clean, firstTry: { replyType: false } }), false);
  assert.equal(R.isClean({ ...clean, tries: { body: 3 } }), false);
  assert.equal(R.isClean({ ...clean, finished: false }), false);
});

t('levels: 15 clean of the last 20, with 3+ of each kind', () => {
  const all = { replyAll: true, ccMom: true, multi: true }, plain = { replyAll: false, ccMom: false, multi: false };
  let p = { level: 1, recent: [] };
  for (let i = 0; i < 14; i++) { p = R.nextProgress(p, true, all); assert.equal(p.level, 1); }
  p = R.nextProgress(p, true, all); assert.equal(p.level, 2); assert.equal(p.movedUp, true); assert.deepEqual(p.recent, []);

  // 15 clean but all easy thank-yous: not enough variety
  p = { level: 1, recent: [] };
  for (let i = 0; i < 20; i++) p = R.nextProgress(p, true, plain);
  assert.equal(p.level, 1); assert.equal(R.standing(p).clean, 20);
  // add the variety, one kind at a time
  for (let i = 0; i < 3; i++) p = R.nextProgress(p, true, { ...plain, replyAll: true });
  for (let i = 0; i < 3; i++) p = R.nextProgress(p, true, { ...plain, ccMom: true });
  assert.equal(p.level, 1);
  for (let i = 0; i < 2; i++) p = R.nextProgress(p, true, { ...plain, multi: true });
  assert.equal(p.level, 1);
  p = R.nextProgress(p, true, { ...plain, multi: true }); assert.equal(p.level, 2);

  // a rushed one costs him but doesn't reset: 14 clean + 1 sloppy + 1 clean = 15 of 16
  p = { level: 2, recent: [] };
  for (let i = 0; i < 14; i++) p = R.nextProgress(p, true, all);
  p = R.nextProgress(p, false, all); assert.equal(R.standing(p).clean, 14); assert.equal(p.level, 2);
  p = R.nextProgress(p, true, all); assert.equal(p.level, 3);

  // too many sloppy ones in the window: 6 misses in the last 20 blocks moving up
  p = { level: 1, recent: [] };
  for (let i = 0; i < 6; i++) p = R.nextProgress(p, false, all);
  for (let i = 0; i < 14; i++) p = R.nextProgress(p, true, all);
  assert.equal(p.level, 1); assert.equal(R.standing(p).clean, 14);
  p = R.nextProgress(p, true, all); assert.equal(p.level, 2);   // oldest miss slid out of the 20

  // no-reply emails don't count
  const before = { level: 1, recent: [{ c: true, ...all }] };
  assert.deepEqual(R.nextProgress(before, false, all, false).recent, before.recent);
  // top level stays
  p = { level: 3, recent: [] }; for (let i = 0; i < 20; i++) p = R.nextProgress(p, true, all); assert.equal(p.level, 3);
});

t('tags: what kind of email it was', () => {
  assert.deepEqual(R.tagsFor({ ...adMail, asks: ['a', 'b'] }), { replyAll: true, ccMom: true, multi: true });
  assert.deepEqual(R.tagsFor({ ...adMail, asks: ['a'] }, true), { replyAll: true, ccMom: false, multi: false });
});

console.log(`All ${n} rule groups passed.`);
