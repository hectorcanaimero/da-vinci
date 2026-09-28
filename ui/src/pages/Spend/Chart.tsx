import type { SpendRow } from '../../types';

const usd = (n: number) => `$${n.toFixed(n !== 0 && Math.abs(n) < 0.1 ? 3 : 2)}`;

// Bars only — the backend groups by a single column (day, provider or
// model), so a stacked-by-provider chart would need a second query shape
// that /api/spend doesn't offer. One series is what the data actually
// supports; add stacking if /api/spend grows a day+provider grouping.
export default function Chart({ days }: { days: SpendRow[] }) {
  const W = 880, H = 260, L = 56, B = 28, T = 16;
  const max = Math.max(...days.map((d) => d.costUsd), 0.01);
  const slot = (W - L) / Math.max(days.length, 1);
  const bw = Math.max(Math.min(slot * 0.6, 40), 2);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const step = Math.max(1, Math.ceil(days.length / 10));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="spend-chart-title"
      style={{ width: '100%', height: 'auto', display: 'block' }}>
      <title id="spend-chart-title">Gasto por día</title>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" strokeWidth={1} />
          <text x={L - 8} y={y(max * f) + 4} textAnchor="end" fontSize="11" fontFamily="var(--font-mono)" fill="var(--text-muted)">
            {usd(max * f)}
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = L + i * slot + (slot - bw) / 2;
        const h = Math.max(H - B - y(d.costUsd), 0);
        return (
          <g key={d.key}>
            <rect x={x} y={y(d.costUsd)} width={bw} height={h} fill="var(--accent)" rx={2}>
              <title>{`${d.key}: ${usd(d.costUsd)} · ${d.count} asset${d.count === 1 ? '' : 's'}`}</title>
            </rect>
            {i % step === 0 && (
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill="var(--text-muted)">
                {d.key.slice(8)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
