# Email Coach

Phone-first app that teaches Burke to answer school email himself: screenshot the email, then step by step decide who's on it, whether it needs an answer, Reply vs Reply all, whether to CC Mom, and write each part (greeting, thank-you, answer, closing, sign-off). The coach never writes the email for him.

- `js/rules.js`: everything graded by fixed rules (Reply/Reply all, CC Mom, greeting, sign-off, levels). `node tests/test.mjs` must pass.
- `functions/`: the Firebase Cloud Function that holds the Claude key and does all database writes. `functions/prompts.js` is everything Claude is told.
- `tests/ui.mjs`: phone-size walkthrough with a stand-in coach (`?mock=1` on localhost only).
- Same Firebase project and logins as Latin Practice.
