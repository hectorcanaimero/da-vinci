import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Channel, invoke } from '@tauri-apps/api/core';
import { useServerEvents } from '../../sse';
import type { Generation } from '../../types';
import Thread, { type ChatMessage } from './Thread';
import Composer, { type ComposerSend } from './Composer';

// Lo que reporta `agent_detect()` / guarda `config_set({agent})` (F5.1.T1,
// Settings/Agents.tsx) — el Chat sólo lee y, si el usuario toca un pill,
// reescribe el mismo objeto completo para no pisarle campos a Ajustes.
type AgentInfo = { name: string; path: string; version: string | null; available: boolean };
type AgentConfig = {
  name?: string; binary?: string; model?: string; permissionMode?: string; workingDir?: string | null; skill?: boolean;
};

// Espejo de `AgentEvent` (src-tauri/src/lib.rs) tal como lo serializa
// `#[serde(tag = "event", content = "data")]`.
type AgentEventMsg =
  | { event: 'Chunk'; data: { text: string } }
  | { event: 'ToolCall'; data: { name: string; args: unknown } }
  | { event: 'Cost'; data: { usd: number } }
  | { event: 'Done' }
  | { event: 'Error'; data: { message: string } };

let seq = 0;
const nextId = () => `m${Date.now()}-${seq++}`;

const INTENT_LABEL: Record<string, string> = { image: 'imagen', video: 'video', svg: 'SVG', audio: 'voz', 'model-3d': '3D' };

// El composer no llama al router directo — el agente es quien genera
// (F5.1.T2) — así que intención y modelo elegidos viajan como una pista de
// texto dentro del mismo prompt, no como parámetros aparte.
function buildPrompt(text: string, intent: string | null, modelLabel: string) {
  const hints: string[] = [];
  if (intent) hints.push(`intención: ${INTENT_LABEL[intent] ?? intent}`);
  if (modelLabel) hints.push(`modelo sugerido: ${modelLabel}`);
  return hints.length ? `${text}\n\n[${hints.join(' · ')}]` : text;
}

