import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';
import { estimate, fileUrl, getSpend, listJobs, listLibrary, listModels, listProviders } from '../api';
import type { Generation, Job, ModelInfo, ProviderStatus } from '../types';

// FR-40: same key everywhere a shortcut is hinted, taken from platform_info()
// so mac shows ⌘ and Windows/Linux show Ctrl — never hardcode the symbol.
function useModifierKey() {
  const [mod, setMod] = useState('Ctrl');
  useEffect(() => {
    invoke<{ os: string; modifier_key: string }>('platform_info')
      .then((info) => setMod(info.modifier_key))
      .catch(() => {});
  }, []);
  return mod;
}

const DESTINATIONS = [
  { to: '/', label: 'Chat' },
  { to: '/estudio', label: 'Estudio' },
  { to: '/galeria', label: 'Galería' },
  { to: '/actividad', label: 'Actividad' },
  { to: '/gastos', label: 'Gastos' },
  { to: '/ajustes', label: 'Ajustes' },
];

const usd = (n: number) => `$${n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`;

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.round(ms / 3_600_000);
  if (h < 1) return 'hace unos min';
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

const basename = (p: string) => p.split(/[/\\]/).pop() ?? p;

type Item = { key: string; label: string; sub?: string; trail?: string; icon?: ReactNode; run: () => void };

// FR-39: "los assets con su miniatura" — imagen/video real, resto queda con un bloque neutro.
function AssetThumb({ g }: { g: Generation }) {
  const box: CSSProperties = { width: 20, height: 20, borderRadius: 4, objectFit: 'cover', flexShrink: 0 };
  if (g.mime.startsWith('image/')) return <img src={fileUrl(g.id)} alt="" style={box} />;
  if (g.mime.startsWith('video/')) return <video src={fileUrl(g.id)} muted style={box} />;
  return <span style={{ ...box, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }} />;
}

