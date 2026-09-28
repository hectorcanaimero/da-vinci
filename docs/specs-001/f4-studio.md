---
type: spec
project_id: da-vinci
phase: 4
version: 0.1
depends_on:
  - docs/arch/001-studio.md
consumed_by:
  - orch-atomizer
generated_by: orch-spec
generated_at: 2026-09-25
title: Studio
---

# F4 — Studio

Generar y encadenar assets desde el dashboard. Contratos:
docs/arch/001-studio.md, *Interfaces → HTTP* (`/api/models`,
`/api/estimate`, `/api/generations`) y *Dashboard: rutas del SPA*
(`/studio?kind=&model=&input=<id>&prompt=`). Mismas reglas de UI que F3.

## F4.1 — Package: Studio

### F4.1.T1 — Formulario de generación con costo

Página `ui/src/pages/Studio/`: selector de tipo (image, svg, video,
model-3d, audio, sfx, avatar-video, bg-remove, upscale); por tipo, solo los
campos que aplican (prompt/text/script, aspecto, duración, calidad, n,
voz — de `/api/...` si existe o campo libre —, textura/PBR, estilo, motor de
upscale); selector de modelo con "Auto" primero y los de `GET
/api/models?kind=` (deshabilitados si `available: false`, con aviso "sin
key" y link a `/providers`). Estimación en vivo con `POST /api/estimate`
(debounce 400 ms): costo, nivel y candidatos de fallback. Enviar: si el
nivel es `confirm`, diálogo de confirmación que reenvía con `confirm: true`;
`budget_exceeded` se muestra con el tope. Tras enviar, el trabajo aparece en
la bandeja y el formulario queda listo para otra generación. Cuando el job
termina, mostrar el resultado debajo con link al detalle.

Done when: `npm run build:ui` pasa y, con el servidor y proveedores
mockeados o reales, se genera una imagen con modelo Auto, el costo mostrado
antes de enviar es igual al de `davinci image --dry-run` con los mismos
parámetros, y un video de costo alto pide confirmación.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: Formulario dinámico con varios estados; estándar.
- **Dependencies**: F3.1.T2
- **Files**:
  - `ui/src/pages/Studio/`

### F4.1.T2 — Inputs desde la biblioteca y precarga

`ui/src/components/AssetPicker.tsx`: diálogo que reutiliza la API de
`/api/library` (búsqueda + filtro por tipo) para elegir uno o varios assets,
y también acepta una URL. Integrarlo en Studio para los tipos que aceptan
inputs (`acceptsInputs` del modelo): mostrar los elegidos como miniaturas
quitables y enviarlos como `inputs:[{id}|{url}]`. Studio lee la query
`kind`, `model`, `input` (repetible) y `prompt` al montar y se precarga.

Done when: `npm run build:ui` pasa y abrir
`/studio?kind=video&input=<id-de-imagen>&prompt=hola` muestra el formulario
de video con la imagen elegida y el prompt; generar deja el video como hijo
de la imagen en su detalle.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Componente de selección más cableado de query.
- **Dependencies**: F4.1.T1
- **Files**:
  - `ui/src/components/AssetPicker.tsx`
  - `ui/src/pages/Studio/`

## F4.2 — Package: acciones de encadenamiento

### F4.2.T1 — Acciones desde el detalle

`ui/src/pages/Asset/Actions.tsx`, montado en el `data-slot="actions"` del
detalle: Regenerar (mismo pedido: `kind`, `model`, `prompt`, params e
inputs, directo a `POST /api/generations` con confirmación si hace falta),
Variar prompt (abre Studio precargado), y según el tipo del asset: imagen →
"Animar (video)", "Modelo 3D", "Quitar fondo", "Upscale"; SVG → "Rasterizar
a imagen" solo si algún modelo lo soporta, si no, ocultar; video, audio y 3D
solo Regenerar/Variar. Cada acción de encadenamiento es un link a
`/studio?kind=…&input=<id>`.

Done when: `npm run build:ui` pasa y desde el detalle de una imagen, "Animar
(video)" abre Studio con la imagen cargada y "Regenerar" crea un nuevo job
con el mismo prompt y modelo.

- **Model**: claude/claude-haiku-4-5
- **Estimate**: 2h
- **Reason**: Botones y links sobre piezas existentes.
- **Dependencies**: F3.3.T2
- **Files**:
  - `ui/src/pages/Asset/Actions.tsx`
  - `ui/src/pages/Asset/index.tsx`
