---
type: arch
project_id: da-vinci
version: 0.1
depends_on:
  - docs/prd/001-studio.md
generated_by: orch-arch
generated_at: 2026-09-25
title: Da Vinci Studio — architecture
---

# Da Vinci Studio — architecture

## Context

Hoy todo vive en `src/generate.mjs` (492 líneas): parseo de flags, gate de
costo con `process.exit`, un handler por intent que llama al proveedor, guarda
el archivo y escribe `manifest.json` por proyecto (read-modify-write sin
bloqueo). Los 7 proveedores (`src/providers/*.mjs`) ya exponen funciones
limpias (`generateImage`, `generateVideo`, …) y lanzan `Error` con el status
HTTP en el mensaje. Costos en `src/utils/cost-estimator.mjs`, secretos en
`src/utils/secrets.mjs` (env → `.env` → Infisical). Cero dependencias de
runtime, ESM, Node.

El PRD agrega: una biblioteca global, un servidor local con API nativa y API
compatible con OpenAI, trabajos en segundo plano, fallback entre proveedores y
un dashboard. La jugada central es **sacar la lógica de generación del CLI a un
núcleo reutilizable**; CLI y servidor pasan a ser dos clientes del mismo núcleo
y de la misma biblioteca.

```
 CLI (src/generate.mjs) ──┐                 ┌── Dashboard (ui/ → dist/ui)
 skill de Claude ─────────┤                 │
                          ▼                 ▼
                     core/router ◄──── server (node:http)
                          │            /api/*  /v1/*  /files/:id  SSE
                          ▼                 │
                    core/generate           ▼
                     │        │        server/jobs (cola en proceso)
             providers/*   core/storage
                          │
                  library/db (node:sqlite, ~/.davinci/davinci.db)
                  utils/manifest (manifest.json por proyecto)
```

## Components

### core/generate — `src/core/generate.mjs`
Ejecuta **una** generación contra **un** proveedor/modelo ya decidido. Recibe
un `GenerationRequest` normalizado, resuelve los inputs (ids de biblioteca,
rutas o URLs → buffer/mime/dataUrl vía `utils/reference-loader`), llama al
proveedor, guarda los archivos con `core/storage` y devuelve
`GenerationOutput[]` (uno por archivo; `n>1` produce varios, hoy se pierden
todos menos el primero). No registra, no hace gate de costo, no hace
`process.exit`. Es la lógica actual de `runImage`, `runVideo`, … movida tal
cual.

### core/catalog — `src/core/catalog.mjs`
Tabla única de modelos: id `<proveedor>/<modelo>`, `kind`, función para
calcular la `costKey` según parámetros, si acepta inputs, y el grupo de
equivalencia para fallback. Define el modelo por defecto de cada `kind`
(los defaults actuales de `defaultImageModel`/`defaultVideoModel`). Se
construye a partir de `COST_TABLE` y las tablas de modelos de cada proveedor;
no duplica precios.

### core/router — `src/core/router.mjs`
Decide y ejecuta: `model: "auto"` → default del `kind`; arma la lista de
candidatos (el pedido + equivalentes del catálogo); aplica el gate de costo
(umbrales existentes) y el tope diario (lee el gasto del día en la
biblioteca); ejecuta con `core/generate` y, ante un error `provider_*`
reintentable, pasa al siguiente candidato. Registra el resultado en la
biblioteca y en el `manifest.json` del proyecto. Es la única puerta de
entrada para CLI, API y dashboard.

### core/errors — `src/core/errors.mjs`
`DavinciError` con `code` y `status` HTTP, y `classifyProviderError(err)`,
que traduce los `Error` actuales de los proveedores (regex sobre el status en
el mensaje, "no configurada", "timeout") a un código.

