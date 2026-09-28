import { useEffect, useState, type CSSProperties } from 'react';
import { listModels } from '../../api';

const PROVIDERS_TOTAL = 7;

export default function ArtPanel() {
  const [modelsCount, setModelsCount] = useState<number | null>(null);
  useEffect(() => { listModels().then((r) => setModelsCount(r.items.length)).catch(() => {}); }, []);

  return (
    <div style={panel}>
      <div style={scrim} />
      <div style={content}>
        <div style={brand}>
          <div style={mark}>R</div>
          <div style={wordmark}>Reverón</div>
        </div>
        <p style={tagline}>
          Un estudio local para generar imágenes, video, voz y 3D — con {modelsCount ?? '32'} modelos
          de {PROVIDERS_TOTAL} proveedores y el costo siempre a la vista.
        </p>
        <div style={facts}>
          <Fact value={modelsCount ?? '—'} label="modelos" />
          <Fact value={PROVIDERS_TOTAL} label="proveedores" />
          <Fact value="$0" label="de suscripción" />
        </div>
      </div>
    </div>
  );
}

function Fact({ value, label }: { value: string | number; label: string }) {
  return (
    <div style={fact}>
      <div style={factValue}>{value}</div>
      <div style={factLabel}>{label}</div>
    </div>
  );
}

// ponytail: mock uses a stock photo behind the scrim; there's no asset
// pipeline for decorative art yet, so a token-colored gradient stands in.
// Swap for a generated/curated image once F2.3 gets a design asset source.
const panel: CSSProperties = {
  position: 'relative',
  width: 520,
  minWidth: 340,
  height: '100%',
  flexShrink: 0,
  background: 'radial-gradient(140% 100% at 15% 100%, var(--accent-soft), var(--bg-app) 62%)',
  overflow: 'hidden',
};
const scrim: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(0deg, var(--bg-app) 0%, transparent 58%)',
};
const content: CSSProperties = {
  position: 'absolute',
  left: 44,
  right: 44,
  bottom: 64,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};
const brand: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 };
const mark: CSSProperties = {
  width: 38, height: 38, borderRadius: 11,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--accent)', color: 'var(--bg-app)',
  fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 21,
};
const wordmark: CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 34, color: 'var(--text-primary)',
};
const tagline: CSSProperties = {
  margin: 0, fontFamily: 'var(--font-ui)', fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary)',
};
const facts: CSSProperties = { display: 'flex', gap: 24 };
const fact: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1 };
const factValue: CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19, color: 'var(--bone)',
};
const factLabel: CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 10.5, color: 'var(--text-muted)' };