// FR-19 / SKILL.md: una referencia de biblioteca viaja como `reveron:<id>`,
// el resto tal cual (URL o path local).
const refToString = (r: { id?: string; url?: string; path?: string; name?: string }) =>
  r.id ? `reveron:${r.id}` : r.url ?? r.path ?? r.name ?? '';

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<AgentConfig | null>(null);
  const [detected, setDetected] = useState<AgentInfo[]>([]);
  const activeAgentId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<{ agent?: AgentConfig }>('config_get').then((r) => setCfg(r.agent ?? {})).catch(() => setCfg({}));
    invoke<AgentInfo[]>('agent_detect').then(setDetected).catch(() => setDetected([]));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function updateAgent(id: string, patch: (m: Extract<ChatMessage, { role: 'agent' }>) => Extract<ChatMessage, { role: 'agent' }>) {
    setMessages((prev) => prev.map((m) => (m.role === 'agent' && m.id === id ? patch(m) : m)));
  }

  // FR-35: la generación real la dispara el agente (llamando al servidor por
  // su cuenta) — el `ToolCall` que vemos acá es sólo el pedido, no el
  // resultado. El evento `generation` de SSE es lo único que confirma que un
  // asset quedó guardado; lo pegamos al último turno del agente en curso.
  // ponytail: heurística temporal (no hay un id de turno real que vincule la
  // generación con el tool call) — sube a un id real si el agente algún día
  // lo emite.
  useServerEvents((g: Generation) => {
    const turnId = activeAgentId.current;
    if (!turnId) return;
    updateAgent(turnId, (m) =>
      (m.blocks.some((b) => b.kind === 'asset' && b.generation.id === g.id)
        ? m
        : { ...m, blocks: [...m.blocks, { kind: 'asset', generation: g }] }));
  });

  function chooseAgent(a: AgentInfo) {
    const next = { ...(cfg ?? {}), name: a.name, binary: a.path };
    setCfg(next);
    invoke('config_set', { patch: { agent: next } }).catch(() => {});
  }

  function send({ text, refs, intent, modelLabel }: ComposerSend) {
    const userId = nextId();
    const agentId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', text, refs },
      { id: agentId, role: 'agent', blocks: [], streaming: true, error: null },
    ]);
    activeAgentId.current = agentId;
    setBusy(true);

    const channel = new Channel<AgentEventMsg>();
    channel.onmessage = (evt) => {
      if (evt.event === 'Chunk') {
        updateAgent(agentId, (m) => {
          const last = m.blocks[m.blocks.length - 1];
          const rest = last?.kind === 'text' ? m.blocks.slice(0, -1) : m.blocks;
          const text = (last?.kind === 'text' ? last.text : '') + evt.data.text;
          return { ...m, blocks: [...rest, { kind: 'text', text }] };
        });
      } else if (evt.event === 'ToolCall') {
        updateAgent(agentId, (m) => ({ ...m, blocks: [...m.blocks, { kind: 'tool', name: evt.data.name, args: evt.data.args }] }));
      } else if (evt.event === 'Done') {
        updateAgent(agentId, (m) => ({ ...m, streaming: false }));
        setBusy(false);
      } else if (evt.event === 'Error') {
        updateAgent(agentId, (m) => ({ ...m, streaming: false, error: evt.data.message }));
        setBusy(false);
      }
      // 'Cost' — el gasto acumulado de la sesión lo pinta F5.2.T2 (FR-36) en
      // el encabezado; este componente no lo necesita.
    };

    invoke('agent_send', { prompt: buildPrompt(text, intent, modelLabel), refs: refs.map(refToString), onEvent: channel })
      .catch((e) => {
        updateAgent(agentId, (m) => ({ ...m, streaming: false, error: String(e) }));
        setBusy(false);
      });
  }

  function newSession() {
    if (busy) invoke('agent_cancel').catch(() => {});
    setMessages([]);
    activeAgentId.current = null;
    setBusy(false);
  }

  const agentLabel = cfg?.model || cfg?.name || (detected[0]?.name ?? 'sin agente');

  return (
    <div style={page}>
      <header style={header}>
        <div>
          <h1 style={title}>Chat</h1>
          <p style={subtitle}>Sesión con agente · {agentLabel} · {messages.length} mensajes</p>
        </div>
        <div style={headerRight}>
          {detected.length > 0 ? (
            <div style={agentPills} role="radiogroup" aria-label="Agente">
              {detected.map((a) => (
                <button key={a.name} type="button" aria-pressed={a.name === cfg?.name} style={pill(a.name === cfg?.name)}
                  onClick={() => chooseAgent(a)}>
                  {a.name}
                </button>
              ))}
            </div>
          ) : (
            <span style={noAgent}>Sin agente detectado — configurá uno en Ajustes</span>
          )}
          <button type="button" style={newBtn} onClick={newSession}>+ Nueva sesión</button>
        </div>
      </header>

      <div ref={scrollRef} style={scroll}>
        <Thread messages={messages} />
      </div>

      <Composer onSend={send} busy={busy} disabled={detected.length === 0} />
    </div>
  );
}

const page: CSSProperties = { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 };
const header: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
  padding: '18px 28px', borderBottom: '1px solid var(--border-soft)', flexShrink: 0,
};
const title: CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-primary)', margin: 0 };
const subtitle: CSSProperties = { fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0', fontFamily: 'var(--font-mono)' };

const headerRight: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 };
const agentPills: CSSProperties = {
  display: 'flex', gap: 4, padding: 3, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
};
const pill = (active: boolean): CSSProperties => ({
  padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)',
  fontSize: 12.5, fontWeight: active ? 600 : 500,
  background: active ? 'var(--bg-surface)' : 'transparent',
  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
});
const noAgent: CSSProperties = { fontSize: 12, color: 'var(--warn)', fontFamily: 'var(--font-ui)' };
const newBtn: CSSProperties = {
  background: 'var(--accent)', color: 'var(--bone)', border: 'none', borderRadius: 8,
  padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap',
};

const scroll: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' };
