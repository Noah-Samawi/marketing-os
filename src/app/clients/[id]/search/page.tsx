import { decideAdGroupAction, generateAdGroupsAction, importSearchTermsAction, updateAdGroupAction } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { LimitedLines, SubmitButton } from "@/components/ui";
import { creativeBlocker } from "@/lib/agents/creative";
import { forbiddenTerms, getBrain } from "@/lib/brain";
import { db } from "@/lib/db";
import { int, money, num } from "@/lib/format";
import { loadClient, type PageArgs } from "@/lib/page";
import { formatKeyword, rowToContent, RSA, validateAdGroup, type AdGroupRow } from "@/lib/search";
import { getSearchTerms, termsSummary, TERM_THRESHOLDS, type TermVerdict } from "@/lib/searchTerms";

const VERDICT: Record<TermVerdict, { label: string; badge: string } | null> = {
  exclude: { label: "Candidate to exclude", badge: "badge-bad" },
  review: { label: "Review", badge: "badge-warn" },
  add: { label: "Candidate keyword", badge: "badge-good" },
  none: null,
};

function host(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "example.com";
  }
}

function AdGroupCard({ row, forbidden }: { row: AdGroupRow; forbidden: string[] }) {
  const c = rowToContent(row);
  const flags = validateAdGroup(c, forbidden);
  const warns = flags.filter((f) => f.level === "warn").length;
  const usable = c.headlines.filter((h) => h.length <= RSA.headlineMax);
  const desc = c.descriptions.filter((d) => d.length <= RSA.descriptionMax);
  return (
    <div className="card" id={`ag-${row.id}`} dir="auto">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-semibold text-lg">{c.theme || "(no theme)"}</h3>
        {row.source === "demo" && <span className="badge badge-warn">demo example</span>}
        <span className={`badge ${warns ? "badge-bad" : "badge-good"}`}>{warns ? `${warns} problem${warns === 1 ? "" : "s"}` : "format ok"}</span>
        <span className="small muted num">
          #{row.id} · {row.created_at} UTC
        </span>
      </div>

      <div className="grid gap-5 md:grid-cols-2 mt-3">
        <div>
          <div className="small font-semibold mb-1">One possible combination</div>
          <div className="rounded-lg p-3" style={{ border: "1px solid var(--line)", background: "#fff" }}>
            <div className="small muted">
              <strong style={{ color: "var(--ink)" }}>Sponsored</strong> · {host(c.final_url)}
              {[c.path1, c.path2].filter(Boolean).map((p) => `/${p}`).join("")}
            </div>
            <div className="mt-1" style={{ color: "#1a0dab", fontSize: "1.1rem", lineHeight: 1.3 }}>{usable.slice(0, 3).join(" | ") || "(no usable headline)"}</div>
            <div className="small mt-1">{desc.slice(0, 2).join(" ") || "(no usable description)"}</div>
          </div>
          <p className="small muted mt-1">Google mixes headlines and descriptions itself. This is only one example.</p>

          <div className="small font-semibold mt-3 mb-1">
            Headlines <span className="muted font-normal">({c.headlines.length}, max {RSA.headlineMax} characters)</span>
          </div>
          <ul className="small space-y-0.5">
            {c.headlines.map((h, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>{h}</span>
                <span className="num" style={{ color: h.length > RSA.headlineMax ? "var(--bad)" : "var(--muted)", fontWeight: h.length > RSA.headlineMax ? 700 : 400 }}>{h.length}</span>
              </li>
            ))}
          </ul>
          <div className="small font-semibold mt-3 mb-1">
            Descriptions <span className="muted font-normal">({c.descriptions.length}, max {RSA.descriptionMax})</span>
          </div>
          <ul className="small space-y-1">
            {c.descriptions.map((d, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>{d}</span>
                <span className="num" style={{ color: d.length > RSA.descriptionMax ? "var(--bad)" : "var(--muted)", fontWeight: d.length > RSA.descriptionMax ? 700 : 400 }}>{d.length}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="small font-semibold mb-1">
            Keywords <span className="muted font-normal">({c.keywords.length}) · [exact] &quot;phrase&quot; broad</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {c.keywords.map((k, i) => (
              <span key={i} className="badge badge-accent" style={{ fontWeight: 500 }}>{formatKeyword(k)}</span>
            ))}
          </div>
          <div className="small font-semibold mt-3 mb-1">
            Negative keywords <span className="muted font-normal">({c.negatives.length})</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {c.negatives.length ? c.negatives.map((n, i) => <span key={i} className="badge" style={{ fontWeight: 500 }}>−{n}</span>) : <span className="small muted">none</span>}
          </div>
          <p className="small muted mt-3">
            Keywords are the agent&apos;s hypotheses. There is no search volume data here: check them in Google&apos;s Keyword Planner before you spend.
          </p>
        </div>
      </div>

      {flags.length > 0 && (
        <ul className="mt-3 space-y-1">
          {flags.map((f, i) => (
            <li key={i} className={`notice ${f.level === "warn" ? "notice-warn" : ""}`} style={f.level === "info" ? { borderColor: "var(--line)" } : undefined}>
              {f.message}
            </li>
          ))}
        </ul>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer small font-semibold">Edit this ad group</summary>
        <form action={updateAdGroupAction} className="grid gap-3 md:grid-cols-2 mt-3" dir="ltr">
          <input type="hidden" name="clientId" value={row.client_id} />
          <input type="hidden" name="adGroupId" value={row.id} />
          <label className="field md:col-span-2">
            <span>Ad group name</span>
            <input className="input" name="theme" defaultValue={c.theme} />
          </label>
          <LimitedLines name="headlines" label="Headlines" defaultValue={c.headlines.join("\n")} limit={RSA.headlineMax} rows={10} />
          <LimitedLines name="descriptions" label="Descriptions" defaultValue={c.descriptions.join("\n")} limit={RSA.descriptionMax} rows={10} />
          <LimitedLines name="keywords" label={'Keywords: [exact], "phrase", or plain for broad'} defaultValue={c.keywords.map(formatKeyword).join("\n")} rows={8} />
          <LimitedLines name="negatives" label="Negative keywords" defaultValue={c.negatives.join("\n")} rows={8} />
          <label className="field md:col-span-2">
            <span>Final URL (landing page)</span>
            <input className="input" name="final_url" type="url" defaultValue={c.final_url} placeholder="https://" />
          </label>
          <label className="field">
            <span>Path 1 (max {RSA.pathMax})</span>
            <input className="input" name="path1" defaultValue={c.path1} />
          </label>
          <label className="field">
            <span>Path 2 (max {RSA.pathMax})</span>
            <input className="input" name="path2" defaultValue={c.path2} />
          </label>
          <div className="md:col-span-2">
            <SubmitButton pendingText="Saving…" className="btn">Save changes</SubmitButton>
          </div>
        </form>
      </details>

      <form action={decideAdGroupAction} className="mt-3 flex gap-2 items-end flex-wrap" dir="ltr">
        <input type="hidden" name="clientId" value={row.client_id} />
        <input type="hidden" name="adGroupId" value={row.id} />
        <label className="field grow" style={{ minWidth: 220 }}>
          <span>Note (on rejection: why)</span>
          <input className="input" name="note" defaultValue={row.note} />
        </label>
        {row.status !== "approved" && (
          <button className="btn btn-primary" name="status" value="approved">
            Approve
          </button>
        )}
        {row.status !== "rejected" && (
          <button className="btn btn-danger" name="status" value="rejected">
            Reject
          </button>
        )}
        {row.status !== "draft" && (
          <button className="btn" name="status" value="draft">
            Back to drafts
          </button>
        )}
      </form>
      {row.status === "approved" && warns > 0 && <p className="small mt-2" style={{ color: "var(--bad)" }}>Approved with open problems. Google will reject over-length texts on upload.</p>}
    </div>
  );
}

export default async function Search(args: PageArgs) {
  const { client, sp } = await loadClient(args);
  const L = client.language;
  const m = (v: number | null) => money(v, client.currency, L);
  const blocker = creativeBlocker(client.id);
  const forbidden = forbiddenTerms(getBrain(client.id).brand_rules);
  const groups = db().prepare("SELECT * FROM search_adgroups WHERE client_id = ? ORDER BY id DESC LIMIT 100").all(client.id) as AdGroupRow[];
  const by = (s: string) => groups.filter((g) => g.status === s);
  const sections: [string, string, AdGroupRow[]][] = [
    ["Waiting for your decision", "draft", by("draft")],
    ["Approved", "approved", by("approved")],
    ["Rejected", "rejected", by("rejected")],
  ];
  const terms = getSearchTerms(client.id);
  const sum = termsSummary(terms.rows, client.target_cpl);
  const flagged = sum.judged.filter((t) => t.verdict !== "none");
  const shown = sum.judged.slice(0, 100);

  return (
    <div className="max-w-5xl">
      <Flash sp={sp} />
      <form action={generateAdGroupsAction} className="card">
        <input type="hidden" name="clientId" value={client.id} />
        <h2>Propose Google Search ad groups</h2>
        <p className="small muted mt-1">
          Each proposal is one search intent: keywords, negative keywords, and the texts of a responsive search ad. Lengths are checked against Google&apos;s limits. Nothing is uploaded from here.
        </p>
        {blocker ? (
          <p className="notice notice-warn mt-3">{blocker}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[130px_1fr_auto] items-end mt-3">
            <label className="field">
              <span>Ad groups</span>
              <input className="input" type="number" name="count" min={1} max={4} defaultValue={2} />
            </label>
            <label className="field">
              <span>Extra brief (optional)</span>
              <input className="input" name="brief" placeholder="e.g. one group for emergency repairs, one for inspections" />
            </label>
            <SubmitButton pendingText="Planning…">Propose</SubmitButton>
          </div>
        )}
      </form>

      {groups.length === 0 && <p className="muted mt-4">No ad groups yet.</p>}

      {sections.map(([title, key, list]) =>
        list.length === 0 ? null : (
          <section key={key} className="mt-6">
            <div className="flex items-baseline justify-between mb-2">
              <h2>
                {title} <span className="muted font-normal">({list.length})</span>
              </h2>
              {key === "approved" && (
                <a className="btn" href={`/clients/${client.id}/search/export`}>
                  Export approved as CSV
                </a>
              )}
            </div>
            {list.map((g) => (
              <AdGroupCard key={g.id} row={g} forbidden={forbidden} />
            ))}
          </section>
        ),
      )}

      <section id="terms" className="mt-8">
        <h2>Search terms report</h2>
        <p className="small muted mb-3">What people actually typed before they clicked. This is where wasted budget shows up first.</p>

        <form action={importSearchTermsAction} className="card">
          <input type="hidden" name="clientId" value={client.id} />
          <ol className="small muted mb-3 list-decimal pl-5 space-y-0.5">
            <li>In Google Ads: Insights and reports → Search terms. Choose the period, e.g. the last 30 days.</li>
            <li>Columns needed: Search term, Clicks, Cost, Conversions. Campaign, Ad group and Impr. are used if present.</li>
            <li>Download as CSV and upload here. A new upload replaces the previous report.</li>
          </ol>
          <div className="flex gap-3 items-end flex-wrap">
            <label className="field grow">
              <span>CSV file</span>
              <input className="input" type="file" name="file" accept=".csv,text/csv" required />
            </label>
            <SubmitButton pendingText="Importing…">Import</SubmitButton>
          </div>
        </form>

        {terms.rows.length > 0 && (
          <>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mt-4">
              {[
                ["Search terms", int(terms.rows.length, L)],
                ["Cost", m(sum.cost)],
                ["Conversions", num(sum.conversions, L)],
                ["Cost on exclude candidates", m(sum.wasted)],
              ].map(([label, value]) => (
                <div key={label} className="card" style={{ margin: 0 }}>
                  <div className="small muted">{label}</div>
                  <div className="text-2xl font-semibold num mt-1">{value}</div>
                </div>
              ))}
            </div>
            <div className="card mt-4" style={{ padding: 0 }}>
              <div className="px-5 pt-4 pb-2">
                <p className="small muted">
                  Imported {terms.importedAt} UTC. Verdicts come from fixed rules: no conversion and cost at or above {m(sum.benchmark)}{" "}
                  ({sum.benchmarkSource === "target" ? "your target cost per lead" : sum.benchmarkSource === "report" ? "average cost per conversion in this report" : `no benchmark, so ${TERM_THRESHOLDS.excludeMinClicksNoBenchmark}+ clicks`}) → candidate to exclude; {TERM_THRESHOLDS.reviewMinClicks}+ clicks without conversion → review; {TERM_THRESHOLDS.addMinConversions}+ conversions → candidate keyword.
                  A term can be relevant and simply not have converted yet. You decide. {flagged.length} of {terms.rows.length} terms are flagged.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Search term</th>
                      <th className="r">Impr.</th>
                      <th className="r">Clicks</th>
                      <th className="r">Cost</th>
                      <th className="r">Conv.</th>
                      <th>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((t, i) => {
                      const v = VERDICT[t.verdict];
                      return (
                        <tr key={i}>
                          <td dir="auto">
                            <div className="font-semibold">{t.term}</div>
                            <div className="small muted">{[t.campaign, t.adgroup].filter(Boolean).join(" › ")}</div>
                          </td>
                          <td className="r num">{int(t.impressions, L)}</td>
                          <td className="r num">{int(t.clicks, L)}</td>
                          <td className="r num">{m(t.cost)}</td>
                          <td className="r num">{num(t.conversions, L)}</td>
                          <td>{v && <span className={`badge ${v.badge}`}>{v.label}</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {sum.judged.length > shown.length && <p className="small muted px-5 py-3">Showing the {shown.length} terms with the highest cost of {sum.judged.length}.</p>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
