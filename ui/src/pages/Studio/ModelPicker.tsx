import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { ModelInfo } from '../../types';

const usd = (n: number) => `$${n.toFixed(3)}`;

// FR-11: el router sólo propone modelos cuyo proveedor tiene llave válida —
// un modelo sin key no debe aparecer en la lista, ni siquiera deshabilitado.
export default function ModelPicker({ models, value, onChange }: {
  models: ModelInfo[];
  value: string;
  onChange: (id: string) => void;
}) {
  const available = models.filter((m) => m.available);

  if (!available.length) {
    return (
      <section>
        <div style={label}>Modelo</div>
        <p style={empty}>
          Ningún proveedor de este tipo tiene key configurada.{' '}
          <Link to="/ajustes" style={link}>Configurar en Ajustes</Link>
        </p>
      </section>
    );
  }

  return (
    <section>
      <div style={label}>Modelo — sugerido por el router</div>
      <div style={list} role="radiogroup" aria-label="Modelo">
        {available.map((m, i) => {
          const selected = m.id === value;
          return (
            <label key={m.id} style={option(selected)}>
              <input
                type="radio"
                name="model"
                value={m.id}
                checked={selected}
                onChange={() => onChange(m.id)}
                style={radio}
              />
              <span style={selected ? checkOn : checkOff} aria-hidden="true">{selected ? '●' : ''}</span>
              <span style={info}>
                <span style={modelName}>{m.model}</span>
                <span style={providerTag}>{m.provider.toUpperCase()}</span>
                {i === 0 && <span style={hint}>por defecto</span>}
              </span>
              <span style={cost}>{m.unitCostUsd != null ? usd(m.unitCostUsd) : '—'}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

const label: CSSProperties = {
  fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--text-muted)', marginBottom: 8, fontFamily: 'var(--font-ui)',
};
const empty: CSSProperties = { fontSize: 13, color: 'var(--text-secondary)', margin: 0 };
const link: CSSProperties = { color: 'var(--accent)' };

const list: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const option = (selected: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
  background: selected ? 'var(--accent-soft)' : 'var(--bg-input)',
});
const radio: CSSProperties = { position: 'absolute', opacity: 0, width: 0, height: 0 };
const checkOn: CSSProperties = {
  width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--accent)', color: 'var(--accent)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, flexShrink: 0,
};
const checkOff: CSSProperties = { ...checkOn, border: '1px solid var(--border)', color: 'transparent' };
const info: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 6, flex: 1, minWidth: 0 };
const modelName: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const providerTag: CSSProperties = { fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 };
const hint: CSSProperties = { fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 };
const cost: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-secondary)', flexShrink: 0 };
