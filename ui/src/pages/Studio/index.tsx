import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, createGeneration, estimate, fileUrl, getGeneration, listModels } from '../../api';
import AssetPicker, { Thumb, type PickedInput } from '../../components/AssetPicker';
import { upsertJob, useJobs } from '../../sse';
import type { Estimate, Generation, GenerationRequest, Kind, ModelInfo } from '../../types';

type Field = 'prompt' | 'text' | 'script' | 'avatar' | 'voice' | 'aspect' | 'duration' | 'quality' | 'n'
  | 'style' | 'texture' | 'pbr' | 'engine';

// Only the fields that apply to each kind.
const FIELDS: Record<Kind, Field[]> = {
  image: ['prompt', 'aspect', 'quality', 'n', 'style'],
  svg: ['prompt', 'style'],
  video: ['prompt', 'aspect', 'duration', 'quality'],
  'model-3d': ['prompt', 'texture', 'pbr'],
  audio: ['text', 'voice'],
  sfx: ['prompt', 'duration'],
  'avatar-video': ['script', 'avatar', 'voice'],
  'bg-remove': [],
  upscale: ['engine'],
};
const NUMERIC: Field[] = ['duration', 'n'];
const BOOLEAN: Field[] = ['texture', 'pbr'];
const MULTILINE: Field[] = ['prompt', 'text', 'script'];
const LABEL: Record<Field, string> = {
  prompt: 'Prompt', text: 'Texto', script: 'Guion', avatar: 'Avatar', voice: 'Voz', aspect: 'Aspecto (1:1, 16:9…)',
  duration: 'Duración (s)', quality: 'Calidad', n: 'Cantidad', style: 'Estilo', engine: 'Motor de upscale',
  texture: 'Textura', pbr: 'PBR',
};
const KINDS = Object.keys(FIELDS) as Kind[];

type Values = Partial<Record<Field, string | boolean>>;

function buildRequest(kind: Kind, model: string, v: Values, inputs: PickedInput[]): GenerationRequest {
  const has = (f: Field) => FIELDS[kind].includes(f);
  const str = (f: Field) => {
    const x = has(f) && typeof v[f] === 'string' ? (v[f] as string).trim() : '';
    return x || undefined;
  };
  const num = (f: Field) => {
    const x = str(f);
    return x !== undefined && Number.isFinite(Number(x)) ? Number(x) : undefined;
  };
  const req: GenerationRequest = { kind, model: model || undefined, prompt: str('prompt'), text: str('text'),
    script: str('script'), avatar: str('avatar'), voice: str('voice') };
  if (inputs.length) req.inputs = inputs.map((i) => (i.id ? { id: i.id } : { url: i.url! }));
  const params = {
    aspect: str('aspect'), duration: num('duration'), quality: str('quality'), n: num('n'),
    style: str('style'), engine: str('engine'),
    texture: has('texture') ? !!v.texture : undefined, pbr: has('pbr') ? !!v.pbr : undefined,
  };
  const clean = Object.fromEntries(Object.entries(params).filter(([, x]) => x !== undefined));
  if (Object.keys(clean).length) req.params = clean;
  return JSON.parse(JSON.stringify(req)); // drop undefined keys so estimate == CLI dry-run
}

const usd = (n: number) => `$${n.toFixed(3)}`;

const INPUT_KINDS: Kind[] = ['bg-remove', 'upscale']; // always need an input, even before models load