function useDebounced<T>(value: T, ms: number) {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [assets, setAssets] = useState<Generation[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [spentToday, setSpentToday] = useState<number | null>(null);
  const [budgetLeftUsd, setBudgetLeftUsd] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const mod = useModifierKey();
  const navigate = useNavigate();
  const debouncedQuery = useDebounced(query, 200);

  // Abre con mod+K — manejador de teclado de la ventana, no un atajo global (no hace falta el plugin de atajos globales).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    inputRef.current?.focus();
    listModels().then((r) => setModels(r.items)).catch(() => setModels([]));
    listJobs(undefined, 50).then((r) => setJobs(r.items)).catch(() => setJobs([]));
    listProviders().then((r) => setProviders(r.items)).catch(() => setProviders([]));
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    getSpend({ from: dayStart.toISOString(), to: now.toISOString(), groupBy: 'day' })
      .then((r) => setSpentToday(r.totalUsd)).catch(() => setSpentToday(null));
    // Único uso barato de POST /api/estimate: es la sola ruta que devuelve
    // dailyBudgetUsd/budgetLeftUsd (ver Sidebar.tsx) — svg+prompt mínimo no genera nada.
    estimate({ kind: 'svg', prompt: 'x' }).then((r) => setBudgetLeftUsd(r.budgetLeftUsd)).catch(() => setBudgetLeftUsd(null));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listLibrary({ q: debouncedQuery || undefined, limit: 5 }).then((r) => setAssets(r.items)).catch(() => setAssets([]));
  }, [open, debouncedQuery]);

  const q = query.trim().toLowerCase();
  const matches = (s: string) => s.toLowerCase().includes(q);

  // JobStatus no lista 'interrupted' (F6.1, fuera del alcance de este archivo) pero
  // el server sí lo devuelve (markInterrupted) — comparamos como string suelto.
  const interrupted = jobs.filter((j) => (j.status as string) === 'interrupted');
  const activeJobs = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  const connectedProviders = providers.filter((p) => p.status === 'connected');

  const actionItems: Item[] = useMemo(() => {
    const list: Item[] = [
      { key: 'gen-image', label: 'Generar imagen…', trail: `${mod} G`, run: () => navigate('/estudio') },
      { key: 'gen-video', label: 'Generar video…', trail: `${mod} ⇧V`, run: () => navigate('/estudio') },
    ];
    if (interrupted.length > 0) {
      list.push({
        key: 'resume', label: `Reanudar ${interrupted.length} job${interrupted.length > 1 ? 's' : ''} interrumpido${interrupted.length > 1 ? 's' : ''}`,
        trail: `${interrupted.length} en espera`, run: () => navigate('/actividad'),
      });
    }
    return list.filter((i) => matches(i.label));
  }, [mod, interrupted.length, q]);

  const modelItems: Item[] = useMemo(() => models
    .filter((m) => matches(`${m.model} ${m.provider} ${m.kind}`))
    .slice(0, 6)
    .map((m) => ({
      key: m.id, label: `${m.model} · ${m.provider}`,
      trail: m.unitCostUsd != null ? usd(m.unitCostUsd) : '—',
      run: () => navigate('/estudio'),
    })), [models, q]);

  const assetItems: Item[] = useMemo(() => assets.slice(0, 5).map((g) => ({
    key: g.id, label: basename(g.filePath), icon: <AssetThumb g={g} />,
    trail: `${g.model} · ${timeAgo(g.createdAt)}`,
    run: () => navigate('/galeria'),
  })), [assets]);

  const destItems: Item[] = useMemo(() => DESTINATIONS.filter((d) => matches(d.label)).map((d) => {
    let trail: string | undefined;
    if (d.to === '/actividad') trail = `${activeJobs.length} activos`;
    else if (d.to === '/gastos' && spentToday != null) trail = `${usd(spentToday)} hoy`;
    else if (d.to === '/ajustes' && providers.length > 0) trail = `${connectedProviders.length} de ${providers.length} conectados`;
    return { key: d.to, label: d.label, trail, run: () => navigate(d.to) };
  }), [q, activeJobs.length, spentToday, providers.length, connectedProviders.length]);

  const groups = [
    { title: 'ACCIONES', items: actionItems },
    { title: q ? `MODELOS · ${modelItems.length} coinciden con "${query}"` : 'MODELOS', items: modelItems },
    { title: 'ASSETS RECIENTES', items: assetItems },
    { title: 'IR A', items: destItems },
  ].filter((g) => g.items.length > 0);

  const flat = groups.flatMap((g) => g.items);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const choose = (item: Item) => { item.run(); setOpen(false); };

  return (
    <div style={overlay} onClick={() => setOpen(false)}>
      <div style={panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Paleta de comandos" aria-modal="true">
        <div style={searchRow}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.6, flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar acciones, modelos, assets, destinos…"
            style={searchInput}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, flat.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter' && flat[active]) { e.preventDefault(); choose(flat[active]); }
            }}
          />
          <kbd style={kbdStyle}>esc</kbd>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {groups.length === 0 && <div style={empty}>Sin resultados para "{query}"</div>}
          {groups.map((g) => (
            <div key={g.title}>
              <div style={groupLabel}>{g.title}</div>
              {g.items.map((item) => {
                const idx = flat.indexOf(item);
                return (
                  <div
                    key={item.key}
                    role="option"
                    aria-selected={idx === active}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => choose(item)}
                    style={row(idx === active)}
                  >
                    <span style={rowMain}>
                      {item.icon}
                      <span style={rowLabel}>
                        {item.label}
                        {item.sub && <span style={rowSub}> · {item.sub}</span>}
                      </span>
                    </span>
                    {item.trail && <span style={rowTrail}>{item.trail}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={footer}>
          <span style={footerHint}><kbd style={kbdStyle}>↑↓</kbd> navegar</span>
          <span style={footerHint}><kbd style={kbdStyle}>↵</kbd> abrir</span>
          <span style={{ marginLeft: 'auto' }}>
            {budgetLeftUsd != null ? `${usd(budgetLeftUsd)} disponibles hoy` : 'sin tope diario'}
          </span>
        </div>
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  paddingTop: '12vh', zIndex: 1000,
};

const panel: CSSProperties = {
  width: 620, maxHeight: '70vh', display: 'flex', flexDirection: 'column',
  background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12,
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)', fontFamily: 'var(--font-ui)', color: 'var(--text-primary)',
  overflow: 'hidden',
};

const searchRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
  borderBottom: '1px solid var(--border-soft)',
};
const searchInput: CSSProperties = {
  flex: 1, background: 'transparent', border: 'none', outline: 'none',
  color: 'var(--text-primary)', fontSize: 15, fontFamily: 'var(--font-ui)',
};
const kbdStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 5,
  padding: '2px 6px',
};

const groupLabel: CSSProperties = {
  fontSize: 10.5, letterSpacing: '0.06em', color: 'var(--text-muted)', padding: '10px 16px 6px',
};
const row = (isActive: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  padding: '8px 16px', cursor: 'pointer', fontSize: 13.5,
  background: isActive ? 'var(--bg-elevated)' : 'transparent',
});
const rowMain: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' };
const rowLabel: CSSProperties = { color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const rowSub: CSSProperties = { color: 'var(--text-muted)', fontSize: 12 };
const rowTrail: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap',
};

const empty: CSSProperties = { padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13.5 };

const footer: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px',
  borderTop: '1px solid var(--border-soft)', fontSize: 11.5, color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
};
const footerHint: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };
