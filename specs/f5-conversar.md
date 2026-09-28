---
type: spec
project_id: da-vinci
phase: 5
version: 0.1
depends_on:
  - docs/arch/002-reveron-desktop.md
consumed_by:
  - orch-atomizer
generated_by: orch-spec
generated_at: 2026-09-28
title: Conversar
---

# F5 — Conversar

El Chat: generar hablando con un agente, con el mismo control de costo y la
misma biblioteca que el resto. Es el diferencial del producto (A2 del PRD) y la
única parte que depende de software que no controlamos.

## F5.1 — Package: puente del agente

### F5.1.T1 — Detección de agentes instalados

Completar `agent_detect()` en `src-tauri/src/agent.rs` según *Components →
tauri/agent* del arch.

Buscar binarios de agente en el `PATH` y en las rutas habituales de cada
sistema operativo, devolviendo por cada uno: nombre, ruta, versión si se puede
obtener barato, y si está disponible. El FR-33 pide que el usuario no tenga que
escribir la ruta a mano.

La ausencia total de agentes **no es un error**: devuelve una lista vacía y la
app sigue funcionando (FR-34).

Done when: con un agente instalado, la detección lo encuentra sin configuración
previa; sin ninguno, devuelve lista vacía y ningún otro comando de la app falla.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 2.5h
- **Reason**: Exploración del sistema de archivos con diferencias por plataforma, sin lógica compleja.
- **Dependencies**: F1.1.T1
- **Files**:
  - `src-tauri/src/agent.rs`

### F5.1.T2 — Lanzamiento del agente y transmisión de su salida

Implementar `agent_send` y `agent_cancel` en `src-tauri/src/agent.rs`.

`agent_send` lanza el agente configurado como subproceso, en el directorio de
trabajo que el usuario eligió, y transmite su salida al frontend por un
`Channel` tipado. El enum de eventos es el que fija *Interfaces → Comandos
Tauri* del arch: `Chunk`, `ToolCall`, `Cost`, `Done`, `Error`, serializado con
`#[serde(tag = "event", content = "data")]`.

Dos cosas que no son negociables:

- **Validar la ruta del binario contra la que el usuario configuró antes de
  ejecutar.** La decisión D8 saca el permiso de shell del frontend justo para
  que el único camino a ejecutar un proceso sea este, con argumentos tipados.
- `agent_cancel` corta el subproceso siempre, incluso si dejó de responder.

Done when: enviar un mensaje devuelve la salida del agente en trozos a medida
que llega, no al final; cancelar termina el subproceso y libera el canal; y un
agente que muere a mitad emite `Error` en vez de dejar la interfaz colgada.

- **Model**: claude/opus
- **Estimate**: 4h
- **Reason**: Subproceso con transmisión incremental y cancelación, y es la superficie de ejecución de la app: tiene que quedar cerrada.
- **Dependencies**: F5.1.T1
- **Files**:
  - `src-tauri/src/agent.rs`

## F5.2 — Package: chat

### F5.2.T1 — Hilo y composer

Construir la pantalla de Chat de `docs/layout.pen`: encabezado con el agente
elegido, hilo de mensajes, y composer abajo.

El hilo alterna mensajes del usuario y del agente; los del agente muestran
texto, llamadas a herramientas y resultados, alimentados por el `Channel` de
F5.1.T2 a medida que llegan. El composer lleva las referencias adjuntas
—reusando el componente de F3.3.T1—, los intents (imagen, video, SVG, voz, 3D),
el modelo elegido y el botón de generar.

Done when: escribir un mensaje muestra la respuesta del agente apareciendo de a
poco; adjuntar un asset de la biblioteca lo manda como referencia; y un asset
generado desde el chat aparece en la galería con su prompt y su costo (FR-35).


**Referencia visual:** `docs/design/chat.png` — comparar contra la
imagen antes de dar la tarea por terminada. Colores y tipografias salen de
`ui/src/styles/tokens.css` por nombre, nunca leidos de la captura.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: La pantalla más densa del diseño, sobre un puente que ya está resuelto.
- **Dependencies**: F5.1.T2, F3.3.T1
- **Files**:
  - `ui/src/pages/Chat/index.tsx`
  - `ui/src/pages/Chat/Thread.tsx`
  - `ui/src/pages/Chat/Composer.tsx`

### F5.2.T2 — Costo de sesión y ausencia del agente

Los dos bordes del Chat.

El costo (FR-36): el encabezado muestra el gasto acumulado de la sesión, y
antes de ejecutar una generación se muestra su costo estimado. Por encima del
umbral, la confirmación es la misma barrera de F3.2.T2 — no una segunda
implementación.

La ausencia (FR-34): sin ningún agente detectado, la pantalla explica cuál
instalar y cómo, con el enlace correspondiente, y **el resto de la app sigue
funcionando normalmente**. No es un error ni un bloqueo: es un estado.

Done when: el costo de la sesión acumula a medida que se generan assets; una
generación cara pide confirmación también desde el chat; y con el agente
desinstalado, la pantalla muestra la guía y las otras cinco pantallas funcionan.


**Referencia visual:** `docs/design/chat.png` — comparar contra la
imagen antes de dar la tarea por terminada. Colores y tipografias salen de
`ui/src/styles/tokens.css` por nombre, nunca leidos de la captura.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Reusa la barrera de costo ya construida; el estado de ausencia es simple pero fácil de olvidar.
- **Dependencies**: F5.2.T1, F3.2.T2
- **Files**:
  - `ui/src/pages/Chat/SessionCost.tsx`
  - `ui/src/pages/Chat/NoAgent.tsx`

## F5.3 — Package: paleta de comandos

### F5.3.T1 — Paleta de comandos

Construir la paleta de `docs/layout.pen`: un solo campo que busca a la vez
acciones, modelos, assets recientes y destinos de navegación, agrupados por
categoría (FR-39).

Cada grupo muestra lo suyo: las acciones con su atajo, los modelos con su costo,
los assets con su miniatura y su modelo, los destinos con su contador. El pie
muestra las teclas de navegación y el presupuesto disponible del día.

Los atajos se dibujan con los símbolos del sistema en curso (FR-40), tomando el
modificador de `platform_info()`: nunca mostrar `⌘` en Windows o Linux.

Abre con el modificador más `K`. Es un manejador de teclado dentro de la
ventana, no un atajo global del sistema: no hace falta el plugin de atajos
globales.

Done when: escribir el nombre de un modelo lo muestra con su costo; elegir un
destino navega; en Windows y Linux los atajos se dibujan con `Ctrl`.


**Referencia visual:** `docs/design/command-palette.png` — comparar contra la
imagen antes de dar la tarea por terminada. Colores y tipografias salen de
`ui/src/styles/tokens.css` por nombre, nunca leidos de la captura.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: Busca sobre cuatro orígenes distintos y tiene que responder al instante.
- **Dependencies**: F1.5.T1, F1.5.T2
- **Files**:
  - `ui/src/components/CommandPalette.tsx`
