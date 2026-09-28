---
type: spec
project_id: da-vinci
phase: 2
version: 0.1
depends_on:
  - docs/arch/001-studio.md
consumed_by:
  - orch-atomizer
generated_by: orch-spec
generated_at: 2026-09-25
title: Servidor y API
---

# F2 — Servidor y API

`davinci serve`: servidor local con `node:http`, API nativa, API compatible
con OpenAI Images, cola de trabajos con SSE y administración de proveedores.
Contratos: docs/arch/001-studio.md, *Components → server*, *Interfaces →
HTTP* y *Interfaces → Configuración*. Reglas comunes: cero dependencias de
runtime nuevas, tests con `node:test` sobre un servidor real en puerto 0,
`DAVINCI_HOME` temporal y `fetch` de proveedores mockeado con
`test/helpers/mock-fetch.mjs` (creado en F1).

## F2.1 — Package: servidor base y API nativa

### F2.1.T1 — Servidor HTTP base

Crear el esqueleto del servidor:

- `src/server/http.mjs`: tabla de rutas mínima (`method`, patrón con
  `:params`), parseo de query y body JSON (límite 25 MB), `sendJson`,
  `sendError(DavinciError)` con el formato
  `{error:{code,message,details}}`, 404 JSON para rutas `/api` y `/v1`
  desconocidas.
- Auth: si `config.host` no es `127.0.0.1`/`localhost`/`::1`, exigir
  `Authorization: Bearer <config.apiKey>` en `/api/*`, `/v1/*` y
  `/files/*` (también `?key=` en `/files` y `/api/events`, porque `<img>` y
  `EventSource` no mandan headers); sin `apiKey` configurada en ese caso,
  negarse a arrancar con un mensaje claro.
- `src/server/events.mjs`: `EventEmitter` compartido y handler de
  `GET /api/events` (SSE: `event: <tipo>\ndata: <json>\n\n`, ping cada 25 s,
  limpieza al cerrar).
- `src/server/routes/files.mjs`: `GET /files/:id` sirve solo el
  `file_path` de esa fila (404 si no existe o está borrada), con
  `Content-Type`, `Content-Length` y soporte de `Range` (206).
- `src/server/routes/openai.mjs` y `src/server/routes/providers.mjs`: stubs
  que exportan `routes = []` (los llenan F2.3.T1 y F2.4.T2).
- `src/server/index.mjs`: `createServer({ config, library, router, jobs })`
  → `http.Server`, que monta `routes/*.mjs`, `/api/events` y sirve estáticos
  de `dist/ui` (si no existe, `/` responde una página HTML mínima que dice
  que el dashboard no está compilado) con fallback a `index.html` para rutas
  que no empiezan con `/api`, `/v1` o `/files`. Evitar path traversal en
  estáticos.
- `src/server/routes/api.mjs`: stub con `routes = []` y solo
  `GET /api/health` → `{ok, version}` (lo completa F2.1.T2).

Done when: `node --test test/server.test.mjs` pasa: health responde, ruta
`/api/x` da 404 JSON, `/files/:id` sirve un archivo registrado con y sin
`Range`, `/files/<id-borrado>` da 404, un pedido a `/../package.json` no
escapa de `dist/ui`, con host `0.0.0.0` sin token da 401 y con token 200, y
un evento emitido llega por SSE.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: HTTP a mano con auth y traversal; estándar con buenos tests.
- **Dependencies**: F1.4.T2
- **Files**:
  - `src/server/http.mjs`
  - `src/server/events.mjs`
  - `src/server/index.mjs`
  - `src/server/routes/files.mjs`
  - `src/server/routes/api.mjs`
  - `src/server/routes/openai.mjs`
  - `src/server/routes/providers.mjs`
  - `test/server.test.mjs`

### F2.1.T2 — API nativa

