---
type: spec
project_id: da-vinci
phase: 6
version: 0.1
depends_on:
  - docs/arch/002-reveron-desktop.md
consumed_by:
  - orch-atomizer
generated_by: orch-spec
generated_at: 2026-09-28
title: Controlar
---

# F6 — Controlar

La cola que sobrevive al cierre, el gasto que se puede auditar y las siete
secciones de Ajustes. Es la fase que convierte la app en algo en lo que se
confía plata.

## F6.1 — Package: cola resiliente

### F6.1.T1 — Trabajos interrumpidos, reanudar y descartar

Cambiar cómo `src/server/jobs.mjs` trata los trabajos que quedaron a medias.

Hoy, al arrancar, `library.jobs.failInterrupted()` marca como `failed` todo lo
que quedó `queued` o `running`. El FR-27 pide otra cosa: que queden
**recuperables** y que decida el usuario.

Agregar el estado `interrupted` y las operaciones de reanudar y descartar, con
la migración aditiva de esquema que describe *Data model* del arch
(`jobs.attempts` incluida, que usa F6.1.T2). Las filas viejas tienen que seguir
siendo válidas.

Cuidado con lo que se le promete al usuario: un trabajo interrumpido **no
garantiza que el proveedor no haya cobrado**. El estado dice que quedó a medias,
no que salió gratis; el texto de la interfaz tiene que ser igual de honesto.

Done when: tests de `node --test` cierran el servidor con trabajos en cola y
corriendo, lo reabren, verifican que quedaron `interrupted` y no `failed`, que
reanudar los vuelve a ejecutar y que descartar los cierra sin ejecutarlos.

- **Model**: claude/opus
- **Estimate**: 4h
- **Reason**: Migración de esquema sobre datos existentes y semántica de trabajos que pueden haber costado plata.
- **Dependencies**:
- **Files**:
  - `src/server/jobs.mjs`
  - `src/library/db.mjs`
  - `test/jobs-resume.test.mjs`

### F6.1.T2 — Pausar la cola y reintentar con espera creciente

Dos controles sobre la cola.

Pausar y reanudar (FR-28): con la cola pausada no arranca ningún trabajo nuevo;
los que ya están corriendo terminan. La concurrencia sigue saliendo de
`config.json`, donde ya vive.

Reintento automático (FR-29): un trabajo fallido reintenta con espera creciente
—2 s, 8 s, 32 s— hasta el límite configurado, usando el contador `attempts` que
agregó F6.1.T1. Un fallo por límite de tasa del proveedor tiene que reintentar,
no darse por perdido al primer intento.

Done when: con concurrencia en 1 nunca hay dos trabajos a la vez; pausada, la
cola no arranca nada nuevo; y un proveedor que devuelve límite de tasa provoca
reintentos con las esperas esperadas antes de rendirse.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Lógica de cola acotada sobre la base que dejó la tarea anterior.
- **Dependencies**: F6.1.T1, F3.2.T1
- **Files**:
  - `src/server/jobs.mjs`
  - `src/core/config.mjs`

### F6.1.T3 — Rutas de la cola

Exponer por HTTP las operaciones de F6.1.T1 y F6.1.T2, tal como las declara
*Interfaces → HTTP* del arch: `POST /api/jobs/:id/resume`,
`POST /api/jobs/:id/discard`, `POST /api/queue/pause` y
`POST /api/queue/resume`.

Done when: cada ruta hace lo que dice y devuelve el estado resultante del
trabajo o de la cola; reanudar un trabajo que no está interrumpido responde un
error claro en vez de ejecutarlo igual.

- **Model**: claude/claude-haiku-4-5
- **Estimate**: 2h
- **Reason**: Cuatro rutas sobre funciones ya escritas, siguiendo el patrón del resto del servidor.
- **Dependencies**: F6.1.T2, F2.2.T2
- **Files**:
  - `src/server/routes/api.mjs`

## F6.2 — Package: actividad

### F6.2.T1 — Pantalla de Actividad

Construir la pantalla de `docs/layout.pen`: banner de recuperación arriba, tira
de estadísticas, y lista de trabajos.

El banner aparece cuando hay trabajos interrumpidos y ofrece reanudarlos todos o
descartarlos, diciendo cuántos son y cuándo quedaron a medias. La tira muestra
concurrencia, cola, gasto de la sesión y presupuesto del día, con la acción de
pausar. La lista muestra cada trabajo con estado, modelo, costo y, si falló, el
mensaje real del proveedor y no un error genérico (FR-25).

Los filtros de arriba acotan por todos, activos, fallidos y listos.

Done when: cerrando la app con trabajos en cola y reabriendo, el banner aparece
con el conteo correcto; reanudar los vuelve a ejecutar en vivo; y un trabajo
fallido muestra el mensaje del proveedor.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: Pantalla con estado en vivo sobre una API ya completa.
- **Dependencies**: F6.1.T3, F1.5.T2
- **Files**:
  - `ui/src/pages/Activity/index.tsx`
  - `ui/src/pages/Activity/RecoveryBanner.tsx`
  - `ui/src/pages/Activity/JobList.tsx`

## F6.3 — Package: gastos

