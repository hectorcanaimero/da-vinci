import { useEffect, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';

// FR-47: el tema sigue al sistema operativo y se puede forzar. `tokens.css`
// hoy sólo define `:root[data-theme='dark']` — el período sepia, el único
// con valores reales. "Sistema" en preferencia clara cae a `data-theme`
// sin bloque propio (la deuda de diseño que reconoce el A7 del PRD): la
// interfaz queda sin estilizar en vez de romperse, y eso sigue siendo
// "acompañar" al sistema en el sentido de FR-47.
type ThemeMode = 'system' | 'dark';
type Font = 'inter' | 'sistema';
type Density = 'compacta' | 'comoda';

export type AppearanceConfig = {
  theme?: ThemeMode;
  font?: Font;
  density?: Density;
  reducedMotion?: boolean;
};

const MOTION_STYLE_ID = 'reveron-reduced-motion';
let currentMode: ThemeMode = 'system';

function prefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveDataTheme(mode: ThemeMode): 'dark' | 'light' {
  return mode === 'dark' || prefersDark() ? 'dark' : 'light';
}

function applyFont(font: Font | undefined) {
  const root = document.documentElement.style;
  if (font === 'sistema') root.setProperty('--font-ui', '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
  else root.removeProperty('--font-ui');
}

function applyReducedMotion(on: boolean) {
  let tag = document.getElementById(MOTION_STYLE_ID);
  if (on) {
    if (!tag) {
      tag = document.createElement('style');
      tag.id = MOTION_STYLE_ID;
      tag.textContent = '*, *::before, *::after { animation-duration: 0.001ms !important; '
        + 'animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; scroll-behavior: auto !important; }';
      document.head.appendChild(tag);
    }
  } else {
    tag?.remove();
  }
}

/** Aplica de inmediato — la llama tanto Ajustes (al tocar un control) como el bootstrap de la app. */
export function applyAppearance(cfg: AppearanceConfig) {
  currentMode = cfg.theme === 'dark' ? 'dark' : 'system';
  document.documentElement.dataset.theme = resolveDataTheme(currentMode);
  document.documentElement.dataset.density = cfg.density ?? 'comoda';
  applyFont(cfg.font);
  applyReducedMotion(!!cfg.reducedMotion);
}

/** Bootstrap de app entera (llamado una vez desde App.tsx): carga lo guardado
 * y deja el listener que hace que un cambio de tema del sistema, con la app
 * abierta, la acompañe en vivo (Done-when de F6.4.T2 / FR-47). */
export function initAppearance() {
  invoke<{ appearance?: AppearanceConfig }>('config_get')
    .then((c) => applyAppearance(c.appearance ?? {}))
    .catch(() => applyAppearance({}));

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (currentMode === 'system') document.documentElement.dataset.theme = resolveDataTheme('system');
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

const PERIODS: Array<{ key: 'sepia' | 'blanco' | 'azul'; title: string; subtitle: string; enabled: boolean; swatch: string }> = [
  { key: 'sepia', title: 'Período sepia', subtitle: 'Oscuro cálido — por defecto', enabled: true, swatch: 'var(--bg-app)' },
  { key: 'blanco', title: 'Período blanco', subtitle: 'Claro, papel y hueso', enabled: false, swatch: 'var(--bone)' },
  { key: 'azul', title: 'Período azul', subtitle: 'Oscuro frío, alto contraste', enabled: false, swatch: 'var(--bg-elevated)' },
];

export default function Appearance() {
  const [cfg, setCfg] = useState<AppearanceConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [osDark, setOsDark] = useState(prefersDark());

  useEffect(() => {
    invoke<{ appearance?: AppearanceConfig }>('config_get')
      .then((c) => setCfg(c.appearance ?? {}))
      .catch((e) => setError(String(e)));
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setOsDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const patch = (next: Partial<AppearanceConfig>) => {
    const merged = { ...(cfg ?? {}), ...next };
    setCfg(merged);
    applyAppearance(merged);
    invoke('config_set', { patch: { appearance: merged } }).catch((e) => setError(String(e)));
  };

  if (!cfg) return <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>;

  const followSystem = (cfg.theme ?? 'system') === 'system';
  const font = cfg.font ?? 'inter';
  const density = cfg.density ?? 'comoda';
  const activePeriod = followSystem ? (osDark ? 'sepia' : 'blanco') : 'sepia';

  return (
    <div style={wrap}>
      <section>
        <h2 style={h2}>Tema</h2>
        <p style={lead}>Los tres períodos de Armando Reverón. El sistema sigue a macOS.</p>

        <div style={field}>
          <div style={labelWrap}>
            <div style={label}>Seguir al sistema</div>
            <div style={hint}>Con esto activado, la app acompaña el modo claro/oscuro del sistema (FR-47).</div>
          </div>
          <Switch checked={followSystem} onChange={(v) => patch({ theme: v ? 'system' : 'dark' })} />
        </div>

        <div style={cardsRow}>
          {PERIODS.map((p) => {
            const forced = !followSystem && p.key === 'sepia';
            const isActive = followSystem ? activePeriod === p.key : forced;
            const clickable = p.enabled && !followSystem;
            return (
              <button
                key={p.key} type="button" style={periodCard(isActive, p.enabled)}
                disabled={!clickable} onClick={() => clickable && patch({ theme: 'dark' })}
              >
                <div style={periodPreview(p.swatch)} />
                <div style={periodTitle}>{p.title}</div>
                <div style={periodSubtitle}>{p.subtitle}</div>
                {!p.enabled && <div style={periodReason}>Sin tokens definidos todavía — deuda de diseño (PRD A7)</div>}
                {isActive && <span style={checkDot} />}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 style={h3}>Ajustes finos</h3>

        <div style={field}>
          <div style={labelWrap}>
            <div style={label}>Color de acento</div>
            <div style={hint}>Se aplica a botones, foco y estados activos. Paleta de acentos: pendiente.</div>
          </div>
          <div style={accentRow}>
            <span style={accentSwatch} />
            <span style={hint}>Sepia (por defecto)</span>
          </div>
        </div>

        <div style={field}>
          <div style={labelWrap}>
            <div style={label}>Densidad</div>
            <div style={hint}>Compacta muestra más filas por pantalla.</div>
          </div>
          <Segmented
            options={[{ value: 'compacta', label: 'Compacta' }, { value: 'comoda', label: 'Cómoda' }]}
            value={density} onChange={(v) => patch({ density: v as Density })}
          />
        </div>

        <div style={field}>
          <div style={labelWrap}>
            <div style={label}>Tipografía de interfaz</div>
            <div style={hint}>Los títulos siempre usan Fraunces.</div>
          </div>
          <Segmented
            options={[{ value: 'inter', label: 'Inter' }, { value: 'sistema', label: 'Sistema' }]}
            value={font} onChange={(v) => patch({ font: v as Font })}
          />
        </div>

        <div style={field}>
          <div style={labelWrap}>
            <div style={label}>Reducir movimiento</div>
            <div style={hint}>Desactiva las transiciones y animaciones de toda la app.</div>
          </div>
          <Switch checked={!!cfg.reducedMotion} onChange={(v) => patch({ reducedMotion: v })} />
        </div>
      </section>

      {error && <div style={errorBox}>{error}</div>}
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} style={switchTrack(checked)} onClick={() => onChange(!checked)}>
      <span style={switchThumb} />
    </button>
  );
}

function Segmented({ options, value, onChange }: { options: Array<{ value: string; label: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <div style={segmentWrap}>
      {options.map((o) => (
        <button key={o.value} type="button" style={segmentBtn(o.value === value)} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 820 };
const h2: CSSProperties = { fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' };
const h3: CSSProperties = { fontSize: 13.5, fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' };
const lead: CSSProperties = { fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' };

const errorBox: CSSProperties = {
  padding: '10px 12px', borderRadius: 8, border: '1px solid var(--danger)',
  color: 'var(--danger)', fontSize: 12.5, background: 'var(--bg-surface)',
};

const field: CSSProperties = {
  display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'center',
  padding: '14px 0', borderTop: '1px solid var(--border-soft)',
};
const labelWrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
const label: CSSProperties = { fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' };
const hint: CSSProperties = { fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4 };

const cardsRow: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 6 };
const periodCard = (isActive: boolean, enabled: boolean): CSSProperties => ({
  position: 'relative', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8,
  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
  background: isActive ? 'var(--accent-soft)' : 'var(--bg-surface)',
  borderRadius: 12, padding: '14px 16px', opacity: enabled ? 1 : 0.55,
  cursor: enabled ? 'pointer' : 'not-allowed', font: 'inherit', color: 'inherit',
});
const periodPreview = (bg: string): CSSProperties => ({ height: 28, borderRadius: 6, background: bg, border: '1px solid var(--border-soft)' });
const periodTitle: CSSProperties = { fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' };
const periodSubtitle: CSSProperties = { fontSize: 11.5, color: 'var(--text-muted)', marginTop: -4 };
const periodReason: CSSProperties = { fontSize: 10.5, color: 'var(--warn)', lineHeight: 1.4 };
const checkDot: CSSProperties = { position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' };

const accentRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
const accentSwatch: CSSProperties = { width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', border: '1px solid var(--border-soft)' };

const segmentWrap: CSSProperties = {
  display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, padding: 2, background: 'var(--bg-input)', width: 'fit-content',
};
const segmentBtn = (active: boolean): CSSProperties => ({
  border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'var(--font-ui)', background: active ? 'var(--bg-elevated)' : 'transparent',
  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
});

const switchTrack = (on: boolean): CSSProperties => ({
  width: 36, height: 20, borderRadius: 10, border: 'none', padding: 2, flexShrink: 0,
  background: on ? 'var(--accent)' : 'var(--bg-input)', cursor: 'pointer', display: 'flex',
  justifyContent: on ? 'flex-end' : 'flex-start', boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--border)',
});
const switchThumb: CSSProperties = { width: 16, height: 16, borderRadius: '50%', background: 'var(--bone)' };