### core/storage — `src/core/storage.mjs`
Guarda buffers/base64/URLs remotas en disco (lo que hoy son
`saveRemoteAsset`/`saveB64Asset`/`saveBufferAsset`) con el nombre
`<kind>-<timestamp>[-i].<ext>`. El directorio lo decide quien llama: CLI →
`<cwd>/assets/generated/`, servidor → `~/.davinci/library/`.

### core/config — `src/core/config.mjs`
Lee `~/.davinci/config.json` (con defaults) y resuelve `DAVINCI_HOME`
(default `~/.davinci`). También lo usan `library` y `server`.

### library — `src/library/db.mjs`, `src/library/import.mjs`
Dueña de `~/.davinci/davinci.db` (node:sqlite, WAL, `busy_timeout` 5 s para
que CLI y servidor escriban a la vez). Registra generaciones y sus inputs,
resuelve linaje, lista con filtros y cursor, borra, marca favoritos, agrega
gasto, y persiste los trabajos. `import.mjs` importa `manifest.json`
existentes: al arrancar el servidor importa el del cwd y con
`davinci import <ruta>` cualquiera otro.

### utils/manifest — `src/utils/manifest.mjs` (existente)
Sigue escribiendo `<proyecto>/assets/generated/manifest.json` con el mismo
formato. Cambia la forma de escribir: lockfile (`manifest.json.lock`, `open`
con `wx` y reintentos) + escritura atómica (tmp + `rename`). La biblioteca es
la fuente de verdad; el manifest es la copia por proyecto que la skill y el
README ya documentan.

### server — `src/server/index.mjs`, `src/server/routes/*.mjs`, `src/server/jobs.mjs`
`node:http` sin framework. Sirve la API nativa, la API compatible con OpenAI,
los archivos por id, el SSE y el dashboard estático (`dist/ui`, con
fallback a `index.html` para rutas del SPA). Escucha en `127.0.0.1` por
defecto; con `--host` distinto exige `apiKey` en config y la valida en todo
`/api` y `/v1`. `jobs.mjs` es una cola en proceso (concurrencia de config,
default 3) que persiste cada cambio de estado en la biblioteca, emite eventos
y, al arrancar, marca como `failed` (`interrupted`) todo trabajo que quedó
`queued` o `running`.

### providers admin — `src/core/providers-status.mjs`
Estado de cada proveedor (conectado / sin key / error), de dónde viene su key
(`env`, `dotenv:<ruta>`, `infisical`), sufijo de 4 caracteres para mostrar,
prueba de conexión (llamada barata por proveedor: listar modelos, voces o
saldo) y guardar una key en `~/.config/da-vinci/.env` (modo `600`) +
`process.env` sin reiniciar.

### CLI — `src/generate.mjs` (existente)
Queda como capa fina: parsea flags → `GenerationRequest` → `router.run` →
imprime el mismo JSON de hoy. `CostConfirmRequired` → código de salida 2, como
hoy. Nuevos subcomandos: `serve [--port] [--host] [--no-open]` e
`import <ruta>`. `--refs` acepta además `davinci:<id>`.

### ui — `ui/` (Vite + React + TypeScript), compila a `dist/ui/`
SPA con 4 secciones (Library, Studio, Providers, Spend) + detalle de asset y
una bandeja de trabajos global. Habla solo con `/api/*` y `/files/*`. Se
compila en `prepublishOnly`; el paquete npm incluye `dist/ui` y no incluye
`ui/`.

## Data model

SQLite en `~/.davinci/davinci.db`. Versión de esquema en `PRAGMA user_version`;
las migraciones son una lista ordenada en `db.mjs` que corre al abrir.

