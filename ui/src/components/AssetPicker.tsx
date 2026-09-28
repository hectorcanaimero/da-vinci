import { useEffect, useState } from 'react';
import { fileUrl, listLibrary } from '../api';
import type { Generation, Kind } from '../types';

// `path` es un archivo local (arrastrado desde el SO, todavía no subido) —
// no hay id ni url para previsualizarlo, sólo el nombre.
export type PickedInput = { id?: string; url?: string; path?: string; name?: string; mime?: string };

const KINDS: Kind[] = ['image', 'svg', 'video', 'audio', 'sfx', 'model-3d', 'bg-remove', 'upscale', 'avatar-video'];

export function Thumb({ input, size = 64 }: { input: PickedInput; size?: number }) {
  if (!input.id && !input.url) {
    const ext = (input.name ?? input.path ?? '').split('.').pop()?.toUpperCase();
    return (
      <span style={{
        width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6, background: 'var(--bg-elevated)', color: 'var(--text-muted)',
        fontSize: 10, fontFamily: 'var(--font-mono)',
      }}>{ext || '?'}</span>
    );
  }
  const src = input.id ? fileUrl(input.id) : input.url!;
  const mime = input.mime ?? '';
  const style = { width: size, height: size, objectFit: 'cover' as const, borderRadius: 6 };
  if (mime.startsWith('video/')) return <video src={src} muted style={style} />;
  return <img src={src} alt={input.id ?? input.url} style={style} />;
}

// Modal to pick library assets (search + kind filter) or paste a URL.
export default function AssetPicker({ multiple, onPick, onClose }: {
  multiple: boolean; onPick: (items: PickedInput[]) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [items, setItems] = useState<Generation[]>([]);
  const [chosen, setChosen] = useState<PickedInput[]>([]);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    const t = setTimeout(() => {
      listLibrary({ q, kind, limit: 30 })
        .then((r) => { if (!stale) { setItems(r.items); setError(null); } })
        .catch((e: Error) => { if (!stale) setError(e.message); });
    }, 250);
    return () => { stale = true; clearTimeout(t); };
  }, [q, kind]);

  const isChosen = (id: string) => chosen.some((c) => c.id === id);
  const toggle = (g: Generation) => setChosen((p) => {
    if (isChosen(g.id)) return p.filter((c) => c.id !== g.id);
    const next = { id: g.id, mime: g.mime };
    return multiple ? [...p, next] : [next];
  });
  const addUrl = () => {
    const u = url.trim();
    if (!u) return;
    setChosen((p) => (multiple ? [...p, { url: u }] : [{ url: u }]));
    setUrl('');
  };

  return (
    <dialog open role="dialog" aria-label="Elegir assets">
      <div>
        <input type="search" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />{' '}
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo">
          <option value="">Todos</option>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      {error && <p role="alert">{error}</p>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 320, overflow: 'auto' }}>
        {items.map((g) => (
          <li key={g.id}>
            <button type="button" aria-pressed={isChosen(g.id)} onClick={() => toggle(g)}
              style={{ outline: isChosen(g.id) ? '2px solid currentColor' : undefined }}>
              <Thumb input={{ id: g.id, mime: g.mime }} />
              <small style={{ display: 'block' }}>{g.kind}</small>
            </button>
          </li>
        ))}
      </ul>
      <div>
        <input type="url" placeholder="o pega una URL" value={url} onChange={(e) => setUrl(e.target.value)} />{' '}
        <button type="button" onClick={addUrl}>Añadir URL</button>
      </div>
      {chosen.length > 0 && <p>{chosen.length} elegido(s)</p>}
      <button type="button" disabled={!chosen.length} onClick={() => onPick(chosen)}>Usar</button>{' '}
      <button type="button" onClick={onClose}>Cancelar</button>
    </dialog>
  );
}
