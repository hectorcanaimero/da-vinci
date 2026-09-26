const STATUS = {
  invalid_request: 400,
  not_found: 404,
  cost_confirm_required: 402,
  budget_exceeded: 402,
  provider_unavailable: 503,
  provider_error: 502, // reintentable (D9)
  provider_rejected: 422, // no reintentable
};

export class DavinciError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'DavinciError';
    this.code = code;
    this.status = STATUS[code] ?? 500;
    if (details !== undefined) this.details = details;
  }
}

/**
 * Traduce los Error de src/providers/*.mjs por regex sobre el mensaje (D8).
 * Solo provider_unavailable y provider_error permiten fallback (D9).
 */
export function classifyProviderError(err) {
  if (err instanceof DavinciError) return err;
  const msg = err?.message ?? String(err);
  const make = (code) => new DavinciError(code, msg, { cause: msg });

  if (/no configurada/i.test(msg)) return make('provider_unavailable');

  const http = msg.match(/\((\d{3})\)/)?.[1];
  if (http) {
    const s = Number(http);
    if (s === 401 || s === 403 || s === 429 || s >= 500) return make('provider_error');
    if (s >= 400) return make('provider_rejected'); // 400, 422, 404...
  }

  // El proveedor ya aceptó el trabajo: reintentar cobraría dos veces.
  if (/timeout|FAILED|\bfailed\b/.test(msg) && !/^fetch failed/.test(msg)) return make('provider_rejected');

  return make('provider_error');
}
