import { useEffect, useState, type CSSProperties } from 'react';

type FileInfo = { path: string; bytes: number };
type DerivedInfo = { count: number; onView?: () => void };

// FR-23: borrar un asset — dice qué se borra (cuántos registros, si además
// se borra el archivo) antes de hacer nada.
type AssetMode = {
  mode: 'asset';
  name: string;
  recordCount?: number;
  file?: FileInfo;
  derived?: DerivedInfo;
  defaultDeleteFile?: boolean;
  onCancel: () => void;
  onConfirm: (deleteFile: boolean) => void;
  busy?: boolean;
};

// FR-48: destruir la biblioteca entera — no se dispara con un botón, exige
// escribir `confirmText` tal cual antes de habilitar la acción.
type LibraryMode = {
  mode: 'library';
  recordCount: number;
  fileCount: number;
  confirmText: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
};

export type ConfirmDeleteProps = AssetMode | LibraryMode;

const KB = 1024;
function fmtBytes(n: number) {
  if (n < KB) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / KB;
  let i = 0;
  while (v >= KB && i < units.length - 1) { v /= KB; i += 1; }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

const icon = (d: string, strokeWidth = 1.8) => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const TRASH = 'M4 7h16M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3m-9 0 1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13';
const LINK = 'M9 17H7a5 5 0 0 1 0-10h2m6 0h2a5 5 0 0 1 0 10h-2M8 12h8';

export default function ConfirmDelete(props: ConfirmDeleteProps) {
  const { onCancel, busy } = props;
  const [deleteFile, setDeleteFile] = useState(props.mode === 'asset' ? (props.defaultDeleteFile ?? true) : true);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  const title = props.mode === 'asset'
    ? (props.recordCount && props.recordCount > 1 ? `¿Borrar ${props.recordCount} assets?` : `¿Borrar ${props.name}?`)
    : '¿Borrar toda la biblioteca?';

  const subtitle = props.mode === 'asset'
    ? 'Se quita de la biblioteca junto con su prompt, su costo y su historial.'
    : `Se borran ${props.recordCount} registro${props.recordCount === 1 ? '' : 's'} de la biblioteca y ${props.fileCount} archivo${props.fileCount === 1 ? '' : 's'} del disco.`;

  const canConfirm = props.mode === 'asset' ? true : typed === props.confirmText;
  const confirmLabel = props.mode === 'asset'
    ? (deleteFile ? 'Borrar asset y archivo' : 'Borrar asset')
    : 'Borrar biblioteca';

  const handleConfirm = () => {
    if (busy || !canConfirm) return;
    if (props.mode === 'asset') props.onConfirm(deleteFile);
    else props.onConfirm();
  };

  return (
    <div style={overlay} onClick={() => !busy && onCancel()}>
      <div style={panel} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-label={title}>
        <div style={headerRow}>
          <span style={dangerBadge}>{icon(TRASH)}</span>
          <div>
            <h2 style={titleStyle}>{title}</h2>
            <p style={subtitleStyle}>{subtitle}</p>
          </div>
        </div>

        {props.mode === 'asset' && props.file && (
          <label style={fileRow}>
            <input
              type="checkbox"
              checked={deleteFile}
              onChange={(e) => setDeleteFile(e.target.checked)}
              style={{ accentColor: 'var(--danger)', marginTop: 2 }}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={fileLabel}>Borrar también el archivo del disco</span>
              <span style={filePath} title={props.file.path}>{props.file.path}</span>
            </span>
            <span style={fileSize}>{fmtBytes(props.file.bytes)}</span>
          </label>
        )}

        {props.mode === 'asset' && props.derived && props.derived.count > 0 && (
          <div style={warnBox}>
            <span style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 1 }}>{icon(LINK)}</span>
            <div>
              <p style={warnTitle}>
                {props.derived.count} generaci{props.derived.count === 1 ? 'ón' : 'ones'} usaron este asset como referencia
              </p>
              <p style={warnBody}>Esas se conservan, pero su lineage va a quedar apuntando a un asset que ya no existe.</p>
              {props.derived.onView && (
                <button type="button" style={warnLink} onClick={props.derived.onView}>
                  Ver las {props.derived.count} derivadas
                </button>
              )}
            </div>
          </div>
        )}

        {props.mode === 'library' && (
          <div style={typedBox}>
            <label style={typedLabel} htmlFor="confirm-delete-typed">
              Escribí <code style={typedCode}>{props.confirmText}</code> para confirmar
            </label>
            <input
              id="confirm-delete-typed"
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              style={typedInput}
            />
          </div>
        )}

        <div style={footer}>
          <span style={footerHint}>No se puede deshacer</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={cancelBtn} onClick={onCancel} disabled={busy}>Cancelar</button>
            <button type="button" style={dangerBtn(!canConfirm || !!busy)} onClick={handleConfirm} disabled={!canConfirm || busy}>
              {icon(TRASH, 1.6)} {busy ? 'Borrando…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
const dangerBadge: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  width: 36, height: 36, borderRadius: 10, background: 'var(--danger)', color: 'var(--bone)',
};
const titleStyle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' };
const subtitleStyle: CSSProperties = { margin: '4px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' };

const fileRow: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
  background: 'var(--bg-input)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '10px 12px',
};
const fileLabel: CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' };
const filePath: CSSProperties = {
  display: 'block', marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-muted)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const fileSize: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0 };

const warnBox: CSSProperties = {
  display: 'flex', gap: 10, background: 'var(--bg-input)', border: '1px solid var(--warn)',
  borderRadius: 10, padding: '10px 12px',
};
const warnTitle: CSSProperties = { margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' };
const warnBody: CSSProperties = { margin: '4px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' };
const warnLink: CSSProperties = {
  marginTop: 6, background: 'none', border: 0, padding: 0, color: 'var(--warn)',
  font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
};

const typedBox: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const typedLabel: CSSProperties = { fontSize: 12.5, color: 'var(--text-secondary)' };
const typedCode: CSSProperties = {
  fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', background: 'var(--bg-elevated)',
  border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px',
};
const typedInput: CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '9px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 13, outline: 'none',
};

const footer: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 };
const footerHint: CSSProperties = { fontSize: 12, color: 'var(--text-muted)' };
const cancelBtn: CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '8px 14px', color: 'var(--text-primary)', font: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const dangerBtn = (disabled: boolean): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8,
  padding: '8px 14px', color: 'var(--bone)', font: 'inherit', fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
});
