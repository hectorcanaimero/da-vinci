export type Kind = 'image' | 'svg' | 'video' | 'audio' | 'sfx' | 'model-3d' | 'bg-remove' | 'upscale' | 'avatar-video';

export type GenerationRequest = {
  kind: Kind;
  model?: string;
  prompt?: string;
  text?: string;
  script?: string;
  avatar?: string;
  voice?: string;
  params?: {
    aspect?: string; duration?: number; quality?: string; n?: number; texture?: boolean;
    pbr?: boolean; faceLimit?: number; style?: string; engine?: string;
  };
  inputs?: Array<{ id: string } | { url: string } | { path: string }>;
  confirm?: boolean;
  fallback?: boolean;
};

export type Estimate = {
  model: string; costKey: string; costUsd: number; level: 'auto' | 'warn' | 'confirm';
  known: boolean; candidates: string[]; budgetLeftUsd: number | null;
};

export type Generation = {
  id: string; createdAt: string; kind: Kind; prompt: string | null; provider: string; model: string;
  requestedModel: string | null; params: Record<string, unknown>; costUsd: number;
  filePath: string; mime: string; bytes: number; source: 'cli' | 'api' | 'dashboard';
  projectDir: string | null; favorite: boolean;
  inputs: Array<{ id: string | null; ref: string | null }>;
  url: string;
};

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export type Job = {
  id: string; createdAt: string; updatedAt: string; status: JobStatus; source: string;
  request: GenerationRequest; generationIds: string[];
  error: { code: string; message: string } | null;
};

export type ModelInfo = {
  id: string; kind: Kind; provider: string; model: string;
  acceptsInputs: 0 | 1 | 'many'; unitCostUsd: number | null; available: boolean;
};

export type ProviderStatus = {
  id: string; status: 'connected' | 'missing' | 'error'; source: string; keyHint: string | null; error?: string;
};

export type SpendRow = { key: string; costUsd: number; count: number };

export type LibraryQuery = Partial<Record<
  'q' | 'kind' | 'provider' | 'model' | 'project' | 'from' | 'to' | 'favorite' | 'cursor' | 'limit',
  string | number | boolean
>>;
