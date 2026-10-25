// Live check of everything Claude does, with the real key. Run once after deploying, in Google Cloud Shell:
//   ANTHROPIC_API_KEY=$(gcloud secrets versions access latest --secret=ANTHROPIC_API_KEY --project=burke-latin) node tests/live.mjs
// Prints PASS/FAIL per case. Nothing is saved anywhere.
import { ACTIONS } from '../functions/index.js';
import * as R from '../js/rules.js';

const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error('No ANTHROPIC_API_KEY'); process.exit(1); }
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  →  ' + detail}`); };
const run = (a, d) => ACTIONS[a](key, d);

const AD_TEXT = `From: Tom Grant <tgrant@school.example>
To: Burke Fisher <burke.fisher@school.example>
Cc: Dana Kent <dkent@school.example>
Subject: Saturday game

Hi Burke,
You mentioned your ankle was sore after practice. Are you planning to play Saturday? Please let us know how it feels today.
Thanks,
Mr. Grant
Athletic Director`;
const THANKS_TEXT = `From: Bo Diaz <bdiaz@school.example>
To: Burke Fisher <burke.fisher@school.example>
Subject: Thanks!

Burke, thanks for helping carry the equipment back today. Much appreciated.
Coach Diaz`;
const LIST_TEXT = `From: Middle School Office <msoffice@school.example>
To: 7th Grade Students <7thgrade@school.example>
Subject: Picture day reminder

This is an automated reminder that picture day is Thursday. No reply is needed.`;

try {
  const ad = await run('read', { text: AD_TEXT });
  check('read AD email: complete', ad.readable && ad.recipientsComplete, JSON.stringify(ad).slice(0, 300));
  check('read AD email: trainer on Cc', ad.recipients.some(r => r.field === 'cc' && /kent/i.test(r.name + r.email)), JSON.stringify(ad.recipients));
  check('read AD email: Burke marked isMe', ad.recipients.some(r => r.isMe), JSON.stringify(ad.recipients));
  check('read AD email: sender Mr. Grant', ad.sender.title === 'Mr.' && /grant/i.test(ad.sender.lastName), JSON.stringify(ad.sender));
  check('read AD email: two asks', ad.asks.length >= 2, JSON.stringify(ad.asks));
  check('read AD email: needs reply', ad.replyNeeded === true, ad.replyWhy);
  check('read AD email: CC Mom (injury)', ad.ccMom === true, ad.ccMomWhy);
  check('rule: AD email → Reply all', R.correctReplyType(ad) === 'reply_all', JSON.stringify(R.others(ad)));
  check('rule: Reply names the trainer', /Kent/.test(R.replyFeedback(ad, 'reply', {}).why));

  const th = await run('read', { text: THANKS_TEXT });
  check('thank-you note: no CC Mom', th.ccMom === false, th.ccMomWhy);
  check('thank-you note: Reply (only Burke)', R.correctReplyType(th) === 'reply');
  const li = await run('read', { text: LIST_TEXT });
  check('automated list notice: no reply needed', li.replyNeeded === false, li.replyWhy);

  const c = (step, answer) => run('check', { step, mail: ad, roles: {}, answer });
  check('understand: half → not ok', !(await c('understand', 'he wants to know if im playing saterday')).ok);
  check('understand: both → ok', (await c('understand', 'if im playing saterday and how my ankel feels')).ok);
  check('thanks: "thx" → not ok', !(await c('thanks', 'thx')).ok);
  check('thanks: proper → ok', (await c('thanks', 'Thank you for cheking on me.')).ok);
  const miss = await c('body', 'I will play Saturday.');
  check('body: missing ankle → not ok', !miss.ok, miss.feedback);
  check('body: feedback doesn\'t write it for him', !/my ankle (feels|is)/i.test(miss.feedback), miss.feedback);
  const sp = await c('body', 'my ankel feels alot beter becuase i iced it and i will play saterday');
  check('body: spelling mistakes still ok (dysgraphia rule)', sp.ok, sp.feedback);
  check('closing: proper → ok', (await c('closing', 'See you at practice.')).ok);

  const w = await run('whole', { mail: ad, roles: {}, answer: 'hey mr grant my ankle is better and i will play saturday\n\nBurke' });
  const item = p => (w.items || []).find(i => i.part === p) || {};
  check('whole: "hey" greeting flagged', item('greeting').ok === false, JSON.stringify(w.items));
  check('whole: missing thanks flagged', item('thanks').ok === false);
  check('whole: answer ok', item('answer').ok === true, item('answer').note);

  const parts = { body: 'my ankle feels beter becuase i iced it and I will play saturday' };
  const pol = await run('polish', { parts });
  const usable = R.usableIssues(pol.issues, parts);
  let fixed = parts.body; for (const x of usable) fixed = R.applyFix(fixed, x.fragment, x.options.find(o => o.ok).text) ?? fixed;
  check('polish: one tap per word (no double fixes on one word)', usable.length === (pol.issues || []).length, JSON.stringify(pol.issues));
  // the app takes a second look after fixes, so do the same here
  const pol2 = await run('polish', { parts: { body: fixed } });
  for (const x of R.usableIssues(pol2.issues, { body: fixed })) fixed = R.applyFix(fixed, x.fragment, x.options.find(o => o.ok).text) ?? fixed;
  check('polish: fixes because/better', /because/.test(fixed) && /better/.test(fixed), fixed);
  check('polish: capitals Saturday and My', /Saturday/.test(fixed) && /^My/.test(fixed), fixed);
  check('polish: ends with a period', /\.$/.test(fixed.trim()), fixed);
  check('polish: wording unchanged', fixed.toLowerCase().replace(/[^a-z ]/g, '').split(' ').length === parts.body.split(' ').length, fixed);
  check('polish: his misspelling offered as a wrong choice', usable.some(x => x.kind === 'spelling' && x.options.some(o => !o.ok && o.text === x.fragment)), JSON.stringify(usable[0]));

  const ex = await run('example', { step: 'thanks', mail: { topic: 'Ankle and Saturday\'s game' } });
  check('example: different situation', !/ankle|saturday|grant/i.test(ex.situation + ex.text), JSON.stringify(ex));

  const pr = await run('practice', { scenario: 1 });
  check('practice: complete email', pr.readable && pr.recipientsComplete && pr.body.length > 40, JSON.stringify(pr).slice(0, 300));
  check('practice: Burke is on it', pr.recipients.some(r => r.isMe));
  check('practice: trainer copied → Reply all', R.correctReplyType(pr) === 'reply_all', JSON.stringify(pr.recipients));
  check('practice: sender has a title', !!pr.sender.title, JSON.stringify(pr.sender));
} catch (e) { fail++; console.log('FAIL  crashed →', e.message); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
