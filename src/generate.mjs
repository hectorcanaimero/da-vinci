#!/usr/bin/env node
/**
 * Da Vinci — router principal.
 *
 * Uso:
 *   node generate.mjs <intent> [--flag=value ...]
 *
 * Intents soportados:
 *   image, svg, video, avatar-video, tts, sfx, bg-remove, upscale,
 *   list-voices, list-avatars
 *
 * Ver referencias/model-matrix.md para la matriz completa de decisión.
 */

import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { injectSecretsIntoEnv } from './utils/secrets.mjs';
import { estimateCost, costMessage, formatCost } from './utils/cost-estimator.mjs';
import { fetchReference, loadLocalReference } from './utils/reference-loader.mjs';
import { recordGeneration, resolveOutputDir } from './utils/manifest.mjs';
import * as fal from './providers/fal.mjs';
import * as openai from './providers/openai.mjs';
import * as gemini from './providers/gemini.mjs';
import * as kie from './providers/kie.mjs';
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
    refs:      { type: 'string' },              // "url1,url2,..."
    image:     { type: 'string' },              // single URL for bg-remove/upscale
    out:       { type: 'string' },              // output path override
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

// ── Main dispatcher ──────────────────────────────────────────────────

async function main() {
  const auth = await injectSecretsIntoEnv();
  if (flags.verbose) {
    console.error(`🔑 Secretos cargados desde: ${auth.source}${auth.path ? ` (${auth.path})` : ''} — keys: ${auth.keys.join(', ')}`);
  }

  const references = flags.refs
    ? await loadReferences(flags.refs.split(',').map((s) => s.trim()).filter(Boolean))
    : [];

  switch (intent) {
    case 'image':          return runImage(references);
    case 'svg':            return runSvg();
    case 'video':          return runVideo(references);
    case 'avatar-video':   return runAvatarVideo();
    case 'tts':            return runTts();
    case 'sfx':            return runSfx();
    case 'bg-remove':      return runBgRemove();
    case 'upscale':        return runUpscale();
    case 'list-voices':    return runListVoices();
    case 'list-avatars':   return runListAvatars();
    default:
      console.error(`❌ Intent desconocido: ${intent}`);
      printHelp();
      process.exit(1);
  }
}

// ── Cost gate ────────────────────────────────────────────────────────

function checkCost(modelKey, quantity = 1) {
  const est = estimateCost(modelKey, quantity);
  console.error(costMessage(est, modelKey));

  if (flags['dry-run']) {
    console.log(JSON.stringify({ dryRun: true, modelKey, ...est }, null, 2));
    process.exit(0);
  }
  if (est.level === 'confirm' && !flags.force) {
    console.error(`🛑 Costo alto (${formatCost(est.totalCost)}). Re-ejecutá con --force para confirmar.`);
    process.exit(2);
  }
  return est;
}

// ── Handlers por intent ──────────────────────────────────────────────

async function runImage(references) {
  const provider = flags.provider ?? 'fal';
  const model = flags.model ?? defaultImageModel(provider);
  const prompt = required('prompt');
  // Solo OpenAI tiene quality tiers (low/medium/high); resto usa costo fijo por modelo.
  const qualityForCost = provider === 'openai' ? flags.quality : null;
  const cost = checkCost(costKey(provider, model, qualityForCost), Number(flags.n));

  let result;
  if (provider === 'fal') {
    result = await fal.generateImage({
      prompt,
      model,
      aspect: flags.aspect,
      numImages: Number(flags.n),
      imageUrls: references.map((r) => r.dataUrl?.() ?? null).filter(Boolean),
    });
    const urls = result.images.map((i) => i.url);
    const outputPath = await saveRemoteAsset(urls[0], 'image', 'png');
    await log({ prompt, provider, model, outputPath, cost, references: flags.refs?.split(',') });
    return outputPath;
  }
  if (provider === 'openai') {
    result = await openai.generateImage({
      prompt, model, quality: flags.quality,
      size: flags.aspect === '16:9' ? '1536x1024' : flags.aspect === '9:16' ? '1024x1536' : '1024x1024',
      n: Number(flags.n),
    });
    const outputPath = await saveB64Asset(result.images[0].b64, 'image', 'png');
    await log({ prompt, provider, model, outputPath, cost, references: flags.refs?.split(',') });
    return outputPath;
  }
  if (provider === 'gemini') {
    const imageInputs = references
      .filter((r) => r.mime?.startsWith('image/'))
      .map((r) => ({ b64: r.base64(), mime: r.mime }));
    result = await gemini.generateImage({
      prompt, model, aspect: flags.aspect,
      numImages: Number(flags.n), imageInputs,
    });
    const outputPath = await saveB64Asset(result.images[0].b64, 'image', 'png');
    await log({ prompt, provider, model, outputPath, cost, references: flags.refs?.split(',') });
    return outputPath;
  }
  if (provider === 'kie') {
    result = await kie.generateImage({
      prompt, model, aspect: flags.aspect, numImages: Number(flags.n),
    });
    const outputPath = await saveRemoteAsset(result.imageUrls[0], 'image', 'png');
    await log({ prompt, provider, model, outputPath, cost, references: flags.refs?.split(',') });
    return outputPath;
  }
  if (provider === 'heygen') {
    result = await heygen.generateHyperFrame({ prompt, aspect: 'landscape', numImages: Number(flags.n) });
    const outputPath = await saveRemoteAsset(result.imageUrls[0], 'image', 'png');
    await log({ prompt, provider, model: 'hyperframes', outputPath, cost, references: flags.refs?.split(',') });
    return outputPath;
  }
  throw new Error(`Provider desconocido para image: ${provider}`);
}

