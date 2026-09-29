import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { listModels } from '../../api';
import RefDrop from '../../components/RefDrop';
import type { PickedInput } from '../../components/AssetPicker';
import type { ModelInfo } from '../../types';

// Mismos 5 intents que Estudio (spec F3.1.T1) — acá sólo son una pista para
// el agente, no disparan la generación directamente: el agente es quien
// decide y ejecuta (F5.1.T2).
type Intent = 'image' | 'video' | 'svg' | 'audio' | 'model-3d';
const INTENTS: Intent[] = ['image', 'video', 'svg', 'audio', 'model-3d'];
const INTENT_LABEL: Record<Intent, string> = { image: 'Imagen', video: 'Video', svg: 'SVG', audio: 'Voz', 'model-3d': '3D' };

const icon = (children: ReactNode) => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const INTENT_ICON: Record<Intent, ReactNode> = {
  image: icon(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m4 17 5-5 3.5 3.5L17 11l3 3" /></>),
  video: icon(<><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m21 8-4 3 4 3z" /></>),
  svg: icon(<><path d="M5 20 15 4" /><circle cx="16" cy="3.2" r="1.6" fill="currentColor" stroke="none" /></>),
  audio: icon(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" /></>),
  'model-3d': icon(<path d="M12 3 20 7.5v9L12 21 4 16.5v-9zM4 7.5 12 12l8-4.5M12 12v9" />),
};
const SEND_ICON = icon(<><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>);

export type ComposerSend = { text: string; refs: PickedInput[]; intent: Intent | null; modelLabel: string };

export default function Composer({ onSend, busy, disabled }: {
  onSend: (v: ComposerSend) => void;
  busy: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [refs, setRefs] = useState<PickedInput[]>([]);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [model, setModel] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);

  // Catálogo filtrado por intent, igual que ModelPicker en Estudio — "auto"
  // (sin elegir) deja que el agente resuelva el modelo por su cuenta.
  useEffect(() => {
    setModel('');
    listModels(intent ?? undefined).then((r) => setModels(r.items.filter((m) => m.available))).catch(() => setModels([]));
  }, [intent]);

  const canSend = !busy && !disabled && text.trim().length > 0;

  function submit() {
    if (!canSend) return;
    onSend({ text: text.trim(), refs, intent, modelLabel: models.find((m) => m.id === model)?.model ?? '' });
    setText('');
    setRefs([]);
  }

  return (
    <div style={wrap}>
      <RefDrop value={refs} onChange={setRefs} />

      <textarea
        style={textarea}
        rows={2}
        placeholder={disabled ? 'Configurá un agente en Ajustes para chatear' : 'Escribile al agente…'}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        }}
      />

      <div style={row}>
        <div style={intents} role="radiogroup" aria-label="Intención">
          {INTENTS.map((k) => (
            <button key={k} type="button" aria-pressed={intent === k} style={intentBtn(intent === k)}
              onClick={() => setIntent((prev) => (prev === k ? null : k))} disabled={disabled}>
              {INTENT_ICON[k]}{INTENT_LABEL[k]}
            </button>
          ))}
        </div>

        <select style={modelSelect} value={model} onChange={(e) => setModel(e.target.value)} aria-label="Modelo" disabled={disabled}>
          <option value="">auto</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.model}</option>)}
        </select>

        <button type="button" style={sendBtn} disabled={!canSend} onClick={submit}>
          {busy ? 'Generando…' : <>Generar {SEND_ICON}</>}
        </button>
      </div>
    </div>
  );
}

const wrap: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 28px 18px',
  borderTop: '1px solid var(--border-soft)', background: 'var(--bg-surface)', flexShrink: 0,
};
const textarea: CSSProperties = {
  width: '100%', resize: 'vertical', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '10px 12px', color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 13.5, lineHeight: 1.4,
  boxSizing: 'border-box',
};
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' };
const intents: CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap' };
const intentBtn = (active: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8,
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  background: active ? 'var(--accent-soft)' : 'var(--bg-input)',
  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  fontSize: 12, fontFamily: 'var(--font-ui)', fontWeight: active ? 600 : 500, cursor: 'pointer',
});
const modelSelect: CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 8px',
  color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12,
};
const sendBtn: CSSProperties = {
  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
  background: 'var(--accent)', color: 'var(--bone)', border: 'none', borderRadius: 10,
  padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
};
