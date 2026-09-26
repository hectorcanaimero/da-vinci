---
type: spec
project_id: da-vinci
phase: 1
version: 0.1
depends_on:
  - docs/arch/001-studio.md
consumed_by:
  - orch-atomizer
generated_by: orch-spec
generated_at: 2026-09-25
title: Biblioteca única
---

# F1 — Biblioteca única

Sacar la lógica de generación del CLI a un núcleo reutilizable, crear la
biblioteca global en SQLite y hacer que el CLI registre ahí sin cambiar su
comportamiento visible. Contratos: docs/arch/001-studio.md, secciones
*Components*, *Data model* e *Interfaces → Núcleo (JS)*. Reglas comunes a
todas las tareas: ESM, cero dependencias de runtime nuevas, tests con
`node:test` + `node:assert` sin llamadas reales a proveedores (mockear
`globalThis.fetch`), comentarios en español como el código existente.

## F1.1 — Package: núcleo de generación

### F1.1.T1 — Errores y catálogo de modelos

Crear `src/core/errors.mjs` y `src/core/catalog.mjs` exactamente con las
firmas de *Interfaces → Núcleo (JS)* de docs/arch/001-studio.md.

`errors.mjs`: clase `DavinciError` (`code`, `status`, `details`) con los
códigos y status HTTP listados en la arquitectura, y
`classifyProviderError(err)` que traduce los `Error` que hoy lanzan
`src/providers/*.mjs`: "no configurada" → `provider_unavailable`; `(401)`,
`(403)`, `(429)`, `(5xx)` en el mensaje → `provider_error`; `(400)`, `(422)`
→ `provider_rejected`; "timeout" o "FAILED"/"failed" de polling →
`provider_rejected` (no se reintenta: el proveedor ya aceptó el trabajo, ver
decisión D9). Un `DavinciError` pasa sin cambios.

`catalog.mjs`: `MODELS` con una entrada por cada modelo que hoy soporta
`src/generate.mjs` (image por fal/openai/gemini/kie/heygen, svg recraft,
video fal/gemini/kie, model-3d tripo, avatar-video heygen, audio y sfx
elevenlabs, bg-remove, upscale clarity/real-esrgan). `costKey(params)`
reproduce exactamente la lógica actual de `costKey()` y de cada `run*` en
`src/generate.mjs` (quality solo para openai, `:<duration>s` en video,
`:textured` en tripo, `tts` vs `tts-turbo` según modelo). `equivalent` agrupa
modelos intercambiables entre proveedores (al menos: veo-3-fast
gemini↔kie, veo-3 gemini↔kie, kling-2.1 fal↔kie, flux-2 kie↔fal si existe).
`defaultModel(kind)` = defaults actuales (`flux-pro-ultra`, `kling-1.6-pro`,
`recraft-v3-svg`, etc.). No duplicar precios: leer `COST_TABLE`.

Done when: `node --test test/catalog.test.mjs` pasa y cubre: cada
`costKey` de un modelo del catálogo existe en `COST_TABLE` (o está marcado
como desconocido a propósito), `defaultModel` por cada kind, `equivalents`
de veo-3-fast, y la clasificación de 6 mensajes de error reales copiados de
los providers.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Tablas y mapeo cuidadoso de lógica existente; tier estándar.
- **Dependencies**:
- **Files**:
  - `src/core/errors.mjs`
  - `src/core/catalog.mjs`
  - `test/catalog.test.mjs`

### F1.1.T2 — generate() y storage

Mover la lógica de los handlers `runImage`, `runSvg`, `runVideo`,
`runModel3d`, `runAvatarVideo`, `runTts`, `runSfx`, `runBgRemove`,
`runUpscale` de `src/generate.mjs` a
`generate(entry, req, ctx): Promise<GenerationOutput[]>` en
`src/core/generate.mjs`, y los helpers `saveRemoteAsset`, `saveB64Asset`,
`saveBufferAsset`, `downloadWithMime`, `MIME_TO_EXT`, `timestamp` a
`src/core/storage.mjs`. Firmas y tipos en *Interfaces → Núcleo (JS)*.

Diferencias con el código actual, a propósito:
- No hay `process.exit`, ni gate de costo, ni registro: solo proveedor +
  guardado. Errores de proveedor se relanzan con `classifyProviderError`.
- Inputs: `req.inputs` (`{id}`, `{url}`, `{path}`) se resuelven con
  `utils/reference-loader.mjs`; `{id}` se resuelve con una función
  `resolveInputPath(id)` que llega en `ctx` (la inyecta el router; en tests
  se mockea). bg-remove y upscale aceptan también inputs locales, pasando
  data URL a FAL.
