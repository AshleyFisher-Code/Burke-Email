// Everything Claude is told. The app grades the tap decisions with fixed rules (js/rules.js);
// Claude reads the email and judges his writing.

export const MOM_EMAIL = 'ashley@ashleyfisher.com';

export const SYSTEM = `You are the email coach inside a phone app that teaches Burke Fisher, a 7th grader, to answer emails from his teachers, advisor, coaches and other school staff by himself.

About his school: it uses an advisory model. Staff email him personally about things specific to him (class-wide news goes through Google Classroom, not email), and they often copy his advisor or another adult (an athletic director might copy the trainer). Teachers go by Mr. or Mrs. plus their last name.

Hard rules:
- Never write his email or any part of it for him. Never give him a full sentence he could copy into his email. You may say what is missing and offer a starter of four words or fewer.
- Burke has dysgraphia. Never mark him wrong for spelling, capital letters or punctuation, except in the polish task, which exists only for that.
- Talk to him directly ("you"), warmly and plainly, at a 7th-grade reading level. One or two short sentences. No exclamation-point cheerleading, no lecturing.
- His mom's address is ${MOM_EMAIL}.
- Texting shortcuts (u, pls, b/c, idk, gonna, tmrw, hw…) and emoji don't belong in school email. In the writing steps, if a piece has three or more shortcuts or any emoji, ok = false and ask him to spell words out / take out the emoji (the final check fixes the odd one or two, so fewer than three is not by itself a reason to fail; the step's own rules still apply, e.g. a one-word answer is still too short). "yeah" is too casual for a teacher.`;

/* ---------- 1. read the email from screenshots or pasted text ---------- */
const person = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Full name as shown, or "" if only an address' },
    email: { type: 'string', description: 'Address if visible, else ""' },
    title: { type: 'string', enum: ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Coach', ''], description: 'Only if the email shows it (signature, sign-off, display name). Do not guess from a first name.' },
    lastName: { type: 'string' },
    isGroup: { type: 'boolean', description: 'A list or office address (e.g. 7thgrade@, athletics@) rather than one person' },
  },
  required: ['name', 'email', 'title', 'lastName', 'isGroup'],
};
export const READ_TOOL = {
  name: 'email_read',
  description: 'Report what is in the email Burke received.',
  input_schema: {
    type: 'object',
    properties: {
      readable: { type: 'boolean', description: 'false if this is not an email or too blurry/cut off to read the message' },
      problem: { type: 'string', description: 'If something is missing, one short instruction for Burke, else ""' },
      recipientsComplete: { type: 'boolean', description: 'false if the recipient list is collapsed (e.g. Gmail shows "to me, Kent +2" or only "to me" without the details opened) so you cannot see everyone' },
      subject: { type: 'string' },
      body: { type: 'string', description: 'The newest message only, word for word, without quoted older replies or footers' },
      sender: person,
      recipients: {
        type: 'array',
        description: 'Everyone on To and Cc. Include Burke himself (Gmail shows him as "me").',
        items: { type: 'object', properties: { ...person.properties,
          field: { type: 'string', enum: ['to', 'cc'] },
          isMe: { type: 'boolean', description: 'This is Burke' },
          isMom: { type: 'boolean', description: `This is his mom (${MOM_EMAIL} or labeled as his mother)` },
        }, required: [...person.required, 'field', 'isMe', 'isMom'] },
      },
      asks: { type: 'array', items: { type: 'string' }, description: 'Each separate thing the sender wants Burke to answer, do, bring or confirm, in plain words. Empty if nothing.' },
      replyNeeded: { type: 'boolean' },
      replyWhy: { type: 'string', description: 'One sentence to Burke explaining why it does or does not need a reply' },
      ccMom: { type: 'boolean' },
      ccMomWhy: { type: 'string', description: 'One sentence to Burke explaining the CC-Mom call' },
      topic: { type: 'string', description: '3 to 6 words, e.g. "Makeup quiz on Friday"' },
    },
    required: ['readable', 'problem', 'recipientsComplete', 'subject', 'body', 'sender', 'recipients', 'asks', 'replyNeeded', 'replyWhy', 'ccMom', 'ccMomWhy', 'topic'],
  },
};
export const READ_INSTRUCTIONS = `Read the email Burke received (screenshots and/or pasted text below) and fill in email_read.

- If the screenshots show a thread, use the newest message addressed to Burke.
- replyNeeded: true if it asks him a question, asks him to do or confirm something, or is a personal note to him that deserves a thank-you. false only for automated notices, newsletters or pure FYI sent to a list.
- ccMom (Burke decides whether to copy his mom, then is told if he was right):
  true when the email is about asking to meet, moving a test, quiz or deadline, extensions, missing or late work, grades, an injury or health, an absence, behavior or any problem, or anything a parent would need to plan around.
  false for a quick thank-you, a simple "got it", a reminder he just confirms, or routine logistics he can handle himself.
  If his mom is already on the email, ccMom is false and ccMomWhy says she's already on it, so Reply all includes her.
- title: Mr./Mrs./Ms./Dr./Coach only when the email shows it. If the sender signs with just a name, leave title "" (the app asks Burke).
- If the To/Cc details are collapsed, set recipientsComplete false and problem to: "Tap the little arrow next to the names at the top so everyone shows, then take the screenshot again."`;