### F6.3.T1 — Exportación del gasto

Agregar `GET /api/spend/export`, que devuelve el gasto del período como CSV con
una fila por generación (FR-31): fecha, tipo, proveedor, modelo, costo, prompt
recortado e identificador.

Escapar correctamente los campos: los prompts traen comas, comillas y saltos de
línea, y un CSV mal escapado se rompe al abrirlo en una planilla.

Done when: un test verifica que el archivo exportado tiene una fila por
generación del período y que un prompt con comas, comillas y saltos de línea
sobrevive intacto al ir y volver.

- **Model**: claude/claude-haiku-4-5
- **Estimate**: 2h
- **Reason**: Serialización mecánica; lo único con filo es el escapado.
- **Dependencies**: F6.1.T3
- **Files**:
  - `src/server/routes/api.mjs`

### F6.3.T2 — Pantalla de Gastos

Construir la pantalla de `docs/layout.pen`: cuatro indicadores arriba, gráfico
de evolución en el medio, y tabla de desglose por modelo abajo.

Los datos salen de `GET /api/spend`, que ya existe. La suma del desglose por
modelo tiene que coincidir con el total del período (FR-30): si no coincide, es
un error de consulta, no de redondeo para tapar.

El gráfico se dibuja con SVG a mano. No agregar una librería de gráficos para
una serie temporal y un par de barras.

Done when: el total de los indicadores coincide con la suma de la tabla,
cambiar el período recalcula todo, y exportar descarga el CSV de F6.3.T1.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: Presentación de datos con un gráfico propio; la consistencia de los totales es lo que hay que verificar.
- **Dependencies**: F6.3.T1, F1.5.T2
- **Files**:
  - `ui/src/pages/Spend/index.tsx`
  - `ui/src/pages/Spend/Chart.tsx`
  - `ui/src/pages/Spend/ModelTable.tsx`

## F6.4 — Package: ajustes

### F6.4.T1 — Ajustes: navegación, proveedores, agentes y almacenamiento

Construir la cáscara de Ajustes con su navegación lateral de siete secciones
(FR-41), donde cada una es alcanzable en un clic desde cualquier otra, y las
tres primeras.

**Proveedores**: el origen de los secretos —llavero, archivo, gestor externo—
según lo que reporte `secrets_list`, y la lista de proveedores reusando el
componente de F2.3.T1. El texto de seguridad tiene que decir la verdad sobre
dónde quedaron guardadas en esta máquina, no repetir el texto del diseño si el
respaldo está en uso.

**Agentes**: elección del agente detectado por F5.1.T1, binario, modelo, modo de
permisos y directorio de trabajo, que tiene que ser visible y modificable
(FR-38).

**Almacenamiento**: carpeta de assets, configurable y abrible desde la app
(FR-46), con el selector de directorio nativo.

Done when: las siete secciones son navegables, cambiar la carpeta de assets hace
que las generaciones nuevas aterricen ahí, y el directorio de trabajo del agente
se ve y se cambia.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: Tres secciones sobre componentes y comandos ya construidos.
- **Dependencies**: F2.3.T1, F5.1.T1
- **Files**:
  - `ui/src/pages/Settings/index.tsx`
  - `ui/src/pages/Settings/Providers.tsx`
  - `ui/src/pages/Settings/Agents.tsx`
  - `ui/src/pages/Settings/Storage.tsx`

### F6.4.T2 — Ajustes: servidor, presupuesto, apariencia y avanzado

Las cuatro secciones restantes.

**Servidor y API**: estado, reinicio y detención con los comandos de F1.3.T3;
host y puerto; exposición en la red local, que exige acción explícita y muestra
la advertencia de que otros equipos generarían con las llaves del usuario
(FR-42); llave del API regenerable; y el interruptor del endpoint compatible con
OpenAI con el ejemplo de código copiable (FR-43).

**Presupuesto**: tope diario y umbral de confirmación de F3.2.T1, con el
medidor del día.

**Apariencia**: tema que sigue al sistema y se puede forzar (FR-47), acento,
densidad, tipografía y reducción de movimiento. Sólo el tema oscuro tiene
valores; los otros dos quedan visibles pero deshabilitados con su motivo, que es
lo que el A7 del PRD reconoce como deuda de diseño.

**Avanzado**: reintentos y tiempo de espera, migración desde Da Vinci reusando
F2.2.T2, nivel de registro, y la zona de peligro con la confirmación escrita de
F4.3.T1.

Done when: exponer en la red exige confirmación y deja el servidor accesible con
la llave; apagar el endpoint compatible hace que `/v1` deje de responder; y
cambiar el tema del sistema con la app abierta la hace acompañar.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: Cuatro secciones que atan comandos y configuración ya existentes; la exposición en red es la única con filo de seguridad.
- **Dependencies**: F6.4.T1, F1.3.T3, F3.2.T1, F4.3.T1
- **Files**:
  - `ui/src/pages/Settings/Server.tsx`
  - `ui/src/pages/Settings/Budget.tsx`
  - `ui/src/pages/Settings/Appearance.tsx`
  - `ui/src/pages/Settings/Advanced.tsx`
