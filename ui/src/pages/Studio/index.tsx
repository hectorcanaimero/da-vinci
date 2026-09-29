import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, createGeneration, estimate, listModels } from '../../api';
import Canvas from './Canvas';
import JobStrip from './JobStrip';
import ModelPicker from './ModelPicker';
import Params, { type ParamValues } from './Params';
import RefDrop from '../../components/RefDrop';
import type { PickedInput } from '../../components/AssetPicker';
import type { Estimate, GenerationRequest, ModelInfo } from '../../types';

// Estudio sólo expone estos 5 tipos (spec F3.1.T1) — el resto del catálogo
// (bg-remove, upscale, avatar-video, sfx) vive fuera de esta pantalla.
type StudioKind = 'image' | 'video' | 'svg' | 'audio' | 'model-3d';
const KINDS: StudioKind[] = ['image', 'video', 'svg', 'audio', 'model-3d'];
const KIND_LABEL: Record<StudioKind, string> = { image: 'Imagen', video: 'Video', svg: 'SVG', audio: 'Voz', 'model-3d': '3D' };
const CONTENT_LABEL: Record<StudioKind, string> = {
  image: 'Prompt', video: 'Prompt', svg: 'Prompt', 'model-3d': 'Prompt', audio: 'Texto',
};

const icon = (children: ReactNode) => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const KIND_ICON: Record<StudioKind, ReactNode> = {
  image: icon(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m4 17 5-5 3.5 3.5L17 11l3 3" /></>),
  video: icon(<><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m21 8-4 3 4 3z" /></>),
  svg: icon(<><path d="M5 20 15 4" /><circle cx="16" cy="3.2" r="1.6" fill="currentColor" stroke="none" /></>),
  audio: icon(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" /></>),
  'model-3d': icon(<path d="M12 3 20 7.5v9L12 21 4 16.5v-9zM4 7.5 12 12l8-4.5M12 12v9" />),
};

const isStudioKind = (v: string | null): v is StudioKind => !!v && (KINDS as string[]).includes(v);
const usd = (n: number) => `$${n.toFixed(3)}`;

const toRequestInput = (r: PickedInput): { id: string } | { url: string } | { path: string } =>
  r.id ? { id: r.id } : r.url ? { url: r.url } : { path: r.path! };

function buildRequest(
  kind: StudioKind, model: string, content: string, voice: string, params: ParamValues,
  refs: PickedInput[], acceptsInputs: ModelInfo['acceptsInputs'] | undefined,
): GenerationRequest {
  const req: GenerationRequest = { kind, model: model || undefined };
  const trimmed = content.trim();
  if (kind === 'audio') {
    if (trimmed) req.text = trimmed;
    if (voice.trim()) req.voice = voice.trim();
  } else if (trimmed) {
    req.prompt = trimmed;
  }
  const cleanParams = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
  if (Object.keys(cleanParams).length) req.params = cleanParams;
  // FR-19: sólo se adjuntan referencias si el modelo elegido las soporta —
  // acceptsInputs 0 significa que el proveedor las ignoraría o rechazaría.
  if (acceptsInputs && refs.length) {
    req.inputs = (acceptsInputs === 1 ? refs.slice(0, 1) : refs).map(toRequestInput);
  }
  return JSON.parse(JSON.stringify(req)); // drop undefined keys so estimate == what POST sends
}

export default function Studio() {
  const [search] = useSearchParams();
  // Preload de /estudio?kind&model&prompt (usado por "Derivar" en Asset) — leído una sola vez.
  const [init] = useState(() => ({
    kind: isStudioKind(search.get('kind')) ? (search.get('kind') as StudioKind) : 'image' as StudioKind,
    model: search.get('model') ?? '',
    content: search.get('prompt') ?? '',
  }));
  const initModel = useRef(init.model);

  const [kind, setKind] = useState<StudioKind>(init.kind);
  const [model, setModel] = useState('');
  const [content, setContent] = useState(init.content);
  const [voice, setVoice] = useState('');
  const [params, setParams] = useState<ParamValues>({});
  // FR-22: "Usar como referencia" en el detalle de un asset navega acá con
  // ?ref=<id> (+ mime/nombre para el thumbnail) — se adjunta sin que el
  // usuario copie ninguna ruta, vía el mismo RefDrop del FR-19.
  const [refs, setRefs] = useState<PickedInput[]>(() => {
    const ref = search.get('ref');
    if (!ref) return [];
    return [{ id: ref, mime: search.get('refMime') ?? undefined, name: search.get('refName') ?? undefined }];
  });
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [totalAvailable, setTotalAvailable] = useState<number | null>(null);
  const [est, setEst] = useState<Estimate | null>(null);
  const [estError, setEstError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastJobId, setLastJobId] = useState<string | null>(null);

  const modelInfo = models.find((m) => m.id === model);
  const provider = modelInfo?.provider;
  const request = useMemo(
    () => buildRequest(kind, model, content, voice, params, refs, modelInfo?.acceptsInputs),
    [kind, model, content, voice, params, refs, modelInfo?.acceptsInputs],
  );

  useEffect(() => {
    listModels().then((r) => setTotalAvailable(r.items.filter((m) => m.available).length)).catch(() => {});
  }, []);

  // Tipo cambiado → catálogo y parámetros vuelven a cero; el modelo por
  // defecto es el primero disponible (FR-11), salvo un preload por query string.
  useEffect(() => {
    let live = true;
    setParams({});
    listModels(kind).then((r) => {
      if (!live) return;
      setModels(r.items);
      const available = r.items.filter((m) => m.available);
      const preload = initModel.current;
      initModel.current = '';
      setModel(preload && available.some((m) => m.id === preload) ? preload : available[0]?.id ?? '');
    }).catch(() => live && setModels([]));
    return () => { live = false; };
  }, [kind]);

  // Estimación en vivo, debounced 400ms — mismo contrato que POST /api/generations envía.
  useEffect(() => {
    let stale = false;
    const t = setTimeout(() => {
      estimate(request)
        .then((e) => { if (!stale) { setEst(e); setEstError(null); } })
        .catch((e: Error) => { if (!stale) { setEst(null); setEstError(e.message); } });
    }, 400);
    return () => { stale = true; clearTimeout(t); };
  }, [request]);

  async function send(confirm?: boolean) {
    setBusy(true);
    setError(null);
    setPending(null);
    try {
      const { job } = await createGeneration(confirm ? { ...request, confirm: true } : request);
      setLastJobId(job.id);
      setContent('');
      setVoice('');
      setRefs([]);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'cost_confirm_required') setPending(e.details as Estimate);
      else if (e instanceof ApiError && e.code === 'budget_exceeded') {
        const left = (e.details as Partial<Estimate> | undefined)?.budgetLeftUsd;
        setError(`Tope diario superado${left != null ? `: quedan ${usd(left)}` : ''}.`);
      } else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const generateLabel = busy ? 'Generando…'
    : est && est.known && est.level !== 'auto' ? `Generar · confirmar ${usd(est.costUsd)}`
    : 'Generar';

  return (
    <div style={page}>
      <header style={header}>
        <h1 style={title}>Estudio</h1>
        <p style={subtitle}>Control manual del router{totalAvailable != null ? ` · ${totalAvailable} modelos disponibles` : ''}</p>
      </header>

      <div style={body}>
        <form style={formCol} onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <section>
            <div style={sectionLabel}>Tipo de asset</div>
            <div style={tabs} role="radiogroup" aria-label="Tipo de asset">
              {KINDS.map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={k === kind} style={tab(k === kind)}>
                  {KIND_ICON[k]}{KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </section>

          <section>
            <label style={sectionLabel} htmlFor="studio-content">{CONTENT_LABEL[kind]}</label>
            <textarea id="studio-content" style={textarea} rows={4} value={content}
              onChange={(e) => setContent(e.target.value)} />
            {kind === 'audio' && (
              <input type="text" style={{ ...textInput, marginTop: 8 }} placeholder="Voz (id) — opcional"
                value={voice} onChange={(e) => setVoice(e.target.value)} />
            )}
          </section>

          <ModelPicker models={models} value={model} onChange={setModel} />
          <Params kind={kind} provider={provider} values={params} onChange={setParams} />
          <RefDrop value={refs} onChange={setRefs} />

          <section style={estimateBox}>
            {est ? (
              <p style={estimateText}>
                Estimado <strong style={estimateAmount}>{est.known ? usd(est.costUsd) : 'desconocido'}</strong>
                {' '}· modelo {est.model}
                {est.candidates.length > 1 && ` · fallback: ${est.candidates.filter((c) => c !== est.model).join(', ')}`}
                {est.budgetLeftUsd != null && ` · quedan ${usd(est.budgetLeftUsd)} de tope hoy`}
              </p>
            ) : estError ? <p style={estimateText}>Sin estimación: {estError}</p> : <p style={estimateText}>Estimando…</p>}
          </section>

          {error && <p role="alert" style={errorText}>{error}</p>}

          <button type="submit" style={generateBtn} disabled={busy}>{generateLabel}</button>
        </form>

        <div style={canvasCol}>
          <Canvas jobId={lastJobId} />
          <JobStrip />
        </div>
      </div>

      {pending && (
        <dialog open role="alertdialog" style={dialog}>
          <p>Costo alto: {usd(pending.costUsd)} con {pending.model}. ¿Continuar?</p>
          <div style={dialogActions}>
            <button type="button" style={generateBtn} onClick={() => void send(true)}>Confirmar</button>
            <button type="button" style={secondaryBtn} onClick={() => setPending(null)}>Cancelar</button>
          </div>
        </dialog>
      )}
    </div>
  );
}

const page: CSSProperties = { display: 'flex', flexDirection: 'column', height: '100%' };
const header: CSSProperties = { padding: '20px 28px 16px', borderBottom: '1px solid var(--border-soft)' };
const title: CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text-primary)', margin: 0 };
const subtitle: CSSProperties = { fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0 0', fontFamily: 'var(--font-mono)' };

const body: CSSProperties = { display: 'flex', flex: 1, minHeight: 0 };
const formCol: CSSProperties = {
  width: 380, minWidth: 380, overflowY: 'auto', padding: 20,
  display: 'flex', flexDirection: 'column', gap: 18,
  background: 'var(--bg-surface)', borderRight: '1px solid var(--border)',
};
const canvasCol: CSSProperties = { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' };

const sectionLabel: CSSProperties = {
  display: 'block', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--text-muted)', marginBottom: 8, fontFamily: 'var(--font-ui)',
};
const tabs: CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap' };
const tab = (active: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 8,
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  background: active ? 'var(--accent-soft)' : 'var(--bg-input)',
  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  fontSize: 12.5, fontFamily: 'var(--font-ui)', fontWeight: active ? 600 : 500, cursor: 'pointer',
});

const textInput: CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '9px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 13.5, boxSizing: 'border-box',
};
const textarea: CSSProperties = { ...textInput, resize: 'vertical', fontFamily: 'var(--font-ui)', lineHeight: 1.4 };

const estimateBox: CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '10px 12px',
};
const estimateText: CSSProperties = { margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' };
const estimateAmount: CSSProperties = { color: 'var(--warn)', fontFamily: 'var(--font-mono)' };
const errorText: CSSProperties = { color: 'var(--danger)', fontSize: 13, margin: 0 };

const generateBtn: CSSProperties = {
  background: 'var(--accent)', color: 'var(--bone)', border: 'none', borderRadius: 10,
  padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
};
const secondaryBtn: CSSProperties = {
  background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '11px 16px', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-ui)',
};
const dialog: CSSProperties = {
  background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 20,
};
const dialogActions: CSSProperties = { display: 'flex', gap: 8, marginTop: 12 };
