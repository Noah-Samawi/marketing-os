import Link from "next/link";
import { DayBars } from "@/components/DayBars";
import { Flash } from "@/components/Flash";
import { actionLabel, buildReportData } from "@/lib/agents/analyst";
import { BRAIN, getBrain, isFilled } from "@/lib/brain";
import { CHECKLIST } from "@/lib/compliance";
import { db } from "@/lib/db";
import { int, money, pct, signedPct } from "@/lib/format";
import { addDays, change, dailySeries } from "@/lib/kpi";
import { loadClient, type PageArgs } from "@/lib/page";
import type { RecommendationAction } from "@/lib/types";

const BADGE: Record<RecommendationAction, string> = { pause: "badge-bad", scale: "badge-good", refresh_creative: "badge-warn", keep: "", wait: "" };

function Tile({ label, value, delta, goodWhenDown, neutral }: { label: string; value: string; delta: number | null; goodWhenDown?: boolean; neutral?: boolean }) {
  // Spend going up or down is neither good nor bad by itself, so it gets no colour.
  const good = neutral || delta === null || Math.abs(delta) < 0.005 ? null : goodWhenDown ? delta < 0 : delta > 0;
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="small muted">{label}</div>
      <div className="text-2xl font-semibold num mt-1">{value}</div>
      <div className="small num mt-1" style={{ color: good === null ? "var(--muted)" : good ? "var(--good)" : "var(--bad)" }}>
        {delta === null ? "no previous week" : `${signedPct(delta, "en")} vs. previous 7 days`}
      </div>
    </div>
  );
}

export default async function Overview(args: PageArgs) {
  const { client, sp } = await loadClient(args);
  const d = buildReportData(client);
  const L = client.language;
  const m = (v: number | null) => money(v, client.currency, L);

  const brain = getBrain(client.id);
  const brainMissing = BRAIN.filter((b) => !isFilled(b.kind, brain[b.kind])).map((b) => b.title);
  const done = (db().prepare("SELECT COUNT(*) AS n FROM checklist WHERE client_id = ? AND done = 1").get(client.id) as { n: number }).n;
  const drafts = (db().prepare("SELECT COUNT(*) AS n FROM creatives WHERE client_id = ? AND status = 'draft'").get(client.id) as { n: number }).n;
  const log = db().prepare("SELECT ts, actor, action, detail FROM activity_log WHERE client_id = ? ORDER BY id DESC LIMIT 8").all(client.id) as { ts: string; actor: string; action: string; detail: string }[];

  const todo: { text: string; href: string }[] = [];
  if (done < CHECKLIST.length) todo.push({ text: `Launch checklist: ${done} of ${CHECKLIST.length} done`, href: "checklist" });
  if (brainMissing.length) todo.push({ text: `Knowledge base incomplete: ${brainMissing.join(", ")}`, href: "knowledge" });
  if (!d) todo.push({ text: "No performance data yet: import a CSV export", href: "data" });
  if (client.target_cpl === null) todo.push({ text: "No target cost per lead set: rules use the account average", href: "settings" });
  if (drafts > 0) todo.push({ text: `${drafts} ad draft${drafts === 1 ? "" : "s"} waiting for your decision`, href: "creatives" });

  return (
    <div>
      <Flash sp={sp} />
      {todo.length > 0 && (
        <div className="card mb-4">
          <h2>Next steps</h2>
          <ul className="mt-2 space-y-1">
            {todo.map((t) => (
              <li key={t.href + t.text}>
                <Link className="link" href={`/clients/${client.id}/${t.href}`}>{t.text}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!d ? (
        <div className="card">
          <p>No performance data yet.</p>
          <p className="small muted mt-1">Go to Data and import a daily export from Meta Ads Manager or Google Ads.</p>
        </div>
      ) : (
        <>
          <p className="small muted mb-2 num">
            {d.period.start} to {d.period.end} (last 7 days with data), compared with {d.previous.start} to {d.previous.end}
          </p>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Tile label="Spend" value={m(d.current.spend)} delta={change(d.current.spend, d.prior.spend)} neutral />
            <Tile label="Leads" value={int(d.current.leads, L)} delta={change(d.current.leads, d.prior.leads)} />
            <Tile label="Cost per lead" value={m(d.current.cpl)} delta={change(d.current.cpl, d.prior.cpl)} goodWhenDown />
            <Tile label="Link CTR" value={pct(d.current.ctr, L)} delta={change(d.current.ctr, d.prior.ctr)} />
          </div>

          <div className="card mt-4 grid gap-6 md:grid-cols-2">
            {(() => {
              const series = dailySeries(client.id, { start: addDays(d.period.end, -27), end: d.period.end });
              return (
                <>
                  <DayBars title="Spend per day, last 28 days" data={series.map((s) => ({ date: s.date, value: s.spend }))} format={(v) => m(v)} />
                  <DayBars title="Leads per day, last 28 days" data={series.map((s) => ({ date: s.date, value: s.leads }))} format={(v) => int(v, L)} color="#b0762a" />
                </>
              );
            })()}
          </div>

          <div className="card mt-4" style={{ padding: 0 }}>
            <div className="px-5 pt-4 pb-2">
              <h2>Ads, last 7 days</h2>
              <p className="small muted">
                Recommendations come from fixed rules, not from the AI. CPL benchmark: {m(d.benchmarkCpl)}{" "}
                ({d.benchmarkSource === "target" ? "your target" : d.benchmarkSource === "account" ? "account average, no target set" : "none"}).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Ad</th>
                    <th className="r">Spend</th>
                    <th className="r">Impr.</th>
                    <th className="r">CTR</th>
                    <th className="r">Leads</th>
                    <th className="r">CPL</th>
                    <th>Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {d.ads.map((a, i) => {
                    const r = d.recommendations.find((x) => x.ad === (a.ad || a.adset || a.campaign) && x.campaign === a.campaign && x.adset === a.adset);
                    return (
                      <tr key={i}>
                        <td>
                          <div className="font-semibold">{a.ad || a.adset || "(no name)"}</div>
                          <div className="small muted">{[a.campaign, a.adset].filter(Boolean).join(" › ")}</div>
                        </td>
                        <td className="r num">{m(a.spend)}</td>
                        <td className="r num">{int(a.impressions, L)}</td>
                        <td className="r num">{pct(a.ctr, L)}</td>
                        <td className="r num">{int(a.leads, L)}</td>
                        <td className="r num">{m(a.cpl)}</td>
                        <td>
                          {r && (
                            <>
                              <span className={`badge ${BADGE[r.action]}`}>{actionLabel(r.action, "en")}</span>
                              <div className="small muted mt-1">{r.reason}</div>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {log.length > 0 && (
        <div className="card mt-4">
          <h2>Recent activity</h2>
          <ul className="mt-2 small space-y-1">
            {log.map((l, i) => (
              <li key={i} className="num">
                <span className="muted">{l.ts} UTC</span> · <span className="badge">{l.actor}</span> {l.action.replaceAll("_", " ")} <span className="muted">{l.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
