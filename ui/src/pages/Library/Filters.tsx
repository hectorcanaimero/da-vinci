import type { CSSProperties, ReactNode } from 'react';
import type { Kind } from '../../types';

const icon = (children: ReactNode) => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const SEARCH_ICON = icon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
const STAR_ICON = icon(<path d="M12 3.3l2.6 5.4 5.9.8-4.3 4.2 1 5.9L12 16.8l-5.2 2.8 1-5.9-4.3-4.2 5.9-.8z" />);

export const KIND_LABEL: Partial<Record<Kind, string>> = {
  image: 'Imagen', video: 'Video', svg: 'SVG', 'model-3d': '3D',
  audio: 'Audio', sfx: 'SFX', 'bg-remove': 'Recorte', upscale: 'Upscale', 'avatar-video': 'Avatar',
};

// ponytail: the reference mock only surfaces the four most common kinds as pills;
// the rest stay reachable via "Todos" instead of crowding the bar.
const KIND_PILLS: Kind[] = ['image', 'video', 'svg', 'model-3d'];

export default function Filters({ path, q, onQ, kind, onKind, favorite, onFavorite }: {
  path: string;
  q: string; onQ: (v: string) => void;
  kind: string; onKind: (v: string) => void;
  favorite: boolean; onFavorite: (v: boolean) => void;
}) {
  return (
    <div style={bar}>
      <div style={pathChip} title={path || undefined}>
        <span style={pathText}>{path || '—'}</span>
      </div>

      <div style={searchWrap}>
        <span style={searchIcon}>{SEARCH_ICON}</span>
        <input type="search" placeholder="Buscar por prompt, modelo o proyecto…" aria-label="Buscar"
          value={q} onChange={(e) => onQ(e.target.value)} style={searchInput} />
      </div>

      <div style={pills} role="group" aria-label="Filtros">
        <button type="button" aria-pressed={!kind && !favorite} style={pill(!kind && !favorite)}
          onClick={() => { onKind(''); onFavorite(false); }}>
          Todos
        </button>
        <button type="button" aria-pressed={favorite} style={pill(favorite)} onClick={() => onFavorite(!favorite)}>
          <span style={pillIcon}>{STAR_ICON}</span>Favoritos
        </button>
        {KIND_PILLS.map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} style={pill(kind === k)}
            onClick={() => onKind(kind === k ? '' : k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
    </div>
  );
}

const bar: CSSProperties = {
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16,
};

const pathChip: CSSProperties = {
  display: 'flex', alignItems: 'center', height: 34, padding: '0 12px',
  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8,
  fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0,
};
const pathText: CSSProperties = { maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

const searchWrap: CSSProperties = { position: 'relative', flex: '1 1 240px', minWidth: 180 };
const searchIcon: CSSProperties = {
  position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)',
  display: 'flex', pointerEvents: 'none',
};
const searchInput: CSSProperties = {
  width: '100%', height: 34, boxSizing: 'border-box', padding: '0 12px 0 32px',
  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text-primary)', font: 'inherit', fontFamily: 'var(--font-ui)', fontSize: 13,
};

const pills: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, marginLeft: 'auto' };
const pill = (active: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px',
  background: active ? 'var(--accent)' : 'var(--bg-surface)',
  color: active ? 'var(--bg-app)' : 'var(--text-secondary)',
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  borderRadius: 999, fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: active ? 600 : 500,
  cursor: 'pointer', whiteSpace: 'nowrap',
});
const pillIcon: CSSProperties = { display: 'flex' };
