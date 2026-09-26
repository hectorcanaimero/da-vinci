import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listLibrary, listModels, listProjects } from '../../api';
import { useServerEvents } from '../../sse';
import type { Generation, ModelInfo } from '../../types';
import Card from './Card';
import './library.css';

const KINDS = ['image', 'svg', 'video', 'audio', 'sfx', 'model-3d', 'bg-remove', 'upscale', 'avatar-video'];
const FILTERS = ['kind', 'provider', 'model', 'project', 'from', 'to', 'favorite'] as const;
const LIMIT = 60;

export default function Library() {
  const [sp, setSp] = useSearchParams();
  const get = (k: string) => sp.get(k) ?? '';
  const [qText, setQText] = useState(get('q'));
  const [items, setItems] = useState<Generation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [more, setMore] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const sentinel = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const set = (k: string, v: string) => setSp((p) => {
    const n = new URLSearchParams(p);
    if (v) n.set(k, v); else n.delete(k);
    return n;
  }, { replace: true });

  useEffect(() => {
    listModels().then((r) => setModels(r.items)).catch(() => {});
    listProjects().then((r) => setProjects(r.items.map((p) => p.dir))).catch(() => {});
  }, []);

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
    for (const k of ['q', ...FILTERS]) if (sp.get(k)) q[k] = sp.get(k)!;
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
      && (!get('provider') || g.provider === get('provider'))
      && (!get('model') || g.model === get('model'))
      && (!get('project') || g.projectDir === get('project'))
      && (!get('from') || g.createdAt >= get('from'))
      && (!get('to') || g.createdAt <= (get('to').length === 10 ? `${get('to')}T23:59:59.999Z` : get('to')))
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

  const providers = [...new Set(models.map((m) => m.provider))].sort();
  const sel = (k: string, label: string, opts: string[]) => (
    <select aria-label={label} value={get(k)} onChange={(e) => set(k, e.target.value)}>
      <option value="">{label}</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <>
      <h1>Library</h1>
      <div className="lib-bar">
        <input type="search" placeholder="Search prompts…" aria-label="Search" value={qText}
          onChange={(e) => setQText(e.target.value)} />
        {sel('kind', 'Type', KINDS)}
        {sel('provider', 'Provider', providers)}
        {sel('model', 'Model', [...new Set(models.map((m) => m.model))].sort())}
        {sel('project', 'Project', projects)}
        <input type="date" aria-label="From" value={get('from')} onChange={(e) => set('from', e.target.value)} />
        <input type="date" aria-label="To" value={get('to')} onChange={(e) => set('to', e.target.value)} />
        <label><input type="checkbox" checked={!!get('favorite')} onChange={(e) => set('favorite', e.target.checked ? 'true' : '')} /> Favorites</label>
      </div>
      {state === 'error' && <p role="alert" className="lib-state">Could not load the library. <button onClick={load}>Retry</button></p>}
      {state === 'loading' && <p className="lib-state">Loading…</p>}
      {state === 'ok' && items.length === 0 && <p className="lib-state">No generations match.</p>}
      <div className="lib-grid">{items.map((g) => <Card key={g.id} g={g} onFav={onFav} />)}</div>
      <div ref={sentinel} style={{ height: 1 }} />
      {more && <p className="lib-state">Loading…</p>}
    </>
  );
}
