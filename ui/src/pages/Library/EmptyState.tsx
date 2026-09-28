import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMigration, runMigration } from '../../api';

const icon = (children: ReactNode, size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

// Same glyphs as Sidebar's "Chat"/"Estudio" icons, so the CTAs read as the same destinations.
const IMAGES_ICON = icon(<>
  <path d="M18 22H4a2 2 0 0 1-2-2V6" />
  <path d="m22 13-1.3-1.3a2.4 2.4 0 0 0-3.4 0L11 18" />
  <circle cx="12" cy="8" r="2" />
  <rect width="16" height="16" x="6" y="2" rx="2" />
</>, 28);
const CHAT_ICON = icon(<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4 4v-4H5.5A1.5 1.5 0 0 1 4 14.5z" />, 16);
const WAND_ICON = icon(<><path d="M4 20 16 8" /><path d="M15 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="currentColor" stroke="none" /></>, 16);
const DOWNLOAD_ICON = icon(<><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>, 18);

export default function EmptyState({ onImported }: { onImported?: () => void }) {
  const nav = useNavigate();
  const [migration, setMigration] = useState<{ detected: boolean; count?: number } | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => { getMigration().then(setMigration).catch(() => {}); }, []);

  const doImport = async () => {
    setImporting(true);
    try { await runMigration(); onImported?.(); } finally { setImporting(false); }
  };

  return (
    <div style={wrap}>
      <div style={glyph}>{IMAGES_ICON}</div>
      <h2 style={title}>Todavía no generaste nada</h2>
      <p style={desc}>
        Cada imagen, video, voz o modelo 3D que generes aparece acá, con su prompt, su costo y el archivo real en disco.
      </p>
      <div style={buttons}>
        <button type="button" style={primaryBtn} onClick={() => nav('/')}>{CHAT_ICON}Pedirle algo al agente</button>
        <button type="button" style={secondaryBtn} onClick={() => nav('/estudio')}>{WAND_ICON}Abrir el Estudio</button>
      </div>

      {migration?.detected && (
        <div style={importRow}>
          <span style={importIcon}>{DOWNLOAD_ICON}</span>
          <div style={importTexts}>
            <p style={importTitle}>¿Venís de Da Vinci?</p>
            <p style={importDesc}>Importá tu manifest.json y traé todo el historial.</p>
          </div>
          <button type="button" style={importAction} onClick={doImport} disabled={importing}>
            {importing ? 'Importando…' : 'Importar'}
          </button>
        </div>
      )}
    </div>
  );
}

const wrap: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
  padding: '72px 24px 32px', gap: 8,
};
const glyph: CSSProperties = {
  width: 64, height: 64, borderRadius: 16, background: 'var(--bg-surface)',
  display: 'grid', placeItems: 'center', color: 'var(--text-muted)', marginBottom: 16,
};
const title: CSSProperties = {
  margin: 0, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--text-primary)',
};
const desc: CSSProperties = {
  margin: '4px 0 0', maxWidth: 420, fontFamily: 'var(--font-ui)', fontSize: 13.5, lineHeight: 1.5,
  color: 'var(--text-secondary)',
};
const buttons: CSSProperties = { display: 'flex', gap: 10, marginTop: 20 };
const btnBase: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 16px', border: 0, borderRadius: 8,
  fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
};
const primaryBtn: CSSProperties = { ...btnBase, background: 'var(--accent)', color: 'var(--bg-app)' };
const secondaryBtn: CSSProperties = { ...btnBase, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' };

const importRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, marginTop: 28, padding: '14px 16px', maxWidth: 460,
  background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'left',
};
const importIcon: CSSProperties = { display: 'flex', color: 'var(--accent)', flexShrink: 0 };
const importTexts: CSSProperties = { flex: 1, minWidth: 0 };
const importTitle: CSSProperties = { margin: 0, fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' };
const importDesc: CSSProperties = { margin: '2px 0 0', fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--text-muted)' };
const importAction: CSSProperties = {
  background: 'none', border: 0, padding: 0, color: 'var(--accent)', fontFamily: 'var(--font-ui)',
  fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
};
