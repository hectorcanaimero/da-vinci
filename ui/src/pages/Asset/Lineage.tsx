import type { CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fileUrl } from '../../api';
import type { Generation } from '../../types';

const basename = (path: string) => path.split(/[\\/]/).pop() ?? path;

const icon = (d: string) => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const REF_ICON = icon('M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1');

function Thumb({ g }: { g: Generation }) {
  return (
    <Link to={`/asset/${g.id}`} title={g.prompt ?? basename(g.filePath)} style={col}>
      <span style={box}>
        {g.mime.startsWith('image/')
          ? <img src={fileUrl(g.id)} alt={g.prompt ?? g.id} style={thumbMedia} />
          : g.mime.startsWith('video/')
            ? <video src={fileUrl(g.id)} muted style={thumbMedia} />
            : <span style={kindLabel}>{g.kind}</span>}
      </span>
      <span style={caption}>{g.model}</span>
    </Link>
  );
}

function Placeholder({ label, title }: { label: string; title?: string }) {
  return (
    <div style={col} title={title}>
      <span style={box}><span style={kindLabel}>{label}</span></span>
      <span style={caption}>{label === '?' ? 'externo' : ''}</span>
    </div>
  );
}

type Props = { gen: Generation; parents: Generation[]; children: Generation[] };

export default function Lineage({ gen, parents, children }: Props) {
  const nav = useNavigate();
  const byId = new Map(parents.map((p) => [p.id, p]));

  const useAsReference = () => {
    const params = new URLSearchParams({ ref: gen.id, refMime: gen.mime, refName: basename(gen.filePath) });
    nav(`/estudio?${params.toString()}`);
  };

  return (
    <section style={section}>
      <div style={sectionHead}>
        <div style={sectionTitle}>Linaje</div>
        <button type="button" style={refBtn} onClick={useAsReference}>{REF_ICON} Usar como referencia</button>
      </div>

      <div style={sub}>
        <div style={subTitle}>Origen</div>
        {gen.inputs.length === 0
          ? <p style={empty}>Generación directa, sin origen.</p>
          : (
            <div style={row}>
              {gen.inputs.map((inp, i) => {
                if (!inp.id) return <Placeholder key={i} label="?" title={inp.ref ?? undefined} />;
                const p = byId.get(inp.id);
                return p ? <Thumb key={inp.id} g={p} /> : <Placeholder key={inp.id} label="⌀" title="origen borrado" />;
              })}
            </div>
          )}
      </div>

      <div style={sub}>
        <div style={subTitle}>Derivados{children.length > 0 ? ` · ${children.length}` : ''}</div>
        {children.length === 0
          ? <p style={empty}>Todavía no se generó nada a partir de este asset.</p>
          : <div style={row}>{children.map((c) => <Thumb key={c.id} g={c} />)}</div>}
      </div>
    </section>
  );
}

const section: CSSProperties = { marginBottom: 22 };
const sectionHead: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 };
const sectionTitle: CSSProperties = {
  fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase',
};
const refBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'var(--bone)',
  border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-ui)',
  cursor: 'pointer', whiteSpace: 'nowrap',
};

const sub: CSSProperties = { marginBottom: 16 };
const subTitle: CSSProperties = {
  fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', marginBottom: 8,
};
const empty: CSSProperties = { margin: 0, fontSize: 12.5, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' };

const row: CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap' };
const col: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, width: 80, textDecoration: 'none' };
const box: CSSProperties = {
  width: 80, height: 80, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
};
const thumbMedia: CSSProperties = { width: '100%', height: '100%', objectFit: 'cover' };
const kindLabel: CSSProperties = { fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' };
const caption: CSSProperties = {
  fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
