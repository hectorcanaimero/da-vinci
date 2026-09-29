import { useEffect, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getSpend } from '../../api';

// F3.2.T1 (src/core/config.mjs): `dailyBudgetUsd` es el tope del día (null =
// sin tope) y `thresholds` son los umbrales de costo de UNA generación —
// por encima de `warn` exige confirmación explícita (FR-17).
type BudgetConfig = { dailyBudgetUsd?: number | null; thresholds?: { auto?: number; warn?: number } };

const usd = (n: number) => `$${n.toFixed(2)}`;
const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local

export default function Budget() {
  const [cfg, setCfg] = useState<BudgetConfig | null>(null);
  const [spentToday, setSpentToday] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<BudgetConfig>('config_get').then(setCfg).catch((e) => setError(String(e)));
    const today = todayStr();
    getSpend({ from: today, to: today }).then((r) => setSpentToday(r.totalUsd)).catch((e) => setError(String(e)));
  }, []);

  const patch = (next: Partial<BudgetConfig>) => {
    setCfg((prev) => ({ ...prev, ...next }));
    invoke('config_set', { patch: next }).catch((e) => setError(String(e)));
  };

  const patchThreshold = (key: 'auto' | 'warn', value: number) => {
    const thresholds = { ...(cfg?.thresholds ?? {}), [key]: value };
    patch({ thresholds });
  };

  if (!cfg) return <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>;

  const dailyBudget = cfg.dailyBudgetUsd ?? null;
  const auto = cfg.thresholds?.auto ?? 0.1;
  const warn = cfg.thresholds?.warn ?? 1.0;
  const pct = dailyBudget != null && dailyBudget > 0 && spentToday != null ? Math.min(1, spentToday / dailyBudget) : null;
  const left = dailyBudget != null && spentToday != null ? Math.max(0, dailyBudget - spentToday) : null;

  return (
    <div style={wrap}>
      <section>
        <h2 style={h2}>Presupuesto</h2>
        <p style={lead}>Topes de gasto y umbrales de confirmación (F3.2.T1).</p>

        {error && <div style={errorBox}>{error}</div>}

        <div style={meterCard}>
          <div style={meterTop}>
            <div>
              <div style={meterLabel}>Gastado hoy</div>
              <div style={meterAmount}>
                {spentToday != null ? usd(spentToday) : '…'}
                {dailyBudget != null && <span style={meterOf}> de {usd(dailyBudget)}</span>}
              </div>
            </div>
            {left != null && (
              <div style={{ textAlign: 'right' }}>
                <div style={meterLeft}>{usd(left)} disponibles</div>
                <div style={meterLeftHint}>se reinicia a las 00:00 · hora local</div>
              </div>
            )}
          </div>
          {pct != null && (
            <div style={barTrack}>
              <div style={barFill(pct)} />
            </div>
          )}
          {dailyBudget == null && <p style={meterLeftHint}>Sin tope diario configurado — todo el gasto pasa sin bloquear.</p>}
        </div>
      </section>

      <section>
        <h3 style={h3}>Topes</h3>
        <p style={lead}>Cuando se alcanza el tope diario, el router rechaza el job con <code style={codeInline}>budget_exceeded</code> antes de llamar al proveedor.</p>

        <div style={field}>
          <div style={labelWrap}>
            <div style={label}>Tope diario</div>
            <div style={hint}>Suma de todos los proveedores. Vacío = sin tope.</div>
          </div>
          <input
            type="number" min={0} step={0.5} style={input}
            value={dailyBudget ?? ''} placeholder="sin tope"
            onChange={(e) => patch({ dailyBudgetUsd: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>

        <div style={field}>
          <div style={labelWrap}>
            <div style={label}>Automático hasta</div>
            <div style={hint}>Por debajo de este monto, una generación corre sin avisar.</div>
          </div>
          <input
            type="number" min={0} step={0.01} style={input} value={auto}
            onChange={(e) => patchThreshold('auto', Number(e.target.value) || 0)}
          />
        </div>

        <div style={field}>
          <div style={labelWrap}>
            <div style={label}>Pedir confirmación desde</div>
            <div style={hint}>Umbral del gate amarillo en el Estudio y el Chat (FR-17).</div>
          </div>
          <input
            type="number" min={0} step={0.01} style={input} value={warn}
            onChange={(e) => patchThreshold('warn', Number(e.target.value) || 0)}
          />
        </div>
      </section>
    </div>
  );
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 760 };
const h2: CSSProperties = { fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' };
const h3: CSSProperties = { fontSize: 13.5, fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' };
const lead: CSSProperties = { fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' };

const errorBox: CSSProperties = {
  marginBottom: 14, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--danger)',
  color: 'var(--danger)', fontSize: 12.5, background: 'var(--bg-surface)',
};

const meterCard: CSSProperties = {
  border: '1px solid var(--border-soft)', borderRadius: 12, padding: '16px 18px',
  background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', gap: 12,
};
const meterTop: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' };
const meterLabel: CSSProperties = { fontSize: 12, color: 'var(--text-muted)' };
const meterAmount: CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, color: 'var(--text-primary)' };
const meterOf: CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' };
const meterLeft: CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--ok)' };
const meterLeftHint: CSSProperties = { fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' };
const barTrack: CSSProperties = { height: 8, borderRadius: 4, background: 'var(--bg-input)', overflow: 'hidden' };
const barFill = (pct: number): CSSProperties => ({
  height: '100%', width: `${pct * 100}%`, borderRadius: 4,
  background: pct >= 1 ? 'var(--danger)' : pct >= 0.8 ? 'var(--warn)' : 'var(--accent)',
});

const field: CSSProperties = {
  display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'center',
  padding: '14px 0', borderTop: '1px solid var(--border-soft)',
};
const labelWrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
const label: CSSProperties = { fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' };
const hint: CSSProperties = { fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4 };
const input: CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-primary)', outline: 'none',
  maxWidth: 160,
};
const codeInline: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11.5, background: 'var(--bg-input)',
  border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px',
};
