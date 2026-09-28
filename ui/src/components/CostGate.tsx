import { useEffect, useState, type CSSProperties } from 'react';
import { ApiError, estimate as fetchEstimate } from '../api';
import type { Estimate, GenerationRequest } from '../types';

// /api/estimate (gate() en src/server/routes/api.mjs) devuelve más campos que
// el tipo Estimate declarado en types.ts — el tope y el gasto del día.
type CostEstimate = Estimate & {
  dailyBudgetUsd: number | null;
  spentTodayUsd: number;
  blocked: boolean;
  needsConfirm: boolean;
};

const usd = (n: number) => `$${n.toFixed(3)}`;

type Props = {
  request: GenerationRequest;
  onGenerate: (request: GenerationRequest) => Promise<void>;
  label?: string;
  disabled?: boolean;
};

// Barrera de costo compartida por Estudio y Chat (FR-17, FR-32): estima en
// vivo, arma la confirmación cuando el costo pasa el umbral y deshabilita
// generar con el tope diario alcanzado — todo antes de tocar al servidor.
export default function CostGate({ request, onGenerate, label = 'Generar', disabled }: Props) {
  const [est, setEst] = useState<CostEstimate | null>(null);
  const [estError, setEstError] = useState<string | null>(null);
  const [pending, setPending] = useState<CostEstimate | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const key = JSON.stringify(request);
  useEffect(() => {
    let stale = false;
    const t = setTimeout(() => {
      fetchEstimate(request)
        .then((e) => { if (!stale) { setEst(e as CostEstimate); setEstError(null); } })
        .catch((e: Error) => { if (!stale) { setEst(null); setEstError(e.message); } });
    }, 400);
    return () => { stale = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function run(req: GenerationRequest) {
    setBusy(true);
    setRuntimeError(null);
    try {
      await onGenerate(req);
      setPending(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'cost_confirm_required') setPending(e.details as CostEstimate);
      else if (e instanceof ApiError && e.code === 'budget_exceeded') {
        const d = e.details as Partial<CostEstimate> | undefined;
        setEst((prev) => (prev ? { ...prev, blocked: true, dailyBudgetUsd: d?.dailyBudgetUsd ?? prev.dailyBudgetUsd,
          spentTodayUsd: d?.spentTodayUsd ?? prev.spentTodayUsd } : prev));
        setRuntimeError(e.message);
      } else setRuntimeError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function generate() {
    if (busy || est?.blocked) return;
    if (est?.needsConfirm) { setPending(est); return; }
    void run(request);
  }

  const blockedReason = est?.blocked
    ? `Tope diario${est.dailyBudgetUsd != null ? ` de ${usd(est.dailyBudgetUsd)}` : ''} alcanzado — hoy ya gastaste ${usd(est.spentTodayUsd)}. Esperá a mañana o subí el tope en Ajustes.`
    : null;

  const buttonLabel = busy ? 'Generando…'
    : est?.known && est.level === 'confirm' ? `${label} · confirmar ${usd(est.costUsd)}`
    : label;

  const pct = est?.dailyBudgetUsd != null && est.dailyBudgetUsd > 0
    ? Math.min(1, est.spentTodayUsd / est.dailyBudgetUsd) : null;

  return (
    <div style={wrap}>
      <div style={box} role="status" aria-live="polite">
        <div style={boxHeader}>
          {warnIcon}
          <span style={boxTitle}>Estimado</span>
          <span style={boxAmount}>{est ? (est.known ? usd(est.costUsd) : 'desconocido') : estError ? '—' : 'calculando…'}</span>
        </div>
        {est && (
          <p style={boxDetail}>
            Modelo {est.model}
            {est.dailyBudgetUsd != null && ` · Hoy llevás ${usd(est.spentTodayUsd)} de ${usd(est.dailyBudgetUsd)}`}
          </p>
        )}
        {estError && <p style={boxDetail}>Sin estimación: {estError}</p>}
        {pct != null && (
          <div style={barTrack}>
            <div style={barFill(pct, est?.blocked ?? false)} />
          </div>
        )}
      </div>

      {blockedReason && <p role="alert" style={reasonText}>{blockedReason}</p>}
      {runtimeError && !blockedReason && <p role="alert" style={reasonText}>{runtimeError}</p>}

      <button type="button" onClick={generate} disabled={busy || !!blockedReason || disabled} style={generateBtn}>
        {buttonLabel}
      </button>

      {pending && (
        <dialog open role="alertdialog" aria-label="Confirmar costo" style={dialog}>
          <p style={boxDetail}>Costo alto: <strong style={boxAmount}>{usd(pending.costUsd)}</strong> con {pending.model}. ¿Continuar?</p>
          <div style={dialogActions}>
            <button type="button" style={generateBtn} onClick={() => void run({ ...request, confirm: true })} disabled={busy}>
              Confirmar {usd(pending.costUsd)}
            </button>
            <button type="button" style={secondaryBtn} onClick={() => setPending(null)} disabled={busy}>Cancelar</button>
          </div>
        </dialog>
      )}
    </div>
  );
}

const warnIcon = (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 22 20H2z" />
    <path d="M12 9.5v5M12 17.5h.01" />
  </svg>
);

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const box: CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '10px 12px',
  display: 'flex', flexDirection: 'column', gap: 6,
};
const boxHeader: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };
const boxTitle: CSSProperties = { fontSize: 12.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', flex: 1 };
const boxAmount: CSSProperties = { color: 'var(--warn)', fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 600 };
const boxDetail: CSSProperties = { margin: 0, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' };
const barTrack: CSSProperties = { height: 5, borderRadius: 3, background: 'var(--bg-input)', overflow: 'hidden' };
const barFill = (pct: number, blocked: boolean): CSSProperties => ({
  height: '100%', width: `${pct * 100}%`, borderRadius: 3,
  background: blocked ? 'var(--danger)' : 'var(--warn)',
});
const reasonText: CSSProperties = { color: 'var(--danger)', fontSize: 12.5, margin: 0, fontFamily: 'var(--font-ui)' };

const generateBtn: CSSProperties = {
  background: 'var(--accent)', color: 'var(--bone)', border: 'none', borderRadius: 10,
  padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
};
const secondaryBtn: CSSProperties = {
  background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '11px 16px', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-ui)',
};
const dialog: CSSProperties = {
  background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 20,
};
const dialogActions: CSSProperties = { display: 'flex', gap: 8, marginTop: 12 };
