import { COST_TABLE } from '../utils/cost-estimator.mjs';

const dur = (p) => `${Number(p?.duration ?? 5)}s`;
const off = (v) => v === false || v === 'false';

// `costModel` = nombre del modelo en COST_TABLE cuando difiere del alias del proveedor.
const image = (provider, model, o = {}) => ({
  provider, model, kind: 'image', acceptsInputs: o.inputs ?? 0,
  costKey: provider === 'openai'
    ? (p) => `openai:${model}:${p?.quality ?? 'medium'}` // quality solo para openai
    : () => `${provider}:${model}${o.costSuffix ?? ''}`,
  ...o.extra,
});
const video = (provider, model, o = {}) => ({
  provider, model, kind: 'video', acceptsInputs: 1,
  costKey: (p) => `${provider}:${o.costModel ?? model}:${o.duration ? `${o.duration}s` : dur(p)}`,
  ...o.extra,
});
const fixed = (provider, model, kind, key, acceptsInputs = 0) => ({
  provider, model, kind, acceptsInputs, costKey: () => key,
});
// Sin precio en COST_TABLE: estimate() lo reportará known:false.
const unknown = { costUnknown: true };

const ENTRIES = [
  // ── image ──
  image('fal', 'flux-schnell'), image('fal', 'flux-dev'), image('fal', 'flux-pro'),
  image('fal', 'flux-pro-ultra', { inputs: 'many' }),
  image('fal', 'flux-2', { extra: { ...unknown, equivalent: 'flux-2' } }),
  image('fal', 'recraft-v3'), image('fal', 'ideogram-v2'), image('fal', 'ideogram-v2-turbo'),
  image('fal', 'nano-banana', { extra: { ...unknown, equivalent: 'nano-banana' } }),
  image('openai', 'gpt-image-2', { inputs: 'many' }), image('openai', 'gpt-image-1', { inputs: 'many' }),
  image('gemini', 'nano-banana', { inputs: 'many', extra: { equivalent: 'nano-banana' } }),
  image('gemini', 'nano-banana-pro', { inputs: 'many' }),
  image('gemini', 'imagen-4-fast'),
  image('gemini', 'imagen-4', { extra: { equivalent: 'imagen-4' } }),
  image('gemini', 'imagen-4-ultra'),
  image('kie', 'flux-2', { extra: { ...unknown, equivalent: 'flux-2' } }),
  image('kie', 'imagen-4', { extra: { ...unknown, equivalent: 'imagen-4' } }),
  image('heygen', 'hyperframes', { costSuffix: ':image' }),
  // ── svg ──
  fixed('fal', 'recraft-v3-svg', 'svg', 'fal:recraft-v3-svg'),
  // ── video ──
  video('fal', 'kling-1.6-std', { costModel: 'kling-1.6-standard' }),
  video('fal', 'kling-1.6-pro'),
  video('fal', 'kling-2.1-master', { extra: { equivalent: 'kling-2.1' } }),
  video('fal', 'luma-dream', { costModel: 'luma-dream-machine' }),
  video('fal', 'minimax-hailuo', { duration: 6 }),
  video('gemini', 'veo-3.0-fast-generate-001', { costModel: 'veo-3-fast', extra: { equivalent: 'veo-3-fast' } }),
  video('gemini', 'veo-3.0-generate-001', { costModel: 'veo-3', extra: { equivalent: 'veo-3' } }),
  video('kie', 'veo-3-fast', { extra: { ...unknown, equivalent: 'veo-3-fast' } }),
  video('kie', 'veo-3', { extra: { equivalent: 'veo-3' } }),
  video('kie', 'kling-2.1', { extra: { equivalent: 'kling-2.1' } }),
  // ── model-3d ── (imagen de entrada = params.inputs no vacío o params.fromImage)
  {
    provider: 'tripo', model: 'default', kind: 'model-3d', acceptsInputs: 1,
    costKey: (p) => `tripo:${p?.inputs?.length || p?.fromImage ? 'image' : 'text'}-to-model${off(p?.texture) ? '' : ':textured'}`,
  },
  // ── avatar-video / audio / sfx ──
  fixed('heygen', 'avatar-video', 'avatar-video', 'heygen:avatar-video:1min'),
  fixed('elevenlabs', 'multilingual-v2', 'audio', 'elevenlabs:tts:1k-chars'),
  fixed('elevenlabs', 'turbo-v2.5', 'audio', 'elevenlabs:tts-turbo:1k-chars'),
  fixed('elevenlabs', 'sfx', 'sfx', 'elevenlabs:sfx:generation'),
  // ── post-proceso ──
  fixed('fal', 'bria-bg-remove', 'bg-remove', 'fal:bria-bg-remove', 1),
  fixed('fal', 'clarity', 'upscale', 'fal:clarity-upscaler', 1),
  fixed('fal', 'real-esrgan', 'upscale', 'fal:real-esrgan', 1),
];

export const MODELS = ENTRIES.map((e) => ({ id: `${e.provider}/${e.model}`, ...e }));

const DEFAULTS = {
  image: 'fal/flux-pro-ultra',
  svg: 'fal/recraft-v3-svg',
  video: 'fal/kling-1.6-pro',
  audio: 'elevenlabs/multilingual-v2',
  sfx: 'elevenlabs/sfx',
  'model-3d': 'tripo/default',
  'bg-remove': 'fal/bria-bg-remove',
  upscale: 'fal/clarity',
  'avatar-video': 'heygen/avatar-video',
};

export const getModel = (id) => MODELS.find((m) => m.id === id);
export const defaultModel = (kind) => getModel(DEFAULTS[kind]);
export function equivalents(id) {
  const g = getModel(id)?.equivalent;
  return g ? MODELS.filter((m) => m.equivalent === g && m.id !== id) : [];
}
export { COST_TABLE };
