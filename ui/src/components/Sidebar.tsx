import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { NavLink } from 'react-router-dom';
import { getSpend, listProviders } from '../api';
import type { ProviderStatus } from '../types';

const WIDTH = 240;

// Shape of src-tauri's ServerStatus (F1.3.T3) — field names are the Rust
// struct's own (no serde rename), so they stay snake_case here.
type ServerStatus = {
  alive: boolean;
  port: number | null;
  pid: number | null;
  uptime_ms: number;
  url: string | null;
  error: string | null;
};

function useServerStatus(intervalMs = 5000) {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  useEffect(() => {
    let live = true;
    const tick = () =>
      invoke<ServerStatus>('server_status')
        .then((s) => live && setStatus(s))
        .catch(() => live && setStatus(null));
    tick();
    const id = setInterval(tick, intervalMs);
    return () => { live = false; clearInterval(id); };
  }, [intervalMs]);
  return status;
}

// ponytail: the daily cap (dailyBudgetUsd) only comes back on POST
// /api/estimate, which requires a valid generation body (e.g. a prompt) — no
// endpoint exposes the bare config value. Show today's spend alone until one
// does; add the "/ tope" suffix once it's cheaply readable.
function useSpendToday(intervalMs = 15000) {
  const [spent, setSpent] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const tick = () => {
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      getSpend({ from: dayStart.toISOString(), to: now.toISOString(), groupBy: 'day' })
        .then((r) => live && setSpent(r.totalUsd))
        .catch(() => live && setSpent(null));
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => { live = false; clearInterval(id); };
  }, [intervalMs]);
  return spent;
}

function useProviders(intervalMs = 20000) {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  useEffect(() => {
    let live = true;
    const tick = () => listProviders().then((r) => live && setProviders(r.items)).catch(() => {});
    tick();
    const id = setInterval(tick, intervalMs);
    return () => { live = false; clearInterval(id); };
  }, [intervalMs]);
  return providers;
}

const icon = (children: ReactNode) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const ICONS: Record<string, ReactNode> = {
  chat: icon(<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4 4v-4H5.5A1.5 1.5 0 0 1 4 14.5z" />),
  estudio: icon(<><path d="M4 20 16 8" /><path d="M15 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="currentColor" stroke="none" /></>),
  galeria: icon(<><rect x="3" y="3" width="12" height="12" rx="2" /><rect x="9" y="9" width="12" height="12" rx="2" /></>),
  actividad: icon(<path d="M3 13h3.5l2-5 3 9 2-7 1.5 3H21" />),
  gastos: icon(<g fill="currentColor" stroke="none"><rect x="4" y="12" width="3.5" height="8" /><rect x="10.3" y="6" width="3.5" height="14" /><rect x="16.5" y="9" width="3.5" height="11" /></g>),
  ajustes: icon(<><circle cx="12" cy="12" r="3.2" /><path d="M12 3v2.4M12 18.6V21M4.2 12H6.6M17.4 12H19.8M6 6l1.7 1.7M16.3 16.3 18 18M18 6l-1.7 1.7M7.7 16.3 6 18" /></>),
};

const DESTINATIONS: Array<{ to: string; label: string; end?: boolean; icon: string }> = [
  { to: '/', label: 'Chat', end: true, icon: 'chat' },
  { to: '/estudio', label: 'Estudio', icon: 'estudio' },
  { to: '/galeria', label: 'Galería', icon: 'galeria' },
  { to: '/actividad', label: 'Actividad', icon: 'actividad' },
  { to: '/gastos', label: 'Gastos', icon: 'gastos' },
  { to: '/ajustes', label: 'Ajustes', icon: 'ajustes' },
];

const STATUS_COLOR: Record<ProviderStatus['status'], string> = {
  connected: 'var(--ok)',
  error: 'var(--danger)',
  missing: 'var(--text-muted)',
};

const Dot = ({ color }: { color: string }) => (
  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
);

const usd = (n: number) => `$${n.toFixed(2)}`;

export default function Sidebar() {
  const server = useServerStatus();
  const spent = useSpendToday();
  const providers = useProviders();

  const address = server?.url?.replace(/^https?:\/\//, '') ?? '—';
  const providerGroups = (['connected', 'error', 'missing'] as const)
    .map((status) => ({ status, items: providers.filter((p) => p.status === status) }))
    .filter((g) => g.items.length > 0);

  return (
    <aside style={aside}>
      <div style={brand}>
        <div style={logo}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--bg-app)" strokeWidth={2} strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
          </svg>
        </div>
        <div>
          <div style={brandTitle}>Reverón</div>
          <div style={brandSubtitle}>v2.0.0 · local</div>
        </div>
      </div>

      <nav style={nav} aria-label="Principal">
        {DESTINATIONS.map((d) => (
          <NavLink key={d.to} to={d.to} end={d.end} style={({ isActive }) => navLink(isActive)}>
            {ICONS[d.icon]}
            <span>{d.label}</span>
          </NavLink>
        ))}
      </nav>

      {providerGroups.length > 0 && (
        <div style={providersBlock}>
          <div style={providersLabel}>PROVIDERS</div>
          {providerGroups.map((g) => (
            <div key={g.status} style={providerRow}>
              <Dot color={STATUS_COLOR[g.status]} />
              <span>{g.items.map((p) => p.id).join(' · ')}</span>
            </div>
          ))}
        </div>
      )}

      <div style={footer}>
        <Dot color={server?.alive ? 'var(--ok)' : 'var(--danger)'} />
        <span style={footerMono}>{address}</span>
        {spent != null && <span style={{ ...footerMono, marginLeft: 'auto' }}>{usd(spent)}</span>}
      </div>
    </aside>
  );
}

const aside: CSSProperties = {
  width: WIDTH,
  minWidth: WIDTH,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-surface)',
  borderRight: '1px solid var(--border)',
  overflow: 'hidden',
  fontFamily: 'var(--font-ui)',
  color: 'var(--text-secondary)',
};

const brand: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px 14px' };
const logo: CSSProperties = {
  width: 28, height: 28, borderRadius: 8, background: 'var(--accent)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};
const brandTitle: CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17, color: 'var(--text-primary)' };
const brandSubtitle: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-muted)' };

const nav: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 10px' };
const navLink = (isActive: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '9px 10px', borderRadius: 8,
  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
  background: isActive ? 'var(--bg-elevated)' : 'transparent',
  textDecoration: 'none', fontSize: 14, fontWeight: isActive ? 600 : 500,
});

const providersBlock: CSSProperties = { marginTop: 18, padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 };
const providersLabel: CSSProperties = { fontSize: 10.5, letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 2 };
const providerRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)' };

const footer: CSSProperties = {
  marginTop: 'auto',
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '12px 16px', borderTop: '1px solid var(--border-soft)',
};
const footerMono: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' };
