import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Lo que reporta `agent_detect()` (src-tauri/src/agent.rs, F5.1.T1).
type AgentInfo = { name: string; path: string; version: string | null; available: boolean };

type PermissionMode = 'auto' | 'plan' | 'ask';

// FR-38: elección del agente, binario, modelo, modo de permisos y directorio
// de trabajo. Se persiste en config.json (comandos `config_get`/`config_set`)
// para que F5.1.T2 pueda leer el mismo directorio de trabajo al lanzar el
// subproceso — no hay otro camino del webview al disco (D8).
type AgentConfig = {
  name: string;
  binary: string;
  model: string;
  permissionMode: PermissionMode;
  workingDir: string | null;
  skill: boolean;
};

const DEFAULT_CONFIG: AgentConfig = {
  name: '', binary: '', model: '', permissionMode: 'plan', workingDir: null, skill: true,
};

// Sugerencias sólo para Claude Code: son los modelos vigentes en esta sesión
// (ver contexto del entorno). Para el resto, campo libre — no hay forma de
// verificar acá qué modelos expone cada CLI de terceros.
const CLAUDE_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001', 'claude-fable-5-1'];

const PERMISSION_LABELS: Record<PermissionMode, string> = { auto: 'Auto', plan: 'Plan primero', ask: 'Preguntar siempre' };

function binaryName(path: string) {
  return path.split(/[/\\]/).pop() ?? path;
}

