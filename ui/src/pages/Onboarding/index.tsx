import { useEffect, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';
import { listProviders } from '../../api';
import ArtPanel from './ArtPanel';
import { AgentStep, FolderStep, KeysStep, Stepper, WizardNav, type KeySource, type StepId } from './Steps';

// Matches Layout.tsx's TITLEBAR_HEIGHT (F1.5.T1) — same reason it's not shared: Titlebar renders outside this tree.
const TITLEBAR_HEIGHT = 38;

const TITLES: Record<StepId, string> = {
  1: 'Bienvenido a Reverón',
  2: 'Conectá al menos un proveedor',
  3: 'Generá tu primer asset',
};
const DESCS: Record<StepId, string> = {
  1: 'Reverón corre en tu máquina: no hay cuenta, no hay servidor en la nube.',
  2: 'Reverón no cobra nada: pagás directo a cada proveedor con tu propia llave. Con FAL solo ya cubrís imagen, video y SVG — después sumás el resto desde Ajustes.',
  3: 'Última parada: una generación real para dejar todo listo antes de entrar.',
};

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<StepId>(1);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [keySource, setKeySource] = useState<KeySource>('none');
  const [checkingKeys, setCheckingKeys] = useState(false);
  const [generated, setGenerated] = useState(false);
  const navigate = useNavigate();

  // secrets_list is the source of truth for where a key actually landed
  // (keyring vs. the ~/.config/reveron/.env backup) — poll while it matters.
  useEffect(() => {
    if (step !== 2) return;
    const refresh = () => invoke<Array<{ present: boolean; source: string }>>('secrets_list')
      .then((list) => {
        const present = list.filter((k) => k.present);
        setKeySource(
          present.some((k) => k.source === 'keyring') ? 'keyring'
            : present.some((k) => k.source === 'file') ? 'file'
              : 'none',
        );
      })
      .catch(() => {});
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [step]);

  const finish = () => { onDone(); navigate('/galeria'); };

  const continueFromKeys = async () => {
    setCheckingKeys(true);
    setKeysError(null);
    try {
      const { items } = await listProviders();
      if (!items.some((p) => p.status === 'connected')) {
        setKeysError('Conectá al menos un proveedor para continuar.');
        return;
      }
      setStep(3);
    } finally {
      setCheckingKeys(false);
    }
  };

  return (
    <div style={screen}>
      <button type="button" style={skipAll} onClick={finish}>Configurar después</button>
      <div style={split}>
        <ArtPanel />
        <div style={wizard}>
          <Stepper current={step} />
          <div style={head}>
            <h1 style={title}>{TITLES[step]}</h1>
            <p style={desc}>{DESCS[step]}</p>
          </div>

          {step === 1 && <AgentStep />}
          {step === 2 && <KeysStep keySource={keySource} />}
          {step === 3 && <FolderStep onGenerated={() => setGenerated(true)} />}
          {step === 2 && keysError && <div style={errorMsg}>{keysError}</div>}

          <div style={{ flex: 1 }} />
          <WizardNav
            step={step}
            busy={checkingKeys}
            canContinue={step !== 3 || generated}
            continueLabel={step === 3 ? 'Ir a la galería' : 'Continuar'}
            onBack={() => setStep((s) => (s > 1 ? ((s - 1) as StepId) : s))}
            onSkip={finish}
            onContinue={() => {
              if (step === 1) setStep(2);
              else if (step === 2) continueFromKeys();
              else finish();
            }}
          />
        </div>
      </div>
    </div>
  );
}

const screen: CSSProperties = {
  position: 'relative', height: `calc(100vh - ${TITLEBAR_HEIGHT}px)`, background: 'var(--bg-app)', overflow: 'hidden',
};
const skipAll: CSSProperties = {
  position: 'absolute', top: 12, right: 24, zIndex: 1,
  background: 'none', border: 'none', cursor: 'pointer',
  fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--text-muted)',
};
const split: CSSProperties = { display: 'flex', height: '100%' };
const wizard: CSSProperties = {
  flex: 1, minWidth: 0, maxWidth: 920, margin: '0 auto',
  display: 'flex', flexDirection: 'column', gap: 22,
  padding: '38px 56px', overflowY: 'auto',
};
const head: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const title: CSSProperties = { margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 27, color: 'var(--text-primary)' };
const desc: CSSProperties = { margin: 0, fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 };
const errorMsg: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--danger)' };