Completar `src/server/routes/api.mjs` con todas las rutas `/api/*` de la
tabla *Interfaces → HTTP* salvo `/api/providers*` y `/api/events`:
`models` (con `available` según haya key del proveedor en `process.env`),
`estimate`, `generations` (valida y corre `router.estimate` antes de
encolar, así los 402 y 400 salen sincrónicos; luego `jobs.enqueue(req,
'dashboard'|'api')` según header `X-Davinci-Source`, 202 `{job}`), `jobs`,
`jobs/:id`, `library` (query → filtro de `Library.list`), `library/:id` (con
`parents`/`children`), `PATCH` favorito, `DELETE` (con `?file=true`, emite
`generation.deleted`), `projects`, `spend` (con `totalUsd`), `import`.
Toda `Generation` serializada con `url: '/files/<id>'`.

Done when: `node --test test/api.test.mjs` pasa cubriendo cada ruta al menos
una vez, incluyendo: POST generations con costo alto sin confirm → 402 sin
job creado, POST válido → 202 y luego el job termina `done` con la
generación en `GET /api/library`.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: Muchas rutas finas sobre contratos ya definidos.
- **Dependencies**: F2.1.T1, F2.2.T1
- **Files**:
  - `src/server/routes/api.mjs`
  - `test/api.test.mjs`

### F2.1.T3 — Subcomando serve y arranque

Crear `src/server/start.mjs` con `startServer({ port, host, open, cwd })`:
carga config (flags pisan config), abre la biblioteca, `jobs.failInterrupted()`,
importa `<cwd>/assets/generated/manifest.json` si existe (silencioso si no),
crea la cola y el servidor, escucha, imprime la URL y, salvo `open: false`,
abre el navegador (`xdg-open`/`open`/`start` según plataforma, sin fallar si
no hay). Cierra limpio con SIGINT/SIGTERM.

En `src/generate.mjs`, agregar `serve [--port N] [--host H] [--no-open]`
que llama a `startServer`, y documentarlo en `--help`.

Done when: `node src/generate.mjs serve --port 0 --no-open` arranca, imprime
la URL, `GET /api/health` responde, y un job dejado en `running` en la base
aparece como `failed`/`interrupted` tras arrancar (test en
`test/start.test.mjs` con proceso hijo).

- **Model**: claude/claude-sonnet-5
- **Estimate**: 2h
- **Reason**: Cableado de arranque.
- **Dependencies**: F2.1.T2
- **Files**:
  - `src/server/start.mjs`
  - `src/generate.mjs`
  - `test/start.test.mjs`

## F2.2 — Package: cola de trabajos

### F2.2.T1 — Cola en proceso con persistencia

Crear `src/server/jobs.mjs` con
`createJobQueue({ library, router, events, concurrency, outDir })` →
`{ enqueue(req, source): Job, get(id), list(filter), idle(): Promise }`.
`enqueue` crea el job `queued` en `library.jobs`, emite `job`, y lo corre
cuando haya lugar (máximo `concurrency` a la vez, FIFO). Correr = pasar a
`running` (emite), `router.run(req, { source, outDir, library })`, y al
terminar `done` con `generationIds` (emite `job` y una `generation` por
resultado) o `failed` con `{code, message}` (emite `job`). Un error nunca
tumba la cola. `events` es un `EventEmitter` inyectado; no importar
`src/server/events.mjs`. `idle()` resuelve cuando no hay nada en cola ni
corriendo (para tests).

Done when: `node --test test/jobs.test.mjs` pasa con un `router` falso:
concurrencia 2 con 5 jobs nunca corre más de 2 a la vez, un job que lanza
queda `failed` y los siguientes corren, los eventos llegan en orden
`queued→running→done` y el estado queda persistido en la biblioteca.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Concurrencia simple con contrato cerrado.
- **Dependencies**: F1.4.T1
- **Files**:
  - `src/server/jobs.mjs`
  - `test/jobs.test.mjs`

## F2.3 — Package: API compatible con OpenAI

### F2.3.T1 — /v1/models y /v1/images/generations

Llenar `src/server/routes/openai.mjs` según *Interfaces → HTTP* (filas
`/v1`): `GET /v1/models` lista los modelos del catálogo de kind `image` y
`svg` en formato OpenAI. `POST /v1/images/generations` recibe
`{model, prompt, n, size, response_format}`, traduce `size`→`aspect`,
`X-Davinci-Confirm: true`→`confirm`, encola con source `api`, espera a que
el job termine (sin timeout propio) y responde
`{created, data:[{url}]}` con URL absoluta según el header `Host`, o
`b64_json` si se pidió. Errores en formato OpenAI:
`{error:{message, type, code}}` con el mismo status.

