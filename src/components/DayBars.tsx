/** One small bar chart per metric (no dual axes), with exact values on hover and for screen readers. */
export function DayBars({ title, data, format, color = "var(--accent)" }: { title: string; data: { date: string; value: number }[]; format: (v: number) => string; color?: string }) {
  const W = 520;
  const H = 110;
  const pad = { l: 4, r: 4, t: 8, b: 18 };
  const max = Math.max(...data.map((d) => d.value), 0);
  const n = Math.max(data.length, 1);
  const slot = (W - pad.l - pad.r) / n;
  const bw = Math.max(Math.min(slot * 0.7, 28), 2);
  const total = data.reduce((s, d) => s + d.value, 0);
  const labelEvery = n > 10 ? Math.ceil(n / 7) : 1;

  return (
    <figure>
      <figcaption className="flex items-baseline justify-between mb-1">
        <span className="small font-semibold">{title}</span>
        <span className="small muted num">
          Total {format(total)} · Peak {format(max)}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${title} per day. Total ${format(total)}, peak ${format(max)}.`}>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line)" />
        {data.map((d, i) => {
          const h = max > 0 ? (d.value / max) * (H - pad.t - pad.b) : 0;
          const x = pad.l + i * slot + (slot - bw) / 2;
          return (
            <g key={d.date}>
              <rect x={x} y={H - pad.b - h} width={bw} height={Math.max(h, d.value > 0 ? 1 : 0)} rx={2} fill={color}>
                <title>{`${d.date}: ${format(d.value)}`}</title>
              </rect>
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={H - 5} textAnchor="middle" fontSize="9" fill="var(--muted)">
                  {d.date.slice(8, 10)}.{d.date.slice(5, 7)}.
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
