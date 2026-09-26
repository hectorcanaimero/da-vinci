---
type: spec
project_id: da-vinci
phase: 3
version: 0.1
depends_on:
  - docs/arch/001-studio.md
consumed_by:
  - orch-atomizer
generated_by: orch-spec
generated_at: 2026-09-25
title: Library en el dashboard
---

# F3 — Library en el dashboard

El dashboard (Vite + React + TypeScript en `ui/`, compilado a `dist/ui/`) con
la sección Library y el detalle de cada asset. Contratos:
docs/arch/001-studio.md, *Interfaces → HTTP* y *Interfaces → Dashboard: rutas
del SPA*; decisiones D5, D6 y D11. Reglas comunes: sin librería de
componentes ni CSS framework, CSS propio con variables en `:root` y tema
claro/oscuro por `prefers-color-scheme`; accesible con teclado; responsive
desde 360 px; textos en español en constantes (preparados para traducir);
el dashboard habla solo con `/api/*` y `/files/*`.

## F3.1 — Package: shell del dashboard

### F3.1.T1 — Proyecto Vite y build

Crear el proyecto en `ui/` (Vite, React, TypeScript estricto,
`react-router-dom`). `vite build` escribe en `../dist/ui` con `base: '/'`;
en dev, proxy de `/api`, `/v1` y `/files` a `http://127.0.0.1:20130`.
`App.tsx` registra todas las rutas del SPA apuntando a páginas stub
(`ui/src/pages/{Library,Asset,Studio,Providers,Spend}/index.tsx`, cada una
con un título), `Layout.tsx` con navegación lateral (colapsa a barra
inferior en móvil) y un stub `ui/src/components/JobsTray.tsx`. `styles.css`
con los tokens de color, tipografía y espaciado.

En el `package.json` raíz: scripts `build:ui` (`npm --prefix ui ci && npm
--prefix ui run build`) y `prepublishOnly` (`npm run build:ui && npm test`),
`files` con `src/`, `dist/ui/`, `SKILL.md`, `install.mjs`, `README*.md`,
`LICENSE`, `.env.example`, `docs/references/`. En `.gitignore`: `dist/` y
`ui/node_modules/`.

Done when: `npm run build:ui` termina sin errores ni warnings de TS,
`npm --prefix ui run preview` muestra el dashboard y las 5 rutas navegan
(incluido recargar en `/spend`), y `npm pack --dry-run` lista
`dist/ui/index.html` y no lista `ui/`. No depende del servidor: que
`davinci serve` sirva `dist/ui` lo verifica F3.1.T2.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Scaffolding de front estándar.
- **Dependencies**:
- **Files**:
  - `ui/package.json`
  - `ui/package-lock.json`
  - `ui/tsconfig.json`
  - `ui/vite.config.ts`
  - `ui/index.html`
  - `ui/src/main.tsx`
  - `ui/src/App.tsx`
  - `ui/src/styles.css`
  - `ui/src/components/Layout.tsx`
  - `ui/src/components/JobsTray.tsx`
  - `ui/src/pages/Library/index.tsx`
  - `ui/src/pages/Asset/index.tsx`
  - `ui/src/pages/Studio/index.tsx`
  - `ui/src/pages/Providers/index.tsx`
  - `ui/src/pages/Spend/index.tsx`
  - `package.json`
  - `.gitignore`

### F3.1.T2 — Cliente de API, SSE y bandeja de trabajos

`ui/src/types.ts`: tipos TS de `Generation`, `Job`, `Estimate`,
`GenerationRequest`, `ModelInfo`, `ProviderStatus`, `SpendRow` copiados
de *Interfaces*. `ui/src/api.ts`: una función por ruta de `/api`, que lanza
`ApiError{code,status,message,details}`, manda `Authorization` si hay
token guardado y `X-Davinci-Source: dashboard`; helper `fileUrl(id)` que
agrega `?key=` cuando hay token. `ui/src/sse.ts`: hook `useServerEvents`
con reconexión automática y un store mínimo (sin librerías) de jobs
activos. `JobsTray.tsx`: botón con contador de trabajos en curso y panel con
cada trabajo (tipo, modelo, estado, error, link al asset al terminar);
sobrevive recargas pidiendo `GET /api/jobs?status=queued,running` al
montar. `ApiKeyGate.tsx`: si una llamada da 401, pide la API key, la guarda
en `localStorage` (con try/catch) y reintenta. Montar ambos en
`Layout.tsx`/`App.tsx`.

