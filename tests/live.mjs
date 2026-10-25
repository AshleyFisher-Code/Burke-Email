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
  // A starter of 4 words or fewer is allowed ("My ankle feels..."); a sentence he could copy is not.
  const quoted = [...miss.feedback.matchAll(/["“]([^"”]+)["”]/g)].map(m => m[1].replace(/[.…]+$/, '').trim());
  const writesIt = quoted.some(q => q.split(/\s+/).length > 4) || /my ankle (feels|is) (better|good|fine|okay|ok|great)/i.test(miss.feedback);
  check('body: feedback doesn\'t write it for him', !writesIt, miss.feedback);
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
  /* ---------- new emails he starts ---------- */
  const lee = { compose: true, sender: { name: 'Mrs. Lee', title: 'Mrs.', lastName: 'Lee' }, toRole: 'teacher', about: 'science' };
  const plan = (purpose, answer, extra = {}) => run('plan', { mail: { ...lee, purpose, ...extra }, answer });
  const missed = await plan('missed', 'i was out sick tuesday and need to know what i missed and if there was homework');
  check('new plan: missed class → ok', missed.ok, missed.feedback);
  check('new plan: missed class → Cc Mom', missed.ccMom === true, missed.ccMomWhy);
  check('new plan: missed class → no advisor', missed.ccAdvisor === false, missed.ccAdvisorWhy);
  check('new plan: mustInclude from his plan', missed.mustInclude.length >= 1 && missed.mustInclude.length <= 5, JSON.stringify(missed.mustInclude));
  const vague = await plan('missed', 'i need help');
  check('new plan: too vague → not ok', !vague.ok, vague.feedback);
  const help = await plan('testHelp', 'math test thursday, stuck on inequalities, free monday or tuesday before school', { sender: { name: 'Mr. Patel', title: 'Mr.', lastName: 'Patel' }, about: 'math' });
  check('new plan: test help → ok', help.ok, help.feedback);
  check('new plan: test help → nobody on Cc', !help.ccMom && !help.ccAdvisor && !help.ccTrainer, JSON.stringify(help));
  const grade = await plan('meeting', 'want to talk about my grade on the last quiz, free thursday after school', { sender: { name: 'Mr. Patel', title: 'Mr.', lastName: 'Patel' }, about: 'math' });
  check('new plan: meeting about a grade → Cc Mom and advisor', grade.ccMom && grade.ccAdvisor, JSON.stringify(grade));
  const hurt = await plan('injury', 'rolled my ankle at recess, cant practice today', { sender: { name: 'Coach Diaz', title: 'Coach', lastName: 'Diaz' }, toRole: 'coach', about: 'baseball' });
  check('new plan: injury to coach → Cc trainer and Mom', hurt.ccTrainer && hurt.ccMom, JSON.stringify(hurt));
  check('rule: Cc grading agrees', R.ccFeedback(missed, ['mom'], 'teacher').ok === true);

  const nm = { ...lee, purpose: 'missed', plan: 'out sick tuesday, need what i missed', asks: missed.mustInclude };
  const cn = (step, answer) => run('check', { step, mail: nm, roles: {}, answer });
  check('new subject: "question" → not ok', !(await cn('new_subject', 'question')).ok);
  check('new subject: specific → ok', (await cn('new_subject', 'Missed science on Tuesday')).ok);
  check('new opener: reason → ok (no thank-you needed)', (await cn('new_thanks', 'I was absent on Tuesday becuase I was sick.')).ok);
  const vb = await cn('new_body', 'I was sick.');
  check('new body: no request → not ok', !vb.ok, vb.feedback);
  check('new body: clear request → ok', (await cn('new_body', 'Could you tell me what I missed in class on Tuesday and if there was any homework?')).ok);
  const nw = await run('whole', { mail: nm, roles: {}, answer: 'Dear Mrs. Lee,\n\nI was absent on Tuesday because I was sick. Could you tell me what I missed and if there was homework?\n\nThank you for your help.\n\nThank you,\nBurke' });
  check('new whole: good draft → all ok', (nw.items || []).length === 6 && nw.items.every(i => i.ok), JSON.stringify(nw.items));
  const spS = await run('polish', { parts: { subject: 'Missed sciense on Tuesday', body: 'could you tell me what i missed' } });
  const spU = R.usableIssues((spS.issues || []).filter(x => x.part !== 'subject' || x.kind === 'spelling'), { subject: 'Missed sciense on Tuesday', body: 'could you tell me what i missed' });
  check('polish: subject gets spelling only', spU.filter(x => x.part === 'subject').every(x => x.kind === 'spelling') && spU.some(x => x.part === 'subject' && /science/.test(x.options.find(o => o.ok).text)), JSON.stringify(spS.issues));
  /* ---------- shortcuts and all-caps ---------- */
  const raw = { body: 'i was out on TUES b/c i was sick. pls send the hw and ur notes from latin class, im gonna be back thurs' };
  let fx = { ...raw };
  for (let r = 0; r < 3; r++) {
    const pr = await run('polish', { parts: fx });
    for (const x of R.polishIssues(pr.issues, fx)) { const i = R.locate(fx.body, x); if (i >= 0) fx.body = R.applyFix(fx.body, x.fragment, x.options.find(o => o.ok).text, i); }
  }
  check('shortcuts: Tuesday/Thursday spelled out', /Tuesday/.test(fx.body) && /Thursday/.test(fx.body) && !/TUES|thurs/i.test(fx.body.replace(/Thursday|Tuesday/g, '')), fx.body);
  check('shortcuts: because, please, homework, going to', /because/.test(fx.body) && /[Pp]lease/.test(fx.body) && /homework/.test(fx.body) && /going to/.test(fx.body), fx.body);
  check('shortcuts: ur → your, im → I\'m (Claude)', /your notes/.test(fx.body) && /I'm/.test(fx.body), fx.body);
  check('shortcuts: Latin capitalized', /Latin/.test(fx.body), fx.body);
  check('shortcuts: sentence capitals and end period', /^I was/.test(fx.body) && /\.$/.test(fx.body), fx.body);
  const ok2 = await run('polish', { parts: { body: 'I will see you in the IS gym on Monday. OK, I will bring my Science notes.' } });
  check('allowed words left alone (IS, OK, Science)', R.polishIssues(ok2.issues, { body: 'I will see you in the IS gym on Monday. OK, I will bring my Science notes.' }).length === 0, JSON.stringify(ok2.issues));
  const txt = await c('body', 'idk if i can play sat b/c my ankle hurts, ill lyk tmrw 👍');
  check('writing check: lots of shortcuts + emoji → not ok', !txt.ok, txt.feedback);
} catch (e) { fail++; console.log('FAIL  crashed →', e.message); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
