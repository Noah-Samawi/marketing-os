import "./_env";
import { generateAdGroups } from "../src/lib/agents/search";
import { getClientBySlug, listClients } from "../src/lib/clients";

const [slug, countArg, ...brief] = process.argv.slice(2);
const client = slug ? getClientBySlug(slug) : null;
if (!client) {
  console.error(`Usage: npm run search -- <client-slug> [ad groups] [brief]\nClients: ${listClients().map((c) => c.slug).join(", ") || "(none)"}`);
  process.exit(1);
}
try {
  const res = await generateAdGroups(client, Math.min(Math.max(Number(countArg) || 2, 1), 4), brief.join(" "));
  console.log(`${res.count} ad group(s) saved (batch ${res.batch}). Review them in the app under Search ads: nothing is uploaded from here.`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
