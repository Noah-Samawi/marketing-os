import Link from "next/link";
import { Flash } from "@/components/Flash";
import { listClients } from "@/lib/clients";
import { money } from "@/lib/format";
import { latestPeriod, totals } from "@/lib/kpi";
import { llmConfigured, llmModel } from "@/lib/llm";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const clients = listClients();
  const metaToken = Boolean(process.env.META_ACCESS_TOKEN);

  return (
    <div>
      <Flash sp={sp} />
      <div className="flex items-center justify-between mb-4">
        <h1>Clients</h1>
        <Link href="/clients/new" className="btn btn-primary">
          New client
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="card">
          <p>No clients yet.</p>
          <p className="muted small mt-1">
            Create your first client, or run <code>npm run seed</code> to load a demo client with synthetic numbers.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Client</th>
                <th>Channel</th>
                <th className="r">Spend, last 7 days</th>
                <th className="r">Leads</th>
                <th className="r">CPL</th>
                <th>Data until</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const p = latestPeriod(c.id);
                const k = p ? totals(c.id, p.current) : null;
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/clients/${c.id}`} className="font-semibold">
                        {c.name}
                      </Link>{" "}
                      {c.is_demo ? <span className="badge badge-warn">Demo data</span> : null}
                      <div className="small muted">{c.industry}</div>
                    </td>
                    <td>{c.channel}</td>
                    <td className="r num">{k ? money(k.spend, c.currency, c.language) : "–"}</td>
                    <td className="r num">{k ? Math.round(k.leads) : "–"}</td>
                    <td className="r num">{k ? money(k.cpl, c.currency, c.language) : "–"}</td>
                    <td className="num">{p ? p.current.end : <span className="muted">no data</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card mt-6">
        <h2>System status</h2>
        <ul className="mt-2 space-y-1 small">
          <li>
            <span className={`badge ${llmConfigured() ? "badge-good" : "badge-warn"}`}>{llmConfigured() ? "on" : "off"}</span> AI agents{" "}
            <span className="muted">
              {llmConfigured() ? `(model ${llmModel()})` : "— set ANTHROPIC_API_KEY in .env.local. Until then reports are rule-based and draft generation is disabled."}
            </span>
          </li>
          <li>
            <span className={`badge ${metaToken ? "badge-good" : ""}`}>{metaToken ? "on" : "off"}</span> Meta API sync{" "}
            <span className="muted">{metaToken ? "(read-only insights)" : "— optional. CSV import works without it."}</span>
          </li>
          <li>
            <span className="badge badge-accent">always</span> Nothing is published from this app. Approved drafts are exported and uploaded by you.
          </li>
        </ul>
      </div>
    </div>
  );
}
