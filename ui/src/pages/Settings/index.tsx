import { type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import Providers from './Providers';
import Agents from './Agents';
import Storage from './Storage';
import Server from './Server';
import Budget from './Budget';
import Appearance from './Appearance';
import Advanced from './Advanced';

const icon = (children: ReactNode) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

type Section = { key: string; label: string; icon: ReactNode; render: () => ReactNode };

const SECTIONS: Section[] = [
  {
    key: 'proveedores', label: 'Proveedores', render: () => <Providers />,
    icon: icon(<path d="M15 7a2 2 0 0 1 2 2 2 2 0 0 1-2 2 2 2 0 0 1-1.4-.6L8 14v2H6v-2H4v-2h2l5.6-5.6A2 2 0 0 1 13 5a2 2 0 0 1 2 2z" />),
  },
  {
    key: 'agentes', label: 'Agentes', render: () => <Agents />,
    icon: icon(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 3.5 12 7l4-3.5" /><circle cx="9" cy="13" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="13" r="1.2" fill="currentColor" stroke="none" /></>),
  },
  {
    key: 'almacenamiento', label: 'Almacenamiento', render: () => <Storage />,
    icon: icon(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M3 11h18" /></>),
  },
  {
    key: 'servidor', label: 'Servidor & API', render: () => <Server />,
    icon: icon(<><rect x="4" y="4" width="16" height="6" rx="1.5" /><rect x="4" y="14" width="16" height="6" rx="1.5" /><path d="M8 7h.01M8 17h.01" /></>),
  },
  {
    key: 'presupuesto', label: 'Presupuesto', render: () => <Budget />,
    icon: icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M9.5 9.8c0-1.3 1.1-2.3 2.5-2.3s2.5 1 2.5 2.1c0 2.8-5 1.5-5 4.2 0 1.2 1.1 2.2 2.5 2.2s2.5-1 2.5-2.3" /></>),
  },
  {
    key: 'apariencia', label: 'Apariencia', render: () => <Appearance />,
    icon: icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" /></>),
  },
  {
    key: 'avanzado', label: 'Avanzado', render: () => <Advanced />,
    icon: icon(<><circle cx="12" cy="12" r="3.2" /><path d="M12 3v2.4M12 18.6V21M4.2 12H6.6M17.4 12H19.8M6 6l1.7 1.7M16.3 16.3 18 18M18 6l-1.7 1.7M7.7 16.3 6 18" /></>),
  },
];

export default function Settings() {
  const [sp, setSp] = useSearchParams();
  const active = SECTIONS.find((s) => s.key === sp.get('section'))?.key ?? SECTIONS[0].key;
  const section = SECTIONS.find((s) => s.key === active)!;

  const go = (key: string) => setSp((p) => {
    const n = new URLSearchParams(p);
    n.set('section', key);
    return n;
  }, { replace: true });

  return (
    <div style={page}>
      <header style={header}>
        <h1 style={title}>Ajustes</h1>
        <p style={subtitle}>Llaves de API, agentes, almacenamiento y servidor local</p>
      </header>

      <div style={body}>
        <nav style={nav} aria-label="Secciones de Ajustes">
          {SECTIONS.map((s) => (
            <button key={s.key} type="button" style={navItem(s.key === active)} onClick={() => go(s.key)}>
              {s.icon}
              <span>{s.label}</span>
            </button>
          ))}
        </nav>

        <div style={content}>{section.render()}</div>
      </div>
    </div>
  );
}

const page: CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100%',
  fontFamily: 'var(--font-ui)', color: 'var(--text-primary)',
};

const header: CSSProperties = {
  padding: '22px 28px 18px', borderBottom: '1px solid var(--border-soft)', flexShrink: 0,
};
const title: CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 24, margin: 0 };
const subtitle: CSSProperties = { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' };

const body: CSSProperties = { display: 'flex', flex: 1, minHeight: 0 };

const nav: CSSProperties = {
  width: 200, minWidth: 200, flexShrink: 0, borderRight: '1px solid var(--border-soft)',
  display: 'flex', flexDirection: 'column', gap: 2, padding: '16px 10px', overflowY: 'auto',
};
const navItem = (isActive: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8,
  border: 'none', background: isActive ? 'var(--bg-elevated)' : 'transparent',
  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
  fontSize: 13.5, fontWeight: isActive ? 600 : 500, fontFamily: 'var(--font-ui)',
  cursor: 'pointer', textAlign: 'left',
});

const content: CSSProperties = { flex: 1, minWidth: 0, overflowY: 'auto', padding: '24px 28px 40px' };
