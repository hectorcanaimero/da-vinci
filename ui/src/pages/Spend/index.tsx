import { useEffect, useMemo, useState } from 'react';
import { estimate, getSpend } from '../../api';
import type { SpendRow } from '../../types';

type Preset = '7d' | '30d' | 'month' | 'custom';
type Data = { days: SpendRow[]; providers: SpendRow[]; models: SpendRow[]; total: number };
type Budget = { cap: number; left: number };

const usd = (n: number) => `$${n.toFixed(n !== 0 && Math.abs(n) < 0.1 ? 4 : 2)}`;
const iso = (d: Date) => d.toISOString().slice(0, 10); // server groups by UTC day
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);

function rangeOf(p: Preset, custom: { from: string; to: string }) {
  const now = new Date();
  if (p === '7d') return { from: iso(addDays(now, -6)), to: iso(now) };
  if (p === '30d') return { from: iso(addDays(now, -29)), to: iso(now) };
  if (p === 'month') return { from: `${iso(now).slice(0, 8)}01`, to: iso(now) };
  return custom;
}

function fillDays(rows: SpendRow[], from: string, to: string): SpendRow[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: SpendRow[] = [];
  const end = Date.parse(to);
  for (let t = Date.parse(from); t <= end && out.length < 400; t += 864e5) {
    const key = iso(new Date(t));
    out.push(byKey.get(key) ?? { key, costUsd: 0, count: 0 });
  }
  return out;
}

function Chart({ days }: { days: SpendRow[] }) {
  const W = 640, H = 220, L = 52, B = 28, T = 10;
  const max = Math.max(...days.map((d) => d.costUsd), 0.01);
  const slot = (W - L) / Math.max(days.length, 1);
  const bw = Math.max(slot * 0.7, 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const step = Math.max(1, Math.ceil(days.length / 8));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="spend-chart-title" style={{ width: '100%', height: 'auto' }}>
      <title id="spend-chart-title">Costo estimado por día</title>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" />
          <text x={L - 6} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{usd(max * f)}</text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = L + i * slot + (slot - bw) / 2;
        return (
          <g key={d.key}>
            <rect x={x} y={y(d.costUsd)} width={bw} height={H - B - y(d.costUsd)} fill="var(--accent)" rx="2">
              <title>{`${d.key}: ${usd(d.costUsd)} (${d.count})`}</title>
            </rect>
            {i % step === 0 && (
              <text x={x + bw / 2} y={H - 10} textAnchor="middle" fontSize="10" fill="var(--muted)">{d.key.slice(5)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const cell = { textAlign: 'left', padding: 'var(--sp-1) var(--sp-2)', borderBottom: '1px solid var(--border)' } as const;
const num = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as const;

function Table({ caption, head, rows, hidden }: { caption: string; head: string; rows: SpendRow[]; hidden?: boolean }) {
  const style = hidden
    ? ({ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' } as const)
    : { width: '100%', borderCollapse: 'collapse' as const };
  return (
    <table style={style}>
      <caption style={{ textAlign: 'left', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>{caption}</caption>
      <thead><tr><th style={cell}>{head}</th><th style={num}>Generaciones</th><th style={num}>Costo</th></tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td style={cell} colSpan={3}>Sin datos</td></tr>}
        {rows.map((r) => (
          <tr key={r.key}><td style={cell}>{r.key}</td><td style={num}>{r.count}</td><td style={num}>{usd(r.costUsd)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Spend() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [custom, setCustom] = useState({ from: iso(addDays(new Date(), -29)), to: iso(new Date()) });
  const [data, setData] = useState<Data | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const range = useMemo(() => rangeOf(preset, custom), [preset, custom]);

  useEffect(() => {
    if (!range.from || !range.to || range.from > range.to) return;
    let live = true;
    setError(null);
    Promise.all([
      getSpend({ ...range, groupBy: 'day' }),
      getSpend({ ...range, groupBy: 'provider' }),
      getSpend({ ...range, groupBy: 'model' }),
    ]).then(([d, p, m]) => {
      if (live) setData({ days: fillDays(d.items, range.from, range.to), providers: p.items, models: m.items, total: d.totalUsd });
    }).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [range]);

  useEffect(() => {
    let live = true;
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    getSpend({ from: `${iso(now).slice(0, 8)}01`, to: iso(now), groupBy: 'day' })
      .then((r) => live && setMonth(r.totalUsd)).catch(() => {});
    // The daily cap lives in config; the API only exposes what is left via /api/estimate.
    Promise.all([
      estimate({ kind: 'image' }),
      getSpend({ from: dayStart.toISOString(), to: addDays(dayStart, 1).toISOString(), groupBy: 'day' }),
    ]).then(([e, t]) => {
      if (live && e.budgetLeftUsd != null) setBudget({ left: e.budgetLeftUsd, cap: e.budgetLeftUsd + t.totalUsd });
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const card = { padding: 'var(--sp-3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' };
  const invalid = preset === 'custom' && (!range.from || !range.to || range.from > range.to);

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      <h1>Spend</h1>
      <p style={{ color: 'var(--muted)', margin: 0 }}>Costos estimados según tabla de precios</p>

      <div role="group" aria-label="Rango" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', alignItems: 'center' }}>
        {([['7d', '7 días'], ['30d', '30 días'], ['month', 'Mes actual'], ['custom', 'Personalizado']] as const).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={preset === k} onClick={() => setPreset(k)}
            style={{ padding: 'var(--sp-2) var(--sp-3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
              background: preset === k ? 'var(--accent)' : 'var(--surface)', color: preset === k ? '#000' : 'var(--text)', cursor: 'pointer' }}>
            {label}
          </button>
        ))}
        {preset === 'custom' && (
          <>
            <label>Desde <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
            <label>Hasta <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
          </>
        )}
      </div>
      {invalid && <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>Rango inválido</p>}
      {error && <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--sp-3)' }}>
        <div style={card}><div style={{ color: 'var(--muted)' }}>Total del rango</div><strong style={{ fontSize: 'var(--fs-lg)' }}>{data ? usd(data.total) : '…'}</strong></div>
        <div style={card}><div style={{ color: 'var(--muted)' }}>Mes actual</div><strong style={{ fontSize: 'var(--fs-lg)' }}>{month == null ? '…' : usd(month)}</strong></div>
        {budget && (
          <div style={card}>
            <div style={{ color: 'var(--muted)' }}>Tope diario {usd(budget.cap)}</div>
            <strong style={{ fontSize: 'var(--fs-lg)' }}>Quedan {usd(Math.max(budget.left, 0))} hoy</strong>
          </div>
        )}
      </div>

      {data && (
        <>
          <section style={card}>
            <Chart days={data.days} />
            <Table caption="Costo por día (tabla alternativa)" head="Día" rows={data.days} hidden />
          </section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--sp-3)' }}>
            <section style={card}><Table caption="Por proveedor" head="Proveedor" rows={data.providers} /></section>
            <section style={card}><Table caption="Por modelo" head="Modelo" rows={data.models} /></section>
          </div>
        </>
      )}
    </div>
  );
}
