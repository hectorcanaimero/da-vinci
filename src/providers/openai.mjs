/**
 * OpenAI provider — gpt-image-1 / gpt-image-2 (Image API).
 * Docs: https://platform.openai.com/docs/api-reference/images
 * Endpoints: /v1/images/generations, /v1/images/edits
 *
 * gpt-image-2 (newer): mejor fidelidad + speed. Default cuando no se especifica.
 * gpt-image-1 (legacy): mantener por retrocompat y cost-sensitive fallbacks.
 */

const API_BASE = 'https://api.openai.com/v1';

export const OPENAI_IMAGE_MODELS = {
  'gpt-image-2': 'gpt-image-2',
  'gpt-image-1': 'gpt-image-1',
};

function authHeader() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY no configurada.');
  return { Authorization: `Bearer ${key}` };
}

/**
 * Genera una imagen con gpt-image-1 o gpt-image-2.
 * @param {object} args
 * @param {string} args.prompt
 * @param {'gpt-image-2'|'gpt-image-1'} [args.model='gpt-image-2']
 * @param {'low'|'medium'|'high'} [args.quality='medium']
 * @param {'1024x1024'|'1024x1536'|'1536x1024'|'auto'} [args.size='1024x1024']
 * @param {number} [args.n=1]
 * @param {'transparent'|'opaque'|'auto'} [args.background='auto']
 * @param {'png'|'jpeg'|'webp'} [args.format='png']
 */
export async function generateImage({ prompt, model = 'gpt-image-2', quality = 'medium', size = '1024x1024', n = 1, background = 'auto', format = 'png' }) {
  const res = await fetch(`${API_BASE}/images/generations`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      quality,
      size,
      n,
      background,
      output_format: format,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI generate falló (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return {
    images: data.data.map((img) => ({
      b64: img.b64_json,
      revisedPrompt: img.revised_prompt,
    })),
    usage: data.usage,
    raw: data,
  };
}

/**
 * Edita/inpaint una imagen existente. Requiere referencia obligatoria.
 * @param {object} args
 * @param {string} args.prompt
 * @param {Buffer|Buffer[]} args.imageBuffers  - PNG/WEBP/JPG buffers
 * @param {Buffer} [args.maskBuffer]           - opcional, alpha mask
 * @param {'gpt-image-2'|'gpt-image-1'} [args.model='gpt-image-2']
 * @param {'low'|'medium'|'high'} [args.quality='medium']
 * @param {string} [args.size='1024x1024']
 * @param {number} [args.n=1]
 */
export async function editImage({ prompt, imageBuffers, maskBuffer, model = 'gpt-image-2', quality = 'medium', size = '1024x1024', n = 1 }) {
  const buffers = Array.isArray(imageBuffers) ? imageBuffers : [imageBuffers];
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('quality', quality);
  form.append('size', size);
  form.append('n', String(n));
  for (const buf of buffers) {
    form.append('image[]', new Blob([buf], { type: 'image/png' }), 'image.png');
  }
  if (maskBuffer) {
    form.append('mask', new Blob([maskBuffer], { type: 'image/png' }), 'mask.png');
  }

  const res = await fetch(`${API_BASE}/images/edits`, {
    method: 'POST',
    headers: authHeader(),
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI edit falló (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return {
    images: data.data.map((img) => ({
      b64: img.b64_json,
      revisedPrompt: img.revised_prompt,
    })),
    usage: data.usage,
    raw: data,
  };
}
