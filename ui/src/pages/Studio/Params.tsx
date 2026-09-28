import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type { Kind } from '../../types';

export type ParamValues = Partial<{
  aspect: string; n: number; quality: string; duration: number;
  texture: boolean; pbr: boolean; faceLimit: number; style: string;
}>;

const ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4'];
const QUALITIES = ['low', 'medium', 'high'];

// Sólo los params que src/core/generate.mjs realmente lee para el kind (y,
// para `quality`, el proveedor) elegido — no hay catálogo declarativo del
// lado del servidor, así que esta lista espeja el dispatch a mano.
export default function Params({ kind, provider, values, onChange }: {
  kind: Kind;
  provider?: string;
  values: ParamValues;
  onChange: (values: ParamValues) => void;
}) {
  const set = <K extends keyof ParamValues>(k: K, v: ParamValues[K]) => onChange({ ...values, [k]: v });

  const fields: ReactElement[] = [];
  if (kind === 'image' || kind === 'video') {
    fields.push(
      <Field key="aspect" label="Aspecto">
        <select style={select} value={values.aspect ?? '16:9'} onChange={(e) => set('aspect', e.target.value)}>
          {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </Field>,
    );
  }
  if (kind === 'image') {
    fields.push(
      <Field key="n" label="Cantidad">
        <input type="number" min={1} style={input} value={values.n ?? 1}
          onChange={(e) => set('n', Math.max(1, Number(e.target.value) || 1))} />
      </Field>,
    );
    if (provider === 'openai') {
      fields.push(
        <Field key="quality" label="Calidad">
          <select style={select} value={values.quality ?? 'medium'} onChange={(e) => set('quality', e.target.value)}>
            {QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </Field>,
      );
    }
  }
  if (kind === 'video') {
    fields.push(
      <Field key="duration" label="Duración (s)">
        <input type="number" min={1} style={input} value={values.duration ?? 5}
          onChange={(e) => set('duration', Math.max(1, Number(e.target.value) || 1))} />
      </Field>,
    );
  }
  if (kind === 'model-3d') {
    fields.push(
      <Field key="style" label="Estilo (opcional)">
        <input type="text" style={input} value={values.style ?? ''} onChange={(e) => set('style', e.target.value)} />
      </Field>,
      <Field key="faceLimit" label="Límite de caras">
        <input type="number" min={1} style={input} value={values.faceLimit ?? ''}
          placeholder="auto" onChange={(e) => set('faceLimit', e.target.value ? Number(e.target.value) : undefined)} />
      </Field>,
      <Checkbox key="texture" label="Textura" checked={values.texture !== false} onChange={(v) => set('texture', v)} />,
      <Checkbox key="pbr" label="PBR" checked={values.pbr !== false} onChange={(v) => set('pbr', v)} />,
    );
  }

  if (!fields.length) return null;

  return (
    <section>
      <div style={label}>Parámetros</div>
      <div style={row}>{fields}</div>
    </section>
  );
}

function Field({ label: text, children }: { label: string; children: ReactNode }) {
  return (
    <label style={field}>
      <span style={fieldLabel}>{text}</span>
      {children}
    </label>
  );
}

function Checkbox({ label: text, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={checkboxField}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span style={fieldLabel}>{text}</span>
    </label>
  );
}

const label: CSSProperties = {
  fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--text-muted)', marginBottom: 8, fontFamily: 'var(--font-ui)',
};
const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 10 };
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 96 };
const fieldLabel: CSSProperties = { fontSize: 11.5, color: 'var(--text-secondary)' };
const checkboxField: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-end', paddingBottom: 6 };
const inputBase: CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '7px 9px', color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 13,
};
const input: CSSProperties = { ...inputBase, width: 96 };
const select: CSSProperties = { ...inputBase, width: 96 };