- `n > 1`: se guardan todos los archivos, `-1`, `-2`… en el nombre, y se
  devuelven todos los outputs.
- Directorio: `ctx.outPath` si viene (solo con un output), si no
  `ctx.outDir`.

`src/generate.mjs` NO se modifica en esta tarea (lo hace F1.4.T2).

Done when: `node --test test/core.test.mjs` pasa con `fetch` mockeado y
cubre: image fal con n=2 (dos archivos), image openai b64, video gemini con
input `{path}`, tts con buffer, un 401 que sale como
`DavinciError{code:'provider_error'}`.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: Refactor mecánico pero extenso; el contrato ya está fijado.
- **Dependencies**: F1.1.T1
- **Files**:
  - `src/core/generate.mjs`
  - `src/core/storage.mjs`
  - `test/core.test.mjs`

## F1.2 — Package: biblioteca SQLite

### F1.2.T1 — Config y Library

Crear `src/core/config.mjs`: resuelve `home` (`DAVINCI_HOME` o
`~/.davinci`), lee `<home>/config.json` fusionando con los defaults de
*Interfaces → Configuración* y exporta `loadConfig()` y `saveConfig(patch)`.

Crear `src/library/db.mjs` con `openLibrary(home)` e implementar la interfaz
`Library` completa de *Interfaces → Núcleo (JS)*, incluido `jobs`, sobre
`node:sqlite` (`DatabaseSync`). Esquema exacto de *Data model*; migraciones
como lista ordenada aplicada según `PRAGMA user_version`. Al abrir:
`journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`. Cada escritura
es una transacción corta. `list` pagina por cursor opaco (base64 de
`created_at|id`), `q` busca con `LIKE` sobre `prompt`, excluye borrados.
`record` resuelve cada input con `resolveInputId` (acepta `davinci:<id>`,
`/files/<id>`, URL absoluta que termine en `/files/<id>`, o ruta igual a un
`file_path`). `remove` marca `deleted_at` y, con `deleteFile`, borra el
archivo. `spend` agrupa por `date(created_at)`, `provider` o `model`.
`spentToday` usa la fecha local. `jobs.failInterrupted` pasa `queued` y
`running` a `failed` con error `{code:'interrupted'}`.

Silenciar solo el `ExperimentalWarning` de `node:sqlite` si aparece.

Done when: `node --test test/library.test.mjs` pasa con una home temporal y
cubre: record + get con inputs vinculados por `davinci:<id>` y por ruta,
lineage padres/hijos, list con q + kind + cursor (3 páginas), remove sin
romper el linaje del hijo, spend por provider, jobs + failInterrupted, y dos
`openLibrary` sobre la misma home escribiendo alternadamente.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: SQL y paginación con contrato claro; estándar alcanza.
- **Dependencies**:
- **Files**:
  - `src/core/config.mjs`
  - `src/library/db.mjs`
  - `test/library.test.mjs`

### F1.2.T2 — Import de manifests

Crear `src/library/import.mjs` con
`importManifest(path, lib): Promise<{imported, skipped}>` según *Data model →
Import*: cada entrada se inserta con su `id` original (idempotente),
`source='import'`, `project_dir` = carpeta dos niveles arriba del manifest,
`kind` deducido de la extensión (`png|jpg|webp|gif`→image, `svg`→svg,
`mp4|webm|mov`→video, `mp3|wav|m4a`→audio, `glb`→model-3d; prompt que empieza
con `bg-remove`/`upscale` → ese kind), `references` → inputs. Archivos que ya
no existen se importan igual. Agregar a `Library` lo que haga falta solo como
uso de su API pública (no editar `db.mjs`; si falta un método, usar
`record` con el id).

Done when: `node --test test/import.test.mjs` pasa: importar un manifest de
ejemplo con 4 entradas da `imported: 4`, repetir da `imported: 0,
skipped: 4`, y un video cuya referencia es la ruta de una imagen importada
queda con `input_id` de esa imagen.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 2h
- **Reason**: Transformación de datos simple.
- **Dependencies**: F1.2.T1
- **Files**:
  - `src/library/import.mjs`
  - `test/import.test.mjs`

## F1.3 — Package: manifest seguro

### F1.3.T1 — Lockfile y escritura atómica

En `src/utils/manifest.mjs`, hacer que `recordGeneration` sea seguro entre
procesos: tomar `manifest.json.lock` con `open(..., 'wx')`, reintentar con
espera corta hasta 10 s, considerar huérfano un lock de más de 30 s,
leer-modificar-escribir a `manifest.json.tmp-<pid>` y `rename`, soltar el
lock en `finally`. El formato del archivo y las firmas exportadas no
cambian. Aceptar un `entry.id` opcional (si viene, usarlo en vez de generar
uno), porque el router registrará el mismo id en la biblioteca y el
manifest.

