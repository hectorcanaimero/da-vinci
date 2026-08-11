/**
 * Gemini provider — Nano-Banana (imagen vía multi-modal) + Imagen (predict) + Veo (video).
 * Docs Imagen:       https://ai.google.dev/gemini-api/docs/imagen
 * Docs Nano-Banana:  https://ai.google.dev/gemini-api/docs/image-generation (Gemini 2.5+ image family)
 * Docs Veo:          https://ai.google.dev/gemini-api/docs/video
 *
 * Auth: `x-goog-api-key: <GEMINI_API_KEY>` (o ?key= en query)
 *
 * Nota: Nano-Banana usa la API multi-modal de generateContent con responseModalities: [IMAGE].
 * Es el modelo recomendado para EDICIÓN de imágenes con consistencia de personajes.
 * Imagen 4 sigue siendo bueno para GENERACIÓN cold-start pura desde texto.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const VEO_POLL_INTERVAL_MS = 5000;
const VEO_POLL_MAX_MS = 600_000; // 10 min

function apiKey() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY no configurada.');
  return k;
}

/**
 * Model registry for image generation.
 * NANO_BANANA family usa generateContent multi-modal (mejor para edit + character consistency).
 * IMAGEN family usa predict endpoint (mejor para text-to-image cold-start).
 */
export const GEMINI_IMAGE_MODELS = {
  'nano-banana':      'gemini-2.5-flash-image',
  'nano-banana-pro':  'gemini-3-pro-image-preview',
  'imagen-4-fast':    'imagen-4.0-fast-generate-001',
  'imagen-4':         'imagen-4.0-generate-001',
  'imagen-4-ultra':   'imagen-4.0-ultra-generate-001',
};

/**
 * Genera imagen. Routea automáticamente entre Nano-Banana (multi-modal) o Imagen (predict).
 * @param {object} args
 * @param {string} args.prompt
 * @param {'nano-banana'|'nano-banana-pro'|'imagen-4-fast'|'imagen-4'|'imagen-4-ultra'} [args.model='nano-banana']
 * @param {number} [args.numImages=1]                       - 1..4 (solo aplica a Imagen)
 * @param {'1:1'|'3:4'|'4:3'|'9:16'|'16:9'} [args.aspect='1:1']
 * @param {'PNG'|'JPEG'} [args.format='PNG']
 * @param {Array<{ b64: string, mime: string }>} [args.imageInputs] - refs para nano-banana (edit)
 */
export async function generateImage({ prompt, model = 'nano-banana', numImages = 1, aspect = '1:1', format = 'PNG', imageInputs }) {
  const modelId = GEMINI_IMAGE_MODELS[model] ?? model;
  const isNanoBanana = model.startsWith('nano-banana');

  if (isNanoBanana) {
    return generateImageMultimodal({ modelId, prompt, aspect, imageInputs });
  }
  return generateImagePredict({ modelId, prompt, numImages, aspect, format });
}

async function generateImagePredict({ modelId, prompt, numImages, aspect, format }) {
  const url = `${API_BASE}/models/${modelId}:predict?key=${apiKey()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: numImages,
        aspectRatio: aspect,
        outputMimeType: format === 'JPEG' ? 'image/jpeg' : 'image/png',
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini Imagen falló (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return {
    images: (data.predictions ?? []).map((p) => ({
      b64: p.bytesBase64Encoded,
      mime: p.mimeType,
    })),
    raw: data,
  };
}

async function generateImageMultimodal({ modelId, prompt, aspect, imageInputs }) {
  const url = `${API_BASE}/models/${modelId}:generateContent?key=${apiKey()}`;
  const parts = [{ text: prompt }];
  for (const ref of imageInputs ?? []) {
    parts.push({ inlineData: { mimeType: ref.mime, data: ref.b64 } });
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        ...(aspect && { imageConfig: { aspectRatio: aspect } }),
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini Nano-Banana falló (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const images = [];
  for (const cand of data.candidates ?? []) {
    for (const part of cand.content?.parts ?? []) {
      if (part.inlineData) {
        images.push({ b64: part.inlineData.data, mime: part.inlineData.mimeType });
      }
    }
  }
  return { images, raw: data };
}

/**
 * Genera video con Veo 3. API async con long-running-operation.
 * @param {object} args
 * @param {string} args.prompt
 * @param {'veo-3.0-fast-generate-001'|'veo-3.0-generate-001'} [args.model='veo-3.0-fast-generate-001']
 * @param {number} [args.durationSeconds=5]
 * @param {'16:9'|'9:16'} [args.aspect='16:9']
 * @param {string} [args.negativePrompt]
 * @param {{ b64: string, mime: string }} [args.imageInput] - image-to-video
 */
export async function generateVideo({ prompt, model = 'veo-3.0-fast-generate-001', durationSeconds = 5, aspect = '16:9', negativePrompt, imageInput }) {
  const url = `${API_BASE}/models/${model}:predictLongRunning?key=${apiKey()}`;
  const instance = { prompt };
  if (imageInput) {
    instance.image = { bytesBase64Encoded: imageInput.b64, mimeType: imageInput.mime };
  }
  const parameters = {
    aspectRatio: aspect,
    durationSeconds,
    ...(negativePrompt && { negativePrompt }),
  };

  const submit = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instances: [instance], parameters }),
  });
  if (!submit.ok) throw new Error(`Gemini Veo submit falló (${submit.status}): ${await submit.text()}`);
  const op = await submit.json(); // { name: "operations/..." }

  // Poll
  const start = Date.now();
  while (Date.now() - start < VEO_POLL_MAX_MS) {
    await new Promise((r) => setTimeout(r, VEO_POLL_INTERVAL_MS));
    const statusRes = await fetch(
      `${API_BASE}/${op.name}?key=${apiKey()}`,
      { method: 'GET' }
    );
    if (!statusRes.ok) throw new Error(`Gemini Veo poll falló (${statusRes.status})`);
    const status = await statusRes.json();
    if (status.done) {
      if (status.error) {
        throw new Error(`Gemini Veo error: ${JSON.stringify(status.error)}`);
      }
      const videos = status.response?.generatedVideos ?? [];
      return {
        videos: videos.map((v) => ({
          uri: v.video?.uri,
          b64: v.video?.bytesBase64Encoded,
        })),
        raw: status,
      };
    }
  }
  throw new Error(`Gemini Veo polling timeout (>${VEO_POLL_MAX_MS / 1000}s)`);
}

/**
 * Descarga un video de Veo desde la URI (requiere API key en el header).
 */
export async function downloadVeoVideo(uri) {
  const res = await fetch(uri, { headers: { 'x-goog-api-key': apiKey() } });
  if (!res.ok) throw new Error(`Gemini Veo download falló (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
