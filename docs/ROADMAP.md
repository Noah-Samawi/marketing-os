# Roadmap

Build the next step only when the trigger is real. Each step adds maintenance.

| Step | Trigger | Notes |
| --- | --- | --- |
| Login and hosted deployment | A second person needs access, or you want it on a server | Add authentication first. Move SQLite to Postgres (e.g. Supabase) at the same time |
| Scheduled weekly sync and report | Meta sync verified against Ads Manager for 2 to 3 weeks | A cron job calling the import and `npm run report` |
| Google Ads API connector | A client runs Google Ads and CSV export becomes a chore | Needs a developer token; approval takes time |
| Image generation for approved drafts | Copy drafts are regularly approved | Generate from `visual_concept`; check AI labelling rules |
| Creative scoring agent | More than about 20 drafts per week | A second model pass that scores drafts against the brand rules |
| Push approved ads as paused drafts to Meta | Many weeks of manual uploads without surprises | Write access is the riskiest step. Create as PAUSED only, keep the budget cap in the ad account |
| Lead and revenue data from the CRM | You want cost per customer, not only cost per lead | Personal data: needs a data processing agreement and a deletion concept |
| Airbyte + ClickHouse warehouse | Several clients with many sources and long history | Not before SQLite or Postgres is actually too small |
| WhatsApp follow-up | Only after opt-in or click-to-WhatsApp ads | Official Business API only. No cold outreach |