Done when: `node --test test/manifest.test.mjs` pasa: 10 procesos hijos
(`child_process.fork`) llaman a `recordGeneration` a la vez sobre el mismo
directorio y el manifest termina con 10 entradas y JSON válido; un
`entry.id` dado se respeta.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 2h
- **Reason**: Concurrencia de archivos acotada.
- **Dependencies**:
- **Files**:
  - `src/utils/manifest.mjs`
  - `test/manifest.test.mjs`

## F1.4 — Package: router y CLI

### F1.4.T1 — core/router

Crear `src/core/router.mjs` con `estimate(req)` y `run(req, ctx)` según
*Interfaces → Núcleo (JS)* y *Components → core/router*:

1. Resolver el modelo: `auto`/vacío → `defaultModel(kind)`; id desconocido →
   `invalid_request`. Validar campos requeridos por kind (prompt, text,
   script+avatar+voice…) → `invalid_request`.
2. Candidatos: el pedido + `equivalents(id)` si `req.fallback !== false` y
   `config.fallback`.
3. Gate: `estimateCost` con los umbrales de config; `confirm` sin
   `req.confirm` → `cost_confirm_required` (details con costo). Si
   `dailyBudgetUsd` y `spentToday()+costo` lo supera → `budget_exceeded`
   (no lo salta `confirm`).
4. Ejecutar `generate()` por candidato; ante `provider_unavailable` o
   `provider_error` pasar al siguiente; ante cualquier otro error, lanzar.
   Si todos fallan, lanzar el último error.
5. Registrar cada output en la biblioteca (`record`, con `requested_model`
   si hubo fallback, `source`, `project_dir`, `params`, inputs) y, si
   `ctx.projectDir`, también en su `manifest.json` con el mismo id.
6. Devolver `Generation[]`.

La biblioteca y config se obtienen por defecto con `openLibrary()` /
`loadConfig()`, pero `run`/`estimate` aceptan `ctx.library` para tests.
`ctx.resolveInputPath` para `generate` se construye con `library.get`.

Done when: `node --test test/router.test.mjs` pasa con `generate` y
biblioteca reales sobre home temporal y `fetch` mockeado: auto elige el
default, costo alto sin confirm lanza 402, tope diario lanza
`budget_exceeded`, un 401 de gemini hace fallback a kie y registra
`provider: 'kie'` + `requested_model`, un 422 no hace fallback, y con
`projectDir` el manifest y la biblioteca comparten id.

- **Model**: claude/opus
- **Estimate**: 4h
- **Reason**: Punto central de gasto y fallback; errores aquí cuestan dinero real.
- **Dependencies**: F1.1.T2, F1.2.T1, F1.3.T1
- **Files**:
  - `src/core/router.mjs`
  - `test/router.test.mjs`

### F1.4.T2 — CLI como capa fina

Reescribir `src/generate.mjs` para que use `core/router`: flags →
`GenerationRequest` (`--provider X --model Y` → `model: 'X/Y'`; solo
`--provider` → default de ese proveedor; nada → `auto`), `ctx = { source:
'cli', projectDir: cwd, outDir: <cwd>/assets/generated, outPath: --out }`.
Conservar exactamente: todos los flags, `--help`, `--dry-run` (imprime el
mismo JSON de hoy usando `estimate`), el mensaje de costo por stderr,
`--force` → `confirm: true`, código de salida 2 en
`cost_confirm_required`, `list-voices` y `list-avatars`, y el JSON de éxito
(`ok, id, provider, model, outputPath, costUsd, manifestPath`; con n>1,
imprimir uno por output). `--refs` acepta además `davinci:<id>`.
Nuevo subcomando `import <ruta-a-manifest.json>` que usa `importManifest` e
imprime `{imported, skipped}`. `--help` los documenta.

En `package.json`: `engines.node` → `>=22.13.0`, script `"test": "node
--test test/"`, y `lint` incluye `src/core/*.mjs src/library/*.mjs`.

Done when: `npm test` pasa entero, e incluye `test/cli.test.mjs` que corre
el CLI como proceso hijo con un `--import` de un módulo que mockea `fetch`
y `DAVINCI_HOME` temporal: `image --dry-run`, `image` fal (JSON de salida
con el mismo shape y fila en la biblioteca), costo alto sin `--force` → exit
2, `--refs davinci:<id>` vincula el padre, `import` dos veces es idempotente.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Cableado con compatibilidad estricta; el diseño ya está resuelto.
- **Dependencies**: F1.4.T1, F1.2.T2
- **Files**:
  - `src/generate.mjs`
  - `package.json`
  - `test/cli.test.mjs`
  - `test/helpers/mock-fetch.mjs`
