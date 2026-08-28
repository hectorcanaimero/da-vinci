/**
 * Tripo3D provider — generación de modelos 3D (GLB) desde texto o imagen.
 * Docs: https://developers.tripo3d.ai/en
 * Auth: `Authorization: Bearer <TRIPO_API_KEY>`
 *
 * Usa la API V3 (`openapi.tripo3d.ai/v3`). La V2 (`api.tripo3d.ai/v2`) deja de
 * mantenerse el 1 oct 2026 y se apaga el 1 nov 2026 — no usar esa base.
 *
 * Flujo: (imagen) upload → file_token  →  POST /generation/{text|image}-to-model
 * → task_id  →  poll GET /tasks/{task_id} hasta status "success"  →  output.model (GLB).
 */

const API_BASE = 'https://openapi.tripo3d.ai/v3';
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 600_000; // 10 min

const IMAGE_MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const TERMINAL_FAILURE_STATES = new Set(['failed', 'cancelled', 'banned', 'expired']);

function authHeader() {
  const key = process.env.TRIPO_API_KEY;
  if (!key) throw new Error('TRIPO_API_KEY no configurada. Cargá el valor en Infisical o en el .env.');
  return { Authorization: `Bearer ${key}` };
}

async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Tripo POST ${path} falló (${res.status}): ${await res.text()}`);
  const data = await res.json();
  if (data.code !== undefined && data.code !== 0) {
    throw new Error(`Tripo POST ${path} error: ${JSON.stringify(data)}`);
  }
  return data;
}

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`Tripo GET ${path} falló (${res.status}): ${await res.text()}`);
  return res.json();
}

/**
 * Sube una imagen local (buffer) y devuelve el file_token para usar en image-to-model.
 * @param {Buffer} buffer
 * @param {string} mime
 */
async function uploadImage(buffer, mime) {
  const ext = IMAGE_MIME_TO_EXT[mime] ?? 'png';
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), `reference.${ext}`);

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: authHeader(), // sin Content-Type: FormData setea el boundary
    body: form,
  });
  if (!res.ok) throw new Error(`Tripo upload falló (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const token = data.data?.image_token ?? data.data?.file_token;
  if (!token) throw new Error(`Tripo upload sin token: ${JSON.stringify(data)}`);
  return { token, ext };
}

async function pollTask(taskId) {
  const start = Date.now();
  while (Date.now() - start < POLL_MAX_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const status = await getJson(`/tasks/${taskId}`);
    const state = status.data?.status;
    if (state === 'success') return status.data;
    if (TERMINAL_FAILURE_STATES.has(state)) {
      throw new Error(`Tripo task ${taskId} ${state}: ${status.data?.error_msg ?? JSON.stringify(status)}`);
    }
  }
  throw new Error(`Tripo polling timeout (>${POLL_MAX_MS / 1000}s) para task ${taskId}`);
}

function toResult(data) {
  const output = data.output ?? {};
  return {
    modelUrl: output.pbr_model ?? output.model ?? output.base_model,
    baseModelUrl: output.base_model ?? null,
    pbrModelUrl: output.pbr_model ?? null,
    renderedImageUrl: output.rendered_image ?? null,
    riggable: output.riggable ?? false,
    raw: data,
  };
}

/**
 * Genera un modelo 3D (GLB) a partir de un prompt de texto.
 * @param {object} args
 * @param {string} args.prompt
 * @param {string} [args.model]          - versión del modelo Tripo (ej: "v3.0-20250812"). Si se omite, usa el default de la cuenta.
 * @param {boolean} [args.texture=true]
 * @param {boolean} [args.pbr=true]
 * @param {number} [args.faceLimit]
 * @param {string} [args.style]
 * @param {string} [args.negativePrompt]
 */
export async function generateFromText({ prompt, model, texture = true, pbr = true, faceLimit, style, negativePrompt }) {
  const body = { prompt, texture, pbr };
  if (model) body.model = model;
  if (faceLimit) body.face_limit = faceLimit;
  if (style) body.style = style;
  if (negativePrompt) body.negative_prompt = negativePrompt;

  const submit = await postJson('/generation/text-to-model', body);
  const taskId = submit.data?.task_id;
  if (!taskId) throw new Error(`Tripo submit sin task_id: ${JSON.stringify(submit)}`);
  return toResult(await pollTask(taskId));
}

/**
 * Genera un modelo 3D (GLB) a partir de una imagen de referencia.
 * @param {object} args
 * @param {Buffer} args.buffer
 * @param {string} args.mime
 * @param {string} [args.model]
 * @param {boolean} [args.texture=true]
 * @param {boolean} [args.pbr=true]
 * @param {number} [args.faceLimit]
 */
export async function generateFromImage({ buffer, mime, model, texture = true, pbr = true, faceLimit }) {
  const { token, ext } = await uploadImage(buffer, mime);
  const body = { file: { type: ext, file_token: token }, texture, pbr };
  if (model) body.model = model;
  if (faceLimit) body.face_limit = faceLimit;

  const submit = await postJson('/generation/image-to-model', body);
  const taskId = submit.data?.task_id;
  if (!taskId) throw new Error(`Tripo submit sin task_id: ${JSON.stringify(submit)}`);
  return toResult(await pollTask(taskId));
}

/**
 * Consulta el balance de créditos de la cuenta (útil para verificar setup).
 */
export async function getBalance() {
  const data = await getJson('/user/balance');
  return data.data ?? data;
}
