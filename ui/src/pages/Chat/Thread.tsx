import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Thumb, type PickedInput } from '../../components/AssetPicker';
import type { Generation } from '../../types';

export type ChatBlock =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; name: string; args: unknown }
  | { kind: 'asset'; generation: Generation };

export type ChatMessage =
  | { id: string; role: 'user'; text: string; refs: PickedInput[] }
  | { id: string; role: 'agent'; blocks: ChatBlock[]; streaming: boolean; error: string | null };

const usd = (n: number) => `$${n.toFixed(3)}`;
const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;
const refLabel = (r: PickedInput) => r.name ?? r.id ?? r.url ?? '';

export default function Thread({ messages }: { messages: ChatMessage[] }) {
  if (!messages.length) {
    return <p style={empty}>Escribí algo abajo para arrancar la conversación con el agente.</p>;
  }
  return (
    <div style={list}>
      {messages.map((m) => (m.role === 'user' ? <UserBubble key={m.id} message={m} /> : <AgentTurn key={m.id} message={m} />))}
    </div>
  );
}

function UserBubble({ message }: { message: Extract<ChatMessage, { role: 'user' }> }) {
  return (
    <div style={userRow}>
      <div style={userBubble}>
        <p style={userText}>{message.text}</p>
        {message.refs.length > 0 && (
          <div style={refRow}>
            {message.refs.map((r, i) => (
              <span key={i} style={refChip}><Thumb input={r} size={20} />{refLabel(r)}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentTurn({ message }: { message: Extract<ChatMessage, { role: 'agent' }> }) {
  return (
    <div style={agentRow}>
      <span style={agentMark} aria-hidden="true">❯_</span>
      <div style={agentBody}>
        {message.blocks.map((b, i) => {
          if (b.kind === 'text') return b.text.trim() ? <p key={i} style={agentText}>{b.text}</p> : null;
          if (b.kind === 'tool') return <ToolCard key={i} name={b.name} args={b.args} />;
          return <AssetCard key={i} generation={b.generation} />;
        })}
        {message.streaming && <span style={cursor} aria-hidden="true">▍</span>}
        {message.error && <p style={errorText} role="alert">{message.error}</p>}
      </div>
    </div>
  );
}

// F5.1.T2 sólo transmite la llamada (nombre + args), no su resultado — un
// tool call se pinta genérico acá; el resultado real de una generación llega
// aparte por SSE y se pega como bloque `asset` (ver Chat/index.tsx).
function ToolCard({ name, args }: { name: string; args: unknown }) {
  const body = typeof args === 'string' ? args : JSON.stringify(args, null, 2);
  const showBody = body && body !== '{}' && body !== 'null';
  return (
    <div style={toolCard}>
      <div style={toolHead}><span style={toolDot} aria-hidden="true" />{name}</div>
      {showBody && <pre style={toolBody}>{body}</pre>}
    </div>
  );
}

function AssetCard({ generation: g }: { generation: Generation }) {
  return (
    <Link to={`/asset/${g.id}`} style={assetCard}>
      <Thumb input={{ id: g.id, mime: g.mime }} size={120} />
      <div style={assetMeta}>
        <div style={assetName}>{basename(g.filePath)}</div>
        <div style={assetSub}>{g.provider.toUpperCase()} · {g.model} · {usd(g.costUsd)}</div>
        {g.prompt && <div style={assetPrompt}>{g.prompt}</div>}
      </div>
    </Link>
  );
}

const empty: CSSProperties = {
  margin: 'auto', color: 'var(--text-muted)', fontSize: 13, fontFamily: 'var(--font-ui)', textAlign: 'center',
};
const list: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 20, padding: '20px 28px' };

const userRow: CSSProperties = { display: 'flex', justifyContent: 'flex-end' };
const userBubble: CSSProperties = {
  maxWidth: '70%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 12, padding: '10px 14px',
};
const userText: CSSProperties = { margin: 0, fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' };
const refRow: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 };
const refChip: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-input)', border: '1px solid var(--border-soft)',
  borderRadius: 999, padding: '2px 8px 2px 2px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
};

const agentRow: CSSProperties = { display: 'flex', gap: 12, maxWidth: '85%' };
const agentMark: CSSProperties = {
  flexShrink: 0, width: 24, height: 24, borderRadius: 6, background: 'var(--accent-soft)', color: 'var(--accent)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11,
};
const agentBody: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 };
const agentText: CSSProperties = { margin: 0, fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.55, whiteSpace: 'pre-wrap' };
const cursor: CSSProperties = { color: 'var(--accent)', fontFamily: 'var(--font-mono)' };
const errorText: CSSProperties = { margin: 0, fontSize: 12.5, color: 'var(--danger)' };

const toolCard: CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px',
};
const toolHead: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
  color: 'var(--text-secondary)',
};
const toolDot: CSSProperties = { width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' };
const toolBody: CSSProperties = {
  margin: '8px 0 0', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-muted)',
  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
};

const assetCard: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'flex-start', textDecoration: 'none',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, maxWidth: 360,
};
const assetMeta: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 };
const assetName: CSSProperties = {
  fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const assetSub: CSSProperties = { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' };
const assetPrompt: CSSProperties = {
  fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.4,
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
};
