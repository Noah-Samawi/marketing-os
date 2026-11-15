export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const ok = one(sp.ok);
  const err = one(sp.err);
  const warn = one(sp.warn);
  if (!ok && !err && !warn) return null;
  return (
    <div className="space-y-2 mb-4" role="status">
      {ok && <div className="notice notice-ok">{ok}</div>}
      {warn && <div className="notice notice-warn">{warn}</div>}
      {err && <div className="notice notice-err">{err}</div>}
    </div>
  );
}
