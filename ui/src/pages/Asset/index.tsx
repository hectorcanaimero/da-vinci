import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteGeneration, getGeneration, listLibrary, setFavorite } from '../../api';
import AssetViewer from '../../components/viewers';
import { useServerEvents } from '../../sse';
import type { Generation } from '../../types';
import { relTime } from '../Library/Card';
import MetaPanel from './MetaPanel';

export type Detail = Generation & { parents: Generation[]; children: Generation[] };

const basename = (path: string) => path.split(/[\\/]/).pop() ?? path;

const icon = (d: string, filled = false) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const ICONS = {
  back: icon('M15 18l-6-6 6-6'),
  chevronLeft: icon('M14 6l-6 6 6 6'),
  chevronRight: icon('M10 6l6 6-6 6'),
  star: (on: boolean) => icon('M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z', on),
  trash: icon('M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13h8l1-13'),
};

export default function Asset() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [alsoFile, setAlsoFile] = useState(false);
  // ponytail: one unfiltered page covers realistic local libraries; if a
  // library outgrows it, paginate this fetch instead of adding a
  // server-side "neighbor of id" endpoint.
  const [siblings, setSiblings] = useState<Generation[]>([]);

  const load = useCallback(() => {
    getGeneration(id).then((r) => { setD(r); setErr(null); }).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { setD(null); setConfirming(false); load(); }, [load]);
  useEffect(() => { listLibrary({ limit: 1000 }).then((r) => setSiblings(r.items)).catch(() => {}); }, []);

  // SSE callbacks are bound once; go through a ref to see the current page.
  const ref = useRef({ d, load });
  ref.current = { d, load };
  useServerEvents(
    (g) => { if (g.inputs.some((i) => i.id === ref.current.d?.id)) ref.current.load(); },
    (gone) => {
      const c = ref.current.d;
      if (c && c.parents.concat(c.children).some((x) => x.id === gone)) ref.current.load();
    },
  );

  const idx = siblings.findIndex((g) => g.id === id);
  const prevGen = idx > 0 ? siblings[idx - 1] : null;
  const nextGen = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirming) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.key === 'ArrowLeft' && prevGen) nav(`/asset/${prevGen.id}`);
      if (e.key === 'ArrowRight' && nextGen) nav(`/asset/${nextGen.id}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevGen, nextGen, nav, confirming]);

  if (err) return <p style={{ color: 'var(--text-primary)', padding: 24 }}>Error: {err}</p>;
  if (!d) return <p style={{ color: 'var(--text-muted)', padding: 24 }}>Cargando…</p>;

  const toggleFav = () => setFavorite(d.id, !d.favorite).then((g) => setD({ ...d, favorite: g.favorite }));
  const remove = () => deleteGeneration(d.id, alsoFile).then(() => nav('/galeria')).catch((e) => setErr(e.message));

  return (
    <div style={page}>
      <header style={header}>
        <div style={crumb}>
          <Link to="/galeria" style={backLink}>{ICONS.back} Galería</Link>
          <span style={sep}>|</span>
          <div>
            <div style={filename}>{basename(d.filePath)}</div>
            <div style={subline}>{d.id} · {relTime(d.createdAt)}</div>
          </div>
        </div>
        <div style={headerActions}>
          <button style={{ ...iconBtn, opacity: prevGen ? 1 : 0.4 }} aria-label="Anterior" disabled={!prevGen}
            onClick={() => prevGen && nav(`/asset/${prevGen.id}`)}>
            {ICONS.chevronLeft}
          </button>
          <button style={{ ...iconBtn, opacity: nextGen ? 1 : 0.4 }} aria-label="Siguiente" disabled={!nextGen}
            onClick={() => nextGen && nav(`/asset/${nextGen.id}`)}>
            {ICONS.chevronRight}
          </button>
          <button style={{ ...iconBtn, color: d.favorite ? 'var(--warn)' : undefined }}
            aria-label={d.favorite ? 'Quitar de favoritos' : 'Marcar favorito'} onClick={toggleFav}>
            {ICONS.star(d.favorite)}
          </button>
          <button style={iconBtn} aria-label="Borrar" onClick={() => setConfirming(true)}>{ICONS.trash}</button>
        </div>
      </header>

      <div style={body}>
        <div style={stage}><AssetViewer gen={d} /></div>
        <MetaPanel d={d} />
      </div>

      {confirming && (
        <dialog open style={dialogStyle}>
          <p style={{ margin: '0 0 12px', color: 'var(--text-primary)' }}>¿Borrar «{basename(d.filePath)}»?</p>
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

const page: CSSProperties = { height: '100%', display: 'flex', flexDirection: 'column' };

const header: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
  padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
};
const crumb: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 };
const backLink: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)',
  textDecoration: 'none', fontSize: 13.5, fontFamily: 'var(--font-ui)', flexShrink: 0,
};
const sep: CSSProperties = { color: 'var(--border)' };
const filename: CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--text-primary)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const subline: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 };

const headerActions: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 };
const iconBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32,
  background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text-secondary)', cursor: 'pointer',
};

const body: CSSProperties = { flex: 1, minHeight: 0, display: 'flex' };
const stage: CSSProperties = { flex: 1, minWidth: 0 };

const dialogStyle: CSSProperties = {
  background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 20, fontFamily: 'var(--font-ui)', maxWidth: 360,
};
const fileLikeBtn: CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 7,
  padding: '7px 14px', color: 'var(--text-primary)', font: 'inherit', fontSize: 13, cursor: 'pointer',
};
