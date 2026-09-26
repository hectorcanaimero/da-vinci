import { DavinciError } from '../../core/errors.mjs';
import { getProvidersStatus, saveKey, testProvider, PROVIDER_IDS } from '../../core/providers-status.mjs';

function assertKnownProvider(id) {
  if (!PROVIDER_IDS.includes(id)) throw new DavinciError('not_found', `Proveedor desconocido: ${id}`);
}

export const routes = [
  {
    method: 'GET',
    path: '/api/providers',
    async handler(req, res, { send }) {
      const status = await getProvidersStatus();
      send(200, { items: status });
    },
  },
  {
    method: 'PUT',
    path: '/api/providers/:id/key',
    async handler(req, res, { params, body, send }) {
      assertKnownProvider(params.id);
      const key = body?.key;
      if (!key || typeof key !== 'string' || !key.trim()) {
        throw new DavinciError('invalid_request', 'key no puede estar vacío');
      }
      const status = await saveKey(params.id, key);
      send(200, status);
    },
  },
  {
    method: 'POST',
    path: '/api/providers/:id/test',
    async handler(req, res, { params, send }) {
      assertKnownProvider(params.id);
      const status = await testProvider(params.id);
      send(200, status);
    },
  },
];
