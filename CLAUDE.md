# Marketing OS — rules for agents working in this repo

See `AGENTS.md` for the Next.js version notes and `README.md` for the overview.

## Hard rules
- Never publish, create, change or pause ads on any ad platform. This repo has read-only connectors on purpose. Prepare; the human decides.
- All figures in reports come from `src/lib/kpi.ts` and `src/lib/rules.ts`. Do not let a model compute or invent numbers.
- Never invent facts about a client: no made-up prices, references, testimonials or results. If the knowledge base lacks it, ask.
- No personal data of leads in the database, in prompts, or in commits.
- Never commit `.env.local` or `data/*.db`.
- Legal items (consent, Impressum, DPA, AI labelling, UWG) are reminders. Do not tell the user something is legally cleared.

## Working on the code
- Run `npm test`, `npm run typecheck` and `npm run lint` before saying a change works.
- Changing a threshold in `rules.ts` changes real recommendations: update the tests and say so.
- The Meta connector is unverified against a live account until the README says otherwise.

## Operating for a client
- Use the skills in `.claude/skills/`: `client-onboarding` for a new client, `weekly-review` for the weekly loop.
- Client slugs: `npm run report` without arguments lists them.