async function runSvg() {
  const prompt = required('prompt');
  const cost = checkCost('fal:recraft-v3-svg', 1);
  const result = await fal.generateSvg({ prompt });
  const outputPath = await saveRemoteAsset(result.svgUrl, 'svg', 'svg');
  await log({ prompt, provider: 'fal', model: 'recraft-v3-svg', outputPath, cost });
  return outputPath;
}

async function runVideo(references) {
  const provider = flags.provider ?? 'fal';
  const model = flags.model ?? defaultVideoModel(provider);
  const prompt = required('prompt');
  const durationSeconds = Number(flags.duration);
  const costK = costKey(provider, model, `${durationSeconds}s`);
  const cost = checkCost(costK, 1);

  let result;
  if (provider === 'fal') {
    result = await fal.generateVideo({
      prompt, model,
      duration: String(durationSeconds),
      aspect: flags.aspect,
      imageUrl: references[0]?.dataUrl(),
    });
    const outputPath = await saveRemoteAsset(result.videoUrl, 'video', 'mp4');
    await log({ prompt, provider, model, outputPath, cost, references: flags.refs?.split(',') });
    return outputPath;
  }
  if (provider === 'gemini') {
    result = await gemini.generateVideo({
      prompt, model, durationSeconds, aspect: flags.aspect,
      imageInput: references[0] ? { b64: references[0].base64(), mime: references[0].mime } : undefined,
    });
    const v = result.videos[0];
    const outputPath = v.b64
      ? await saveB64Asset(v.b64, 'video', 'mp4')
      : await saveRemoteAsset(v.uri, 'video', 'mp4');
    await log({ prompt, provider, model, outputPath, cost, references: flags.refs?.split(',') });
    return outputPath;
  }
  if (provider === 'kie') {
    result = await kie.generateVideo({
      prompt, model, aspect: flags.aspect, durationSeconds,
      imageUrl: references[0]?.dataUrl(),
    });
    const outputPath = await saveRemoteAsset(result.videoUrls[0], 'video', 'mp4');
    await log({ prompt, provider, model, outputPath, cost, references: flags.refs?.split(',') });
    return outputPath;
  }
  throw new Error(`Provider desconocido para video: ${provider}`);
}

async function runAvatarVideo() {
  const avatarId = required('avatar');
  const voiceId = required('voice');
  const script = required('script');
  const est = checkCost('heygen:avatar-video:1min', 1);
  const result = await heygen.generateAvatarVideo({ avatarId, voiceId, script });
  const outputPath = await saveRemoteAsset(result.videoUrl, 'video', 'mp4');
  await log({ prompt: script, provider: 'heygen', model: 'avatar-video', outputPath, cost: est });
  return outputPath;
}

async function runTts() {
  const text = required('text');
  const voiceId = flags.voice ?? elevenlabs.DEFAULT_VOICES['rachel-en'];
  const model = flags.model ?? 'multilingual-v2';
  const chars = text.length;
  const costK = model.startsWith('turbo') || model.startsWith('flash')
    ? 'elevenlabs:tts-turbo:1k-chars' : 'elevenlabs:tts:1k-chars';
  const cost = checkCost(costK, Math.ceil(chars / 1000));

  const { audioBuffer, format } = await elevenlabs.textToSpeech({
    text, voiceId, model,
  });
  const ext = format.startsWith('mp3') ? 'mp3' : 'wav';
  const outputPath = await saveBufferAsset(audioBuffer, 'audio', ext);
  await log({ prompt: text.slice(0, 100), provider: 'elevenlabs', model, outputPath, cost });
  return outputPath;
}

async function runSfx() {
  const text = required('text');
  const cost = checkCost('elevenlabs:sfx:generation', 1);
  const { audioBuffer } = await elevenlabs.generateSoundEffect({
    text,
    durationSeconds: flags.duration ? Number(flags.duration) : undefined,
  });
  const outputPath = await saveBufferAsset(audioBuffer, 'sfx', 'mp3');
  await log({ prompt: text, provider: 'elevenlabs', model: 'sfx', outputPath, cost });
  return outputPath;
}