```sql
CREATE TABLE generations (
  id            TEXT PRIMARY KEY,          -- UUID; en import = id del manifest
  created_at    TEXT NOT NULL,             -- ISO 8601
  kind          TEXT NOT NULL,             -- image|svg|video|audio|sfx|model-3d
  prompt        TEXT,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  requested_model TEXT,                    -- lo pedido, si hubo fallback
  params        TEXT NOT NULL DEFAULT '{}',-- JSON
  cost_usd      REAL NOT NULL DEFAULT 0,   -- estimado (COST_TABLE)
  file_path     TEXT NOT NULL,             -- absoluta
  mime          TEXT,
  bytes         INTEGER,
  source        TEXT NOT NULL,             -- cli|api|dashboard|import
  project_dir   TEXT,                      -- cwd del CLI; NULL desde el servidor
  favorite      INTEGER NOT NULL DEFAULT 0,
  deleted_at    TEXT
);
CREATE INDEX generations_created ON generations(created_at DESC);
CREATE INDEX generations_file    ON generations(file_path);

CREATE TABLE generation_inputs (
  generation_id TEXT NOT NULL REFERENCES generations(id),
  position      INTEGER NOT NULL,
  input_id      TEXT REFERENCES generations(id),  -- si está en la biblioteca
  input_ref     TEXT,                              -- URL/ruta original
  PRIMARY KEY (generation_id, position)
);
CREATE INDEX generation_inputs_input ON generation_inputs(input_id);

CREATE TABLE jobs (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  status        TEXT NOT NULL,             -- queued|running|done|failed
  source        TEXT NOT NULL,             -- api|dashboard
  request       TEXT NOT NULL,             -- JSON GenerationRequest
  generation_ids TEXT,                     -- JSON array, al terminar
  error         TEXT                       -- JSON {code,message}
);
```

- **Linaje:** al registrar, cada input se resuelve a `input_id` si es
  `davinci:<id>`, `/files/<id>`, o una ruta igual a un `file_path` existente.
  Si no, queda solo `input_ref`. Borrar un asset pone `deleted_at`; sus hijos
  conservan `input_id` y el detalle lo muestra como "origen borrado".
- **Import:** cada entrada de manifest se inserta con su `id` original
  (`INSERT OR IGNORE`), `source = 'import'`, `project_dir` = la carpeta dos
  niveles arriba del manifest, `kind` deducido de la extensión del archivo.
  Idempotente por construcción (FR-3).
- **Gasto:** `SUM(cost_usd)` agrupado por `date(created_at)`, `provider` o
  `model`, excluyendo borrados. Sin tabla aparte.
- `manifest.json` no cambia de formato.

## Interfaces

### Núcleo (JS)

