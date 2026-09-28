import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { deleteGeneration, getGeneration, setFavorite } from '../../api';
import AssetViewer from '../../components/viewers';
import { useJobs, useServerEvents } from '../../sse';
import type { Generation, JobStatus } from '../../types';

const icon = (children: ReactNode) => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const ICONS = {
  star: (on: boolean) => icon(<path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" fill={on ? 'currentColor' : 'none'} />),
  copy: icon(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>),
  download: icon(<><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M5 21h14" /></>),
  folder: icon(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />),
  fork: icon(<><circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="12" r="2" /><path d="M6 8v8M6 12h8" /></>),
  trash: icon(<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13h8l1-13" />),
};

const basename = (path: string) => path.split(/[\\/]/).pop() ?? path;
const usd = (n: number) => `$${n.toFixed(3)}`;
// `interrupted` no dice que no se cobro, sólo que quedo a medias: el FR-27
// deja la decision de reanudar en el usuario, y el texto tiene que ser igual
// de honesto.
const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'En cola', running: 'Generando…', done: 'Listo', failed: 'Falló',
  interrupted: 'Interrumpido', discarded: 'Descartado',
};

export default function Canvas({ jobId }: { jobId: string | null }) {
  const [gen, setGen] = useState<Generation | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [alsoFile, setAlsoFile] = useState(false);
  const job = useJobs().find((j) => j.id === jobId) ?? null;

  // SSE callbacks are bound once by useServerEvents; read the current job via a ref.
  const jobRef = useRef(job);
  jobRef.current = job;
  useServerEvents(
    (g) => { if (jobRef.current?.generationIds.includes(g.id)) setGen(g); },
    (id) => setGen((cur) => (cur?.id === id ? null : cur)),
  );

  useEffect(() => setGen(null), [jobId]);

  // Fallback for when the 'generation' event fired before this page subscribed.
  useEffect(() => {
    if (job?.status === 'done' && job.generationIds[0] && !gen) {
      getGeneration(job.generationIds[0]).then(setGen).catch(() => {});
    }
  }, [job?.status, job?.generationIds, gen]);

  const toggleFav = () => gen && setFavorite(gen.id, !gen.favorite).then((g) => setGen({ ...gen, favorite: g.favorite }));
  const remove = () => gen && deleteGeneration(gen.id, alsoFile).then(() => { setGen(null); setConfirming(false); });
  const deriveUrl = gen
    ? `/estudio?${new URLSearchParams({ kind: gen.kind, model: gen.requestedModel || gen.model, ...(gen.prompt ? { prompt: gen.prompt } : {}) }).toString()}`
    : undefined;

  return (
    <div style={col}>
      <header style={bar}>
        <div style={info}>
          {gen ? (
            <>
              <div style={filename}>{basename(gen.filePath)}</div>
              <div style={meta}>{gen.provider} · {gen.model} · {usd(gen.costUsd)}</div>
            </>
          ) : (
            <div style={meta}>{job ? `${STATUS_LABEL[job.status]} · ${job.request.model ?? 'auto'}` : 'Sin resultado todavía'}</div>
          )}
        </div>
        <div style={actions}>
          <button style={{ ...iconBtn, color: gen?.favorite ? 'var(--warn)' : undefined }} disabled={!gen}
            aria-label={gen?.favorite ? 'Quitar de favoritos' : 'Marcar favorito'} onClick={toggleFav}>{ICONS.star(!!gen?.favorite)}</button>
          <button style={iconBtn} disabled aria-label="Copiar (llega en F4.3.T1)" title="Copiar — llega en F4.3.T1">{ICONS.copy}</button>
          <button style={iconBtn} disabled aria-label="Descargar (llega en F4.3.T1)" title="Descargar — llega en F4.3.T1">{ICONS.download}</button>
          <button style={iconBtn} disabled aria-label="Abrir carpeta (llega en F4.3.T1)" title="Abrir carpeta — llega en F4.3.T1">{ICONS.folder}</button>
          <a href={deriveUrl} aria-disabled={!gen} style={{ ...iconBtn, ...(!gen && disabledLink), textDecoration: 'none' }} aria-label="Derivar">{ICONS.fork}</a>
          <button style={iconBtn} disabled={!gen} aria-label="Borrar" onClick={() => setConfirming(true)}>{ICONS.trash}</button>
        </div>
      </header>

      <div style={stage}>
        {gen ? <AssetViewer gen={gen} /> : (
          <p style={placeholder}>
            {job?.status === 'failed' ? <span style={{ color: 'var(--danger)' }}>{job.error?.message ?? 'Falló la generación.'}</span>
              : job ? STATUS_LABEL[job.status]
              : 'Generá algo para verlo acá.'}
          </p>
        )}
      </div>

      {confirming && gen && (
        <dialog open style={dialogStyle}>
          <p style={{ margin: '0 0 12px', color: 'var(--text-primary)' }}>¿Borrar «{basename(gen.filePath)}»?</p>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={alsoFile} onChange={(e) => setAlsoFile(e.target.checked)} />
            Borrar también el archivo en disco
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button style={fileLikeBtn} onClick={() => setConfirming(false)}>Cancelar</button>
            <button style={{ ...fileLikeBtn, background: 'var(--danger)', color: 'var(--text-primary)', borderColor: 'var(--danger)' }} onClick={remove}>
              Borrar
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}

const col: CSSProperties = { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' };
const bar: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
  padding: '10px 16px', borderBottom: '1px solid var(--border-soft)', flexShrink: 0,
};
const info: CSSProperties = { minWidth: 0 };
const filename: CSSProperties = {
  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const meta: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 };

const actions: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 };
const iconBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30,
  background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text-secondary)', cursor: 'pointer',
};
const disabledLink: CSSProperties = { opacity: 0.4, pointerEvents: 'none' };

const stage: CSSProperties = { flex: 1, minHeight: 0, overflow: 'hidden' };
const placeholder: CSSProperties = { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, margin: 0 };

const dialogStyle: CSSProperties = {
  background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 20, fontFamily: 'var(--font-ui)', maxWidth: 360,
};
const fileLikeBtn: CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 7,
  padding: '7px 14px', color: 'var(--text-primary)', font: 'inherit', fontSize: 13, cursor: 'pointer',
};
