import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marketing OS",
  description: "Agent-assisted marketing workspace: data, weekly analysis, ad drafts, human approval.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
          <div className="mx-auto max-w-6xl px-5 py-3 flex items-center justify-between">
            <Link href="/" className="font-semibold no-underline tracking-tight">
              Marketing OS
            </Link>
            <span className="small muted">Agents prepare. You decide.</span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-6">{children}</main>
      </body>
    </html>
  );
}
