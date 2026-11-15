---
name: weekly-review
description: Run the weekly marketing review for one client in this repo - import the latest metrics, create the report, propose new ad drafts, and hand the decisions to the human. Use when asked for a weekly review, weekly report, or "what should we do this week" for a client.
---

# Weekly review

Input: a client slug (list them with `npm run report`) and, if available, the path to this week's CSV export.

1. **Data.** If the user gave a CSV: `npm run import -- <slug> <file> <meta|google|other>`. Read the output: check the mapped columns and whether a leads column was found. If there is no new data, say so and stop; do not report on stale numbers as if they were new.
2. **Report.** `npm run report -- <slug>`. Show the report as printed.
3. **Sanity check.** Look at the figures before passing them on. Flag anything implausible (zero impressions with spend, CTR above 10 %, a lead count that jumped several times over). A tracking error is more likely than a miracle.
4. **Drafts.** Only if the knowledge base is filled: `npm run creatives -- <slug> 5 "<brief>"`. Build the brief from the report: which angle won, which ad needs a new hook.
5. **Google clients.** If the client runs Google Search: ask for the search terms report every 2 to 4 weeks (imported in the app under Search ads). New ad groups: `npm run search -- <slug> 2 "<brief>"`. Over-length headlines are flagged, not cut: the human fixes them.
6. **Hand over.** Tell the human, in this order: actions to carry out in the ad account (pause, scale), drafts waiting in the app under Creatives, open questions.

Never carry out an action in an ad account. Never mark a draft approved yourself.
