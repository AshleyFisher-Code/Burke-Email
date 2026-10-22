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

t('levels: clean sessions move him up after 5 in a row; a miss resets', () => {
  const clean = { finished: true, firstTry: { replyType: true, ccMom: true }, tries: { body: 1 } };
  assert.equal(R.isClean(clean), true);
  assert.equal(R.isClean({ ...clean, firstTry: { replyType: false } }), false);
  assert.equal(R.isClean({ ...clean, tries: { body: 3 } }), false);
  assert.equal(R.isClean({ ...clean, finished: false }), false);
  let p = { level: 1, cleanStreak: 0 };
  for (let i = 0; i < 4; i++) { p = R.nextProgress(p, true); assert.equal(p.level, 1); }
  p = R.nextProgress(p, true); assert.equal(p.level, 2); assert.equal(p.movedUp, true); assert.equal(p.cleanStreak, 0);
  p = R.nextProgress(p, true); p = R.nextProgress(p, false); assert.equal(p.cleanStreak, 0); assert.equal(p.level, 2);
  p = { level: 3, cleanStreak: 4 }; p = R.nextProgress(p, true); assert.equal(p.level, 3);
});

console.log(`All ${n} rule groups passed.`);
