import type {
  Estimate, Generation, GenerationRequest, Job, LibraryQuery, ModelInfo, ProviderStatus, SpendRow,
} from './types';

const KEY = 'davinci.apiKey';

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// Kept in memory too, so the retry works when localStorage is unavailable.
let memToken: string | null = null;
export function getToken(): string | null {
  try { return localStorage.getItem(KEY) ?? memToken; } catch { return memToken; }
}
export function setToken(token: string) {
  memToken = token;
  try { localStorage.setItem(KEY, token); } catch { /* private mode / blocked storage */ }
}

// 401 → the gate asks for the key, stores it and resolves so the call is retried once.
let onUnauthorized: (() => Promise<void>) | null = null;
export function setUnauthorizedHandler(fn: (() => Promise<void>) | null) { onUnauthorized = fn; }

const qs = (q?: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q ?? {})) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

async function request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const headers: Record<string, string> = { 'X-Davinci-Source': 'dashboard' };
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401 && onUnauthorized && !retried) {
    await onUnauthorized();
    return request<T>(method, path, body, true);
  }
  if (!res.ok) {
    const e = (await res.json().catch(() => null))?.error;
    throw new ApiError(e?.code ?? 'error', res.status, e?.message ?? res.statusText, e?.details);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const withKey = (path: string) => {
  const t = getToken();
  return t ? `${path}?key=${encodeURIComponent(t)}` : path;
};
export const fileUrl = (id: string) => withKey(`/files/${encodeURIComponent(id)}`);
export const eventsUrl = () => withKey('/api/events');

const enc = encodeURIComponent;
export const health = () => request<{ ok: boolean; version: string }>('GET', '/api/health');
export const listModels = (kind?: string) => request<{ items: ModelInfo[] }>('GET', `/api/models${qs({ kind })}`);
export const estimate = (r: GenerationRequest) => request<Estimate>('POST', '/api/estimate', r);
export const createGeneration = (r: GenerationRequest) => request<{ job: Job }>('POST', '/api/generations', r);
export const listJobs = (status?: string, limit?: number) =>
  request<{ items: Job[] }>('GET', `/api/jobs${qs({ status, limit })}`);
export const getJob = (id: string) => request<Job>('GET', `/api/jobs/${enc(id)}`);
export const listLibrary = (q?: LibraryQuery) =>
  request<{ items: Generation[]; nextCursor: string | null }>('GET', `/api/library${qs(q)}`);
export const getGeneration = (id: string) =>
  request<Generation & { parents: Generation[]; children: Generation[] }>('GET', `/api/library/${enc(id)}`);
export const setFavorite = (id: string, favorite: boolean) =>
  request<Generation>('PATCH', `/api/library/${enc(id)}`, { favorite });
export const deleteGeneration = (id: string, deleteFile = false) =>
  request<void>('DELETE', `/api/library/${enc(id)}${qs({ file: deleteFile || undefined })}`);
export const listProjects = () => request<{ items: Array<{ dir: string; count: number }> }>('GET', '/api/projects');
export const listProviders = () => request<{ items: ProviderStatus[] }>('GET', '/api/providers');
export const setProviderKey = (id: string, key: string) =>
  request<ProviderStatus>('PUT', `/api/providers/${enc(id)}/key`, { key });
export const testProvider = (id: string) => request<ProviderStatus>('POST', `/api/providers/${enc(id)}/test`);
export const getSpend = (q: { from?: string; to?: string; groupBy?: 'day' | 'provider' | 'model' }) =>
  request<{ items: SpendRow[]; totalUsd: number }>('GET', `/api/spend${qs(q)}`);
export const importManifest = (path: string) =>
  request<{ imported: number; skipped: number }>('POST', '/api/import', { path });
export const getMigration = () =>
  request<{ detected: boolean; count?: number }>('GET', '/api/migration');
export const runMigration = () =>
  request<{ total: number; migrated: number }>('POST', '/api/migration/run');
