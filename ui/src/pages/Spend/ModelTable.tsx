import type { CSSProperties } from 'react';
import type { SpendRow } from '../../types';

export type ModelRow = SpendRow & { provider: string };

const usd = (n: number) => `$${n.toFixed(n !== 0 && Math.abs(n) < 0.1 ? 3 : 2)}`;

const th: CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: 11, letterSpacing: '0.04em',
  color: 'var(--text-muted)', fontWeight: 500, borderBottom: '1px solid var(--border-soft)',
};
const thNum: CSSProperties = { ...th, textAlign: 'right' };
const td: CSSProperties = {
  padding: '12px 14px', fontSize: 13.5, color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border-soft)',
};
const tdNum: CSSProperties = { ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' };

// The total is passed in rather than re-summed here — the caller already
// verified it against the same rows (FR-30), so the percentages stay tied
// to that one checked number instead of a second, possibly diverging sum.
export default function ModelTable({ rows, total }: { rows: ModelRow[]; total: number }) {
  if (rows.length === 0) {
    return <p style={{ color: 'var(--text-muted)', margin: 0 }}>Sin gasto en el período.</p>;
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={th}>Modelo</th>
          <th style={th}>Proveedor</th>
          <th style={thNum}>Assets</th>
          <th style={thNum}>Costo</th>
          <th style={{ ...th, textAlign: 'left' }}>% del total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const pct = total > 0 ? (r.costUsd / total) * 100 : 0;
          return (
            <tr key={r.key}>
              <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{r.key}</td>
              <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.provider}</td>
              <td style={tdNum}>{r.count}</td>
              <td style={tdNum}>{usd(r.costUsd)}</td>
              <td style={{ ...td, minWidth: 160 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', width: 34, textAlign: 'right' }}>
                    {Math.round(pct)}%
                  </span>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
