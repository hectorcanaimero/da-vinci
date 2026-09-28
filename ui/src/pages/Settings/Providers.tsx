import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ProviderList from '../../components/ProviderList';

// Lo que reporta el comando Tauri `secrets_list` (src-tauri/src/secrets.rs):
// por proveedor, si hay llave, sus últimos 4 caracteres y de dónde salió.
type KeyStatus = { provider: string; present: boolean; suffix: string | null; source: 'keyring' | 'file' | 'none' };

type Origin = 'keyring' | 'file' | 'none';

function useSecretsOrigin() {
  const [statuses, setStatuses] = useState<KeyStatus[] | null>(null);
  useEffect(() => {
    let live = true;
    invoke<KeyStatus[]>('secrets_list').then((r) => live && setStatuses(r)).catch(() => live && setStatuses([]));
    return () => { live = false; };
  }, []);

  const present = (statuses ?? []).filter((s) => s.present);
  const origins = new Set(present.map((s) => s.source));
  // El llavero manda cuando conviven los dos: es lo que pasa apenas el
  // llavero vuelve a estar disponible después de haber usado el archivo.
  const active: Origin = origins.has('keyring') ? 'keyring' : origins.has('file') ? 'file' : 'none';
  return { loading: statuses === null, active, hasFileBackup: origins.has('file') };
}

const ICON = (children: ReactNode) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const CARDS: Array<{ key: Origin | 'infisical'; title: string; subtitle: string; icon: ReactNode; available: boolean }> = [
  {
    key: 'keyring', title: 'Keychain', subtitle: 'Cifrado con el llavero del sistema', available: true,
    icon: ICON(<><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>),
  },
  {
    key: 'file', title: 'Archivo .env', subtitle: '~/.config/reveron/.env · modo 600', available: true,
    icon: ICON(<><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v3h3" /></>),
  },
  {
    key: 'infisical', title: 'Infisical', subtitle: 'No disponible en esta versión de escritorio', available: false,
    icon: ICON(<><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>),
  },
];

// El texto de seguridad tiene que decir la verdad sobre dónde quedaron
// guardadas las llaves EN ESTA máquina, no repetir la copia del diseño (que
// asume Keychain) cuando en realidad se cayó al respaldo en archivo.
function securityText(active: Origin): string {
  if (active === 'keyring') {
    return 'Las llaves que guardaste quedan cifradas en el Keychain del sistema (servicio "reveron") y nunca se envían a ningún servidor de Reverón. El proceso de Tauri es el único que las lee.';
  }
  if (active === 'file') {
    return 'Este equipo no tiene un llavero de sistema disponible, así que las llaves quedaron en ~/.config/reveron/.env con permisos 600. Tratá ese archivo como una contraseña: cualquiera con acceso a tu usuario puede leerlo.';
  }
  return 'Todavía no guardaste ninguna llave. Reverón prueba primero el Keychain del sistema y sólo cae a un archivo con permisos 600 en ~/.config/reveron/.env si el llavero no está disponible.';
}

export default function Providers() {
  const { loading, active } = useSecretsOrigin();

  return (
    <div style={wrap}>
      <section>
        <h2 style={h2}>Origen de los secretos</h2>
        <p style={lead}>Reverón detecta automáticamente de dónde leer las llaves en esta máquina.</p>

        <div style={cardsRow}>
          {CARDS.map((c) => {
            const isActive = !loading && c.key === active;
            return (
              <div key={c.key} style={card(isActive, c.available)}>
                <div style={cardHead}>
                  {isActive ? <span style={{ ...cardIcon, color: 'var(--accent)' }}>{c.icon}</span> : <span style={cardIcon}>{c.icon}</span>}
                  {isActive && <span style={activeDot} />}
                </div>
                <div style={cardTitle}>{c.title}</div>
                <div style={cardSubtitle}>{c.subtitle}</div>
              </div>
            );
          })}
        </div>

        {!loading && (
          <div style={securityNote}>
            {ICON(<><path d="M12 3 5 6v6c0 4.4 3 7.4 7 9 4-1.6 7-4.6 7-9V6z" /><path d="m9 12 2 2 4-4" /></>)}
            <p style={{ margin: 0 }}>{securityText(active)}</p>
          </div>
        )}
      </section>

      <section>
        <h2 style={h2}>Llaves de API</h2>
        <ProviderList />
      </section>
    </div>
  );
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 960 };
const h2: CSSProperties = { fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' };
const lead: CSSProperties = { fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 14px' };

const cardsRow: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 };
const card = (isActive: boolean, available: boolean): CSSProperties => ({
  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
  background: isActive ? 'var(--accent-soft)' : 'var(--bg-surface)',
  borderRadius: 10, padding: '14px 16px', opacity: available ? 1 : 0.55,
});
const cardHead: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const cardIcon: CSSProperties = { color: 'var(--text-secondary)', display: 'flex' };
const activeDot: CSSProperties = { width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' };
const cardTitle: CSSProperties = { fontSize: 14, fontWeight: 600, marginTop: 10, color: 'var(--text-primary)' };
const cardSubtitle: CSSProperties = { fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 };

const securityNote: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, padding: '12px 14px',
  borderRadius: 10, border: '1px solid var(--border-soft)', background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 1.5,
};
