# Contributing to Da Vinci

Thanks for helping make Da Vinci better. This guide covers the two most common contributions: **adding a new model** and **adding a new provider**.

## Ways to contribute

- 🔌 Add a new model to an existing provider (easiest — 5 min)
- 🚀 Add a new provider (medium — 30 min)
- 📖 Improve docs, translate a README, fix typos
- 🐛 Report bugs via [issues](https://github.com/hectorcanaimero/da-vinci/issues)
- ⭐ Star the repo if it saved you time

## Adding a new model to an existing provider

Example: FAL adds `flux-3`. Three edits:

**1.** Add to the provider's model registry (`src/providers/fal.mjs`):
```js
export const FAL_MODELS = {
  // ... existing
  'flux-3': 'fal-ai/flux-3',
};
```

**2.** Add cost estimate in `src/utils/cost-estimator.mjs`:
```js
export const COST_TABLE = {
  // ... existing
  'fal:flux-3': 0.08,
};
```

**3.** Add row to the decision matrix in `docs/references/model-matrix.md` under the appropriate use case section.

## Adding a new provider

Example: adding `Together AI` as a 7th provider.

**1.** Create `src/providers/together.mjs`:
```js
export const TOGETHER_MODELS = { /* your models */ };

function authHeader() {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) throw new Error('TOGETHER_API_KEY not configured.');
  return { Authorization: `Bearer ${key}` };
}

export async function generateImage({ prompt, model, aspect }) {
  // ... your implementation
  return { images: [{ url: '...', b64: '...' }], raw: {...} };
}
```

**2.** Add cases in `src/generate.mjs` under `runImage()` and `runVideo()` for the new provider.

**3.** Add key to `.env.example` + `EXPECTED_KEYS` in `src/utils/secrets.mjs`.

**4.** Add cost estimates in `src/utils/cost-estimator.mjs`.

**5.** Update `docs/references/model-matrix.md` and the model tables in README files.

**6.** Bump `metadata.version` in `docs/SKILL.md`.

## Code style

- **ESM only** — `import`/`export`, `.mjs` files
- **Node 18+ features** — `fetch`, `AbortController`, top-level await are OK
- **Zero runtime dependencies** — if you need something, wrap the native API
- **No TypeScript** — keeping it a zero-build project. JSDoc for types.
- **2-space indent**, single quotes, semicolons

## Testing changes

Run the smoke test after any change:
```bash
node src/generate.mjs image --provider fal --model flux-schnell \
  --prompt "test" --dry-run --verbose
```

Should output cost estimate and `dryRun: true` — no API calls made.

## Commit conventions

Loose Conventional Commits:
- `feat(provider): add together.ai` — new feature
- `fix(fal): correct aspect ratio for flux-schnell` — bug fix
- `docs(readme): update model matrix` — docs only
- `chore(deps): bump node version` — housekeeping

## PR checklist

- [ ] Code follows style above
- [ ] Smoke test passes
- [ ] `docs/references/model-matrix.md` updated if applicable
- [ ] `.env.example` updated if you added a new provider
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]`

## Questions?

Open a [discussion](https://github.com/hectorcanaimero/da-vinci/discussions) or ping [@hectorcanaimero](https://github.com/hectorcanaimero).
