#!/usr/bin/env node
/**
 * Da Vinci — CLI (capa fina sobre src/core/router).
 *
 * Uso:
 *   node generate.mjs <intent> [--flag=value ...]
 *
 * Intents soportados:
 *   image, svg, video, model-3d, avatar-video, tts, sfx, bg-remove, upscale,
 *   list-voices, list-avatars, import
 *
 * Ver referencias/model-matrix.md para la matriz completa de decisión.
 */

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { injectSecretsIntoEnv } from './utils/secrets.mjs';
import { costMessage, formatCost } from './utils/cost-estimator.mjs';
import { resolveOutputDir, resolveManifestPath } from './utils/manifest.mjs';
import { estimate, run } from './core/router.mjs';
import { DavinciError } from './core/errors.mjs';
import { openLibrary } from './library/db.mjs';
import { importManifest } from './library/import.mjs';
import * as heygen from './providers/heygen.mjs';
import * as elevenlabs from './providers/elevenlabs.mjs';

// ── CLI parsing ──────────────────────────────────────────────────────

const { positionals, values: flags } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    provider:  { type: 'string' },
    model:     { type: 'string' },
    prompt:    { type: 'string' },
    text:      { type: 'string' },
    script:    { type: 'string' },
    voice:     { type: 'string' },
    avatar:    { type: 'string' },
    aspect:    { type: 'string', default: '16:9' },
    duration:  { type: 'string', default: '5' },
    quality:   { type: 'string', default: 'medium' },
    n:         { type: 'string', default: '1' },
    refs:      { type: 'string' },              // "url1,ruta,davinci:<id>,..."
    image:     { type: 'string' },              // single URL for bg-remove/upscale
    out:       { type: 'string' },              // output path override
    texture:   { type: 'string', default: 'true' },  // model-3d: --texture false para desactivar
    pbr:       { type: 'string', default: 'true' },  // model-3d: --pbr false para desactivar
    'face-limit': { type: 'string' },           // model-3d: límite de polígonos
    style:     { type: 'string' },              // model-3d: estilo (ver docs Tripo)
    'dry-run': { type: 'boolean', default: false },
    force:     { type: 'boolean', default: false },
    help:      { type: 'boolean', default: false },
    verbose:   { type: 'boolean', default: false },
  },
});

const intent = positionals[0];

if (flags.help || !intent) {
  printHelp();
  process.exit(flags.help ? 0 : 1);
}

// ── Intents → GenerationRequest ──────────────────────────────────────

const KIND = {
  image: 'image', svg: 'svg', video: 'video', 'model-3d': 'model-3d', 'avatar-video': 'avatar-video',
  tts: 'audio', sfx: 'sfx', 'bg-remove': 'bg-remove', upscale: 'upscale',
};
const REQUIRED_FLAGS = {
  image: ['prompt'], svg: ['prompt'], video: ['prompt'], 'avatar-video': ['avatar', 'voice', 'script'],
  tts: ['text'], sfx: ['text'], 'bg-remove': ['image'], upscale: ['image'],
};
// Proveedor que se asume cuando solo se pasa --model (como hoy).
const MODEL_PROVIDER = { image: 'fal', video: 'fal', upscale: 'fal', tts: 'elevenlabs', 'model-3d': 'tripo' };
// Modelo por defecto de cada proveedor cuando solo se pasa --provider.
const DEFAULT_MODEL = {
  image: { fal: 'flux-pro-ultra', openai: 'gpt-image-2', gemini: 'nano-banana', kie: 'flux-2', heygen: 'hyperframes' },
  video: { fal: 'kling-1.6-pro', gemini: 'veo-3.0-fast-generate-001', kie: 'veo-3-fast' },
};

function modelId() {
  const provider = flags.provider ?? (flags.model ? MODEL_PROVIDER[intent] : undefined);
  if (!provider) return 'auto';
  const model = flags.model ?? DEFAULT_MODEL[intent]?.[provider];
  return model ? `${provider}/${model}` : 'auto';
}

// "davinci:<id>" → {id}; http(s) → {url}; resto → {path}
function refToInput(item) {
  if (item.startsWith('davinci:')) return { id: item.slice('davinci:'.length) };
  return /^https?:\/\//i.test(item) ? { url: item } : { path: item };
}

