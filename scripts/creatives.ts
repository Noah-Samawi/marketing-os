import "./_env";
import { generateCreatives } from "../src/lib/agents/creative";
import { getClientBySlug, listClients } from "../src/lib/clients";

const [slug, countArg, ...brief] = process.argv.slice(2);
const client = slug ? getClientBySlug(slug) : null;
if (!client) {
  console.error(`Usage: npm run creatives -- <client-slug> [count] [brief]\nClients: ${listClients().map((c) => c.slug).join(", ") || "(none)"}`);
  process.exit(1);
}
try {
  const res = await generateCreatives(client, Math.min(Math.max(Number(countArg) || 5, 1), 10), brief.join(" "));
  console.log(`${res.count} drafts saved (batch ${res.batch}). Review them in the app: nothing goes live from here.`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
