import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, getModel, defaultModel, equivalents, COST_TABLE } from '../src/core/catalog.mjs';
import { DavinciError, classifyProviderError } from '../src/core/errors.mjs';

test('costKey de cada modelo existe en COST_TABLE (o costUnknown)', () => {
  for (const m of MODELS) {
    const k = m.costKey({});
    assert.equal(k in COST_TABLE, !m.costUnknown, `${m.id} → ${k}`);
  }
  assert.equal(new Set(MODELS.map((m) => m.id)).size, MODELS.length);
});

test('costKey reproduce la lógica de generate.mjs', () => {
  assert.equal(getModel('openai/gpt-image-2').costKey({ quality: 'high' }), 'openai:gpt-image-2:high');
  assert.equal(getModel('openai/gpt-image-2').costKey({}), 'openai:gpt-image-2:medium');
  assert.equal(getModel('fal/flux-pro-ultra').costKey({ quality: 'high' }), 'fal:flux-pro-ultra');
  assert.equal(getModel('fal/kling-1.6-pro').costKey({ duration: 5 }), 'fal:kling-1.6-pro:5s');
  assert.equal(getModel('gemini/veo-3.0-generate-001').costKey({ duration: 8 }), 'gemini:veo-3:8s');
  const t = getModel('tripo/default').costKey;
  assert.equal(t({}), 'tripo:text-to-model:textured');
  assert.equal(t({ texture: false }), 'tripo:text-to-model');
  assert.equal(t({ inputs: [{}] }), 'tripo:image-to-model:textured');
  assert.equal(getModel('elevenlabs/turbo-v2.5').costKey(), 'elevenlabs:tts-turbo:1k-chars');
});

test('defaultModel por cada kind', () => {
  const kinds = ['image', 'svg', 'video', 'audio', 'sfx', 'model-3d', 'bg-remove', 'upscale', 'avatar-video'];
  for (const k of kinds) assert.equal(defaultModel(k)?.kind, k);
  assert.equal(defaultModel('image').id, 'fal/flux-pro-ultra');
  assert.equal(defaultModel('video').id, 'fal/kling-1.6-pro');
  assert.equal(defaultModel('svg').id, 'fal/recraft-v3-svg');
});

test('equivalents de veo-3-fast', () => {
  assert.deepEqual(equivalents('gemini/veo-3.0-fast-generate-001').map((m) => m.id), ['kie/veo-3-fast']);
  assert.deepEqual(equivalents('kie/veo-3-fast').map((m) => m.id), ['gemini/veo-3.0-fast-generate-001']);
  assert.deepEqual(equivalents('fal/kling-2.1-master').map((m) => m.id), ['kie/kling-2.1']);
  assert.deepEqual(equivalents('fal/flux-schnell'), []);
});

test('classifyProviderError con mensajes reales de providers', () => {
  const cases = [
    ['OPENAI_API_KEY no configurada.', 'provider_unavailable', 503],
    ['FAL submit falló (401): unauthorized', 'provider_error', 502],
    ['KIE createTask falló (429): rate limit', 'provider_error', 502],
    ['Gemini Imagen falló (503): request failed', 'provider_error', 502],
    ['OpenAI generate falló (400): content policy', 'provider_rejected', 422],
    ['HeyGen POST /v2/video falló (422): bad avatar', 'provider_rejected', 422],
    ['FAL polling timeout (>300s)', 'provider_rejected', 422],
    ['KIE task abc FAILED: code 500', 'provider_rejected', 422],
  ];
  for (const [msg, code, status] of cases) {
    const e = classifyProviderError(new Error(msg));
    assert.ok(e instanceof DavinciError);
    assert.deepEqual([e.code, e.status], [code, status], msg);
  }
  const own = new DavinciError('not_found', 'x');
  assert.equal(classifyProviderError(own), own);
});
