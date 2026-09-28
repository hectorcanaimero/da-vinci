---
type: spec
project_id: da-vinci
phase: 3
version: 0.1
depends_on:
  - docs/arch/002-reveron-desktop.md
consumed_by:
  - orch-atomizer
generated_by: orch-spec
generated_at: 2026-09-28
title: Generar
---

# F3 — Generar

El Estudio: control manual del router con el costo siempre a la vista. Es donde
la tesis del producto se hace visible — no se vende generar, se vende saber lo
que se está gastando mientras se gasta.

## F3.1 — Package: estudio

### F3.1.T1 — Formulario de generación y modelos sugeridos

Construir la pantalla de Estudio de `docs/layout.pen`: columna de formulario a
la izquierda, lienzo de resultado a la derecha.

El formulario tiene tipo de asset (imagen, video, SVG, voz, 3D), prompt,
modelos sugeridos y parámetros. Al cambiar el tipo, los modelos sugeridos
cambian: salen de `GET /api/models`, que ya devuelve el catálogo filtrado por
proveedor con llave válida (FR-11). El usuario puede forzar cualquiera de los
propuestos en vez del primero.

Los parámetros que se muestran dependen del tipo y del modelo elegido; no
inventar parámetros que el catálogo no declare.

Done when: cambiar el tipo de asset cambia la lista de modelos sugeridos;
sin llave de un proveedor, ninguno de sus modelos aparece; y generar dispara
`POST /api/generations` con el modelo y los parámetros que la pantalla muestra.


**Referencia visual:** `docs/design/estudio.png` — comparar contra la
imagen antes de dar la tarea por terminada. Colores y tipografias salen de
`ui/src/styles/tokens.css` por nombre, nunca leidos de la captura.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: Pantalla central del producto, con estado que depende del catálogo y del tipo elegido.
- **Dependencies**: F1.5.T2
- **Files**:
  - `ui/src/pages/Studio/index.tsx`
  - `ui/src/pages/Studio/ModelPicker.tsx`
  - `ui/src/pages/Studio/Params.tsx`

### F3.1.T2 — Lienzo de resultado y cola del estudio

Completar la mitad derecha del Estudio: el lienzo que muestra el asset
generado y la tira de trabajos recientes debajo.

El lienzo muestra el resultado con las acciones de la barra superior del diseño
(favorito, copiar, descargar, abrir carpeta, derivar, borrar); las que dependen
del sistema de archivos se conectan en F4.3.T1 y acá quedan deshabilitadas con
su lugar hecho. La tira de trabajos se alimenta del flujo de eventos que
`ui/src/sse.ts` ya maneja.

Done when: generar muestra el resultado en el lienzo sin recargar, y los
cambios de estado del trabajo aparecen en la tira en vivo.


**Referencia visual:** `docs/design/estudio.png` — comparar contra la
imagen antes de dar la tarea por terminada. Colores y tipografias salen de
`ui/src/styles/tokens.css` por nombre, nunca leidos de la captura.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Reusa el cliente de eventos existente; el trabajo es de presentación.
- **Dependencies**: F3.1.T1
- **Files**:
  - `ui/src/pages/Studio/Canvas.tsx`
  - `ui/src/pages/Studio/JobStrip.tsx`

## F3.2 — Package: barrera de costo

### F3.2.T1 — Umbral de confirmación y tope diario

Agregar a `src/core/config.mjs` los valores que gobiernan el gasto: umbral por
encima del cual una generación pide confirmación (FR-17) y tope de gasto diario
(FR-32), con sus defaults.

Hacer que el servidor los aplique: una generación por encima del umbral
responde pidiendo confirmación explícita en vez de ejecutarse, y con el tope
diario alcanzado responde bloqueado **sin llamar a ningún proveedor**. El gasto
del día sale de la biblioteca, que ya lo registra.

Extender `POST /api/estimate` con el modo de sólo estimar del FR-18: calcula el
costo sin llamar a nadie, sin registrar gasto y sin crear ningún asset.

Done when: tests de `node --test` cubren los tres casos — por debajo del umbral
ejecuta directo, por encima exige confirmación, con el tope alcanzado bloquea; y
el modo de sólo estimar no deja rastro en la biblioteca ni en el gasto.

- **Model**: claude/opus
- **Estimate**: 4h
- **Reason**: Es la barrera que decide si se gasta plata del usuario; los casos límite tienen que estar cerrados.
- **Dependencies**: F2.2.T2
- **Files**:
  - `src/core/config.mjs`
  - `src/server/routes/api.mjs`
  - `test/cost-gate.test.mjs`

### F3.2.T2 — Barrera de costo en la interfaz

Construir `ui/src/components/CostGate.tsx`, el componente que muestra el costo
antes de cada generación y pide confirmación cuando corresponde.

Muestra costo estimado de la acción, gasto acumulado del día, tope, y la barra
de presupuesto de `docs/layout.pen`. Por encima del umbral abre la
confirmación; con el tope alcanzado deshabilita generar y explica por qué.
Es el mismo componente que usa el Chat (F5.2.T2), así que vive en
`components/`.

Done when: una generación por debajo del umbral se ejecuta sin interrupción,
una por encima abre la confirmación con el costo real, y alcanzado el tope el
botón de generar queda deshabilitado con el motivo visible.


**Referencia visual:** `docs/design/estudio.png` — comparar contra la
imagen antes de dar la tarea por terminada. Colores y tipografias salen de
`ui/src/styles/tokens.css` por nombre, nunca leidos de la captura.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Componente compartido, simple, pero es lo que el usuario mira antes de cada gasto.
- **Dependencies**: F3.2.T1, F3.1.T1
- **Files**:
  - `ui/src/components/CostGate.tsx`

## F3.3 — Package: referencias

### F3.3.T1 — Adjuntar referencias a una generación

Implementar el adjuntado de referencias del FR-19: arrastrar archivos del
sistema, elegir un asset de la biblioteca, o pegar una URL.

Dos componentes: `RefDrop.tsx` es la zona de arrastre con la lista de
referencias adjuntas y su acción de quitar; `AssetPicker.tsx` —que ya existe en
el repo— se adapta para elegir de la biblioteca en vez de reescribirse.

El selector de archivos del sistema usa el plugin de diálogos de Tauri, no un
`input` de archivo: la app tiene que abrir el diálogo nativo. Agregar
`dialog:default` a la capability.

Done when: las tres formas de adjuntar dejan la referencia en la lista, quitarla
la saca, y la generación viaja al proveedor con las referencias adjuntas para
los modelos que las soportan.


**Referencia visual:** `docs/design/estudio.png` — comparar contra la
imagen antes de dar la tarea por terminada. Colores y tipografias salen de
`ui/src/styles/tokens.css` por nombre, nunca leidos de la captura.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3.5h
- **Reason**: Tres orígenes distintos de entrada y un permiso de Tauri nuevo que hay que declarar.
- **Dependencies**: F3.1.T1
- **Files**:
  - `ui/src/components/RefDrop.tsx`
  - `ui/src/components/AssetPicker.tsx`
  - `src-tauri/capabilities/default.json`
