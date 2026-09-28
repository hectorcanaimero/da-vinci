import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listLibrary } from '../../api';
import VirtualGrid from '../../components/VirtualGrid';
import { useServerEvents } from '../../sse';
import type { Generation } from '../../types';
import Card from './Card';
import EmptyState from './EmptyState';
import Filters from './Filters';
import ListView from './ListView';
import './library.css';

const CARD_MIN_WIDTH = 200;
const CARD_GAP = 16;
const CARD_ROW_HEIGHT = 260;

const LIMIT = 60;

// ponytail: no endpoint exposes the assets root directly — derive it from
// whatever's loaded instead of hardcoding a guess. Upgrade if an /api/config
// (or similar) ever surfaces it directly.
function commonDir(items: Generation[]): string {
  const p = items[0]?.filePath;
  if (!p) return '';
  const i = p.lastIndexOf('/');
  return i > 0 ? p.slice(0, i) : '';
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

const icon = (children: ReactNode) => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const GRID_ICON = icon(<><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></>);
const LIST_ICON = icon(<><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>);

export default function Library() {
  const [sp, setSp] = useSearchParams();
  const get = (k: string) => sp.get(k) ?? '';
  const [qText, setQText] = useState(get('q'));
  const [items, setItems] = useState<Generation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [more, setMore] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const view = get('view') === 'list' ? 'list' : 'grid';

  const set = (k: string, v: string) => setSp((p) => {
    const n = new URLSearchParams(p);
    if (v) n.set(k, v); else n.delete(k);
    return n;
  }, { replace: true });

  // debounce search text into the query string
  useEffect(() => {
    if (qText === get('q')) return;
    const t = setTimeout(() => set('q', qText), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qText]);

  const query = sp.toString();
  const params = useCallback(() => {
    const q: Record<string, string | number> = { limit: LIMIT };
    for (const k of ['q', 'kind', 'favorite'] as const) if (sp.get(k)) q[k] = sp.get(k)!;
    return q;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const load = useCallback(() => {
    const id = ++seq.current;
    setState('loading'); setItems([]); setCursor(null);
    listLibrary(params())
      .then((r) => { if (id === seq.current) { setItems(r.items); setCursor(r.nextCursor); setState('ok'); } })
      .catch(() => { if (id === seq.current) setState('error'); });
  }, [params]);
  useEffect(load, [load]);

  const loadMore = useCallback(() => {
    if (!cursor || more) return;
    const id = seq.current;
    setMore(true);
    listLibrary({ ...params(), cursor })
      .then((r) => {
        if (id !== seq.current) return;
        setItems((cur) => {
          const seen = new Set(cur.map((g) => g.id));
          return [...cur, ...r.items.filter((g) => !seen.has(g.id))];
        });
        setCursor(r.nextCursor);
      })
      .catch(() => { if (id === seq.current) setState('error'); })
      .finally(() => setMore(false));
  }, [cursor, more, params]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) loadMore(); }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, state]);

  // SSE: callbacks are captured once by useServerEvents, so read the latest filters via a ref.
  const matches = useRef<(g: Generation) => boolean>(() => true);
  matches.current = (g) => {
    const q = get('q').toLowerCase();
    return (!q || (g.prompt ?? '').toLowerCase().includes(q))
      && (!get('kind') || g.kind === get('kind'))
      && (!get('favorite') || g.favorite);
  };
  useServerEvents(
    (g) => {
      if (!matches.current(g)) return;
      setItems((cur) => (cur.some((x) => x.id === g.id) ? cur : [g, ...cur]));
      setState('ok');
    },
    (id) => setItems((cur) => cur.filter((g) => g.id !== id)),
  );

  const onFav = (id: string, favorite: boolean) =>
    setItems((cur) => cur.map((g) => (g.id === id ? { ...g, favorite } : g)));

  const path = useMemo(() => commonDir(items), [items]);
  const totalBytes = useMemo(() => items.reduce((n, g) => n + (g.bytes || 0), 0), [items]);

  return (
    <div style={page}>
      <div style={titleRow}>
        <h1 style={title}>Galería</h1>
        <div style={viewToggle} role="group" aria-label="Vista">
          <button type="button" aria-pressed={view === 'grid'} aria-label="Grilla"
            style={toggleBtn(view === 'grid')} onClick={() => set('view', '')}>{GRID_ICON}</button>
          <button type="button" aria-pressed={view === 'list'} aria-label="Lista"
            style={toggleBtn(view === 'list')} onClick={() => set('view', 'list')}>{LIST_ICON}</button>
        </div>
      </div>

      <Filters path={path} q={qText} onQ={setQText}
        kind={get('kind')} onKind={(v) => set('kind', v)}
        favorite={!!get('favorite')} onFavorite={(v) => set('favorite', v ? 'true' : '')} />

      {state === 'error' && <p role="alert" className="lib-state">No se pudo cargar la biblioteca. <button onClick={load}>Reintentar</button></p>}
      {state === 'loading' && <p className="lib-state">Cargando…</p>}
      {state === 'ok' && items.length === 0 && !get('q') && !get('kind') && !get('favorite')
        && <EmptyState onImported={load} />}
      {state === 'ok' && items.length === 0 && (get('q') || get('kind') || get('favorite'))
        && <p className="lib-state">No hay generaciones que coincidan.</p>}

      {items.length > 0 && (view === 'grid'
        ? (
          <VirtualGrid items={items} rowHeight={CARD_ROW_HEIGHT} gap={CARD_GAP} minColumnWidth={CARD_MIN_WIDTH}
            renderRow={(row, _i, columns) => (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: CARD_GAP }}>
                {row.map((g) => <Card key={g.id} g={g} onFav={onFav} />)}
              </div>
            )} />
        )
        : <ListView items={items} onFav={onFav} />)}

      <div ref={sentinel} style={{ height: 1 }} />
      {more && <p className="lib-state">Cargando…</p>}

      {items.length > 0 && (
        <div style={footer}>
          <span>{items.length}{cursor ? '+' : ''} assets · {fmtBytes(totalBytes)} en disco</span>
        </div>
      )}
    </div>
  );
}

const page: CSSProperties = { padding: 24, fontFamily: 'var(--font-ui)', color: 'var(--text-primary)' };
const titleRow: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 };
const title: CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, margin: 0 };
const viewToggle: CSSProperties = {
  display: 'flex', gap: 2, padding: 2, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8,
};
const toggleBtn = (active: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 28, border: 0, borderRadius: 6,
  background: active ? 'var(--bg-elevated)' : 'transparent',
  color: active ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer',
});
const footer: CSSProperties = {
  marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-soft)',
  color: 'var(--text-muted)', fontSize: 12.5,
};