```js
// src/core/errors.mjs
class DavinciError extends Error { code; status; details }
// code:
//   invalid_request (400) | not_found (404) | cost_confirm_required (402)
//   budget_exceeded (402) | provider_unavailable (503, sin key)
//   provider_error (502, reintentable) | provider_rejected (422, no reintentable)
export function classifyProviderError(err): DavinciError

// src/core/catalog.mjs
type ModelEntry = {
  id: string,            // 'fal/flux-pro-ultra'
  provider: string, model: string,
  kind: 'image'|'svg'|'video'|'audio'|'sfx'|'model-3d'|'bg-remove'|'upscale'|'avatar-video',
  acceptsInputs: 0|1|'many',
  costKey(params): string,
  equivalent?: string,   // grupo de fallback, ej. 'veo-3-fast'
}
export const MODELS: ModelEntry[]
export function getModel(id): ModelEntry | undefined
export function defaultModel(kind): ModelEntry
export function equivalents(id): ModelEntry[]   // mismo grupo, orden de la tabla, sin `id`

// Request normalizado — lo producen CLI, API y dashboard
type GenerationRequest = {
  kind: ModelEntry['kind'],
  model?: string,                 // 'provider/model' | 'auto' (default)
  prompt?: string,                // image, svg, video, model-3d
  text?: string,                  // audio, sfx
  script?: string, avatar?: string, voice?: string,
  params?: { aspect?, duration?, quality?, n?, texture?, pbr?, faceLimit?, style?, engine? },
  inputs?: Array<{ id: string } | { url: string } | { path: string }>,
  confirm?: boolean,              // salta cost_confirm_required (no el tope diario)
  fallback?: boolean,             // default true
}
type RunContext = {
  source: 'cli'|'api'|'dashboard',
  projectDir?: string,            // CLI: cwd → también escribe su manifest
  outDir: string,
  outPath?: string,               // --out del CLI
  onProgress?(msg: string): void,
}

// src/core/generate.mjs
type GenerationOutput = { filePath, mime, bytes }
export async function generate(entry: ModelEntry, req, ctx): Promise<GenerationOutput[]>

// src/core/router.mjs
type Estimate = { model: string, costKey: string, costUsd: number,
                  level: 'auto'|'warn'|'confirm', known: boolean,
                  candidates: string[], budgetLeftUsd: number | null }
type Generation = {                // fila de biblioteca serializada
  id, createdAt, kind, prompt, provider, model, requestedModel, params,
  costUsd, filePath, mime, bytes, source, projectDir, favorite,
  inputs: Array<{ id: string|null, ref: string|null }>,
  url: string,                     // '/files/<id>'
}
export function estimate(req): Estimate
export async function run(req, ctx): Promise<Generation[]>

// src/library/db.mjs
export function openLibrary(home = config.home): Library
interface Library {
  record(g: Omit<Generation,'url'>): Generation
  get(id): Generation | null
  list(filter: { q?, kind?, provider?, model?, project?, from?, to?,
                 favorite?, cursor?, limit? = 60 }): { items: Generation[], nextCursor: string|null }
  lineage(id): { parents: Generation[], children: Generation[] }
  setFavorite(id, bool): void
  remove(id, { deleteFile }): void
  spend({ from, to, groupBy: 'day'|'provider'|'model' }): Array<{ key, costUsd, count }>
  spentToday(): number
  resolveInputId(ref: string): string | null
  jobs: { create(job), update(id, patch), get(id), list({ status?, limit? }), failInterrupted(): number }
}

// src/library/import.mjs
export async function importManifest(path, lib): Promise<{ imported: number, skipped: number }>
```

### HTTP

Todas las respuestas JSON. Error: `{ "error": { "code", "message", "details"? } }`
con el `status` del `DavinciError`. Paginación por cursor opaco.

| Método y ruta | Body / query | Respuesta |
| --- | --- | --- |
| `GET /api/health` | — | `{ ok, version }` |
| `GET /api/models` | `?kind=` | `{ items: [{ id, kind, provider, model, acceptsInputs, unitCostUsd, available }] }` |
| `POST /api/estimate` | `GenerationRequest` | `Estimate` |
| `POST /api/generations` | `GenerationRequest` | `202 { job }` — errores de gate (402) se devuelven acá, antes de encolar |
| `GET /api/jobs` | `?status=&limit=` | `{ items: Job[] }` |
| `GET /api/jobs/:id` | — | `Job` |
| `GET /api/events` | — | SSE: `job` → `Job`, `generation` → `Generation`, `generation.deleted` → `{ id }` |
| `GET /api/library` | `q, kind, provider, model, project, from, to, favorite, cursor, limit` | `{ items: Generation[], nextCursor }` |
| `GET /api/library/:id` | — | `Generation & { parents: Generation[], children: Generation[] }` |
| `PATCH /api/library/:id` | `{ favorite }` | `Generation` |
| `DELETE /api/library/:id` | `?file=true` | `204` |
| `GET /api/projects` | — | `{ items: [{ dir, count }] }` |
| `GET /api/providers` | — | `{ items: [{ id, status: 'connected'|'missing'|'error', source, keyHint, error? }] }` |
| `PUT /api/providers/:id/key` | `{ key }` | provider status |
| `POST /api/providers/:id/test` | — | provider status |
| `GET /api/spend` | `from, to, groupBy` | `{ items: [{ key, costUsd, count }], totalUsd }` |
| `POST /api/import` | `{ path }` | `{ imported, skipped }` |
| `GET /files/:id` | — | bytes del archivo con `Content-Type` y soporte de `Range` |
| `GET /v1/models` | — | formato OpenAI `{ object: 'list', data: [{ id, object: 'model', owned_by }] }`, solo `kind` image/svg |
| `POST /v1/images/generations` | `{ model, prompt, n?, size?, response_format? }` | `{ created, data: [{ url } \| { b64_json }] }`; espera el trabajo (síncrono) |

