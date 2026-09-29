import { useEffect, useState } from 'react';
import { ApiError, createGeneration, estimate, listModels } from '../../api';
import type { Generation, GenerationRequest, Estimate } from '../../types';

type Props = { gen: Generation };

const usd = (n: number) => `$${n.toFixed(3)}`;

export default function Actions({ gen }: Props) {
  const [pending, setPending] = useState<Estimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasImageModels, setHasImageModels] = useState(false);

  // Check if image models exist (for SVG rasterization option).
  useEffect(() => {
    if (gen.kind === 'svg') {
      listModels('image').then((r) => setHasImageModels(r.items.length > 0)).catch(() => {});
    }
  }, [gen.kind]);

  const buildRequest = (): GenerationRequest => {
    const req: GenerationRequest = {
      kind: gen.kind,
      model: gen.requestedModel || gen.model,
      prompt: gen.prompt ?? undefined,
      params: Object.keys(gen.params).length > 0 ? gen.params : undefined,
    };
    if (gen.inputs.length > 0 && gen.inputs[0].id) {
      req.inputs = [{ id: gen.inputs[0].id }];
    }
    return req;
  };

  async function regenerate(confirm?: boolean) {
    setBusy(true);
    setError(null);
    setPending(null);
    try {
      const request = buildRequest();
      if (!confirm) {
        const est = await estimate(request);
        if (est.level === 'confirm') {
          setPending(est);
          setBusy(false);
          return;
        }
      }
      const body = confirm ? { ...buildRequest(), confirm: true } : buildRequest();
      await createGeneration(body);
      // Reload or redirect to show new job.
      window.location.reload();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'cost_confirm_required') {
        setPending(e.details as Estimate);
      } else if (e instanceof ApiError && e.code === 'budget_exceeded') {
        const left = (e.details as Partial<Estimate> | undefined)?.budgetLeftUsd;
        setError(`Tope diario superado${left != null ? `: quedan ${usd(left)}` : ''}.`);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  const studioUrl = (kind: string, input: string = gen.id) => {
    const params = new URLSearchParams({ kind, input });
    if (gen.prompt) params.set('prompt', gen.prompt);
    return `/estudio?${params.toString()}`;
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
        <button onClick={() => regenerate()} disabled={busy}>
          Regenerar
        </button>
        <a href={studioUrl(gen.kind)}>
          <button>Variar prompt</button>
        </a>

        {gen.kind === 'image' && (
          <>
            <a href={studioUrl('video')}>
              <button>Animar (video)</button>
            </a>
            <a href={studioUrl('model-3d')}>
              <button>Modelo 3D</button>
            </a>
            <a href={studioUrl('bg-remove')}>
              <button>Quitar fondo</button>
            </a>
            <a href={studioUrl('upscale')}>
              <button>Upscale</button>
            </a>
          </>
        )}

        {gen.kind === 'svg' && hasImageModels && (
          <a href={studioUrl('image')}>
            <button>Rasterizar a imagen</button>
          </a>
        )}
      </div>

      {pending && (
        <dialog open role="alertdialog">
          <p>
            Costo alto: {usd(pending.costUsd)} con {pending.model}. ¿Continuar?
          </p>
          <button onClick={() => regenerate(true)}>Confirmar</button>
          {' '}
          <button onClick={() => setPending(null)}>Cancelar</button>
        </dialog>
      )}

      {error && <p role="alert">{error}</p>}
    </>
  );
}
