import type { Client } from "@/lib/types";
import { SubmitButton } from "./ui";

export function ClientForm({ action, client, submitLabel }: { action: (f: FormData) => Promise<void>; client?: Client; submitLabel: string }) {
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {client && <input type="hidden" name="clientId" value={client.id} />}
      <label className="field sm:col-span-2">
        <span>Client name *</span>
        <input className="input" name="name" required defaultValue={client?.name} />
      </label>
      <label className="field">
        <span>Industry</span>
        <input className="input" name="industry" defaultValue={client?.industry} />
      </label>
      <label className="field">
        <span>Website / landing page</span>
        <input className="input" name="website" type="url" placeholder="https://" defaultValue={client?.website} />
      </label>
      <label className="field">
        <span>Language of ads and reports</span>
        <select className="input" name="language" defaultValue={client?.language ?? "de"}>
          <option value="de">German</option>
          <option value="en">English</option>
          <option value="ar">Arabic</option>
        </select>
      </label>
      <label className="field">
        <span>First channel (start with one)</span>
        <select className="input" name="channel" defaultValue={client?.channel ?? "meta"}>
          <option value="meta">Meta (Instagram / Facebook)</option>
          <option value="google">Google Ads</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="field">
        <span>Currency (ISO code)</span>
        <input className="input" name="currency" defaultValue={client?.currency ?? "EUR"} maxLength={3} pattern="[A-Z]{3}" />
      </label>
      <label className="field">
        <span>Daily test budget</span>
        <input className="input" name="daily_budget" inputMode="decimal" defaultValue={client?.daily_budget ?? ""} />
      </label>
      <label className="field">
        <span>Target cost per lead</span>
        <input className="input" name="target_cpl" inputMode="decimal" defaultValue={client?.target_cpl ?? ""} />
        <span className="small muted" style={{ fontWeight: 400, marginTop: 4 }}>
          Used by the pause and scale rules. Without it the account average is used.
        </span>
      </label>
      <label className="field">
        <span>Meta ad account ID (optional, digits only)</span>
        <input className="input" name="meta_ad_account_id" inputMode="numeric" defaultValue={client?.meta_ad_account_id} />
      </label>
      <div className="sm:col-span-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