/* ---------- 2. check one piece of his writing ---------- */
export const CHECK_TOOL = {
  name: 'step_check',
  description: 'Judge one piece of Burke\'s reply.',
  input_schema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      feedback: { type: 'string', description: 'One or two sentences to Burke. If ok, say specifically what worked. If not, say what to change without writing it for him.' },
    },
    required: ['ok', 'feedback'],
  },
};
export const STEP_RULES = {
  understand: `Burke was asked "What is the sender asking you to do?" and answered in his own words.
ok = his answer captures every item in the asks list (his words, any spelling). If he only got some, ok = false and tell him what he got and roughly where to look for the rest ("there's one more thing in the second paragraph"), without saying what it is.
If the asks list is empty, ok = true when he says it's just information / nothing to do.`,
  thanks: `This is the first sentence of his reply: a thank-you opener.
ok = one polite sentence that thanks them (for the email, for letting him know, for the reminder, for reaching out, for a specific thing). Fine if short, but a single word ("thanks", "thx", "ty") is not a sentence: ask him to say what he's thanking them for. Not ok if there's no thanks, it's sarcastic, or it already starts answering the question (that goes in the next part).`,
  body: `This is the main part of his reply, after the thank-you.
ok = it answers every item in the asks list, gives specifics the sender needs (a day, a time, what he'll bring, which option he picks), is polite, and suits everyone on the email (people were copied on purpose). Under about six sentences. No slang, no blaming, no "u"/"ur".
A short, direct answer to each ask is enough; don't ask for more detail than the sender needs to act. If something is missing, name which ask is unanswered or what detail is missing. Ignore spelling and punctuation.`,
  closing: `This is his closing line, the last sentence before the sign-off.
ok = one polite sentence that wraps up: thanks again, says he'll do the thing, says see you at a time, or offers to answer questions. Not ok if it's empty, rude, or a repeat of the whole answer.`,
};
export const WHOLE_TOOL = {
  name: 'draft_check',
  description: 'Check Burke\'s whole draft part by part.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: { type: 'object', properties: {
          part: { type: 'string', enum: ['greeting', 'thanks', 'answer', 'closing', 'signoff', 'tone'] },
          ok: { type: 'boolean' },
          note: { type: 'string', description: 'One short sentence. If not ok, what to change without writing it for him.' },
        }, required: ['part', 'ok', 'note'] },
      },
    },
    required: ['items'],
  },
};
export const WHOLE_RULES = `Burke wrote his whole reply himself. Check each part and return all six items:
- greeting: "Dear"/"Hello"/"Hi" + the right title and last name + a comma (e.g. Dear Mrs. Kent,). Not "Hey", not a first name.
- thanks: a thank-you sentence near the start.
- answer: answers every item in the asks list. A short, direct answer to each ask is enough ("my ankle feels better" answers "how does it feel"). Only mark it not ok if an ask is unanswered or a needed specific is missing (e.g. they offered two days and he didn't pick one). Don't ask for more detail than the sender needs.
- closing: a polite wrap-up sentence before the sign-off.
- signoff: "Thank you," / "Best," / "Sincerely," on its own line, then "Burke".
- tone: polite, no slang, right for everyone copied.
Ignore spelling, capitals and punctuation except the greeting comma.`;

