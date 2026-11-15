import { importCsvAction, syncMetaAction } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/ui";
import { dataCoverage } from "@/lib/metrics";
import { loadClient, type PageArgs } from "@/lib/page";

export default async function Data(args: PageArgs) {
  const { client, sp } = await loadClient(args);
  const cov = dataCoverage(client.id);
  const metaToken = Boolean(process.env.META_ACCESS_TOKEN);
  return (
    <div className="max-w-3xl">
      <Flash sp={sp} />
      <div className="card">
        <h2>Stored data</h2>
        {cov.rows === 0 ? (
          <p className="muted mt-1">Nothing imported yet.</p>
        ) : (
          <p className="mt-1 num">
            {cov.rows} ad-day rows on {cov.days} days, from {cov.first} to {cov.last}.
          </p>
        )}
        <p className="small muted mt-1">Importing the same period again updates the rows. It never creates duplicates.</p>
      </div>

      <form action={importCsvAction} className="card">
        <input type="hidden" name="clientId" value={client.id} />
        <h2>Import a CSV export</h2>
        <ol className="small muted mt-1 mb-3 list-decimal pl-5 space-y-0.5">
          <li>In Meta Ads Manager or Google Ads, open the ads report.</li>
          <li>Add the breakdown by day. Without it the file cannot be imported.</li>
          <li>Include: ad name, amount spent, impressions, link clicks, and results or leads.</li>
          <li>Export as CSV. German and English column names are recognised.</li>
        </ol>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="field">
            <span>CSV file</span>
            <input className="input" type="file" name="file" accept=".csv,text/csv" required />
          </label>
          <label className="field">
            <span>Platform</span>
            <select className="input" name="platform" defaultValue={client.channel}>
              <option value="meta">Meta</option>
              <option value="google">Google Ads</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
        <div className="mt-3">
          <SubmitButton pendingText="Importing…">Import</SubmitButton>
        </div>
      </form>

      <form action={syncMetaAction} className="card">
        <input type="hidden" name="clientId" value={client.id} />
        <h2>Sync from the Meta API</h2>
        <p className="small muted mt-1">
          Read-only: fetches ad insights per day. This connector follows the documented API but has not been run against a live account yet. Compare the first sync with Ads Manager.
        </p>
        {!metaToken || !client.meta_ad_account_id ? (
          <p className="notice notice-warn mt-3">
            Not available yet: {!metaToken ? "META_ACCESS_TOKEN is missing in .env.local" : ""}
            {!metaToken && !client.meta_ad_account_id ? " and " : ""}
            {!client.meta_ad_account_id ? "the ad account ID is missing in Settings" : ""}.
          </p>
        ) : (
          <div className="flex items-end gap-3 mt-3">
            <label className="field">
              <span>Days back</span>
              <input className="input" name="days" type="number" min={1} max={90} defaultValue={14} style={{ width: 110 }} />
            </label>
            <SubmitButton pendingText="Syncing…">Sync now</SubmitButton>
          </div>
        )}
      </form>
    </div>
  );
}