Done when: `node --test test/openai.test.mjs` pasa usando el SDK HTTP a mano
(fetch) con la forma exacta del SDK de OpenAI: genera con
`fal/flux-schnell` y la URL devuelta descarga el archivo; `b64_json`
funciona; modelo desconocido → 400 formato OpenAI; costo alto sin header →
402.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Adaptador de formato sobre piezas existentes.
- **Dependencies**: F2.1.T2
- **Files**:
  - `src/server/routes/openai.mjs`
  - `test/openai.test.mjs`

## F2.4 — Package: administración de proveedores

### F2.4.T1 — Estado y keys de proveedores

Crear `src/core/providers-status.mjs`: por cada proveedor (openai, gemini,
fal, kie, heygen, elevenlabs, tripo) → `{ id, status, source, keyHint,
error? }`. `source` sale de dónde cargó la key `utils/secrets.mjs` (env,
`dotenv:<ruta>`, `infisical`); si hace falta, extender `secrets.mjs` para
que reporte el origen por key sin cambiar su API actual. `keyHint` =
`…` + últimos 4 caracteres; la key completa nunca sale de este módulo.
`testProvider(id)`: llamada barata real (openai `GET /v1/models`, gemini
listar modelos, fal un `GET` autenticado a la cola, kie consulta de
créditos, heygen `listVoices`, elevenlabs `listVoices`, tripo
`getBalance`) → `connected` o `error` con mensaje. `saveKey(id, key)`:
escribir/reemplazar la línea en `~/.config/da-vinci/.env` (crear con modo
`600`, conservar otras líneas), actualizar `process.env` y devolver el estado
tras `testProvider`.

Done when: `node --test test/providers.test.mjs` pasa con `HOME` temporal y
`fetch` mockeado: sin key → `missing`, `saveKey` crea el archivo con modo
600 y no pisa otras keys, `keyHint` nunca contiene la key completa, un 401
en el test → `error`.

- **Model**: claude/opus
- **Estimate**: 3h
- **Reason**: Maneja secretos y permisos de archivo; vale el tier premium.
- **Dependencies**:
- **Files**:
  - `src/core/providers-status.mjs`
  - `src/utils/secrets.mjs`
  - `test/providers.test.mjs`

### F2.4.T2 — Rutas /api/providers

Llenar `src/server/routes/providers.mjs`: `GET /api/providers`,
`PUT /api/providers/:id/key` (`{key}` no vacío, si no 400),
`POST /api/providers/:id/test`, usando `providers-status.mjs`. Proveedor
desconocido → 404.

Done when: `node --test test/providers-routes.test.mjs` pasa cubriendo las
tres rutas y verificando que ninguna respuesta contiene la key completa.

- **Model**: claude/claude-haiku-4-5
- **Estimate**: 1h
- **Reason**: Tres rutas finas sobre un módulo ya probado.
- **Dependencies**: F2.4.T1, F2.1.T1
- **Files**:
  - `src/server/routes/providers.mjs`
  - `test/providers-routes.test.mjs`

## F2.5 — Package: prueba de punta a punta

### F2.5.T1 — Smoke test del servidor

Crear `test/e2e.test.mjs`: arranca `startServer` en puerto 0 con
`DAVINCI_HOME` temporal y `fetch` de proveedores mockeado; genera una imagen
por `POST /api/generations`, espera el evento `job` `done` por SSE, genera
un video con `inputs:[{id}]` de esa imagen, verifica el linaje en
`GET /api/library/:id`, genera por `/v1/images/generations`, y comprueba
`GET /api/spend` suma los tres costos. Además corre el CLI contra la misma
`DAVINCI_HOME` y verifica que su generación aparece en `GET /api/library`.

Done when: `npm test` pasa entero incluyendo `test/e2e.test.mjs`.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 2h
- **Reason**: Test de integración sobre piezas terminadas.
- **Dependencies**: F2.1.T3, F2.3.T1, F2.4.T2
- **Files**:
  - `test/e2e.test.mjs`
