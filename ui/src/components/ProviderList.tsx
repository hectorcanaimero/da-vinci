import { useEffect, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listModels, listProviders, testProvider } from '../api';
import type { ModelInfo, ProviderStatus } from '../types';

// Nombres de exhibición: la API sólo conoce el id corto (openai, fal, ...).
const NAMES: Record<string, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  fal: 'FAL.ai',
  kie: 'KIE.ai',
  heygen: 'HeyGen',
  elevenlabs: 'ElevenLabs',
  tripo: 'Tripo3D',
};

// secrets_set (src-tauri/src/secrets.rs) identifica proveedores por el nombre
// completo de la env var, no por el id corto que devuelve GET /api/providers.
const envVar = (id: string) => `${id.toUpperCase()}_API_KEY`;

const STATUS_LABEL: Record<ProviderStatus['status'], string> = {
  connected: 'Conectado',
  missing: 'Sin llave',
  error: 'Error',
};
const STATUS_COLOR: Record<ProviderStatus['status'], string> = {
  connected: 'var(--ok)',
  missing: 'var(--text-muted)',
  error: 'var(--danger)',
};

function useModelsByProvider() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  useEffect(() => { listModels().then((r) => setModels(r.items)).catch(() => {}); }, []);
  return (id: string) => [...new Set(models.filter((m) => m.provider === id).map((m) => m.model))].join(' · ');
}

type Busy = 'saving' | 'testing' | null;

export default function ProviderList() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, Busy>>({});
  const modelsFor = useModelsByProvider();

  useEffect(() => { listProviders().then((r) => setProviders(r.items)).catch(() => {}); }, []);

  const setRow = (id: string, patch: Partial<ProviderStatus>) =>
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const test = async (id: string) => {
    setBusy((b) => ({ ...b, [id]: 'testing' }));
    try {
      setRow(id, await testProvider(id));
    } finally {
      setBusy((b) => ({ ...b, [id]: null }));
    }
  };

  const save = async (id: string) => {
    const value = drafts[id]?.trim();
    if (!value) return;
    setBusy((b) => ({ ...b, [id]: 'saving' }));
    try {
      await invoke('secrets_set', { provider: envVar(id), value });
      setDrafts((d) => ({ ...d, [id]: '' }));
      await test(id);
    } catch (err) {
      setRow(id, { status: 'error', error: err instanceof Error ? err.message : String(err) });
      setBusy((b) => ({ ...b, [id]: null }));
    }
  };

  return (
    <div style={list}>
      {providers.map((p) => {
        const name = NAMES[p.id] ?? p.id;
        const draft = drafts[p.id] ?? '';
        const rowBusy = busy[p.id] ?? null;
        return (
          <div key={p.id} style={row}>
            <div style={avatar}>{name[0]}</div>
            <div style={info}>
              <div style={nameStyle}>{name}</div>
              <div style={modelsStyle}>{modelsFor(p.id)}</div>
            </div>

            <div style={keyField}>
              <span style={envLabel}>{envVar(p.id)}</span>
              <input
                type="password"
                value={draft}
                onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && save(p.id)}
                placeholder={p.keyHint ?? 'pegá tu llave aquí'}
                aria-label={`Llave de ${name}`}
                style={input}
              />
            </div>

            <div style={statusWrap}>
              <span style={{ ...dot, background: STATUS_COLOR[p.status] }} />
              <span>{STATUS_LABEL[p.status]}</span>
            </div>

            <div style={actions}>
              <button type="button" style={actionBtn}
                disabled={p.status === 'missing' || rowBusy !== null}
                onClick={() => test(p.id)}>
                {rowBusy === 'testing' ? 'Probando…' : 'Probar'}
              </button>
              <button type="button" style={actionBtnAccent}
                disabled={!draft.trim() || rowBusy !== null}
                onClick={() => save(p.id)}>
                {rowBusy === 'saving' ? 'Guardando…' : p.status === 'missing' ? 'Guardar' : 'Rotar'}
              </button>
            </div>

            {p.status === 'error' && p.error && <div style={errorMsg}>{p.error}</div>}
          </div>
        );
      })}
    </div>
  );
}

const list: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'var(--font-ui)' };

const row: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr 2fr auto auto',
  alignItems: 'center',
  gap: 14,
  padding: '12px 14px',
  borderRadius: 10,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  position: 'relative',
};

const avatar: CSSProperties = {
  width: 34, height: 34, borderRadius: 8,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-primary)',
};

const info: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 };
const nameStyle: CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' };
const modelsStyle: CSSProperties = {
  fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const keyField: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '6px 10px', minWidth: 0,
};
const envLabel: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap',
};
const input: CSSProperties = {
  flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
  fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-primary)',
};

const statusWrap: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap',
};
const dot: CSSProperties = { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 };

const actions: CSSProperties = { display: 'flex', gap: 6 };
const actionBtn: CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, padding: '6px 10px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer',
};
const actionBtnAccent: CSSProperties = {
  ...actionBtn, background: 'var(--accent)', color: 'var(--bg-app)', border: '1px solid var(--accent)',
};

const errorMsg: CSSProperties = {
  gridColumn: '1 / -1', fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--font-mono)', marginTop: -2,
};