`Job = { id, createdAt, updatedAt, status, source, request, generationIds, error }`.

En `/v1`, `size` se traduce a `aspect` (`1024x1024`→`1:1`, `1536x1024`→`16:9`,
`1024x1536`→`9:16`), la confirmación de costo va en el header
`X-Davinci-Confirm: true`, y `url` es absoluta (`http://<host>:<port>/files/<id>`).

Autenticación (solo si `host` ≠ `127.0.0.1`/`localhost`):
`Authorization: Bearer <apiKey>` en `/api/*`, `/v1/*` y `/files/*`; el
dashboard la pide una vez y la guarda en `localStorage`.

### Configuración — `~/.davinci/config.json`

```json
{
  "port": 20130,
  "host": "127.0.0.1",
  "apiKey": null,
  "concurrency": 3,
  "dailyBudgetUsd": null,
  "thresholds": { "auto": 0.10, "warn": 1.00 },
  "fallback": true
}
```

### Dashboard: rutas del SPA

`/` → Library · `/asset/:id` · `/studio?kind=&model=&input=<id>&prompt=` ·
`/providers` · `/spend`. Studio lee la query para precargarse; las acciones
de encadenamiento del detalle son links a Studio (FR-10).

## Decisions

- **D1 — Almacenamiento de la biblioteca.** Elegido: SQLite con `node:sqlite`
  (incluido en Node). Rechazado: `better-sqlite3` porque es módulo nativo y
  rompe NFR-2 cuando no hay binario precompilado; JSON por archivo porque no
  resuelve FR-4 entre procesos ni filtros/agregados de FR-7 y FR-13.
- **D2 — El CLI escribe directo en la biblioteca, no vía servidor.** Elegido:
  CLI y servidor abren la misma base con WAL. Rechazado: CLI → HTTP al
  servidor, porque obliga a tenerlo corriendo para usar la skill.
- **D3 — `manifest.json` se mantiene como copia por proyecto.** Elegido:
  seguir escribiéndolo, con lockfile + escritura atómica. Rechazado: dejar de
  escribirlo, porque rompe G5 y la documentación de la skill.
- **D4 — Servidor HTTP.** Elegido: `node:http` con una tabla de rutas propia.
  Rechazado: Express/Fastify, porque agregan dependencias de runtime (NFR-3)
  para ~20 rutas.
- **D5 — Dashboard.** Elegido: Vite + React + TypeScript, compilado a
  `dist/ui` y publicado dentro del paquete. Rechazado: Next.js (lo que usa
  9router), porque exige compilar con mucha memoria y el SSR no aporta en una
  app local; HTML renderizado en servidor, porque Studio, la bandeja de
  trabajos y el linaje son interactivos.
- **D6 — Actualizaciones en vivo.** Elegido: Server-Sent Events. Rechazado:
  WebSocket, porque el flujo es solo servidor → cliente y SSE no necesita
  librería; polling, porque multiplica pedidos durante videos de minutos.
- **D7 — Trabajos.** Elegido: cola en proceso con estado persistido en SQLite.
  Rechazado: worker separado o Redis, porque es un solo usuario y los
  proveedores ya hacen el trabajo pesado (nosotros solo esperamos).