/* ---------- 3. an example from a different situation, for when he's stuck ---------- */
export const EXAMPLE_TOOL = {
  name: 'example',
  description: 'A model of one part of an email, for a different situation.',
  input_schema: { type: 'object', properties: {
    situation: { type: 'string', description: 'One line: who emailed and what they asked, in the made-up situation' },
    text: { type: 'string', description: 'The model text for that part only' },
  }, required: ['situation', 'text'] },
};
export const EXAMPLE_RULES = `Burke is stuck on one part of his reply. Show him a model of that same part for a DIFFERENT, made-up school situation: a different adult, a different subject and a different request from his email, so he sees the pattern but cannot copy it. Keep it short and natural for a 7th grader.`;

/* ---------- 4. polish: spelling, capitals, punctuation ---------- */
export const POLISH_TOOL = {
  name: 'polish',
  description: 'Mechanical fixes in Burke\'s writing, each as a tap choice.',
  input_schema: {
    type: 'object',
    properties: {
      issues: {
        type: 'array',
        items: { type: 'object', properties: {
          part: { type: 'string', description: 'Which piece of his writing: one of the keys you were given' },
          kind: { type: 'string', enum: ['spelling', 'spellout', 'capital', 'punctuation'] },
          fragment: { type: 'string', description: 'Copied character for character from his text, as short as possible but appearing only once in that part' },
          options: { type: 'array', description: '2 or 3 choices. Exactly one ok. For spelling include his version as a wrong choice.',
            items: { type: 'object', properties: { text: { type: 'string' }, ok: { type: 'boolean' } }, required: ['text', 'ok'] } },
          why: { type: 'string', description: 'A few words, e.g. "Sentences start with a capital." or "" for plain spelling' },
        }, required: ['part', 'kind', 'fragment', 'options', 'why'] },
      },
    },
    required: ['issues'],
  },
};
export const POLISH_RULES = `Find only mechanical mistakes in Burke's writing: misspelled words (including sound-alike mix-ups like there/their, to/too), missing capitals (start of a sentence, "I", names, days, months, Mr./Mrs., and language names like Latin, English, Spanish), missing end punctuation, missing apostrophes in contractions (dont, im), texting shortcuts, and ALL-CAPS words.
- Texting shortcuts and shortened words get kind "spellout", and the right option is the WHOLE word or phrase with correct capitals: ur → your or you're (whichever fits), prob → probably or problem, pres → presentation, lit → literature, geo → geography or geometry (whichever fits), 2/4 used as words → to/for, gonna → going to, emoji-free words, etc. Never offer a shortened form (like "Tues." or "TUES") as the right answer.
- An ALL-CAPS word (other than allowed abbreviations) is fixed to normal capitals in one issue.
- These are fine; never flag them: IS, LS, US (school divisions), PE, STEM, JV, OK, okay, iPad, PDF, a.m., p.m., Mr., Mrs., Ms., Dr., math, gym, quiz, info, test.
- Subject names other than languages (science, biology, history, math…) are fine with or without a capital; never flag their capitals either way.
Do not change his wording, word choice, style or grammar beyond that. If the part is not "whole", do not flag a greeting or sign-off (the app built those). For "whole", also check that the greeting ends with a comma and that Mr./Mrs. and names are capitalized.
Each issue becomes a tap choice: the fragment is replaced by whichever option he taps. For a missing period at the end, the fragment is the last word and the right option is that word plus the period. If one word needs more than one fix (for example a capital AND the final period, like saturday → Saturday.), make it ONE issue whose right option has every fix; never list two issues on the same words. Make each fragment appear exactly once in its part (widen it by a word if needed). For the "subject" part, flag only misspelled words (subject lines don't need periods or sentence capitals). Return an empty list if it's clean.`;

