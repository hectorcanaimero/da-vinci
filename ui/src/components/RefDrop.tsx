import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import AssetPicker, { Thumb, type PickedInput } from './AssetPicker';

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;
const label = (r: PickedInput) => r.name ?? r.id ?? r.url ?? '';

// FR-19: tres orígenes de referencia — arrastrar archivos del SO (evento
// tauri://drag-drop, el HTML5 dataTransfer no trae paths en el webview),
// elegir de la biblioteca, o pegar una URL (las dos últimas via AssetPicker).
export default function RefDrop({ value, onChange }: {
  value: PickedInput[];
  onChange: (refs: PickedInput[]) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [dragOver, setDragOver] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    getCurrentWebviewWindow().onDragDropEvent((event) => {
      const rect = boxRef.current?.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const inside = (() => {
        if (!rect || event.payload.type === 'leave') return false;
        const { x, y } = event.payload.position;
        return x / dpr >= rect.left && x / dpr <= rect.right && y / dpr >= rect.top && y / dpr <= rect.bottom;
      })();
      if (event.payload.type === 'drop') {
        setDragOver(false);
        if (inside) {
          const added = event.payload.paths.map((p) => ({ path: p, name: basename(p) }));
          onChangeRef.current([...valueRef.current, ...added]);
        }
      } else {
        setDragOver(inside);
      }
    }).then((fn) => { if (cancelled) fn(); else unlisten = fn; });
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  async function browseFiles() {
    const selected = await openFileDialog({ multiple: true });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    onChange([...value, ...paths.map((p) => ({ path: p, name: basename(p) }))]);
  }

  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <section>
      <div style={sectionLabel}>Referencias</div>
      <div ref={boxRef} style={box(dragOver)}>
        {value.length > 0 && (
          <ul style={list}>
            {value.map((r, i) => (
              <li key={i} style={row}>
                <Thumb input={r} size={36} />
                <span style={name}>{label(r)}</span>
                <button type="button" aria-label="Quitar referencia" onClick={() => remove(i)} style={removeBtn}>×</button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" style={hint} onClick={() => setPicking(true)}>
          Arrastrá archivos, pegá una URL o elegí de la galería
        </button>
        <button type="button" style={browseBtn} onClick={() => void browseFiles()}>Examinar archivos…</button>
      </div>
      {picking && (
        <AssetPicker multiple onClose={() => setPicking(false)}
          onPick={(items) => { onChange([...value, ...items]); setPicking(false); }} />
      )}
    </section>
  );
}

const sectionLabel: CSSProperties = {
  display: 'block', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--text-muted)', marginBottom: 8, fontFamily: 'var(--font-ui)',
};
const box = (dragOver: boolean): CSSProperties => ({
  display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10,
  background: 'var(--bg-input)', border: `1px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
});
const list: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 };
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
const name: CSSProperties = {
  flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
};
const removeBtn: CSSProperties = {
  background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1,
  cursor: 'pointer', padding: 4, flexShrink: 0,
};
const hint: CSSProperties = {
  background: 'none', border: 'none', textAlign: 'left', padding: 0, cursor: 'pointer',
  fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
};
const browseBtn: CSSProperties = {
  alignSelf: 'flex-start', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '6px 10px', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-ui)',
};
