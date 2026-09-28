import type { CSSProperties } from 'react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { loadActiveJobs, useJobs, useServerEvents } from '../../sse';
import type { JobStatus } from '../../types';

// `interrupted` y `discarded` los agrego F6.1.T1: un trabajo que quedo a
// medias al cerrar la app es recuperable, no fallido, y el texto no puede
// afirmar que no se cobro (FR-27).
const LABEL: Record<JobStatus, string> = {
  queued: 'en cola', running: 'generando', done: 'listo', failed: 'error',
  interrupted: 'interrumpido', discarded: 'descartado',
};
const BAR_COLOR: Record<JobStatus, string> = {
  queued: 'var(--border)', running: 'var(--accent)', done: 'var(--ok)', failed: 'var(--danger)',
  interrupted: 'var(--warn)', discarded: 'var(--text-muted)',
};

// ponytail: Canvas already keeps an SSE connection open on this page; this
// component opens its own too so it stays useful standalone, same tradeoff
// JobsTray.tsx already makes. Dedupe into one shared connection if a second
// consumer ever makes the cost obvious.
export default function JobStrip() {
  const jobs = useJobs();
  useServerEvents();
  useEffect(() => { loadActiveJobs().catch(() => {}); }, []);

  if (!jobs.length) return null;

  return (
    <div style={strip} aria-label="Trabajos recientes">
      {jobs.slice(0, 12).map((j) => {
        const card = (
          <div key={j.id} style={cardStyle}>
            <div style={cardTop}>
              <span style={idText}>job {j.id.slice(0, 5)}</span>
              <span style={statusText(j.status)}>{LABEL[j.status]}</span>
            </div>
            <div style={modelText}>{j.request.model ?? 'auto'}</div>
            {j.error && <div style={errorText} title={j.error.message}>{j.error.message}</div>}
            <div style={track}><div style={fill(j.status)} /></div>
          </div>
        );
        return j.status === 'done' && j.generationIds[0]
          ? <Link key={j.id} to={`/asset/${j.generationIds[0]}`} style={cardLink}>{card}</Link>
          : card;
      })}
    </div>
  );
}

const strip: CSSProperties = {
  display: 'flex', gap: 10, padding: '10px 16px', overflowX: 'auto',
  borderTop: '1px solid var(--border-soft)', background: 'var(--bg-surface)', flexShrink: 0,
};
const cardLink: CSSProperties = { textDecoration: 'none', flexShrink: 0 };
const cardStyle: CSSProperties = {
  width: 168, flexShrink: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4,
};
const cardTop: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' };
const idText: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' };
const statusText = (s: JobStatus): CSSProperties => ({
  fontSize: 10.5, fontFamily: 'var(--font-ui)', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.04em', color: s === 'failed' ? 'var(--danger)' : s === 'done' ? 'var(--ok)' : 'var(--text-muted)',
});
const modelText: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const errorText: CSSProperties = {
  fontSize: 10.5, color: 'var(--danger)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const track: CSSProperties = { height: 3, borderRadius: 2, background: 'var(--border-soft)', overflow: 'hidden', marginTop: 2 };
const fill = (s: JobStatus): CSSProperties => ({
  height: '100%', borderRadius: 2, background: BAR_COLOR[s],
  width: s === 'queued' ? '15%' : s === 'running' ? '55%' : '100%',
});
