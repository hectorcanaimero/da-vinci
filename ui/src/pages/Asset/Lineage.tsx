import { Link } from 'react-router-dom';
import { fileUrl } from '../../api';
import type { Generation } from '../../types';

const box: React.CSSProperties = {
  width: 96, height: 96, border: '1px solid var(--border)', borderRadius: 6, display: 'flex',
  alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 12, overflow: 'hidden',
};

function Thumb({ g }: { g: Generation }) {
  return (
    <Link to={`/asset/${g.id}`} title={g.prompt ?? g.id} style={{ ...box, textDecoration: 'none', color: 'inherit' }}>
      {g.mime.startsWith('image/')
        ? <img src={fileUrl(g.id)} alt={g.prompt ?? g.id} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span>{g.kind}</span>}
    </Link>
  );
}

export default function Lineage({ gen, parents, children }: { gen: Generation; parents: Generation[]; children: Generation[] }) {
  const byId = new Map(parents.map((p) => [p.id, p]));
  return (
    <section>
      <h3>Origen</h3>
      {gen.inputs.length === 0 && <p>Sin origen (generación directa).</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {gen.inputs.map((inp, i) => {
          if (!inp.id) return <div key={i} style={box} title={inp.ref ?? ''}>externo{inp.ref ? `: ${inp.ref.slice(0, 40)}` : ''}</div>;
          const p = byId.get(inp.id);
          return p ? <Thumb key={inp.id} g={p} /> : <div key={inp.id} style={box}>origen borrado</div>;
        })}
      </div>
      <h3>Derivados</h3>
      {children.length === 0 && <p>Sin derivados.</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {children.map((c) => <Thumb key={c.id} g={c} />)}
      </div>
    </section>
  );
}
