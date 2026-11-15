"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pendingText, className = "btn btn-primary" }: { children: React.ReactNode; pendingText?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}

export function Tabs({ base, items }: { base: string; items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Client sections">
      {items.map((t) => {
        const href = base + t.href;
        const active = t.href === "" ? path === base : path.startsWith(href);
        return (
          <Link key={t.href} href={href} aria-current={active ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ConfirmButton({ children, message, className = "btn btn-danger" }: { children: React.ReactNode; message: string; className?: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

/** Textarea with one item per line and a live check of each line against a character limit. */
export function LimitedLines({ name, label, defaultValue, limit, rows = 6 }: { name: string; label: string; defaultValue: string; limit?: number; rows?: number }) {
  const [value, setValue] = useState(defaultValue);
  const items = value.split("\n").map((l) => l.trim()).filter(Boolean);
  const over = limit ? items.filter((l) => l.length > limit) : [];
  return (
    <label className="field">
      <span>
        {label} <span className="muted" style={{ fontWeight: 400 }}>· {items.length} line{items.length === 1 ? "" : "s"}{limit ? `, max ${limit} characters each` : ""}</span>
      </span>
      <textarea className="input" name={name} rows={rows} value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} />
      {over.length > 0 && (
        <span className="small" style={{ color: "var(--bad)", fontWeight: 400, marginTop: 4 }} aria-live="polite">
          {over.length} too long: {over.map((l) => `"${l}" (${l.length})`).join(", ")}
        </span>
      )}
    </label>
  );
}
