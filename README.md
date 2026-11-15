# Marketing OS

A local workspace for running agent-assisted marketing for several clients (small and medium-sized businesses).
Agents prepare the analysis and the ad drafts. A human decides what goes live.

## What it does

| Area | What happens | Who decides |
| --- | --- | --- |
| Checklist | Pre-launch gate per client: offer, landing page, tracking, legal reminders (DE/EU), access | You |
| Knowledge | Offer, audience, customer voice, brand rules, competitors. Every agent reads these first | You write them |
| Data | Daily ad metrics from CSV exports (Meta Ads Manager, Google Ads) or the Meta API. Imports never duplicate | Code |
| Overview | Spend, leads, CPL, CTR for the last 7 days with data, compared with the 7 days before | Code |
| Rules | Pause / scale / new creative / keep / wait per ad, from fixed thresholds in `src/lib/rules.ts` | Code |
| Reports | Weekly report. The model only explains the computed figures and fixed actions | Model writes, you read |
| Social ads | Ad drafts for Meta from the knowledge base, results, and your earlier approvals and rejections | Model drafts, you approve |
| Search ads | Google Search ad groups: keywords, negative keywords, responsive search ad texts, checked against Google's length limits (30 / 90 / 15 characters). Editable before approval | Model drafts, you edit and approve |
| Search terms | Import of the Google Ads search terms report. Fixed rules mark candidates to exclude, to review, or to add as keywords | Code flags, you decide |

Nothing is published from this app. Approved drafts are exported as CSV and uploaded by you.

## Quick start

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY to switch the agents on
npm run seed                 # optional: demo client with synthetic numbers
npm run dev                  # http://localhost:3000
```

Requires Node.js 22.13 or newer. The database uses Node's built-in SQLite, so there is no native module to compile. Node 22 prints an "ExperimentalWarning: SQLite" line on start; it can be ignored.

Without `ANTHROPIC_API_KEY` the app still runs: reports use rule-based text, draft generation is disabled.

## Weekly rhythm

1. Export last week's ads report by day as CSV and import it under **Data** (or `npm run import -- <slug> file.csv meta`).
2. **Reports** → Create report (or `npm run report -- <slug>`). Carry out pause and scale actions in the ad account yourself.
3. **Social ads** → Generate (or `npm run creatives -- <slug> 5`). Approve or reject each draft; write why you reject.
   For Google: **Search ads** → Propose (or `npm run search -- <slug> 2`), fix any over-length text, approve. Import the search terms report there every 2 to 4 weeks.
4. Export the approved drafts and build the ads in the ad platform.

## What has been verified, and what has not

- Verified here: 54 automated tests (number and date parsing, CSV imports in German and English, KPI maths, rules, idempotent imports, copy checks, Google length limits, search term rules, agent handling with a mocked model API), production build, and a browser run through client creation, checklist, knowledge, CSV import, report, approve, reject, export, delete, editing a search ad group and importing a search terms report.
- **Not verified:** real model output (no API key was available during the build), the Meta API sync (no live ad account), and CSV files exported from a live Google Ads account (the parsers were tested with files written to match Google's column names). Compare the first Meta sync against Ads Manager, especially lead counts.
- Keywords proposed by the agent are hypotheses without search volume data. Check them in Google's Keyword Planner.
- The search ads export is a worksheet for copying into Google Ads, not a Google Ads Editor import file.
- The copy checks and the legal checklist are reminders. They are not legal advice or clearance.

## Safety notes

- There is **no login**. Run it locally. Do not put it on the public internet without adding authentication.
- Keys live in `.env.local`, which is git-ignored. The database is `data/marketing.db`, also git-ignored. Back it up yourself.
- Do not store personal data of leads here. The app only needs aggregated ad metrics.
- The Meta connector is read-only (insights). There is no code path that creates or changes ads.

## Project layout

```
src/lib/db.ts              SQLite schema
src/lib/kpi.ts             KPI queries and periods
src/lib/rules.ts           Deterministic recommendations and thresholds
src/lib/importers/         CSV parser, Meta insights connector
src/lib/agents/            Analyst (reports), creative (social drafts) and search (Google) agents
src/lib/search.ts          Google Search formats and length checks
src/lib/searchTerms.ts     Search terms report import and rules
src/lib/compliance.ts      Copy checks and the launch checklist
src/app/                   Pages and server actions
scripts/                   CLI: seed, import, report, creatives
tests/                     Vitest
.claude/skills/            Workflows for Claude Code in this repo
docs/ROADMAP.md            What to build next, and when it is worth it
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | App |
| `npm test` | Tests |
| `npm run typecheck`, `npm run lint` | Checks |
| `npm run seed` | Recreate the demo client |
| `npm run import -- <slug> <file.csv> [meta\|google\|other]` | Import metrics |
| `npm run report -- <slug>` | Weekly report |
| `npm run creatives -- <slug> [count] [brief]` | Social ad drafts |
| `npm run search -- <slug> [ad groups] [brief]` | Google Search ad group proposals |
