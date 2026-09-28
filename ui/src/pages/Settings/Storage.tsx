import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

const icon = (children: ReactNode) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const OPEN_ICON = icon(<><path d="M6 18 18 6" /><path d="M9 6h9v9" /></>);

// FR-46: la carpeta vive en config.json (`assetsDir`), el mismo archivo que
// ya gobierna puerto/presupuesto (src/core/config.mjs). `resolveOutputDir`
// (src/utils/manifest.mjs) la usa apenas está seteada — sin reiniciar nada.
export default function Storage() {
  const [assetsDir, setAssetsDir] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<{ assetsDir?: string | null }>('config_get')
      .then((cfg) => setAssetsDir(cfg.assetsDir ?? null))
      .catch((e) => setError(String(e)))
      .finally(() => setLoaded(true));
  }, []);

  const persist = (dir: string | null) => {
    setAssetsDir(dir);
    invoke('config_set', { patch: { assetsDir: dir } }).catch((e) => setError(String(e)));
  };

  const choose = async () => {
    try {
      const dir = await invoke<string | null>('pick_directory', { prompt: 'Elegí la carpeta de assets' });
      if (dir) persist(dir);
    } catch (e) {
      setError(String(e));
    }
  };

  const open = () => {
    if (assetsDir) invoke('open_path', { path: assetsDir }).catch((e) => setError(String(e)));
  };

  if (!loaded) return <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>;

  return (
    <div style={wrap}>
      <section>
        <h2 style={h2}>Almacenamiento</h2>
        <p style={lead}>Dónde aterrizan los archivos que ves en la galería.</p>

        {error && <div style={errorBox}>{error}</div>}

        <div style={field}>
          <div style={labelWrap}>
            <div style={label}>Carpeta de assets</div>
            <div style={hint}>
              {assetsDir
                ? 'Las generaciones nuevas quedan acá y se registran en la biblioteca.'
                : 'Sin elegir todavía: se usa la carpeta por defecto del servidor local.'}
            </div>
          </div>
          <div style={inputRow}>
            <input style={input} value={assetsDir ?? ''} readOnly placeholder="carpeta por defecto (assets/generated)" />
            <button type="button" style={iconBtn} onClick={open} disabled={!assetsDir} title="Abrir">
              {OPEN_ICON}
            </button>
            <button type="button" style={btn} onClick={choose}>Cambiar…</button>
          </div>
        </div>
      </section>
    </div>
  );
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 760 };
const h2: CSSProperties = { fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' };
const lead: CSSProperties = { fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' };

const errorBox: CSSProperties = {
  marginBottom: 14, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--danger)',
  color: 'var(--danger)', fontSize: 12.5, background: 'var(--bg-surface)',
};

const field: CSSProperties = {
  display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'center',
  padding: '14px 0', borderTop: '1px solid var(--border-soft)',
};
const labelWrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
const label: CSSProperties = { fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' };
const hint: CSSProperties = { fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4 };

const inputRow: CSSProperties = { display: 'flex', gap: 8 };
const input: CSSProperties = {
  flex: 1, minWidth: 0, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-primary)', outline: 'none',
};
const btn: CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 500, padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const iconBtn: CSSProperties = { ...btn, padding: '8px 10px', display: 'flex', alignItems: 'center' };
