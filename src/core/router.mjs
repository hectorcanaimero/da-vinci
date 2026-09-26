import { join } from 'node:path';
import { DavinciError } from './errors.mjs';
import { getModel, defaultModel, equivalents } from './catalog.mjs';
import { loadConfig } from './config.mjs';
import { generate } from './generate.mjs';
import { COST_TABLE } from '../utils/cost-estimator.mjs';
import { recordGeneration } from '../utils/manifest.mjs';
import { openLibrary } from '../library/db.mjs';

const invalid = (msg, details) => new DavinciError('invalid_request', msg, details);

// Campos obligatorios por kind (model-3d acepta prompt o imagen de entrada).
const REQUIRED = {
  image: ['prompt'], svg: ['prompt'], video: ['prompt'],
  audio: ['text'], sfx: ['text'],
  'avatar-video': ['script', 'avatar', 'voice'],
};

function resolveEntry(req) {
  const id = req?.model;
  const entry = !id || id === 'auto' ? defaultModel(req?.kind) : getModel(id);
  if (!entry) throw invalid(id && id !== 'auto' ? `Modelo desconocido: ${id}` : `kind inválido: ${req?.kind}`);
  if (req.kind && req.kind !== entry.kind) {
    throw invalid(`El modelo ${entry.id} es de kind ${entry.kind}, no ${req.kind}`);
  }
  for (const f of REQUIRED[entry.kind] ?? []) if (!req[f]) throw invalid(`Falta ${f}`);
  const hasInputs = req.inputs?.length > 0;
  if (entry.kind === 'model-3d' && !req.prompt && !hasInputs) throw invalid('Falta prompt o inputs');
  if ((entry.kind === 'bg-remove' || entry.kind === 'upscale') && !hasInputs) throw invalid('Falta inputs[0]');
  if (hasInputs && !entry.acceptsInputs) throw invalid(`${entry.id} no acepta inputs`);
  return entry;
}

// Costo con los umbrales de config (no los fijos de cost-estimator).
function costOf(entry, req, thresholds) {
  const costKey = entry.costKey({ ...req.params, inputs: req.inputs });
  const unit = COST_TABLE[costKey];
  const known = unit !== undefined && !entry.costUnknown;
  const costUsd = known ? unit * Number(req.params?.n ?? 1) : 0;
  const level = costUsd > thresholds.warn ? 'confirm' : costUsd > thresholds.auto ? 'warn' : 'auto';
  return { costKey, costUsd, level, known };
}

function plan(req, library) {
  const config = loadConfig();
  const entry = resolveEntry(req);
  const candidates = req.fallback !== false && config.fallback ? [entry, ...equivalents(entry.id)] : [entry];
  const cost = costOf(entry, req, config.thresholds);
  const budget = config.dailyBudgetUsd;
  const budgetLeftUsd = budget == null ? null : budget - library().spentToday();
  return { config, entry, candidates, cost, budgetLeftUsd };
}

// Abre la biblioteca solo si hace falta; la cierra quien la abrió.
function lazyLibrary(ctx) {
  let own = null;
  return {
    get: () => ctx.library ?? (own ??= openLibrary()),
    close: () => own?.close(),
  };
}

/** @returns {{ model, costKey, costUsd, level, known, candidates, budgetLeftUsd }} */
export function estimate(req, ctx = {}) {
  const lib = lazyLibrary(ctx);
  try {
    const { entry, candidates, cost, budgetLeftUsd } = plan(req, lib.get);
    return { model: entry.id, ...cost, candidates: candidates.map((c) => c.id), budgetLeftUsd };
  } finally {
    lib.close();
  }
}

/**
 * Gate de costo + tope diario, ejecución con fallback (D9) y registro en
 * biblioteca y manifest del proyecto.
 * @returns {Promise<object[]>} Generation[]
 */
export async function run(req, ctx = {}) {
  const lib = lazyLibrary(ctx);
  try {
    const library = lib.get();
    const { config, entry, candidates, cost, budgetLeftUsd } = plan(req, () => library);
    const details = { model: entry.id, costKey: cost.costKey, costUsd: cost.costUsd, known: cost.known };

    // El tope diario va primero: `confirm` no lo salta.
    if (budgetLeftUsd != null && cost.costUsd > budgetLeftUsd) {
      throw new DavinciError('budget_exceeded', `Tope diario de $${config.dailyBudgetUsd} superado`,
        { ...details, budgetLeftUsd, dailyBudgetUsd: config.dailyBudgetUsd });
    }
    if (cost.level === 'confirm' && !req.confirm) {
      throw new DavinciError('cost_confirm_required', `Costo alto ($${cost.costUsd.toFixed(3)}): requiere confirmación`, details);
    }

    const genCtx = {
      ...ctx,
      outDir: ctx.outDir ?? join(config.home, 'library'),
      resolveInputPath: (id) => library.get(id)?.filePath ?? null,
    };

    let lastErr;
    for (const cand of candidates) {
      let outputs;
      try {
        outputs = await generate(cand, { ...req, kind: cand.kind }, genCtx);
      } catch (err) {
        lastErr = err;
        if (err.code === 'provider_unavailable' || err.code === 'provider_error') {
          ctx.onProgress?.(`${cand.id} falló (${err.code}), probando siguiente candidato`);
          continue;
        }
        throw err;
      }
      return record(outputs, cand, entry, req, ctx, library, config);
    }
    throw lastErr;
  } finally {
    lib.close();
  }
}

async function record(outputs, cand, requested, req, ctx, library, config) {
  const { costUsd } = costOf(cand, req, config.thresholds);
  const perFile = costUsd / outputs.length;
  const prompt = req.prompt ?? req.text ?? req.script ?? null;
  const params = req.params ?? {};
  const inputs = (req.inputs ?? []).map((i) => (i.id ? { id: i.id } : { ref: i.url ?? i.path }));

  const gens = [];
  for (const o of outputs) {
    const g = library.record({
      kind: cand.kind, prompt, provider: cand.provider, model: cand.model,
      requestedModel: cand === requested ? null : requested.id,
      params, costUsd: perFile, filePath: o.filePath, mime: o.mime, bytes: o.bytes,
      source: ctx.source, projectDir: ctx.projectDir ?? null, inputs,
    });
    if (ctx.projectDir) {
      await recordGeneration({
        id: g.id, prompt, provider: cand.provider, model: cand.model, outputPath: o.filePath,
        costUsd: perFile, references: inputs.map((i) => i.ref ?? `davinci:${i.id}`), params,
        projectRoot: ctx.projectDir,
      });
    }
    gens.push(g);
  }
  return gens;
}