async function runBgRemove() {
  const image = required('image');
  const cost = checkCost('fal:bria-bg-remove', 1);
  const result = await fal.removeBackground({ imageUrl: image });
  const outputPath = await saveRemoteAsset(result.imageUrl, 'image', 'png');
  await log({ prompt: `bg-remove ${image}`, provider: 'fal', model: 'bria-bg-remove', outputPath, cost, references: [image] });
  return outputPath;
}

async function runUpscale() {
  const image = required('image');
  const engine = flags.model ?? 'clarity';
  const costK = engine === 'real-esrgan' ? 'fal:real-esrgan' : 'fal:clarity-upscaler';
  const cost = checkCost(costK, 1);
  const result = await fal.upscaleImage({ imageUrl: image, engine });
  const outputPath = await saveRemoteAsset(result.imageUrl, 'image', 'png');
  await log({ prompt: `upscale ${image}`, provider: 'fal', model: engine, outputPath, cost, references: [image] });
  return outputPath;
}

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

async function loadReferences(items) {
  return Promise.all(items.map((item) =>
    /^https?:\/\//i.test(item) ? fetchReference(item) : loadLocalReference(item)
  ));
}

function defaultImageModel(provider) {
  return {
    fal:    'flux-pro-ultra',
    openai: 'gpt-image-2',
    gemini: 'nano-banana',
    kie:    'flux-2',
    heygen: 'hyperframes',
  }[provider] ?? 'flux-pro-ultra';
}

function defaultVideoModel(provider) {
  return {
    fal:    'kling-1.6-pro',
    gemini: 'veo-3.0-fast-generate-001',
    kie:    'veo-3-fast',
  }[provider] ?? 'kling-1.6-pro';
}

function costKey(provider, model, extra) {
  // Ej: openai + gpt-image-2 + medium  →  "openai:gpt-image-2:medium"
  // Ej: fal + flux-pro-ultra           →  "fal:flux-pro-ultra"
  // Ej: fal + kling-1.6-pro + "5s"     →  "fal:kling-1.6-pro:5s"
  const base = `${provider}:${model}`;
  return extra ? `${base}:${extra}` : base;
}

const MIME_TO_EXT = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/webp':    'webp',
  'image/gif':     'gif',
  'image/svg+xml': 'svg',
  'video/mp4':     'mp4',
  'video/webm':    'webm',
  'video/quicktime': 'mov',
  'audio/mpeg':    'mp3',
  'audio/wav':     'wav',
  'audio/mp4':     'm4a',
};

async function saveRemoteAsset(url, kind, fallbackExt) {
  const { buffer, mime } = await downloadWithMime(url);
  const ext = MIME_TO_EXT[mime] ?? fallbackExt;
  return saveBufferAsset(buffer, kind, ext);
}

async function saveB64Asset(b64, kind, ext) {
  const buf = Buffer.from(b64, 'base64');
  return saveBufferAsset(buf, kind, ext);
}

async function saveBufferAsset(buffer, kind, ext) {
  const outputPath = flags.out
    ? resolve(flags.out)
    : resolve(resolveOutputDir(), `${kind}-${timestamp()}.${ext}`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buffer);
  return outputPath;
}

async function downloadWithMime(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download falló (${res.status}): ${url}`);
  const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mime };
}

function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

async function log({ prompt, provider, model, outputPath, cost, references = [] }) {
  const { id, manifestPath } = await recordGeneration({
    prompt, provider, model, outputPath,
    costUsd: cost.totalCost,
    references: references.filter(Boolean),
    params: {
      aspect: flags.aspect,
      duration: flags.duration,
      quality: flags.quality,
      n: flags.n,
    },
  });
  console.log(JSON.stringify({
    ok: true,
    id,
    provider,
    model,
    outputPath,
    costUsd: cost.totalCost,
    manifestPath,
  }, null, 2));
}

function printHelp() {
  console.error(`
Da Vinci — visual generation router
Uso: node generate.mjs <intent> [flags]

Intents:
  image          --provider {fal|openai|gemini|kie|heygen} --model X --prompt "..." [--aspect] [--n]
  svg            --prompt "..." (siempre FAL Recraft V3 SVG)
  video          --provider {fal|gemini|kie} --model X --prompt "..." [--aspect] [--duration]
  avatar-video   --avatar ID --voice ID --script "..." (HeyGen)
  tts            --text "..." --voice ID [--model multilingual-v2] (ElevenLabs)
  sfx            --text "..." [--duration N] (ElevenLabs)
  bg-remove      --image URL (FAL BRIA)
  upscale        --image URL [--model clarity|real-esrgan]
  list-voices    [--provider elevenlabs|heygen]
  list-avatars   (HeyGen)

Global flags:
  --refs URL1,URL2   Referencias visuales (imagen/video)
  --out PATH         Override output path
  --dry-run          Solo estima costo, no ejecuta
  --force            Confirma costo alto sin prompt
  --verbose          Info extra en stderr
  --help
`);
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  if (flags.verbose) console.error(err.stack);
  process.exit(1);
});