- **D8 — Clasificación de errores de proveedor.** Elegido: un clasificador
  central por regex sobre los mensajes actuales (`(401)`, `(429)`, `(5xx)`,
  `no configurada`, `timeout`). Rechazado: cambiar los 7 proveedores para
  lanzar errores tipados; es más limpio pero toca todo para el mismo
  resultado. Se revisa si el regex empieza a fallar.
- **D9 — Fallback solo antes de que el proveedor acepte el trabajo.**
  Elegido: reintentar con otro proveedor ante 401/403/429/5xx o key faltante.
  Rechazado: reintentar también ante timeout de polling o fallo del trabajo,
  porque el primer proveedor probablemente ya cobró y se pagaría dos veces.
- **D10 — Búsqueda.** Elegido: `LIKE` sobre `prompt`. Rechazado por ahora:
  FTS5; con 5 000 filas `LIKE` cumple FR-7 y FTS5 depende de cómo se compiló
  el SQLite de Node.
- **D11 — Visor 3D.** Elegido: `@google/model-viewer` (web component, carga
  diferida solo en el detalle de GLB). Rechazado: visor propio con three.js,
  porque es mucho código para mostrar un modelo.
- **D12 — Archivos por id.** Elegido: `/files/:id` sirve solo `file_path` de
  una fila de la biblioteca. Rechazado: servir rutas arbitrarias, porque
  expone todo el disco.
- **D13 — Tests.** Elegido: `node:test` + `node:assert`, en `test/`, sin
  llamadas reales a proveedores (se mockea `globalThis.fetch`). Rechazado:
  Jest/Vitest en el núcleo, por dependencias.
- **D14 — Node mínimo 22.13**, donde `node:sqlite` no necesita flag. Es un
  cambio de `engines` (hoy `>=18`) y va en el CHANGELOG como breaking.

Supuestos del PRD que la arquitectura toma tal cual: A1–A7. Las preguntas
Q1 (`davinci` sin argumentos) y Q2 (`/v1` para video/audio) no cambian el
diseño: son una línea en el CLI y dos rutas más en `routes/openai.mjs`.

## Risks

- **`node:sqlite` todavía marcado como experimental** (emite un warning).
  *Mitigación:* suprimir solo ese warning en el binario, fijar Node ≥ 22.13 y
  aislar todo el SQL en `library/db.mjs` para cambiar de driver sin tocar el
  resto.
- **Dos procesos escribiendo la base a la vez** (CLI + servidor). *Mitigación:*
  WAL + `busy_timeout`; cada escritura es una transacción corta. Test de 10
  procesos CLI en paralelo (FR-4).
- **Pagar dos veces por un fallback.** *Mitigación:* D9 — solo se reintenta
  antes de que el proveedor acepte el trabajo.
- **Costos desactualizados en `COST_TABLE`.** *Mitigación:* el dashboard
  muestra el costo como "estimado"; la tabla sigue siendo un solo archivo.
- **Timeouts de clientes OpenAI en `/v1/images/generations`** con modelos
  lentos. *Mitigación:* `/v1` solo expone modelos de imagen y SVG; video y 3D
  van por la API nativa asíncrona.
- **Exponer el servidor en la red filtra las keys de todos los proveedores.**
  *Mitigación:* NFR-1 — `127.0.0.1` por defecto, `apiKey` obligatoria en otro
  host, las keys nunca salen completas por la API.
- **Refactor del CLI rompe la skill.** *Mitigación:* F1.4 conserva flags y
  JSON de salida; test que corre los ejemplos del README con `--dry-run` y con
  proveedores mockeados.

## Requirement coverage

