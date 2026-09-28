import type { CSSProperties, MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fileUrl, setFavorite } from '../../api';
import VirtualGrid from '../../components/VirtualGrid';
import type { Generation } from '../../types';
import { relTime } from './Card';
import { KIND_LABEL } from './Filters';

const ICON: Record<string, string> = { audio: '🎵', sfx: '🔊', 'model-3d': '🧊' };
const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1) || p;
const usd = (n: number) => `$${n.toFixed(3)}`;
const ROW_HEIGHT = 53;
const COLS = 8;

export default function ListView({ items, onFav }: {
  items: Generation[];
  onFav: (id: string, fav: boolean) => void;
}) {
  const nav = useNavigate();

  const toggleFav = async (e: MouseEvent, g: Generation) => {
    e.stopPropagation();
    onFav(g.id, !g.favorite); // optimistic
    try { await setFavorite(g.id, !g.favorite); } catch { onFav(g.id, g.favorite); }
  };

  return (
    <table style={table}>
      <thead>
        <tr>
          <th style={{ ...th, width: 48 }} />
          <th style={th}>Nombre y prompt</th>
          <th style={th}>Tipo</th>
          <th style={th}>Modelo</th>
          <th style={th}>Proyecto</th>
          <th style={{ ...th, textAlign: 'right' }}>Costo</th>
          <th style={th}>Creado</th>
          <th style={{ ...th, width: 40 }} />
        </tr>
      </thead>
      <VirtualGrid items={items} as="tbody" rowHeight={ROW_HEIGHT} placeholderColSpan={COLS}
        renderRow={([g]) => (
          <tr key={g.id} style={row} tabIndex={0} onClick={() => nav(`/asset/${g.id}`)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) nav(`/asset/${g.id}`); }}>
            <td style={td}>
              {ICON[g.kind]
                ? <span style={thumbIcon}>{ICON[g.kind]}</span>
                : <img src={fileUrl(g.id)} alt="" style={thumb} loading="lazy" />}
            </td>
            <td style={td}>
              <div style={name}>{basename(g.filePath)}</div>
              <div style={promptCell} title={g.prompt ?? ''}>{g.prompt ?? '(sin prompt)'}</div>
            </td>
            <td style={td}><span style={badge}>{KIND_LABEL[g.kind] ?? g.kind}</span></td>
            <td style={{ ...td, color: 'var(--text-secondary)' }}>{g.model}</td>
            <td style={{ ...td, color: 'var(--text-secondary)' }}>{g.projectDir ?? '—'}</td>
            <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{usd(g.costUsd)}</td>
            <td style={{ ...td, color: 'var(--text-muted)' }}>{relTime(g.createdAt)}</td>
            <td style={td}>
              <button type="button" aria-pressed={g.favorite}
                aria-label={g.favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                style={star(g.favorite)} onClick={(e) => toggleFav(e, g)}>
                {g.favorite ? '★' : '☆'}
              </button>
            </td>
          </tr>
        )} />
    </table>
  );
}

const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-ui)', fontSize: 13 };
const th: CSSProperties = {
  textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 500, fontSize: 12,
  borderBottom: '1px solid var(--border)',
};
const row: CSSProperties = { cursor: 'pointer', borderBottom: '1px solid var(--border-soft)' };
const td: CSSProperties = { padding: '8px 10px', color: 'var(--text-primary)', verticalAlign: 'middle' };
const thumb: CSSProperties = { width: 36, height: 36, borderRadius: 6, objectFit: 'cover', background: 'var(--bg-app)' };
const thumbIcon: CSSProperties = {
  width: 36, height: 36, borderRadius: 6, background: 'var(--bg-app)',
  display: 'grid', placeItems: 'center', fontSize: 16,
};
const name: CSSProperties = { fontWeight: 600 };
const promptCell: CSSProperties = {
  color: 'var(--text-muted)', fontSize: 12, maxWidth: 360, overflow: 'hidden',
  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const badge: CSSProperties = {
  display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500,
};
const star = (on: boolean): CSSProperties => ({
  background: 'none', border: 0, cursor: 'pointer', fontSize: '1.1rem',
  color: on ? '#ffc94d' : 'var(--text-muted)',
});