/* ---------- 5. a made-up email for practice ---------- */
export const PRACTICE_TOOL = { ...READ_TOOL, name: 'practice_email', description: 'A realistic made-up email to Burke for practice, described the same way as a real one.' };
export const PRACTICE_RULES = `Write a realistic made-up email to Burke Fisher from an adult at his school for practice, then describe it exactly as email_read would.
- 50 to 140 words, the way real teachers write. The sender signs with Mr./Mrs. + last name (or Coach for a coach), and the title field matches.
- Use made-up names and addresses at @school.example. Burke is burke.fisher@school.example (isMe true).
- Follow the scenario you're given, including who is copied. Never copy his mom unless the scenario says so.
- readable true, recipientsComplete true, problem "".`;

export const SCENARIOS = [
  'A teacher says he missed a quiz while out sick and asks which day next week he can make it up (Tue or Thu during lunch). His advisor is copied.',
  'The athletic director asks if he will be at Saturday\'s game, since he mentioned a sore ankle. The trainer is copied.',
  'A teacher reminds him his book report is due Friday and asks him to confirm he has the book. Only Burke is on it.',
  'His advisor asks to meet briefly this week about his schedule and asks what time works.',
  'A teacher says his lab worksheet is missing and asks him to turn it in by Wednesday. His advisor is copied.',
  'A coach sends a quick thank-you for helping carry equipment. Only Burke is on it.',
  'A teacher offers extra help before the test and asks if he wants to come Monday or Wednesday morning.',
  'A teacher says his project partner is out and asks whether he can present alone on Thursday or would rather wait. His advisor and the learning specialist are copied.',
  'The school nurse asks him to bring a signed form for his allergy medicine by Friday. His advisor is copied.',
  'A teacher answers a question he asked about the homework and says to let her know if anything else is unclear. Only Burke is on it.',
  'A teacher says the grade on his last test was lower than usual and invites him to talk about it. His advisor is copied.',
  'A club advisor asks whether he can help set up for the science fair after school on Tuesday. Another teacher is copied.',
  'A teacher asks two things: whether he has chosen his history project topic, and whether he needs more time on the outline. His advisor is copied.',
  'His advisor asks how the first week back after his absence went and whether he has caught up on missed work in math and science.',
];

/* ---------- NEW emails Burke starts himself ---------- */
export const PURPOSES = {
  missed: 'He missed a class and needs to find out what he missed / catch up',
  testHelp: 'He wants extra help before a test or quiz',
  meeting: 'He wants to set up a meeting about something',
  extension: 'He needs more time on an assignment, or has missing work',
  question: 'He has a question about an assignment',
  injury: 'He is hurt or sick and can\'t play or practice',
  other: 'Something else',
};
export const composeBlock = m => `BURKE IS STARTING A NEW EMAIL (not a reply).
To: ${m.sender && m.sender.name || '?'} (${m.toRole || 'school staff'})${m.about ? `, about ${m.about}` : ''}
Why he's writing: ${PURPOSES[m.purpose] || m.purpose || '?'}
His plan, in his own words: ${m.plan ? JSON.stringify(m.plan) : '(not written yet)'}
${m.asks && m.asks.length ? `What the email must say: ${JSON.stringify(m.asks)}` : ''}`;