| Requirement | Component(s) |
| --- | --- |
| FR-1 | library/db, core/router |
| FR-2 | library/db (`generation_inputs`, `resolveInputId`), CLI (`davinci:<id>`) |
| FR-3 | library/import, server (import al arrancar), CLI (`import`) |
| FR-4 | library/db (WAL), utils/manifest (lockfile + atómico) |
| FR-5 | utils/manifest |
| FR-6 | server, CLI (`serve`) |
| FR-7 | ui Library, `GET /api/library`, library/db `list` |
| FR-8 | ui Asset, `GET /api/library/:id`, `GET /files/:id` |
| FR-9 | ui Studio, `POST /api/estimate`, `GET /api/models`, core/catalog |
| FR-10 | ui Asset (acciones) → ui Studio (query) |
| FR-11 | server/jobs, SSE, ui bandeja de trabajos |
| FR-12 | core/providers-status, `/api/providers`, ui Providers |
| FR-13 | library/db `spend`, `GET /api/spend`, ui Spend |
| FR-14 | library/db `remove`/`setFavorite`, `PATCH`/`DELETE /api/library/:id`, ui |
| FR-15 | server/routes/openai |
| FR-16 | server/routes/api |
| FR-17 | core/router, core/catalog (`equivalent`), core/errors |
| FR-18 | core/router (gate + tope diario), core/config |
| FR-19 | CLI, core/router |
| NFR-1 | server (host por defecto, apiKey) |
| NFR-2 | D1, D5 (UI precompilada), `package.json` `files` |
| NFR-3 | D1, D4, D13 |
| NFR-4 | core/providers-status (keyHint, `.env` modo 600) |
| NFR-5 | library/db (índice + cursor), ui Library (paginado) |
| NFR-6 | F5.3 documentación |
| NFR-7 | server/jobs (`failInterrupted` al arrancar) |

## Work breakdown

Tests del núcleo con `node:test` en `test/`; cada paquete es dueño de su
archivo de test.

### F1 — Biblioteca única (M1)

- **F1.1 — Núcleo de generación**: extraer de `src/generate.mjs` la lógica de
  proveedores a `generate()`, los helpers de guardado a `storage`, errores y
  clasificador, y el catálogo de modelos. `src/generate.mjs` no se toca en este
  paquete. Files: `src/core/generate.mjs`, `src/core/storage.mjs`,
  `src/core/errors.mjs`, `src/core/catalog.mjs`, `test/core.test.mjs`.
- **F1.2 — Biblioteca SQLite**: config/`DAVINCI_HOME`, esquema y
  migraciones, la interfaz `Library` completa (incluye `jobs`), import de
  manifests. Files: `src/core/config.mjs`, `src/library/db.mjs`,
  `src/library/import.mjs`, `test/library.test.mjs`.
- **F1.3 — Manifest seguro**: lockfile + escritura atómica en
  `recordGeneration`, sin cambiar formato. Files: `src/utils/manifest.mjs`,
  `test/manifest.test.mjs`.
- **F1.4 — Router y CLI**: `core/router` (estimate, run, gate de costo, tope
  diario, fallback, registro en biblioteca + manifest); `src/generate.mjs`
  pasa a capa fina con los mismos flags y JSON, `--refs davinci:<id>`,
  subcomando `import`; `engines` a `>=22.13`; script `test`. Depends on: F1.1,
  F1.2, F1.3. Files: `src/core/router.mjs`, `src/generate.mjs`,
  `package.json`, `test/router.test.mjs`, `test/cli.test.mjs`.

### F2 — Servidor y API (M2)

- **F2.1 — Servidor base y API nativa**: `node:http`, tabla de rutas, errores
  JSON, auth por host, `/files/:id` con `Range`, estáticos de `dist/ui` con
  fallback SPA, `/api/health|models|estimate|generations|jobs|library|projects|spend|import`,
  SSE, import del manifest del cwd al arrancar, subcomando `serve` (abre el
  navegador salvo `--no-open`). Deja `routes/openai.mjs` y
  `routes/providers.mjs` como módulos que exportan `[]`, ya montados.
  Depends on: F1.4. Files: `src/server/index.mjs`, `src/server/http.mjs`,
  `src/server/routes/api.mjs`, `src/server/routes/files.mjs`,
  `src/server/routes/openai.mjs`, `src/server/routes/providers.mjs`,
  `src/server/events.mjs`, `src/generate.mjs`, `test/server.test.mjs`.
