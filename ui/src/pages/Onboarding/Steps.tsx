import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import ProviderList from '../../components/ProviderList';
import { createGeneration, getJob, getMigration, listModels, runMigration } from '../../api';
import type { Job, Kind, ModelInfo } from '../../types';

export type StepId = 1 | 2 | 3;
export type KeySource = 'keyring' | 'file' | 'none';

const STEP_META: { id: StepId; label: string }[] = [
  { id: 1, label: 'Agente' },
  { id: 2, label: 'Llaves' },
  { id: 3, label: 'Carpeta' },
];

export function Stepper({ current }: { current: StepId }) {
  return (
    <div style={stepperRow}>
      {STEP_META.flatMap((s, i) => {
        const nodes: ReactNode[] = [];
        if (i > 0) nodes.push(<div key={`c${s.id}`} style={connector} />);
        const done = s.id < current;
        const active = s.id === current;
        nodes.push(
          <div key={s.id} style={stepItem}>
            <div style={{ ...dot, background: done || active ? 'var(--accent)' : 'var(--bg-input)' }}>
              {done
                ? <span style={checkMark}>✓</span>
                : <span style={{ ...num, color: active ? 'var(--bg-app)' : 'var(--text-muted)' }}>{s.id}</span>}
            </div>
            <span style={{ ...label, color: done || active ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: active ? 600 : 500 }}>
              {s.label}
            </span>
          </div>,
        );
        return nodes;
      })}
    </div>
  );
}

export function AgentStep() {
  const [migration, setMigration] = useState<{ detected: boolean; count?: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ total: number; migrated: number } | null>(null);

  useEffect(() => { getMigration().then(setMigration).catch(() => setMigration({ detected: false })); }, []);

  const migrate = async () => {
    setRunning(true);
    try {
      setResult(await runMigration());
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={stepBody}>
      <p style={bodyText}>
        Reverón corre en tu máquina: no hay cuenta ni servidor en la nube. Guardás la llave de cada
        proveedor acá al lado y Reverón la usa directo, sin pasar por ningún intermediario.
      </p>
      {migration?.detected && (
        <div style={migrationCard}>
          <div style={migrationTitle}>Encontramos una instalación anterior de Da Vinci</div>
          <div style={migrationDesc}>
            {result
              ? `Importados ${result.migrated} de ${result.total} registros. Los archivos originales no se movieron.`
              : `${migration.count} generaciones guardadas en ~/.davinci. Podés traerlas a tu biblioteca sin duplicar archivos.`}
          </div>
          {!result && (
            <button type="button" style={accentBtn} onClick={migrate} disabled={running}>
              {running ? 'Migrando…' : 'Migrar biblioteca'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const SECURITY_TEXT: Record<KeySource, string> = {
  keyring: 'Se guardan cifradas en el llavero del sistema. Nunca salen de esta máquina.',
  file: 'Tu sistema no tiene un llavero disponible: se guardaron en ~/.config/reveron/.env con permisos 600.',
  none: 'Se guardan cifradas en el llavero del sistema (o en un archivo local si no hay uno disponible). Nunca salen de esta máquina.',
};

export function KeysStep({ keySource }: { keySource: KeySource }) {
  return (
    <div style={stepBody}>
      <ProviderList />
      <div style={security}>
        <span>🔒</span>
        <span>{SECURITY_TEXT[keySource]}</span>
      </div>
    </div>
  );
}

// Kinds a low-cost demo generation can drive with just a prompt/text — no
// avatar/voice picker, no existing asset to feed as input.
const DEMO_KINDS: Kind[] = ['image', 'svg', 'video', 'audio', 'sfx', 'model-3d'];

function buildRequest(pick: ModelInfo) {
  const base = { kind: pick.kind, model: pick.id, confirm: true as const };
  return pick.kind === 'audio' || pick.kind === 'sfx'
    ? { ...base, text: 'Bienvenido a Reverón' }
    : { ...base, prompt: 'Boceto rápido para probar Reverón' };
}

export function FolderStep({ onGenerated }: { onGenerated: (assetId: string) => void }) {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);

  const run = async () => {
    setState('running');
    setError(null);
    try {
      const models = (await listModels()).items.filter((m) => m.available && DEMO_KINDS.includes(m.kind));
      const pick = [...models].sort((a, b) => (a.unitCostUsd ?? Infinity) - (b.unitCostUsd ?? Infinity))[0];
      if (!pick) throw new Error('Ningún proveedor conectado soporta todavía una generación de prueba.');
      const { job: created } = await createGeneration(buildRequest(pick));
      let current = created;
      while (current.status === 'queued' || current.status === 'running') {
        await new Promise((r) => setTimeout(r, 1200));
        current = await getJob(created.id);
      }
      if (current.status === 'failed') throw new Error(current.error?.message ?? 'La generación falló');
      setJob(current);
      setState('done');
      onGenerated(current.generationIds[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  };

  return (
    <div style={stepBody}>
      <p style={bodyText}>
        Tus archivos se guardan en <code style={code}>~/.reveron/library</code>. Vamos a generar algo
        chico y barato para probar que todo funciona de punta a punta.
      </p>
      {state !== 'done' && (
        <button type="button" style={accentBtn} onClick={run} disabled={state === 'running'}>
          {state === 'running' ? 'Generando…' : 'Generar mi primer asset'}
        </button>
      )}
      {state === 'error' && <div style={errorMsg}>{error}</div>}
      {state === 'done' && job && (
        <div style={doneCard}>✓ Listo — ya está en tu biblioteca.</div>
      )}
    </div>
  );
}

export function WizardNav({ step, canContinue, busy, continueLabel, onBack, onSkip, onContinue }: {
  step: StepId; canContinue: boolean; busy?: boolean; continueLabel: string;
  onBack: () => void; onSkip: () => void; onContinue: () => void;
}) {
  return (
    <div style={navRow}>
      <button type="button" style={backBtn} onClick={onBack} disabled={step === 1}>← Atrás</button>
      <div style={{ flex: 1 }} />
      <button type="button" style={skipLink} onClick={onSkip}>Saltar por ahora</button>
      <button type="button" style={nextBtn} onClick={onContinue} disabled={!canContinue || busy}>
        {continueLabel} →
      </button>
    </div>
  );
}

const stepperRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-ui)' };
const connector: CSSProperties = { flex: 1, height: 1, background: 'var(--border)' };
const stepItem: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 };
const dot: CSSProperties = { width: 22, height: 22, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const checkMark: CSSProperties = { color: 'var(--bg-app)', fontSize: 12, fontWeight: 700 };
const num: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 };
const label: CSSProperties = { fontSize: 12.5 };

const stepBody: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 };
const bodyText: CSSProperties = { margin: 0, fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 };
const code: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12.5, background: 'var(--bg-input)', padding: '1px 6px', borderRadius: 4 };

const migrationCard: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 };
const migrationTitle: CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' };
const migrationDesc: CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--text-secondary)' };

const security: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--text-secondary)' };

const accentBtn: CSSProperties = { alignSelf: 'flex-start', fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 9, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--bg-app)', cursor: 'pointer' };
const doneCard: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 10, padding: '10px 14px', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-primary)' };
const errorMsg: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--danger)' };

const navRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 16 };
const backBtn: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer' };
const skipLink: CSSProperties = { background: 'none', border: 'none', fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--text-muted)', cursor: 'pointer' };
const nextBtn: CSSProperties = { ...accentBtn, alignSelf: 'auto', padding: '9px 18px' };