export default function Studio() {
  const [params] = useSearchParams();
  // Query preload (?kind&model&input=…&prompt), read once on mount.
  const [init] = useState(() => {
    const k = params.get('kind') as Kind | null;
    return { kind: k && KINDS.includes(k) ? k : 'image' as Kind, model: params.get('model') ?? '',
      prompt: params.get('prompt'), inputs: params.getAll('input').filter(Boolean) };
  });
  const initModel = useRef(init.model);
  const [kind, setKind] = useState<Kind>(init.kind);
  const [model, setModel] = useState('');
  const [values, setValues] = useState<Values>(() => {
    const f = FIELDS[init.kind].find((x) => MULTILINE.includes(x));
    return init.prompt && f ? { [f]: init.prompt } : {};
  });
  const [inputs, setInputs] = useState<PickedInput[]>(() =>
    init.inputs.map((x) => (/^https?:\/\//.test(x) ? { url: x } : { id: x })));
  const [picking, setPicking] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [est, setEst] = useState<Estimate | null>(null);
  const [estError, setEstError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Estimate | null>(null); // confirm dialog
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<string[]>([]);
  const jobs = useJobs();

  const request = useMemo(() => buildRequest(kind, model, values, inputs), [kind, model, values, inputs]);
  const chosen = models.find((m) => m.id === model);
  const maxInputs = chosen ? chosen.acceptsInputs
    : models.some((m) => m.acceptsInputs === 'many') ? 'many' : models.some((m) => m.acceptsInputs === 1) ? 1 : 0;
  const showInputs = maxInputs !== 0 || INPUT_KINDS.includes(kind);

  // Preloaded ids have no mime yet: fetch it for the thumbnails.
  useEffect(() => {
    inputs.filter((i) => i.id && !i.mime).forEach((i) =>
      getGeneration(i.id!).then((g) => setInputs((p) => p.map((x) => (x.id === i.id ? { ...x, mime: g.mime } : x)))).catch(() => {}));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setModel(initModel.current);
    initModel.current = '';
    setModels([]);
    listModels(kind).then((r) => setModels(r.items)).catch(() => {});
  }, [kind]);

  // Live estimate, debounced 400 ms.
  useEffect(() => {
    let stale = false;
    const t = setTimeout(() => {
      estimate(request)
        .then((e) => { if (!stale) { setEst(e); setEstError(null); } })
        .catch((e: Error) => { if (!stale) { setEst(null); setEstError(e.message); } });
    }, 400);
    return () => { stale = true; clearTimeout(t); };
  }, [request]);

  const set = (f: Field, v: string | boolean) => setValues((p) => ({ ...p, [f]: v }));

  async function send(confirm?: boolean) {
    setBusy(true);
    setError(null);
    setPending(null);
    try {
      const { job } = await createGeneration(confirm ? { ...request, confirm: true } : request);
      upsertJob(job);
      setSubmitted((p) => [job.id, ...p]);
      setValues({}); // ready for another generation
      setInputs([]);
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

  const finished = submitted
    .map((id) => jobs.find((j) => j.id === id))
    .filter((j) => j && (j.status === 'done' || j.status === 'failed'));

  return (
    <div>
      <h1>Studio</h1>
      <form onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <label>Tipo{' '}
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        {FIELDS[kind].map((f) => (
          <div key={f}>
            <label>
              {BOOLEAN.includes(f) ? (
                <input type="checkbox" checked={!!values[f]} onChange={(e) => set(f, e.target.checked)} />
              ) : null}
              {LABEL[f]}{' '}
              {MULTILINE.includes(f) ? (
                <textarea rows={3} value={(values[f] as string) ?? ''} onChange={(e) => set(f, e.target.value)} />
              ) : BOOLEAN.includes(f) ? null : (
                <input type={NUMERIC.includes(f) ? 'number' : 'text'} min={NUMERIC.includes(f) ? 1 : undefined}
                  value={(values[f] as string) ?? ''} onChange={(e) => set(f, e.target.value)} />
              )}
            </label>
          </div>
        ))}
        {showInputs && (
          <div>
            Inputs{' '}
            {inputs.map((i, n) => (
              <span key={i.id ?? i.url}>
                <Thumb input={i} />
                <button type="button" aria-label="Quitar" onClick={() => setInputs((p) => p.filter((_, m) => m !== n))}>×</button>
              </span>
            ))}{' '}
            <button type="button" onClick={() => setPicking(true)}>Elegir de la biblioteca…</button>
          </div>
        )}
        <div>
          <label>Modelo{' '}
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">Auto</option>
              {models.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.available}>
                  {m.id}{m.unitCostUsd != null ? ` (${usd(m.unitCostUsd)})` : ''}{m.available ? '' : ' — sin key'}
                </option>
              ))}
            </select>
          </label>
          {models.some((m) => !m.available) && (
            <small> Modelos «sin key»: <Link to="/providers">configurar proveedores</Link></small>
          )}
        </div>

        <p aria-live="polite">
          {est ? (
            <>
              Costo estimado: <strong>{est.known ? usd(est.costUsd) : 'desconocido'}</strong> · nivel {est.level} · modelo {est.model}
              {est.candidates.length > 1 && <> · fallback: {est.candidates.filter((c) => c !== est.model).join(', ')}</>}
            </>
          ) : estError ? `Sin estimación: ${estError}` : 'Estimando…'}
        </p>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy}>Generar</button>
      </form>

      {picking && (
        <AssetPicker multiple={maxInputs === 'many'} onClose={() => setPicking(false)}
          onPick={(items) => { setInputs((p) => (maxInputs === 'many' ? [...p, ...items] : items)); setPicking(false); }} />
      )}

      {pending && (
        <dialog open role="alertdialog">
          <p>Costo alto: {usd(pending.costUsd)} con {pending.model}. ¿Continuar?</p>
          <button onClick={() => void send(true)}>Confirmar</button>{' '}
          <button onClick={() => setPending(null)}>Cancelar</button>
        </dialog>
      )}

      {finished.map((j) => j && <Result key={j.id} ids={j.generationIds} error={j.error?.message} />)}
    </div>
  );
}

function Result({ ids, error }: { ids: string[]; error?: string }) {
  const [gens, setGens] = useState<Generation[]>([]);
  useEffect(() => { Promise.all(ids.map(getGeneration)).then(setGens).catch(() => {}); }, [ids]);
  if (error) return <p role="alert">Falló: {error}</p>;
  return (
    <section>
      {gens.map((g) => (
        <figure key={g.id}>
          {g.mime.startsWith('image/') ? <img src={fileUrl(g.id)} alt={g.prompt ?? g.kind} style={{ maxWidth: 320 }} />
            : g.mime.startsWith('video/') ? <video src={fileUrl(g.id)} controls style={{ maxWidth: 320 }} />
            : g.mime.startsWith('audio/') ? <audio src={fileUrl(g.id)} controls /> : null}
          <figcaption><Link to={`/asset/${g.id}`}>Ver detalle</Link> · {usd(g.costUsd)}</figcaption>
        </figure>
      ))}
    </section>
  );
}
