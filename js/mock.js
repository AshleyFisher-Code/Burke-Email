// Test stand-in for the server function (only loads on localhost with ?mock=1). Never used by the real app.
const AD_EMAIL = {
  readable: true, problem: '', recipientsComplete: true, subject: 'Saturday game', topic: 'Ankle and Saturday\'s game',
  body: 'Hi Burke,\n\nYou mentioned your ankle was sore after practice. Are you planning to play Saturday? Please let us know how it feels today.\n\nThanks,\nMr. Grant',
  sender: { name: 'Tom Grant', email: 'tgrant@school.example', title: 'Mr.', lastName: 'Grant', isGroup: false },
  recipients: [
    { name: 'Burke Fisher', email: 'burke.fisher@school.example', title: '', lastName: 'Fisher', isGroup: false, field: 'to', isMe: true, isMom: false },
    { name: 'Dana Kent', email: 'dkent@school.example', title: 'Mrs.', lastName: 'Kent', isGroup: false, field: 'cc', isMe: false, isMom: false },
  ],
  asks: ['Say whether he plans to play Saturday', 'Say how his ankle feels today'],
  replyNeeded: true, replyWhy: 'Mr. Grant asked you two questions.',
  ccMom: true, ccMomWhy: 'It\'s about an injury, so Mom gets a copy.',
};
const COLLAPSED = { ...AD_EMAIL, recipientsComplete: false, problem: 'Tap the little arrow next to the names at the top so everyone shows, then take the screenshot again.' };
let progress = { level: 1, recent: [] }; const saved = [];
const wait = ms => new Promise(r => setTimeout(r, ms));

export async function coachMock({ action, ...d }) {
  await wait(150);
  switch (action) {
    case 'progress': return { progress, sessions: saved.slice().reverse() };
    case 'read': return /collapsed/.test(d.text || '') ? COLLAPSED : AD_EMAIL;
    case 'practice': return { ...AD_EMAIL, practice: true, scenario: d.scenario };
    case 'plan': {
      const a = d.answer.toLowerCase();
      const ok = /tuesday|monday|thursday|friday|wednesday/.test(a);
      return { ok, feedback: ok ? 'You said what happened and what you need.' : 'Which day did you miss?', topic: 'Missed science on Tuesday',
        mustInclude: ['Which day you missed', 'Ask what you missed and the homework'],
        ccMom: true, ccMomWhy: 'You missed school, so Mom gets a copy.', ccAdvisor: false, ccAdvisorWhy: 'One missed class is just between you and Mrs. Lee.', ccTrainer: false, ccTrainerWhy: 'Not about an injury.' };
    }
    case 'check': {
      const a = d.answer.toLowerCase();
      if (d.step === 'new_subject') return a.split(/\s+/).length >= 2 ? { ok: true, feedback: 'Clear and specific.' } : { ok: false, feedback: 'Say what it\'s about, like the class and the day.' };
      if (d.step === 'new_thanks') return /writing|absent|missed|out/.test(a) ? { ok: true, feedback: 'You said why you\'re writing.' } : { ok: false, feedback: 'Say why you\'re writing.' };
      if (d.step === 'new_body') return /\?|could/.test(a) ? { ok: true, feedback: 'Clear request.' } : { ok: false, feedback: 'Ask what you missed.' };
      if (d.step === 'new_closing') return a.length > 8 ? { ok: true, feedback: 'Polite.' } : { ok: false, feedback: 'Thank her for her help.' };
      if (d.step === 'understand') return /play|saturday/.test(a) && /ankle|feel/.test(a) ? { ok: true, feedback: 'You caught both questions.' } : { ok: false, feedback: 'You got one part. There\'s one more question in the email.' };
      if (d.step === 'body') return /saturday|play/.test(a) && /ankle|feel|better/.test(a) ? { ok: true, feedback: 'You answered both questions.' } : { ok: false, feedback: 'Say how your ankle feels today too.' };
      return a.length > 8 ? { ok: true, feedback: 'That works.' } : { ok: false, feedback: 'Make it a full sentence.' };
    }
    case 'whole': {
      const t = d.answer;
      if (d.mail.compose) return { items: [
        { part: 'greeting', ok: /^(dear|hello) mrs\. lee,/i.test(t.trim()), note: 'Start with Dear Mrs. Lee,' },
        { part: 'purpose', ok: /absent|missed|writing/i.test(t), note: 'Say why you\'re writing.' },
        { part: 'request', ok: /\?/.test(t), note: 'Ask what you missed.' },
        { part: 'closing', ok: true, note: 'Good.' }, { part: 'signoff', ok: /burke\s*$/i.test(t.trim()), note: 'Sign off with your name.' }, { part: 'tone', ok: true, note: 'Polite.' }] };
      return { items: [
        { part: 'greeting', ok: /^(dear|hello|hi) mr\. grant,/i.test(t.trim()), note: 'Start with Dear Mr. Grant, and a comma.' },
        { part: 'thanks', ok: /thank/i.test(t), note: 'Thank him near the start.' },
        { part: 'answer', ok: /saturday|play/i.test(t) && /ankle|feel/i.test(t), note: 'Answer both questions.' },
        { part: 'closing', ok: true, note: 'Good wrap-up.' },
        { part: 'signoff', ok: /burke\s*$/i.test(t.trim()), note: 'End with a sign-off and your name.' },
        { part: 'tone', ok: true, note: 'Polite.' }] };
    }
    case 'example': return { situation: 'Mrs. Ruiz asked if you can bring your permission slip by Monday.', text: 'Thank you for the reminder about the field trip.' };
    case 'polish': {
      const issues = [];
      for (const [part, t] of Object.entries(d.parts)) {
        if (t.includes('becuase')) issues.push({ part, kind: 'spelling', fragment: 'becuase', options: [{ text: 'because', ok: true }, { text: 'becuase', ok: false }], why: '' });
        if (/(^|\. )i /.test(t) || t.includes(' i ')) issues.push({ part, kind: 'capital', fragment: t.includes(' i ') ? ' i ' : 'i ', options: [{ text: t.includes(' i ') ? ' I ' : 'I ', ok: true }, { text: t.includes(' i ') ? ' i ' : 'i ', ok: false }], why: '"I" is always a capital.' });
        if (/[a-z]$/i.test(t.trim())) { const w = t.trim().split(/\s+/).at(-1); issues.push({ part, kind: 'punctuation', fragment: w, options: [{ text: w + '.', ok: true }, { text: w, ok: false }], why: 'Sentences end with a period.' }); }
      }
      return { issues };
    }
    case 'save': if (!d.preview) { saved.push({ ...d.session, at: Date.now() }); progress = { ...progress, ...d.progress }; } window.__saved = saved; return { saved: !d.preview };
    case 'setLevel': progress = { ...progress, level: d.level, recent: [] }; return { level: d.level };
  }
  throw new Error('mock: unknown ' + action);
}