- **F2.2 — Cola de trabajos**: cola con concurrencia, persistencia en
  `library.jobs`, eventos `job`/`generation`, `failInterrupted` al arrancar.
  Depends on: F1.4. Files: `src/server/jobs.mjs`, `test/jobs.test.mjs`.
  (F2.1 la importa por la interfaz `createJobQueue({ library, router, events, concurrency })
  → { enqueue(req, source): Job }`; se integran al cerrar F2.)
- **F2.3 — API compatible con OpenAI**: `/v1/models` y
  `/v1/images/generations` sobre router + cola. Depends on: F2.1, F2.2.
  Files: `src/server/routes/openai.mjs`, `test/openai.test.mjs`.
- **F2.4 — Administración de proveedores**: estado, origen de key, prueba de
  conexión, guardar key en `~/.config/da-vinci/.env` (600) y recargar env;
  rutas `/api/providers*`. Depends on: F2.1. Files:
  `src/core/providers-status.mjs`, `src/server/routes/providers.mjs`,
  `test/providers.test.mjs`.

### F3 — Library en el dashboard (M3)

- **F3.1 — Shell del dashboard**: proyecto Vite + React + TS en `ui/`, layout
  y navegación, cliente de API tipado según *Interfaces*, hook de SSE,
  bandeja de trabajos, pantalla de API key cuando hay auth; build a
  `dist/ui`, `files` y `prepublishOnly` en `package.json`. Depends on: F2.1.
  Files: `ui/package.json`, `ui/vite.config.ts`, `ui/index.html`,
  `ui/src/main.tsx`, `ui/src/App.tsx`, `ui/src/api.ts`, `ui/src/sse.ts`,
  `ui/src/components/Layout.tsx`, `ui/src/components/JobsTray.tsx`,
  `ui/src/styles.css`, `package.json`, `.gitignore`.
- **F3.2 — Library**: grilla paginada con miniaturas, búsqueda, filtros,
  favoritos. Depends on: F3.1. Files: `ui/src/pages/Library/`.
- **F3.3 — Detalle y linaje**: visores (imagen, SVG, video, audio, GLB con
  model-viewer), prompt, parámetros, costo, árbol de padres e hijos, borrar.
  Depends on: F3.1. Files: `ui/src/pages/Asset/`, `ui/src/components/viewers/`.

### F4 — Studio (M4)

- **F4.1 — Studio**: formulario por `kind`, selector de modelo (con "auto"),
  inputs desde la biblioteca, estimación en vivo, confirmación sobre umbral,
  precarga desde query. Depends on: F3.1. Files: `ui/src/pages/Studio/`.
- **F4.2 — Acciones de encadenamiento**: regenerar, variar prompt, → video,
  → 3D, quitar fondo, upscale, como links a Studio desde el detalle. Depends
  on: F3.3. Files: `ui/src/pages/Asset/Actions.tsx`.

### F5 — Providers, Spend y lanzamiento (M5)

- **F5.1 — Pantalla Providers**: estado, origen, probar, pegar key. Depends
  on: F3.1, F2.4. Files: `ui/src/pages/Providers/`.
- **F5.2 — Pantalla Spend**: rango de fechas, barras por día (SVG propio),
  tablas por proveedor y modelo, total del mes, tope diario. Depends on:
  F3.1. Files: `ui/src/pages/Spend/`.
- **F5.3 — Documentación y release**: README es/en/pt (instalación npm,
  `serve`, API, config), SKILL.md (`davinci:<id>`, biblioteca), CHANGELOG
  (Node ≥ 22.13 breaking). Depends on: F5.1, F5.2, F4.2. Files: `README.md`,
  `README.pt.md`, `SKILL.md`, `docs/SKILL.md`, `CHANGELOG.md`.
