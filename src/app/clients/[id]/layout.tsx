import Link from "next/link";
import { notFound } from "next/navigation";
import { Tabs } from "@/components/ui";
import { getClient } from "@/lib/clients";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/checklist", label: "Checklist" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/data", label: "Data" },
  { href: "/reports", label: "Reports" },
  { href: "/creatives", label: "Creatives" },
  { href: "/settings", label: "Settings" },
];

export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getClient(Number(id));
  if (!client) notFound();
  return (
    <div>
      <p className="small">
        <Link href="/">← Clients</Link>
      </p>
      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <h1>{client.name}</h1>
        {client.is_demo ? <span className="badge badge-warn">Demo data, synthetic</span> : null}
        <span className="small muted">{[client.industry, client.channel].filter(Boolean).join(" · ")}</span>
      </div>
      <Tabs base={`/clients/${client.id}`} items={TABS} />
      <div className="pt-5">{children}</div>
    </div>
  );
}
