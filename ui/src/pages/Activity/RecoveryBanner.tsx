import type { CSSProperties } from 'react';
import type { Job } from '../../types';

type Props = { jobs: Job[]; busy: boolean; onResumeAll: () => void; onDiscardAll: () => void };

// FR-27: aparece sólo si algo quedó a medias, y dice cuántos y desde cuándo.
export default function RecoveryBanner({ jobs, busy, onResumeAll, onDiscardAll }: Props) {
  if (jobs.length === 0) return null;
  const at = new Date(jobs[0].updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const n = jobs.length;

  return (
    <div role="alert" style={banner}>
      <div style={text}>
        <strong style={heading}>{n} job{n === 1 ? '' : 's'} quedaron interrumpidos cuando cerraste la app</strong>
        <p style={body}>
          Estaban en cola o corriendo a las {at}. Ninguno llegó a cobrarse — podés reanudarlos o descartarlos.
        </p>
      </div>
      <div style={actions}>
        <button type="button" onClick={onDiscardAll} disabled={busy} style={discardBtn}>Descartar</button>
        <button type="button" onClick={onResumeAll} disabled={busy} style={resumeBtn}>Reanudar los {n}</button>
      </div>
    </div>
  );
}

const banner: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap',
  padding: '14px 18px', borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--accent-soft)',
};
const text: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 };
const heading: CSSProperties = { fontSize: 14, color: 'var(--text-primary)' };
const body: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--text-secondary)' };
const actions: CSSProperties = { display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 };
const discardBtn: CSSProperties = {
  background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: 8,
};
const resumeBtn: CSSProperties = {
  padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--bg-app)',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
