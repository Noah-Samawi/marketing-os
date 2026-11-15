import { generateReportAction } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/ui";
import { actionLabel } from "@/lib/agents/analyst";
import { db } from "@/lib/db";
import { llmConfigured } from "@/lib/llm";
import { loadClient, type PageArgs } from "@/lib/page";
import type { Recommendation, Report } from "@/lib/types";

const BADGE: Record<string, string> = { pause: "badge-bad", scale: "badge-good", refresh_creative: "badge-warn" };

export default async function Reports(args: PageArgs) {
  const { client, sp } = await loadClient(args);
  const reports = db().prepare("SELECT * FROM reports WHERE client_id = ? ORDER BY id DESC LIMIT 20").all(client.id) as Report[];
  return (
    <div className="max-w-4xl">
      <Flash sp={sp} />
      <form action={generateReportAction} className="card flex items-center justify-between gap-4 flex-wrap">
        <input type="hidden" name="clientId" value={client.id} />
        <div>
          <h2>Weekly report</h2>
          <p className="small muted">
            Covers the last 7 days with data. Figures and actions are computed by code.{" "}
            {llmConfigured() ? "The AI only writes the explanation." : "No API key set, so the text is rule-based."}
          </p>
        </div>
        <SubmitButton pendingText="Analysing…">Create report</SubmitButton>
      </form>

      {reports.length === 0 && <p className="muted mt-4">No reports yet.</p>}

      {reports.map((r, i) => {
        const recs = (JSON.parse(r.recommendations_json) as Recommendation[]).filter((x) => x.action !== "keep" && x.action !== "wait");
        return (
          <details key={r.id} className="card" open={i === 0}>
            <summary className="cursor-pointer font-semibold num">
              {r.period_start} to {r.period_end}{" "}
              <span className={`badge ${r.source === "llm" ? "badge-accent" : ""}`}>{r.source === "llm" ? "AI text" : "rule-based text"}</span>{" "}
              <span className="small muted font-normal">created {r.created_at} UTC</span>
            </summary>
            <div className="prose-report mt-3">{r.narrative}</div>
            {recs.length > 0 && (
              <div className="mt-4">
                <div className="small font-semibold mb-1">Actions from the rules (you carry them out in the ad account)</div>
                <ul className="space-y-1 small">
                  {recs.map((x, j) => (
                    <li key={j}>
                      <span className={`badge ${BADGE[x.action] ?? ""}`}>{actionLabel(x.action, "en")}</span> <strong>{x.ad}</strong> <span className="muted">{x.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}
