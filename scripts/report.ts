import "./_env";
import { generateReport } from "../src/lib/agents/analyst";
import { getClientBySlug, listClients } from "../src/lib/clients";
import { db } from "../src/lib/db";

const slug = process.argv[2];
const client = slug ? getClientBySlug(slug) : null;
if (!client) {
  console.error(`Usage: npm run report -- <client-slug>\nClients: ${listClients().map((c) => c.slug).join(", ") || "(none)"}`);
  process.exit(1);
}
const res = await generateReport(client);
if (!res) {
  console.error("No data for this client yet. Import metrics first.");
  process.exit(1);
}
const row = db().prepare("SELECT narrative FROM reports WHERE id = ?").get(res.id) as { narrative: string };
console.log(`Report #${res.id} (${res.source})${res.llmError ? ` — LLM failed, rule-based text used: ${res.llmError}` : ""}\n`);
console.log(row.narrative);