function buildRequest() {
  for (const f of REQUIRED_FLAGS[intent] ?? []) required(f);
  const refs = (flags.refs ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const inputs = (intent === 'bg-remove' || intent === 'upscale' ? [flags.image] : refs).map(refToInput);
  if (intent === 'model-3d' && !flags.prompt && !inputs.length) required('prompt');

  const req = {
    kind: KIND[intent],
    model: modelId(),
    params: {
      aspect: flags.aspect, duration: flags.duration, quality: flags.quality, n: Number(flags.n),
      ...(intent === 'model-3d' && {
        texture: flags.texture !== 'false', pbr: flags.pbr !== 'false',
        faceLimit: flags['face-limit'] ? Number(flags['face-limit']) : undefined, style: flags.style,
      }),
    },
    confirm: flags.force,
  };
  if (inputs.length) req.inputs = inputs;
  for (const f of ['prompt', 'text', 'script', 'voice', 'avatar']) if (flags[f]) req[f] = flags[f];
  return req;
}

async function runIntent() {
  const req = buildRequest();
  const cwd = process.cwd();
  const ctx = {
    source: 'cli', projectDir: cwd, outDir: resolveOutputDir(cwd),
    outPath: flags.out ? resolve(flags.out) : undefined,
  };

  const est = estimate(req, ctx);
  console.error(costMessage({ totalCost: est.costUsd, level: est.level, known: est.known }, est.costKey));
  if (flags['dry-run']) {
    console.log(JSON.stringify({
      dryRun: true,
      modelKey: est.costKey,
      unitCost: est.known ? est.costUsd / (req.params.n || 1) : null,
      totalCost: est.costUsd,
      level: est.level,
      known: est.known,
    }, null, 2));
    return;
  }

  // Con n>1 se imprime un JSON por output.
  for (const g of await run(req, ctx)) {
    console.log(JSON.stringify({
      ok: true,
      id: g.id,
      provider: g.provider,
      model: g.model,
      outputPath: g.filePath,
      costUsd: g.costUsd,
      manifestPath: resolveManifestPath(cwd),
    }, null, 2));
  }
}

async function runImport(path) {
  if (!path) {
    console.error('❌ Uso: import <ruta-a-manifest.json>');
    process.exit(1);
  }
  const lib = openLibrary();
  try {
    console.log(JSON.stringify(await importManifest(path, lib)));
  } finally {
    lib.close();
  }
}

// ── Main dispatcher ──────────────────────────────────────────────────

async function main() {
  // import solo toca la biblioteca local: no exige credenciales de proveedores.
  const auth = await injectSecretsIntoEnv().catch((err) => {
    if (intent === 'import') return null;
    throw err;
  });
  if (auth && flags.verbose) {
    console.error(`🔑 Secretos cargados desde: ${auth.source}${auth.path ? ` (${auth.path})` : ''} — keys: ${auth.keys.join(', ')}`);
  }

  switch (intent) {
    case 'list-voices':  return runListVoices();
    case 'list-avatars': return runListAvatars();
    case 'import':       return runImport(positionals[1]);
    default:
      if (KIND[intent]) return runIntent();
      console.error(`❌ Intent desconocido: ${intent}`);
      printHelp();
      process.exit(1);
  }
}

// ── Listados ─────────────────────────────────────────────────────────

async function runListVoices() {
  const provider = flags.provider ?? 'elevenlabs';
  if (provider === 'elevenlabs') {
    const voices = await elevenlabs.listVoices();
    console.log(JSON.stringify(voices.map((v) => ({
      id: v.voice_id, name: v.name, category: v.category, labels: v.labels,
    })), null, 2));
    return;
  }
  if (provider === 'heygen') {
    const voices = await heygen.listVoices();
    console.log(JSON.stringify(voices, null, 2));
    return;
  }
  throw new Error(`Provider sin list-voices: ${provider}`);
}

async function runListAvatars() {
  const avatars = await heygen.listAvatars();
  console.log(JSON.stringify(avatars, null, 2));
}

// ── Utilities ────────────────────────────────────────────────────────

function required(name) {
  if (!flags[name]) {
    console.error(`❌ Falta el flag requerido --${name}`);
    process.exit(1);
  }
  return flags[name];
}

function printHelp() {
  console.error(`
Da Vinci — visual generation router
Uso: node generate.mjs <intent> [flags]

Intents:
  image          --provider {fal|openai|gemini|kie|heygen} --model X --prompt "..." [--aspect] [--n]
  svg            --prompt "..." (siempre FAL Recraft V3 SVG)
  video          --provider {fal|gemini|kie} --model X --prompt "..." [--aspect] [--duration]
  model-3d       --prompt "..." (texto) o --refs URL (imagen) → GLB (Tripo3D)
                 [--texture true|false] [--pbr true|false] [--face-limit N] [--style X]
  avatar-video   --avatar ID --voice ID --script "..." (HeyGen)
  tts            --text "..." --voice ID [--model multilingual-v2] (ElevenLabs)
  sfx            --text "..." [--duration N] (ElevenLabs)
  bg-remove      --image URL (FAL BRIA)
  upscale        --image URL [--model clarity|real-esrgan]
  list-voices    [--provider elevenlabs|heygen]
  list-avatars   (HeyGen)
  import         <ruta-a-manifest.json> — importa un manifest a la biblioteca → {imported, skipped}

Sin --provider/--model se elige el modelo por defecto del intent (auto).

Global flags:
  --refs REF1,REF2   Referencias visuales: URL, ruta local o davinci:<id> de la biblioteca
  --out PATH         Override output path
  --dry-run          Solo estima costo, no ejecuta
  --force            Confirma costo alto sin prompt
  --verbose          Info extra en stderr
  --help
`);
}

main().catch((err) => {
  if (err instanceof DavinciError && err.code === 'cost_confirm_required') {
    console.error(`🛑 Costo alto (${formatCost(err.details.costUsd)}). Re-ejecutá con --force para confirmar.`);
    process.exit(2);
  }
  console.error(`❌ ${err.message}`);
  if (flags.verbose) console.error(err.stack);
  process.exit(1);
});
