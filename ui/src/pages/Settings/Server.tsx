import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

const icon = (children: ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const EYE_ICON = icon(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>, 14);
const COPY_ICON = icon(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>, 13);

// Lo que reporta `server_status`/`server_restart` (src-tauri/src/lib.rs).
type ServerStatus = {
  port: number | null; pid: number | null; uptimeMs: number; alive: boolean;
  url: string | null; error: string | null;
};

// Claves de config.json que este panel lee y escribe (src/core/config.mjs,
// src-tauri/src/lib.rs config_get/config_set). `dynamicPort` y
// `openaiCompatEnabled` no están en los DEFAULTS de Node — igual que `agent`
// en Settings/Agents.tsx, una clave ausente cae a su comportamiento histórico.
type ServerConfig = {
  host?: string; port?: number; dynamicPort?: boolean;
  apiKey?: string | null; openaiCompatEnabled?: boolean;
};

const LOOPBACK = '127.0.0.1';
const ANY_HOST = '0.0.0.0';

function newApiKey() {
  return `sk-rv-${crypto.randomUUID().replace(/-/g, '')}`;
}

function maskKey(key: string) {
  if (key.length <= 10) return '•'.repeat(key.length);
  return `${key.slice(0, 6)}${'•'.repeat(key.length - 10)}${key.slice(-4)}`;
}

function fmtUptime(ms: number) {
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} h ${m} min de uptime` : `${m} min de uptime`;
}

// snake_case: así vienen las claves de ServerStatus desde Rust (serde default).
type RawStatus = { port: number | null; pid: number | null; uptime_ms: number; alive: boolean; url: string | null; error: string | null };
const fromRaw = (r: RawStatus): ServerStatus => ({ port: r.port, pid: r.pid, uptimeMs: r.uptime_ms, alive: r.alive, url: r.url, error: r.error });

export default function Server() {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [cfg, setCfg] = useState<ServerConfig | null>(null);
  const [busy, setBusy] = useState<'restart' | 'stop' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealKey, setRevealKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmExpose, setConfirmExpose] = useState(false);

  const refreshStatus = () => invoke<RawStatus>('server_status').then((r) => setStatus(fromRaw(r))).catch((e) => setError(String(e)));

  useEffect(() => {
    refreshStatus();
    invoke<ServerConfig>('config_get').then(setCfg).catch((e) => setError(String(e)));
    const t = setInterval(refreshStatus, 4000);
    return () => clearInterval(t);
  }, []);

  const patch = (next: Partial<ServerConfig>) => {
    setCfg((prev) => ({ ...prev, ...next }));
    return invoke('config_set', { patch: next }).catch((e) => setError(String(e)));
  };

  const restart = () => {
    setBusy('restart');
    setError(null);
    invoke<RawStatus>('server_restart')
      .then((r) => setStatus(fromRaw(r)))
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(null));
  };

  const stop = () => {
    setBusy('stop');
    setError(null);
    invoke('server_stop')
      .then(() => refreshStatus())
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(null));
  };

  if (!cfg) return <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>;

  const exposed = cfg.host === ANY_HOST;
  const dynamicPort = cfg.dynamicPort ?? true;
  const port = cfg.port ?? 20130;
  const apiKey = cfg.apiKey ?? null;
  const openaiCompat = cfg.openaiCompatEnabled ?? true;

  const confirmExposure = () => {
    const key = apiKey ?? newApiKey();
    setConfirmExpose(false);
    patch({ host: ANY_HOST, apiKey: key }).then(restart);
  };

  const disableExposure = () => {
    patch({ host: LOOPBACK }).then(restart);
  };

  const regenerateKey = () => {
    patch({ apiKey: newApiKey() }).then(restart);
  };

  const baseUrl = status?.url ?? `http://${LOOPBACK}:${port}`;
  const codeSample = `client = OpenAI(\n    api_key="${apiKey ?? 'sk-rv-…'}",\n    base_url="${baseUrl}/v1")`;

  const copy = () => {
    navigator.clipboard.writeText(codeSample).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div style={wrap}>
      <section>
        <h2 style={h2}>Servidor</h2>
        <p style={lead}>El servidor local que atiende a la app, al CLI y a tus scripts.</p>

        {error && <div style={errorBox}>{error}</div>}

        <div style={statusCard}>
          <span style={statusIcon(status?.alive ?? false)}>{icon(<><rect x="4" y="4" width="16" height="6" rx="1.5" /><rect x="4" y="14" width="16" height="6" rx="1.5" /></>, 18)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={statusTitle}>{status?.alive ? 'Servidor activo' : 'Servidor detenido'}</div>
            <div style={statusDetail}>
              {status?.alive
                ? `${status.url} · sidecar node · pid ${status.pid} · ${fmtUptime(status.uptimeMs)}`
                : status?.error ?? 'Sin proceso corriendo'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn} onClick={restart} disabled={busy !== null}>
              {icon(<><path d="M3 12a9 9 0 1 1 2.6 6.4" /><path d="M3 4v6h6" /></>, 13)} {busy === 'restart' ? 'Reiniciando…' : 'Reiniciar'}
            </button>
            <button type="button" style={btn} onClick={stop} disabled={busy !== null || !status?.alive}>
              {icon(<rect x="6" y="6" width="12" height="12" rx="2" />, 13)} {busy === 'stop' ? 'Deteniendo…' : 'Detener'}
            </button>
          </div>
        </div>
      </section>

      <section>
        <h3 style={h3}>Red</h3>
        <p style={lead}>Por defecto sólo escucha en localhost. Cambiá esto únicamente si sabés lo que estás haciendo (FR-42).</p>

        <div style={field}>
          <div style={labelWrap}>
            <div style={label}>Host</div>
            <div style={hint}>Se controla con "Exponer en la red local", abajo.</div>
          </div>
          <input style={{ ...input, opacity: 0.7 }} value={cfg.host ?? LOOPBACK} readOnly />
        </div>

        <div style={field}>
          <div style={labelWrap}>
            <div style={label}>Puerto</div>
            <div style={hint}>Si está ocupado, Reverón busca el siguiente libre y avisa (FR-44). Cambios: reiniciá para aplicarlos.</div>
          </div>
          <div style={inputRow}>
            <input
              type="number" style={input} value={port} disabled={dynamicPort}
              onChange={(e) => patch({ port: Number(e.target.value) || 20130 })}
            />
            <label style={toggleRow}>
              <Switch checked={dynamicPort} onChange={(v) => patch({ dynamicPort: v })} />
              <span style={toggleLabel}>Puerto dinámico</span>
            </label>
          </div>
        </div>

        <div style={field}>
          <div style={labelWrap}>
            <div style={label}>Exponer en la red local</div>
            <div style={hint}>Otros equipos de tu red podrán generar con TUS llaves.</div>
          </div>
          <Switch checked={exposed} onChange={(v) => (v ? setConfirmExpose(true) : disableExposure())} />
        </div>
      </section>

      <section>
        <h3 style={h3}>Llave del API</h3>
        <p style={lead}>Requerida en el header <code style={codeInline}>X-Reveron-API-Key</code> cuando el servidor no es local.</p>
        <div style={inputRow}>
          <input style={{ ...input, fontFamily: 'var(--font-mono)' }} readOnly
            value={apiKey ? (revealKey ? apiKey : maskKey(apiKey)) : 'sin llave todavía'} />
          {apiKey && (
            <button type="button" style={iconBtn} onClick={() => setRevealKey((v) => !v)} title={revealKey ? 'Ocultar' : 'Mostrar'}>
              {EYE_ICON}
            </button>
          )}
          <button type="button" style={btn} onClick={regenerateKey}>Regenerar</button>
        </div>
      </section>

      <section>
        <h3 style={h3}>Endpoint compatible con OpenAI</h3>
        <p style={lead}>Apuntá cualquier SDK de OpenAI acá y Reverón rutea al mejor modelo según el intent (FR-43).</p>

        <div style={codeBlock}>
          <button type="button" style={copyBtn} onClick={copy}>{COPY_ICON} {copied ? 'Copiado' : 'Copiar'}</button>
          <pre style={codePre}>{`client = OpenAI(\n    api_key="${apiKey ? maskKey(apiKey) : 'sk-rv-…'}",\n    base_url="${baseUrl}/v1")`}</pre>
        </div>

        <div style={field}>
          <div style={labelWrap}>
            <div style={label}>Habilitar /v1</div>
            <div style={hint}>Expone images.generate al estilo OpenAI. Apagarlo corta el endpoint (requiere reiniciar).</div>
          </div>
          <Switch checked={openaiCompat} onChange={(v) => patch({ openaiCompatEnabled: v })} />
        </div>
      </section>

      {confirmExpose && (
        <div style={overlay} onClick={() => setConfirmExpose(false)}>
          <div style={panel} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-label="Exponer en la red local">
            <div style={headerRow}>
              <span style={warnBadge}>{icon(<><path d="M12 3 22 20H2z" /><path d="M12 9.5v5M12 17.5h.01" /></>, 18)}</span>
              <div>
                <h2 style={titleStyle}>¿Exponer el servidor en la red local?</h2>
                <p style={subtitleStyle}>Otros equipos de tu red vas a poder alcanzarlo y van a generar usando TUS llaves de proveedor. Sólo va a poder entrar quien tenga la llave del API.</p>
              </div>
            </div>
            <div style={footer}>
              <button type="button" style={cancelBtn} onClick={() => setConfirmExpose(false)}>Cancelar</button>
              <button type="button" style={dangerBtn} onClick={confirmExposure}>Exponer de todos modos</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} style={switchTrack(checked)} onClick={() => onChange(!checked)}>
      <span style={switchThumb(checked)} />
    </button>
  );
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 760 };
const h2: CSSProperties = { fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' };
const h3: CSSProperties = { fontSize: 13.5, fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' };
const lead: CSSProperties = { fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' };

const errorBox: CSSProperties = {
  marginBottom: 14, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--danger)',
  color: 'var(--danger)', fontSize: 12.5, background: 'var(--bg-surface)',
};

const statusCard: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
  border: '1px solid var(--border-soft)', borderRadius: 10, background: 'var(--bg-elevated)',
};
const statusIcon = (alive: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10,
  background: alive ? 'var(--accent-soft)' : 'var(--bg-input)', color: alive ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0,
});
const statusTitle: CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' };
const statusDetail: CSSProperties = {
  fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const field: CSSProperties = {
  display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'center',
  padding: '14px 0', borderTop: '1px solid var(--border-soft)',
};
const labelWrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
const label: CSSProperties = { fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' };
const hint: CSSProperties = { fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4 };

const inputRow: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' };
const input: CSSProperties = {
  flex: 1, minWidth: 0, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '8px 10px', fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--text-primary)', outline: 'none',
};
const btn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 500, padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const iconBtn: CSSProperties = { ...btn, padding: '8px 10px' };
const codeInline: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11.5, background: 'var(--bg-input)',
  border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px',
};

const toggleRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', whiteSpace: 'nowrap' };
const toggleLabel: CSSProperties = { fontSize: 12, color: 'var(--text-secondary)' };

const switchTrack = (on: boolean): CSSProperties => ({
  width: 36, height: 20, borderRadius: 10, border: 'none', padding: 2, flexShrink: 0,
  background: on ? 'var(--accent)' : 'var(--bg-input)', cursor: 'pointer', display: 'flex',
  justifyContent: on ? 'flex-end' : 'flex-start', boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--border)',
});
const switchThumb = (_on: boolean): CSSProperties => ({
  width: 16, height: 16, borderRadius: '50%', background: 'var(--bone)',
});

const codeBlock: CSSProperties = {
  position: 'relative', background: 'var(--bg-input)', border: '1px solid var(--border-soft)',
  borderRadius: 10, padding: '14px 16px', marginBottom: 4,
};
const codePre: CSSProperties = {
  margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)',
  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
};
const copyBtn: CSSProperties = {
  position: 'absolute', top: 10, right: 12, display: 'inline-flex', alignItems: 'center', gap: 5,
  background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11.5, fontFamily: 'var(--font-ui)', cursor: 'pointer',
};

const overlay: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const panel: CSSProperties = {
  width: 440, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: 16,
  background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14,
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)', fontFamily: 'var(--font-ui)', padding: 20,
};
const headerRow: CSSProperties = { display: 'flex', gap: 14, alignItems: 'flex-start' };
const warnBadge: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  width: 36, height: 36, borderRadius: 10, background: 'var(--warn)', color: 'var(--bg-app)',
};
const titleStyle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' };
const subtitleStyle: CSSProperties = { margin: '4px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' };
const footer: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8 };
const cancelBtn: CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '8px 14px', color: 'var(--text-primary)', font: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const dangerBtn: CSSProperties = {
  background: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8,
  padding: '8px 14px', color: 'var(--bone)', font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
