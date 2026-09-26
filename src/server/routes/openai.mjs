import { readFileSync } from 'node:fs';
import { DavinciError } from '../../core/errors.mjs';
import { MODELS, getModel } from '../../core/catalog.mjs';
import { sendJson } from '../http.mjs';

const KINDS = ['image', 'svg'];
const ASPECT = { '1024x1024': '1:1', '1536x1024': '16:9', '1024x1536': '9:16' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fail = (res, e) => {
  const err = e instanceof DavinciError ? e : new DavinciError('internal_error', e?.message ?? String(e));
  sendJson(res, err.status, { error: { message: err.message, type: err.status < 500 ? 'invalid_request_error' : 'server_error', code: err.code } });
};

// ponytail: sondea el job cada 100 ms; suscribirse a events 'job' si importa la latencia.
async function waitJob(jobs, id) {
  for (;;) {
    const job = jobs.get(id);
    if (job.status === 'done' || job.status === 'failed') return job;
    await sleep(100);
  }
}

export const routes = [
  { method: 'GET', path: '/v1/models', handler: (req, res, { send }) => send(200, {
    object: 'list',
    data: MODELS.filter((m) => KINDS.includes(m.kind)).map((m) => ({ id: m.id, object: 'model', created: 0, owned_by: m.provider })),
  }) },

  { method: 'POST', path: '/v1/images/generations', async handler(req, res, { body, router, library, jobs }) {
    try {
      const { model, prompt, n, size, response_format: format } = body ?? {};
      const entry = getModel(model);
      if (!entry || !KINDS.includes(entry.kind)) throw new DavinciError('invalid_request', `Modelo desconocido: ${model}`);
      if (size != null && !ASPECT[size]) throw new DavinciError('invalid_request', `size no soportado: ${size}`);
      if (format != null && !['url', 'b64_json'].includes(format)) throw new DavinciError('invalid_request', `response_format inválido: ${format}`);

      const request = { kind: entry.kind, model: entry.id, prompt, confirm: req.headers['x-davinci-confirm'] === 'true',
        params: { ...(size && { aspect: ASPECT[size] }), ...(n != null && { n: Number(n) }) } };
      const est = router.estimate(request, { library }); // 400 si es inválido
      if (est.budgetLeftUsd != null && est.costUsd > est.budgetLeftUsd) throw new DavinciError('budget_exceeded', 'Tope diario superado', est);
      if (est.level === 'confirm' && !request.confirm) {
        throw new DavinciError('cost_confirm_required', `Costo alto ($${est.costUsd.toFixed(3)}): requiere confirmación`, est);
      }

      const job = await waitJob(jobs, jobs.enqueue(request, 'api').id);
      if (job.status === 'failed') throw new DavinciError(job.error.code, job.error.message);

      const data = job.generationIds.map((id) => (format === 'b64_json'
        ? { b64_json: readFileSync(library.get(id).filePath).toString('base64') }
        : { url: `http://${req.headers.host}/files/${id}` }));
      sendJson(res, 200, { created: Math.floor(Date.now() / 1000), data });
    } catch (e) {
      fail(res, e);
    }
  } },
];
