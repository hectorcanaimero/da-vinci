import type { CSSProperties, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { fileUrl } from '../../api';
import Actions from './Actions';
import Lineage from './Lineage';
import type { Detail } from './index';

const copy = (s: string) => navigator.clipboard?.writeText(s).catch(() => {});

function shortenPath(path: string, max = 44) {
  if (path.length <= max) return path;
  const tail = path.slice(-(max - 1));
  return `…${tail}`;
}

const KB = 1024;
function fmtBytes(n: number) {
  if (n < KB) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / KB;
  let i = 0;
  while (v >= KB && i < units.length - 1) { v /= KB; i += 1; }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

// Humanizes provider-specific param keys (seed, aspect, faceLimit…) without
// hardcoding which ones a given model produces.
function label(key: string) {
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const icon = (d: string) => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const ICONS = {
  copy: icon('M8 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1'),
  reveal: icon('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'),
  download: icon('M12 3v12m0 0-4-4m4 4 4-4M4 19h16'),
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={section}>
      <div style={sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label: l, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div style={row}>
      <span style={rowLabel}>{l}</span>
      <span style={mono ? rowValueMono : rowValue}>{value}</span>
    </div>
  );
}

export default function MetaPanel({ d }: { d: Detail }) {
  const reveal = () => invoke('reveal_in_files', { path: d.filePath }).catch(() => {});
  const params = Object.entries(d.params).filter(([, v]) => v !== undefined && v !== null && v !== '');

  return (
    <div style={panel}>
      <Section title="Prompt">
        <p style={promptText}>{d.prompt ?? '—'}</p>
        <div style={linkRow}>
          {d.prompt && <button style={linkBtn} onClick={() => copy(d.prompt!)}>{ICONS.copy} Copiar prompt</button>}
          <a style={{ ...linkBtn, textDecoration: 'none' } as CSSProperties}
            href={`/estudio?kind=${d.kind}&input=${d.id}${d.prompt ? `&prompt=${encodeURIComponent(d.prompt)}` : ''}`}>
            Reusar en Estudio
          </a>
        </div>
      </Section>

      <Section title="Metadatos">
        <Row label="Proveedor" value={d.provider} />
        <Row label="Modelo" value={d.model} />
        {d.requestedModel && d.requestedModel !== d.model && <Row label="Pedido" value={d.requestedModel} />}
        {params.map(([k, v]) => (
          <Row key={k} label={label(k)} value={typeof v === 'object' ? JSON.stringify(v) : String(v)} />
        ))}
        <Row label="Costo" value={`$${d.costUsd.toFixed(4)}`} />
        <Row label="Fecha" value={new Date(d.createdAt).toLocaleString()} />
        <Row label="Origen" value={d.source} />
        {d.projectDir && <Row label="Proyecto" value={d.projectDir} />}
      </Section>

      <Section title="Archivo">
        <div style={fileRow} title={d.filePath}>
          <span style={filePath}>{shortenPath(d.filePath)}</span>
          <span style={fileSize}>{fmtBytes(d.bytes)}</span>
        </div>
        <div style={btnRow}>
          <button style={fileBtn} onClick={reveal}>{ICONS.reveal} Revelar</button>
          <button style={fileBtn} onClick={() => copy(d.filePath)}>{ICONS.copy} Copiar ruta</button>
          <a style={{ ...fileBtn, textDecoration: 'none' } as CSSProperties} href={fileUrl(d.id)} download>
            {ICONS.download} Exportar
          </a>
        </div>
      </Section>

      <Section title="Acciones">
        <Actions gen={d} />
      </Section>

      <Lineage gen={d} parents={d.parents} children={d.children} />
    </div>
  );
}

const panel: CSSProperties = {
  width: 360, minWidth: 360, height: '100%', overflow: 'auto',
  background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
  padding: '20px 20px 32px', fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)',
};

const section: CSSProperties = { marginBottom: 22 };
const sectionTitle: CSSProperties = {
  fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)',
  marginBottom: 10, textTransform: 'uppercase',
};

const promptText: CSSProperties = {
  margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap',
};
const linkRow: CSSProperties = { display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' };
const linkBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 0, padding: 0,
  color: 'var(--accent)', font: 'inherit', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
};

const row: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0',
  borderBottom: '1px solid var(--border-soft)', fontSize: 12.5,
};
const rowLabel: CSSProperties = { color: 'var(--text-muted)' };
const rowValue: CSSProperties = { color: 'var(--text-primary)', textAlign: 'right' };
const rowValueMono: CSSProperties = { ...rowValue, fontFamily: 'var(--font-mono)' };

const fileRow: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline',
  background: 'var(--bg-input)', border: '1px solid var(--border-soft)', borderRadius: 8,
  padding: '8px 10px', fontSize: 11.5,
};
const filePath: CSSProperties = {
  fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', overflow: 'hidden',
  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const fileSize: CSSProperties = { fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flexShrink: 0 };

const btnRow: CSSProperties = { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' };
const fileBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)',
  border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px', color: 'var(--text-primary)',
  font: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer',
};