const icon = (children: ReactNode) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const FOLDER_ICON = icon(<path d="M4 6a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />);
const OPEN_ICON = icon(<><path d="M6 18 18 6" /><path d="M9 6h9v9" /></>);
const CHECK_ICON = icon(<><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12 2.5 2.5L16 9" /></>);

export default function Agents() {
  const [detected, setDetected] = useState<AgentInfo[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [cfg, setCfg] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detect = () => {
    setDetecting(true);
    return invoke<AgentInfo[]>('agent_detect')
      .then((list) => setDetected(list))
      .catch((e) => setError(String(e)))
      .finally(() => setDetecting(false));
  };

  useEffect(() => {
    detect();
    invoke<{ agent?: Partial<AgentConfig> }>('config_get')
      .then((full) => setCfg((c) => ({ ...c, ...full.agent })))
      .catch((e) => setError(String(e)))
      .finally(() => setLoaded(true));
  }, []);

  const save = (patch: Partial<AgentConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    invoke('config_set', { patch: { agent: next } }).catch((e) => setError(String(e)));
  };

  const selectAgent = (a: AgentInfo) => save({ name: a.name, binary: a.path });

  const chooseWorkingDir = async () => {
    try {
      const dir = await invoke<string | null>('pick_directory', { prompt: 'Elegí el directorio de trabajo del agente' });
      if (dir) save({ workingDir: dir });
    } catch (e) {
      setError(String(e));
    }
  };

  const openWorkingDir = () => {
    if (cfg.workingDir) invoke('open_path', { path: cfg.workingDir }).catch((e) => setError(String(e)));
  };

  if (!loaded || detected === null) return <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>;

  return (
    <div style={wrap}>
      <section>
        <h2 style={h2}>Agente de chat</h2>
        <p style={lead}>
          Reverón conversa a través de un CLI de agente que ya tenés instalado. El agente lee la skill de
          Reverón, elige el modelo de generación y ejecuta los jobs contra el servidor local.
        </p>

        {error && <div style={errorBox}>{error}</div>}

        {detected.length === 0 ? (
          <div style={emptyBox}>
            No detectamos ningún agente instalado (Claude Code, Codex, Gemini CLI). Instalá uno y tocá «Detectar».
          </div>
        ) : (
          <div style={cardsRow}>
            {detected.map((a) => {
              const isActive = a.name === cfg.name;
              return (
                <button key={a.name} type="button" onClick={() => selectAgent(a)} style={agentCard(isActive)}>
                  <div style={cardHead}>
                    <span style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}>{FOLDER_ICON}</span>
                    {isActive && <span style={{ color: 'var(--accent)' }}>{CHECK_ICON}</span>}
                  </div>
                  <div style={cardTitle}>{a.name}</div>
                  <div style={cardMono}>$ {binaryName(a.path)}</div>
                  <div style={cardFoot}>
                    <span style={{ ...dot, background: a.available ? 'var(--ok)' : 'var(--text-muted)' }} />
                    {a.version ? `${a.version} detectado` : a.available ? 'detectado' : 'no responde'}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div style={fields}>
          <Field label="Binario del agente" hint="Ruta al ejecutable que Reverón lanza como subproceso">
            <div style={inputRow}>
              <input style={input} value={cfg.binary} onChange={(e) => save({ binary: e.target.value })}
                placeholder="/opt/homebrew/bin/claude" />
              <button type="button" style={btn} onClick={detect} disabled={detecting}>
                {detecting ? 'Detectando…' : 'Detectar'}
              </button>
            </div>
          </Field>

          <Field label="Modelo del agente" hint="Sólo conversa y decide — no genera imágenes">
            <input style={input} value={cfg.model} onChange={(e) => save({ model: e.target.value })}
              list="claude-models" placeholder="nombre del modelo" />
            {cfg.name === 'Claude Code' && (
              <datalist id="claude-models">
                {CLAUDE_MODELS.map((m) => <option key={m} value={m} />)}
              </datalist>
            )}
          </Field>

          <Field label="Modo de permisos" hint="Qué puede ejecutar el agente sin preguntarte">
            <div style={segmented}>
              {(Object.keys(PERMISSION_LABELS) as PermissionMode[]).map((mode) => (
                <button key={mode} type="button" style={segment(cfg.permissionMode === mode)}
                  onClick={() => save({ permissionMode: mode })}>
                  {PERMISSION_LABELS[mode]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Directorio de trabajo" hint="El agente sólo puede leer y escribir acá">
            <div style={inputRow}>
              <input style={input} value={cfg.workingDir ?? ''} readOnly placeholder="sin elegir todavía" />
              <button type="button" style={iconBtn} onClick={openWorkingDir} disabled={!cfg.workingDir} title="Abrir">
                {OPEN_ICON}
              </button>
              <button type="button" style={btn} onClick={chooseWorkingDir}>Elegir…</button>
            </div>
          </Field>

          <Field label="Skill de Reverón" hint="Inyecta SKILL.md y el catálogo de modelos en cada sesión">
            <button type="button" role="switch" aria-checked={cfg.skill}
              onClick={() => save({ skill: !cfg.skill })} style={toggle(cfg.skill)}>
              <span style={toggleKnob(cfg.skill)} />
            </button>
          </Field>
        </div>
      </section>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div style={field}>
      <div style={fieldLabelWrap}>
        <div style={fieldLabel}>{label}</div>
        <div style={fieldHint}>{hint}</div>
      </div>
      <div style={fieldControl}>{children}</div>
    </div>
  );
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 760 };
const h2: CSSProperties = { fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' };
const lead: CSSProperties = { fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 };

const errorBox: CSSProperties = {
  marginBottom: 14, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--danger)',
  color: 'var(--danger)', fontSize: 12.5, background: 'var(--bg-surface)',
};
const emptyBox: CSSProperties = {
  padding: '14px 16px', borderRadius: 10, border: '1px dashed var(--border)',
  color: 'var(--text-muted)', fontSize: 13,
};

const cardsRow: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 8 };
const agentCard = (isActive: boolean): CSSProperties => ({
  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
  background: isActive ? 'var(--accent-soft)' : 'var(--bg-surface)',
  borderRadius: 10, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-ui)',
});
const cardHead: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const cardTitle: CSSProperties = { fontSize: 14, fontWeight: 600, marginTop: 10, color: 'var(--text-primary)' };
const cardMono: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 };
const cardFoot: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11.5, color: 'var(--text-secondary)' };
const dot: CSSProperties = { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 };

const fields: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 20 };
const field: CSSProperties = {
  display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'center',
  padding: '14px 0', borderTop: '1px solid var(--border-soft)',
};
const fieldLabelWrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
const fieldLabel: CSSProperties = { fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' };
const fieldHint: CSSProperties = { fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4 };
const fieldControl: CSSProperties = { minWidth: 0 };

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

const segmented: CSSProperties = {
  display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', width: 'fit-content',
};
const segment = (isActive: boolean): CSSProperties => ({
  fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: isActive ? 600 : 500, padding: '8px 14px',
  border: 'none', borderRight: '1px solid var(--border)', cursor: 'pointer',
  background: isActive ? 'var(--bg-elevated)' : 'transparent',
  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
});

const toggle = (on: boolean): CSSProperties => ({
  width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative',
  background: on ? 'var(--accent)' : 'var(--border)', padding: 2, display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
});
const toggleKnob = (_on: boolean): CSSProperties => ({
  width: 18, height: 18, borderRadius: '50%', background: 'var(--bg-app)',
});
