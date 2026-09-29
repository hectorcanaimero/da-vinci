import { useState, type CSSProperties } from 'react';

// FR-34: ausencia total de agente no es error ni bloqueo, es un estado — el
// resto de la app (Estudio, Galería, Actividad, Gastos, Ajustes) sigue
// funcionando, sólo el Chat no tiene con quién hablar. La lista coincide con
// `CANDIDATES` en src-tauri/src/agent.rs (F5.1.T1): Claude Code, Codex, Gemini CLI.
// No hay permiso `opener:allow-open-url` (ver src-tauri/capabilities/default.json,
// decisión deliberada contra ampliar la superficie de shell/D8) — los enlaces
// se muestran como texto seleccionable, no como navegación.
const AGENTS = [
  { name: 'Claude Code', install: 'npm install -g @anthropic-ai/claude-code', docs: 'docs.claude.com/en/docs/claude-code' },
  { name: 'Codex', install: 'npm install -g @openai/codex', docs: 'github.com/openai/codex' },
  { name: 'Gemini CLI', install: 'npm install -g @google/gemini-cli', docs: 'github.com/google-gemini/gemini-cli' },
];

export default function NoAgent({ onRetry }: { onRetry: () => Promise<void> | void }) {
  const [checking, setChecking] = useState(false);

  async function retry() {
    setChecking(true);
    try { await onRetry(); } finally { setChecking(false); }
  }

  return (
    <div style={wrap}>
      <div style={box}>
        <h2 style={h2}>Sin agente detectado</h2>
        <p style={lead}>
          El Chat conversa a través de un CLI de agente instalado en tu máquina — no viene incluido con Reverón.
          Instalá uno de estos y tocá «Volver a buscar».
        </p>

        <ul style={list}>
          {AGENTS.map((a) => (
            <li key={a.name} style={item}>
              <div style={itemName}>{a.name}</div>
              <code style={code}>{a.install}</code>
              <span style={docs}>{a.docs}</span>
            </li>
          ))}
        </ul>

        <button type="button" style={retryBtn} onClick={retry} disabled={checking}>
          {checking ? 'Buscando…' : 'Volver a buscar'}
        </button>
      </div>
    </div>
  );
}

const wrap: CSSProperties = { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 };
const box: CSSProperties = {
  maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 14,
  background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 14, padding: 24,
};
const h2: CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-primary)', margin: 0 };
const lead: CSSProperties = { fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', margin: 0 };
const list: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, margin: 0, padding: 0, listStyle: 'none' };
const item: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 12px',
  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10,
};
const itemName: CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' };
const code: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' };
const docs: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' };
const retryBtn: CSSProperties = {
  alignSelf: 'flex-start', background: 'var(--accent)', color: 'var(--bone)', border: 'none', borderRadius: 8,
  padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
};