Done when: `npm run build:ui` pasa sin errores de TS,
`node src/generate.mjs serve --no-open` sirve el dashboard en `/` (recargar
en `/spend` también funciona) y, con el servidor corriendo, lanzar un job con `curl` a `POST /api/generations` hace aparecer
el trabajo en la bandeja y pasar a "listo" sin recargar.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Capa de datos del front sobre contrato fijo.
- **Dependencies**: F3.1.T1, F2.1.T3
- **Files**:
  - `ui/src/types.ts`
  - `ui/src/api.ts`
  - `ui/src/sse.ts`
  - `ui/src/components/JobsTray.tsx`
  - `ui/src/components/ApiKeyGate.tsx`
  - `ui/src/components/Layout.tsx`
  - `ui/src/App.tsx`

## F3.2 — Package: Library

### F3.2.T1 — Grilla, búsqueda y filtros

Página Library en `ui/src/pages/Library/`: grilla responsive de tarjetas
(miniatura con `loading="lazy"`; video con `preload="metadata"` y play al
hover; audio/sfx con ícono y reproductor al abrir; GLB y SVG con ícono o
`<img>`), en cada tarjeta prompt truncado, modelo, costo estimado, fecha
relativa y estrella de favorito (`PATCH`). Barra con búsqueda (debounce
250 ms), filtros por tipo, proveedor, modelo (de `GET /api/models`),
proyecto (de `GET /api/projects`), rango de fechas y solo favoritos; el
estado de filtros vive en la query string. Scroll infinito con
`nextCursor`. Se agregan arriba las generaciones nuevas que llegan por SSE
si coinciden con los filtros, y desaparecen las borradas. Clic en tarjeta →
`/asset/:id`. Estados vacío, cargando y error.

Done when: `npm run build:ui` pasa, y con una biblioteca de prueba de 5 000
filas (script `ui/scripts/seed.mjs` que las inserta en una
`DAVINCI_HOME` dada usando `openLibrary`) la primera página aparece en < 1 s
y buscar por texto filtra correctamente.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: UI de lista con estado; estándar.
- **Dependencies**: F3.1.T2
- **Files**:
  - `ui/src/pages/Library/`
  - `ui/scripts/seed.mjs`

## F3.3 — Package: detalle y linaje

### F3.3.T1 — Visores por tipo de asset

Componentes en `ui/src/components/viewers/`: `ImageViewer` (zoom al clic),
`SvgViewer` (como `<img>`, fondo a cuadros), `VideoViewer` (`<video
controls>`), `AudioViewer` (`<audio controls>`), `ModelViewer` (GLB con
`@google/model-viewer`, importado de forma diferida solo cuando se usa), y
`AssetViewer` que elige por `kind`/`mime`. Todos reciben
`Generation` y usan `fileUrl(id)`. Agregar `@google/model-viewer` a
`ui/package.json`.

Done when: `npm run build:ui` pasa, el chunk principal no incluye
model-viewer (verificar en el output de build), y cada visor se ve con un
archivo de ejemplo de `docs/examples/`.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 2h
- **Reason**: Componentes de presentación simples.
- **Dependencies**: F3.1.T2
- **Files**:
  - `ui/src/components/viewers/`
  - `ui/package.json`
  - `ui/package-lock.json`

### F3.3.T2 — Página de detalle con linaje

Página `ui/src/pages/Asset/index.tsx` (y componentes en esa carpeta): visor
grande con `AssetViewer`, prompt completo con botón copiar, modelo (y "pedido:
X" si `requestedModel` difiere), parámetros, costo estimado, fecha, origen,
proyecto, ruta del archivo con copiar, descargar. Linaje: padres e hijos
como miniaturas navegables; un padre borrado o externo (`input_ref` sin id)
se muestra como tal. Favorito y borrar (diálogo con opción "borrar también el
archivo"; tras borrar vuelve a Library). Dejar un contenedor
`<div data-slot="actions">` donde F4.2.T1 montará las acciones. Reacciona a
`generation` por SSE agregando hijos nuevos.

Done when: `npm run build:ui` pasa y, con el servidor y datos de prueba, se
navega de un GLB a la imagen origen y de ahí a su otro hijo; borrar un
padre deja al hijo mostrando "origen borrado".

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Página de detalle con navegación; estándar.
- **Dependencies**: F3.3.T1
- **Files**:
  - `ui/src/pages/Asset/`