export const PLAN_TOOL = {
  name: 'plan_check',
  description: 'Check Burke\'s plan for a new email and decide who should be copied.',
  input_schema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean', description: 'true if the plan says what he needs and the key facts the reader will need' },
      feedback: { type: 'string', description: 'One or two sentences to Burke. If not ok, ask about the one missing fact (which day, which test, when he is free…) without writing it for him.' },
      topic: { type: 'string', description: '3 to 6 words, e.g. "Missed science on Tuesday"' },
      mustInclude: { type: 'array', items: { type: 'string' }, description: '2 to 4 short items the email must say, in plain words, from HIS plan (e.g. "Which day you missed", "Ask what you missed", "When you could come in"). Never invent facts he did not give.' },
      ccMom: { type: 'boolean' }, ccMomWhy: { type: 'string', description: 'One sentence to Burke' },
      ccAdvisor: { type: 'boolean' }, ccAdvisorWhy: { type: 'string', description: 'One sentence to Burke' },
      ccTrainer: { type: 'boolean' }, ccTrainerWhy: { type: 'string', description: 'One sentence to Burke' },
    },
    required: ['ok', 'feedback', 'topic', 'mustInclude', 'ccMom', 'ccMomWhy', 'ccAdvisor', 'ccAdvisorWhy', 'ccTrainer', 'ccTrainerWhy'],
  },
};
export const PLAN_RULES = `Burke is about to write a new email. He was asked: "What happened, and what do you need from them?" He answered in his own words (spelling doesn't matter).
ok = it says what he needs (what he missed, help, a meeting, more time, an answer…) plus the key facts the reader needs for this purpose:
- missed class: which day/class he missed (and why only if he gave it).
- help before a test: which test and roughly when it is, and when he could meet.
- meeting: what it's about and when he's free.
If one key fact is missing, ok = false and ask about just that fact. Don't demand more than the reader needs.

Who should be copied (Cc) on this new email:
- his mom: true for asking to meet, an absence or missed class, moving a test or deadline, an extension or missing work, grades, an injury or being sick, or any problem. false for extra help before a test, a simple question about an assignment, or a thank-you.
- his advisor: true for a missed test or quiz, an extension or missing work, grades, a problem or conflict, a meeting about a concern, or missing more than one day. false for extra help, a simple question, one missed class where he's just asking what he missed, or a thank-you. Always false if he's writing TO his advisor.
- the trainer: true only when he's writing to a coach or athletic director about an injury or being unable to play or practice. Always false if he's writing TO the trainer.
Each Why sentence explains the call to Burke in plain words.`;

Object.assign(STEP_RULES, {
  new_subject: `This is the SUBJECT LINE of his new email.
ok = 2 to 8 words that name the topic specifically (the class, test, or day when it matters), like a label. Not ok: vague ("Hi", "Question", "Help", "Email", "Hello"), a whole sentence, or all capital letters. Ignore capitalization and spelling.`,
  new_thanks: `This is the opening of his NEW email, right after the greeting.
ok = one or two polite sentences that say why he's writing (e.g. starting "I'm writing to ask…" or "I was absent on…"). A friendly line first ("I hope you're having a good week.") is fine, but the reason must also be there. This is not a reply, so don't require a thank-you. Not ok if the reason is missing, or it's rude or too casual.`,
  new_body: `This is the main part of his NEW email, after the opening.
ok = together with what he already wrote in his opening (shown as "what he has written so far"), it covers each item in "What the email must say" with the specifics the reader needs. Don't make him repeat something his opening already says (which day, which test, days/times he's free), and makes a clear, polite request (a question, or "Could I…", "Would you be able to…"). Short and direct is enough. Not ok if an item is missing or there's no clear request. Ignore spelling and punctuation.`,
  new_closing: `This is the closing line of his NEW email, before the sign-off.
ok = one polite sentence that thanks them for their help or time, or says he looks forward to hearing back. Not ok if empty, rude, or a repeat of the request.`,
});

export const NEW_WHOLE_TOOL = {
  name: 'new_draft_check',
  description: 'Check Burke\'s whole new email part by part.',
  input_schema: {
    type: 'object',
    properties: {
      items: { type: 'array', items: { type: 'object', properties: {
        part: { type: 'string', enum: ['greeting', 'purpose', 'request', 'closing', 'signoff', 'tone'] },
        ok: { type: 'boolean' },
        note: { type: 'string', description: 'One short sentence. If not ok, what to change without writing it for him.' },
      }, required: ['part', 'ok', 'note'] } },
    },
    required: ['items'],
  },
};
export const NEW_WHOLE_RULES = `Burke wrote a whole NEW email himself (the subject line is separate). Check each part and return all six items:
- greeting: "Dear"/"Hello" + the right title and last name + a comma. Not "Hey", not a first name.
- purpose: near the start, says why he's writing.
- request: covers each item in "What the email must say" with the specifics needed, and asks clearly and politely.
- closing: a polite wrap-up sentence (thanks for your help/time, or looking forward to hearing back).
- signoff: "Thank you," / "Best," / "Sincerely," on its own line, then "Burke".
- tone: polite, no slang, right for a teacher.
A short, direct email is fine. Ignore spelling, capitals and punctuation except the greeting comma.`;
