import type { CSSProperties } from 'react';
import type { Job, JobStatus } from '../../types';

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'en cola', running: 'corriendo', done: 'listo', failed: 'falló',
  interrupted: 'interrumpido', discarded: 'descartado',
};
const STATUS_COLOR: Record<JobStatus, string> = {
  queued: 'var(--text-muted)', running: 'var(--accent)', done: 'var(--ok)', failed: 'var(--danger)',
  interrupted: 'var(--warn)', discarded: 'var(--text-muted)',
};

const usd = (n: number) => `$${n.toFixed(n !== 0 && Math.abs(n) < 0.1 ? 3 : 2)}`;
const timeAgo = (iso: string) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
};
const preview = (j: Job) => j.request.prompt ?? j.request.text ?? j.request.script ?? '';

// FR-25: si falló, se muestra job.error.message tal como vino del proveedor — nunca un texto genérico propio.
export default function JobList({ jobs, costs }: { jobs: Job[]; costs: Record<string, number> }) {
  if (jobs.length === 0) return <p style={empty}>No hay trabajos para este filtro.</p>;

  return (
    <ul style={list}>
      {jobs.map((j) => {
        const cost = j.generationIds[0] ? costs[j.generationIds[0]] : undefined;
        return (
          <li key={j.id} style={row}>
            <div style={rowMain}>
              <span style={{ ...dot, background: STATUS_COLOR[j.status] }} aria-hidden="true" />
              <div style={rowInfo}>
                <div style={rowTop}>
                  <span style={jobId}>job {j.id.slice(0, 6)}</span>
                  <span style={meta}>{j.request.kind} · {j.request.model ?? 'auto'}</span>
                </div>
                {preview(j) && <div style={promptText}>{preview(j)}</div>}
              </div>
              <div style={rowRight}>
                <span style={costText}>{cost != null ? usd(cost) : '—'}</span>
                <span style={{ ...statusText, color: STATUS_COLOR[j.status] }}>{STATUS_LABEL[j.status]}</span>
                <span style={timeText}>{timeAgo(j.updatedAt)}</span>
              </div>
            </div>
            {j.status === 'failed' && j.error && (
              <div style={errorBox}>
                <span style={errorCode}>{j.error.code}</span>
                <span style={errorMsg}>{j.error.message}</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const list: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 };
const row: CSSProperties = { padding: 14, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10 };
const rowMain: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 12 };
const dot: CSSProperties = { width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0 };
const rowInfo: CSSProperties = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 };
const rowTop: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const jobId: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-primary)' };
const meta: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' };
const promptText: CSSProperties = {
  fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const rowRight: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 };
const costText: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--bone)' };
const statusText: CSSProperties = { fontSize: 12.5, fontWeight: 600, textTransform: 'capitalize' };
const timeText: CSSProperties = { fontSize: 12, color: 'var(--text-muted)', minWidth: 60, textAlign: 'right' };
const errorBox: CSSProperties = {
  marginTop: 10, marginLeft: 20, padding: '10px 12px', borderRadius: 8,
  background: 'var(--accent-soft)', border: '1px solid var(--danger)', display: 'flex', gap: 10, alignItems: 'flex-start',
};
const errorCode: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--danger)', background: 'var(--bg-input)',
  padding: '2px 6px', borderRadius: 4, flexShrink: 0,
};
const errorMsg: CSSProperties = { fontSize: 13, color: 'var(--text-primary)' };
const empty: CSSProperties = { color: 'var(--text-muted)', fontSize: 14, padding: '24px 0', textAlign: 'center' };
