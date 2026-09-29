import { useState, type CSSProperties } from 'react';
import CostGate from '../../components/CostGate';
import type { GenerationRequest, Kind } from '../../types';
import type { PickedInput } from '../../components/AssetPicker';

const usd = (n: number) => `$${n.toFixed(3)}`;

const RECEIPT_ICON = (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6M9 12h6" />
  </svg>
);

// FR-36: gasto acumulado de la sesión — cada AgentEvent::Cost (agent.rs) suma
// acá, el turno de chat que lo disparó no necesita saberlo (ver index.tsx).
export function useSessionCost() {
  const [totalUsd, setTotalUsd] = useState(0);
  const addCost = (amountUsd: number) => setTotalUsd((t) => t + amountUsd);
  return { totalUsd, addCost };
}

export function SessionCostBadge({ totalUsd }: { totalUsd: number }) {
  return (
    <span style={badge}>
      {RECEIPT_ICON}
      {usd(totalUsd)} esta sesión
    </span>
  );
}

const refToInput = (r: PickedInput) => (r.id ? { id: r.id } : r.url ? { url: r.url } : r.path ? { path: r.path } : null);

type Props = {
  kind: Kind;
  model: string;
  prompt: string;
  refs: PickedInput[];
  disabled?: boolean;
  onSend: () => void;
};

// FR-36, segunda mitad: antes de que el chat le pida al agente una generación
// concreta (intención + modelo ya elegidos en el composer), se estima el
// costo y — por encima del umbral — se confirma. Es la misma barrera de
// F3.2.T2 (CostGate), no una reimplementación: `onGenerate` acá sólo dispara
// el envío del mensaje, la estimación/confirmación las resuelve el propio
// CostGate contra /api/estimate.
export default function SessionCostGate({ kind, model, prompt, refs, disabled, onSend }: Props) {
  const request: GenerationRequest = {
    kind,
    model: model || undefined,
    ...(kind === 'audio' || kind === 'sfx' ? { text: prompt } : { prompt }),
    inputs: refs.map(refToInput).filter((i): i is NonNullable<typeof i> => i != null),
  };
  return (
    <div style={gateWrap}>
      <CostGate request={request} onGenerate={async () => onSend()} label="Generar" disabled={disabled} />
    </div>
  );
}

const badge: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8,
  background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
  fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap',
};
const gateWrap: CSSProperties = { width: '100%' };
