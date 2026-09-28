import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { estimate, getSpend, listModels } from '../../api';
import type { SpendRow } from '../../types';
import Chart from './Chart';
import ModelTable, { type ModelRow } from './ModelTable';

type Preset = '7d' | '30d' | 'month' | 'custom';
type Data = { days: SpendRow[]; models: ModelRow[]; total: number; count: number };

const PRESET_LABEL: Record<Preset, string> = {
  '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', month: 'Mes actual', custom: 'Rango personalizado',
};

const usd = (n: number) => `$${n.toFixed(n !== 0 && Math.abs(n) < 0.1 ? 3 : 2)}`;
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

export default function Spend() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [custom, setCustom] = useState({ from: iso(addDays(new Date(), -29)), to: iso(new Date()) });
  const [data, setData] = useState<Data | null>(null);
  const [providerByModel, setProviderByModel] = useState<Map<string, string>>(new Map());
  const [today, setToday] = useState<number | null>(null);
  const [budgetCap, setBudgetCap] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const range = useMemo(() => rangeOf(preset, custom), [preset, custom]);
  const invalid = !range.from || !range.to || range.from > range.to;

  // Provider metadata for the model table's "Proveedor" column — model
  // catalog is period-independent, so it only needs fetching once.
  useEffect(() => {
    listModels().then((r) => setProviderByModel(new Map(r.items.map((m) => [m.model, m.provider])))).catch(() => {});
  }, []);

  // "Hoy" is always the real today, not the selected period.
  useEffect(() => {
    let live = true;
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // ponytail: the daily cap only comes back on POST /api/estimate (needs a
    // valid generation body); today's spend comes from /api/spend for the
    // same day and the two combine into the cap.
    Promise.all([
      getSpend({ from: dayStart.toISOString(), to: now.toISOString(), groupBy: 'day' }),
      estimate({ kind: 'image' }),
    ]).then(([t, e]) => {
      if (!live) return;
      setToday(t.totalUsd);
      if (e.budgetLeftUsd != null) setBudgetCap(e.budgetLeftUsd + t.totalUsd);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (invalid) return;
    let live = true;
    setError(null);
    Promise.all([
      getSpend({ ...range, groupBy: 'day' }),
      getSpend({ ...range, groupBy: 'model' }),
    ]).then(([byDay, byModel]) => {
      if (!live) return;
      // FR-30: the model breakdown has to sum to the period total. Both
      // numbers come from the same WHERE clause with a different GROUP BY,
      // so a mismatch beyond float noise is a real query bug — surface it
      // instead of rounding it away.
      const modelsSum = byModel.items.reduce((s, r) => s + r.costUsd, 0);
      setMismatch(Math.abs(modelsSum - byDay.totalUsd) > 0.005);
      const models: ModelRow[] = byModel.items
        .map((r) => ({ ...r, provider: providerByModel.get(r.key) ?? '—' }))
        .sort((a, b) => b.costUsd - a.costUsd);
      setData({
        days: fillDays(byDay.items, range.from, range.to),
        models,
        total: byDay.totalUsd,
        count: byModel.items.reduce((s, r) => s + r.count, 0),
      });
    }).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [range, invalid, providerByModel]);

  const exportHref = `/api/spend/export?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
  const topModel = data?.models[0] ?? null;

  return (
    <div style={page}>
      <header style={header}>
        <div>
          <h1 style={h1}>Gastos</h1>
          <p style={subtitle}>{PRESET_LABEL[preset]}{data ? ` · ${usd(data.total)}` : ''}</p>
        </div>
        <div style={controls}>
          <div role="group" aria-label="Rango" style={presetGroup}>
            {(Object.keys(PRESET_LABEL) as Preset[]).map((k) => (
              <button key={k} type="button" aria-pressed={preset === k} onClick={() => setPreset(k)} style={presetBtn(preset === k)}>
                {k === '7d' ? '7 días' : k === '30d' ? '30 días' : k === 'month' ? 'Mes actual' : 'Personalizado'}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} style={dateInput} />
              <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} style={dateInput} />
            </div>
          )}
          <a
            href={exportHref}
            style={invalid ? { ...exportBtn, opacity: 0.5, pointerEvents: 'none' } : exportBtn}
            aria-disabled={invalid}
            onClick={(e) => invalid && e.preventDefault()}
          >
            Exportar CSV
          </a>
        </div>
      </header>

      {invalid && <p role="alert" style={alert}>Rango inválido.</p>}
      {error && <p role="alert" style={alert}>{error}</p>}
      {mismatch && (
        <p role="alert" style={alert}>
          El desglose por modelo no coincide con el total del período — hay un error en la consulta de gasto.
        </p>
      )}

      <div style={cardsGrid}>
        <div style={card}>
          <div style={cardLabel}>Total del período</div>
          <div style={cardValue}>{data ? usd(data.total) : '…'}</div>
          <div style={cardSub}>{PRESET_LABEL[preset]}</div>
        </div>
        <div style={card}>
          <div style={cardLabel}>Hoy</div>
          <div style={cardValue}>{today == null ? '…' : usd(today)}</div>
          <div style={cardSub}>{budgetCap == null ? 'gasto de hoy' : `de ${usd(budgetCap)} de presupuesto`}</div>
        </div>
        <div style={card}>
          <div style={cardLabel}>Costo medio por asset</div>
          <div style={cardValue}>{data && data.count > 0 ? usd(data.total / data.count) : '—'}</div>
          <div style={cardSub}>{data ? `${data.count} asset${data.count === 1 ? '' : 's'} en el período` : '…'}</div>
        </div>
        <div style={card}>
          <div style={cardLabel}>Modelo con mayor gasto</div>
          <div style={cardValue}>{topModel ? usd(topModel.costUsd) : '—'}</div>
          <div style={cardSub}>
            {topModel && data ? `${topModel.key} · ${Math.round((topModel.costUsd / data.total) * 100 || 0)}% del total` : '…'}
          </div>
        </div>
      </div>

      <section style={card}>
        <div style={sectionTitle}>Gasto por día</div>
        {data && <Chart days={data.days} />}
      </section>

      <section style={card}>
        {data && <ModelTable rows={data.models} total={data.total} />}
      </section>
    </div>
  );
}

const page: CSSProperties = { padding: 28, display: 'grid', gap: 20 };
const header: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 };
const h1: CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 24, color: 'var(--text-primary)', margin: 0 };
const subtitle: CSSProperties = { fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' };
const controls: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' };

const presetGroup: CSSProperties = { display: 'flex', gap: 4, background: 'var(--bg-elevated)', padding: 4, borderRadius: 10, border: '1px solid var(--border)' };
const presetBtn = (active: boolean): CSSProperties => ({
  padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-ui)',
  background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--bg-app)' : 'var(--text-secondary)', fontWeight: active ? 600 : 500,
});
const dateInput: CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', padding: '6px 8px', fontSize: 12.5,
};
const exportBtn: CSSProperties = {
  padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)',
  color: 'var(--text-primary)', textDecoration: 'none', fontSize: 13, fontWeight: 500,
};

const alert: CSSProperties = { color: 'var(--danger)', margin: 0, fontSize: 13.5 };

const cardsGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 };
const card: CSSProperties = { padding: 18, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12 };
const cardLabel: CSSProperties = { fontSize: 12.5, color: 'var(--text-secondary)' };
const cardValue: CSSProperties = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 26, color: 'var(--text-primary)', margin: '6px 0 2px' };
const cardSub: CSSProperties = { fontSize: 11.5, color: 'var(--text-muted)' };
const sectionTitle: CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 };
