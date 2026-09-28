---
type: spec
project_id: da-vinci
phase: 4
version: 0.1
depends_on:
  - docs/arch/002-reveron-desktop.md
consumed_by:
  - orch-atomizer
generated_by: orch-spec
generated_at: 2026-09-28
title: La biblioteca
---

# F4 — La biblioteca

Lo que hace que el usuario se quede: miles de assets con su prompt, su costo y
sus derivados, en su disco, cada uno sirviendo de referencia para el siguiente.

## F4.1 — Package: galería

### F4.1.T1 — Grilla, lista, búsqueda y filtros

Construir la galería de `docs/layout.pen`: alternancia entre grilla y lista,
búsqueda por prompt, modelo o proyecto, y filtros por tipo de asset y favoritos.

Todo sale de `GET /api/library`, que ya acepta filtros y paginado por cursor.
La barra superior lleva la ruta de la carpeta de assets, el buscador y los
filtros; el pie muestra el conteo y el peso en disco.

Reusar la página que ya existe en `ui/src/pages/Library/` en vez de empezar de
cero: cambia el sistema visual y se agregan la vista de lista y los filtros por
tipo, no la lógica de datos.

Done when: buscar un fragmento de prompt deja sólo los assets que lo contienen,
cada filtro acota como corresponde, y alternar entre grilla y lista conserva la
búsqueda y los filtros activos.


**Referencia visual:** `docs/design/galeria.png · galeria-lista.png` — comparar contra la
imagen antes de dar la tarea por terminada. Colores y tipografias salen de
`ui/src/styles/tokens.css` por nombre, nunca leidos de la captura.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: Reestilado más funciones nuevas sobre una página existente que ya resuelve los datos.
- **Dependencies**: F1.5.T2
- **Files**:
  - `ui/src/pages/Library/index.tsx`
  - `ui/src/pages/Library/Filters.tsx`
  - `ui/src/pages/Library/ListView.tsx`

### F4.1.T2 — Estado vacío y listas largas

Dos cosas que la galería necesita en los extremos.

El estado vacío del FR-23: sin assets, la pantalla ofrece generar el primero en
vez de mostrar una grilla vacía, con el texto y la acción de `docs/layout.pen`.

Las listas largas del NFR-7: la galería tiene que seguir fluida con al menos
5.000 assets. Virtualizar el renderizado de la grilla y de la lista. No agregar
dependencias si se puede resolver con un observador de intersección y el
paginado por cursor que la API ya ofrece.

Done when: sin assets aparece el estado vacío con su acción; con 5.000 registros
sembrados, desplazarse por la galería no traba la interfaz y la memoria no crece
sin techo.


**Referencia visual:** `docs/design/galeria-vacia.png` — comparar contra la
imagen antes de dar la tarea por terminada. Colores y tipografias salen de
`ui/src/styles/tokens.css` por nombre, nunca leidos de la captura.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: La virtualización tiene que medirse contra un caso real, no asumirse.
- **Dependencies**: F4.1.T1
- **Files**:
  - `ui/src/pages/Library/EmptyState.tsx`
  - `ui/src/components/VirtualGrid.tsx`

## F4.2 — Package: detalle y linaje

### F4.2.T1 — Detalle del asset con visores y metadatos

Construir la pantalla de detalle de `docs/layout.pen`: visor a la izquierda,
panel de datos a la derecha con prompt completo, metadatos, archivo en disco y
navegación entre assets.

Los visores por tipo ya existen en `ui/src/components/viewers/`: imagen, video,
SVG, audio y 3D con `@google/model-viewer`. Se reestilan, no se reescriben.

Done when: cada tipo de asset abre en su visor correspondiente, el panel muestra
prompt, modelo, proveedor, costo, parámetros y ruta en disco, y las flechas
navegan al asset anterior y siguiente sin volver a la galería.


**Referencia visual:** `docs/design/detalle-asset.png` — comparar contra la
imagen antes de dar la tarea por terminada. Colores y tipografias salen de
`ui/src/styles/tokens.css` por nombre, nunca leidos de la captura.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: Cinco tipos de asset con su visor, sobre componentes que ya funcionan.
- **Dependencies**: F1.5.T2
- **Files**:
  - `ui/src/pages/Asset/index.tsx`
  - `ui/src/pages/Asset/MetaPanel.tsx`
  - `ui/src/components/viewers/index.tsx`

### F4.2.T2 — Linaje y usar como referencia

Completar el detalle con lo que convierte la biblioteca en un lugar de trabajo
y no en una carpeta.

El linaje del FR-21: mostrar de qué asset salió este y qué assets salieron de
él. La tabla `generation_inputs` ya resuelve la relación en ambas direcciones;
sólo hay que pedirla y mostrarla, con navegación a cada extremo.

El FR-22: la acción de usar como referencia deja el asset adjunto en el
formulario de generación **sin que el usuario copie ninguna ruta**, reusando el
componente de referencias de F3.3.T1.

Done when: un asset derivado muestra su origen y el origen muestra sus
derivados, ambos navegables; y usar como referencia lleva al Estudio con el
asset ya adjunto.


**Referencia visual:** `docs/design/detalle-asset.png` — comparar contra la
imagen antes de dar la tarea por terminada. Colores y tipografias salen de
`ui/src/styles/tokens.css` por nombre, nunca leidos de la captura.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: La relación ya está en la base; el trabajo es de presentación y de encadenar dos pantallas.
- **Dependencies**: F4.2.T1, F3.3.T1
- **Files**:
  - `ui/src/pages/Asset/Lineage.tsx`

## F4.3 — Package: acciones de archivo

### F4.3.T1 — Abrir en el explorador y borrar con confirmación

Las dos acciones que tocan el disco del usuario.

Abrir en el explorador (FR-24): completar `reveal_in_files` en
`src-tauri/src/platform.rs` para que abra Finder en macOS, el Explorador en
Windows y el gestor de archivos en Linux, **seleccionando el archivo**, no sólo
la carpeta. Declarar el permiso del plugin de apertura acotado a la carpeta de
assets; no dar acceso a todo el disco.

Borrar (FR-23 y FR-48): la confirmación dice exactamente qué se borra —cuántos
registros y si además se eliminan los archivos— antes de hacer nada. La
destrucción de toda la biblioteca exige confirmación escrita, no un botón.

Done when: la acción abre el explorador con el archivo seleccionado en los tres
sistemas; borrar un asset pide confirmación nombrando lo que elimina; y la
acción destructiva de Ajustes no se dispara sin texto confirmado.


**Referencia visual:** `docs/design/galeria-borrar.png` — comparar contra la
imagen antes de dar la tarea por terminada. Colores y tipografias salen de
`ui/src/styles/tokens.css` por nombre, nunca leidos de la captura.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Toca el sistema de archivos del usuario en tres sistemas operativos y una de las acciones es irreversible.
- **Dependencies**: F1.5.T1, F4.1.T1
- **Files**:
  - `src-tauri/src/platform.rs`
  - `ui/src/components/ConfirmDelete.tsx`
