---
type: prd
project_id: da-vinci
version: 0.1
generated_by: orch-prd
generated_at: 2026-09-28
title: Reverón — estudio de generación visual para escritorio
---

# Reverón — estudio de generación visual para escritorio

## Problem

Da Vinci resolvió el router: elige modelo entre 32 opciones de 7 proveedores,
estima el costo antes de gastar y guarda todo en una biblioteca con linaje.
Pero vive detrás de una terminal. Para usarlo hay que tener Node instalado,
saber qué es `npm i -g`, levantar `davinci serve` a mano y dejar una pestaña
del navegador abierta contra `localhost`. Si cerrás la terminal, se muere el
servidor y con él la cola de trabajos.

Eso deja afuera a casi todo el mundo que necesita el producto. El diseñador que
quiere un hero para una landing no va a instalar Node. El desarrollador que sí
lo tiene igual paga un impuesto diario: arrancar el servidor, encontrar el
puerto, acordarse de la URL. Y nadie confía llaves de API a algo que corre en
una pestaña sin saber dónde quedan guardadas.

Mientras tanto la alternativa que la gente elige es peor pero más fácil:
suscripciones mensuales a Midjourney, ChatGPT Plus, Runway. Pagan un fijo
usen o no usen, no eligen modelo, no ven el costo por generación y los assets
quedan encerrados en la web de otro. El problema no es que falte capacidad de
generar — sobra. El problema es que **nadie te deja ver lo que estás gastando
mientras lo gastás, ni te deja llevarte lo que generaste.**

## Visión y posicionamiento

Esta sección es la tesis del producto. No es implementable; es lo que tiene que
ser verdad para que el resto valga la pena.

### El trabajo que la gente contrata

Nadie quiere "32 modelos de 7 proveedores". Eso es la ficha técnica del taladro.
El trabajo real es: **tener el asset que me falta para lo que estoy
construyendo, sin volverme experto en comprar modelos de IA.** Reverón se
contrata para eso. Todo lo que no sirva a ese trabajo es peso muerto.

### Lo que Reverón vende no es generar — es control

La capacidad de generar está comoditizada y es gratis o casi. Lo escaso es la
tranquilidad. La pérdida duele aproximadamente el doble de lo que gusta la
ganancia equivalente, y en generación con IA la pérdida es real y difusa: no
sabés qué te va a salir el video hasta que ya lo pagaste.

Por eso el **cost gate es el producto**, no una funcionalidad de Ajustes.
Cada pantalla muestra el costo antes del clic, el acumulado del día y el tope.
El diseño ya lo entendió: el sidebar tiene `$3.42/10` permanente, el composer
dice `~$0.039` antes de generar, y el paleta de comandos cierra con
`$6.58 disponibles hoy`. Eso no es decoración: es la razón por la que alguien
elige esto sobre una suscripción.

### El precio se enmarca contra la suscripción, no contra cero

Reverón no cobra nada, pero el usuario **sí paga** — directo a cada proveedor,
con su llave. Negarlo sería mentir y se nota. La honestidad acá construye más
confianza que el silencio: el onboarding dice literalmente "Reverón no cobra
nada: pagás directo a cada proveedor con tu propia llave".

El encuadre correcto no es "gratis" contra "pago", es **"pagás lo que usás"
contra "pagás $20 al mes uses o no"**. Un mes flojo en Reverón cuesta $2. En
Midjourney cuesta $10 igual. Y `$0.039` por imagen cae en una cuenta mental
distinta que `$20/mes`: el primero se compara contra el valor de esa imagen,
el segundo contra el alquiler.

### La fricción de arranque es el único enemigo real

El cuello de botella de adopción no son las funciones — sobran. Es el primer
minuto. Siete proveedores es parálisis por exceso de opciones, así que el
onboarding pide **una sola llave** (FAL solo ya cubre imagen, video y SVG) y
deja las otras seis para después. Tres pasos con barra de progreso, porque el
esfuerzo se acelera cuando se ve la meta cerca.

Y el momento que se recuerda de una app es el pico y el final. El final del
onboarding **no puede ser un formulario guardado**: tiene que ser una imagen
generada. Si el usuario cierra el wizard sin haber visto a Reverón producir
algo, el producto todavía no existe para él.

### Lo que hace que se quede

La biblioteca. Cada asset con su prompt, su costo, su modelo y sus derivados
es trabajo acumulado que no se puede llevar a otro lado. A los 1.248 assets
del usuario no los reemplaza un competidor: son suyos, están en su disco, y
cada uno sirve de referencia para el siguiente. Eso es lo que convierte una
herramienta en un lugar donde se trabaja.

Por eso la migración desde `~/.davinci` es de un clic y por eso el detalle de
asset tiene "Usar como referencia": cada generación alimenta a la próxima.

### Métrica norte

**Assets que el usuario reusa** — marcados como favoritos o usados como
referencia de otra generación. No "assets generados": generar es barato y
mide entusiasmo, no valor. Un asset reusado es un asset que sirvió.

Métrica de activación, subordinada: **porcentaje de instalaciones que llegan a
su primera generación exitosa.** Si esto es bajo, ninguna otra cosa importa.

### La tribu

Gente que no le entrega sus llaves a un SaaS. Local-first, código abierto,
las llaves cifradas en la máquina y el binario hablando sólo con los endpoints
de cada proveedor. No es una característica de seguridad: es una declaración
de a quién le pertenece esto.

## Users

- **Creador con proyectos propios (Héctor)** — genera assets para sus
  proyectos y necesita encontrarlos, reusarlos y encadenarlos meses después
  sin acordarse del prompt.
- **Desarrollador que ya usa Da Vinci por CLI** — quiere lo mismo que tiene
  hoy, pero sin levantar el servidor a mano y sin perder la cola al cerrar la
  terminal.
- **Diseñador o creador sin terminal** — necesita generar imagen, video, voz y
  3D controlando el gasto, y no va a instalar Node ni a escribir un comando.
- **Usuario de agente (Claude Code / Codex)** — ya conversa con un agente y
  quiere que ese agente genere assets sin salir de la conversación, viendo el
  costo de cada paso.

## Goals

- G1 — Un usuario sin Node instalado descarga, abre y genera su primer asset
  en menos de 5 minutos, en macOS, Windows o Linux.
- G2 — El costo de cada generación es visible antes de confirmarla, y el gasto
  acumulado del día está a la vista en todo momento sin abrir ninguna pantalla.
- G3 — Nada de lo que hoy funciona en Da Vinci se pierde: los 7 proveedores,
  el router, la biblioteca con linaje y el endpoint compatible con OpenAI
  siguen funcionando, y la biblioteca existente se migra sola.
- G4 — La cola de trabajos sobrevive a que se cierre la app: al reabrir, los
  jobs interrumpidos se pueden reanudar sin haber cobrado de más.
- G5 — Las llaves de API quedan cifradas en la máquina del usuario y nunca
  salen de ella salvo hacia el proveedor dueño de esa llave.
- G6 — El agente de chat genera assets conversando, con el mismo cost gate y
  la misma biblioteca que el resto de la app.

## Non-goals

- **Cuentas, login o backend propio.** Reverón no tiene servidor en la nube ni
  usuarios registrados. Todo vive en la máquina.
- **Cobrar por el producto.** No hay plan pago, ni tier premium, ni proxy de
  llaves. El usuario paga a los proveedores, no a nosotros.
- **Móvil.** Tauri lo permite; el diseño no lo contempla y el caso de uso no lo
  pide. Fuera de alcance.
- **Modelos propios o alojados.** Reverón rutea a proveedores; no entrena, no
  hostea, no corre inferencia local.
- **Editor de imágenes.** Se genera, se encadena y se reusa como referencia.
  Recortar, pintar o componer es trabajo de otra herramienta.
- **Colaboración multiusuario.** La biblioteca es de una persona en una
  máquina. Exponer el servidor en la red local existe, pero comparte llaves,
  no cuentas.
- **Firma y notarización en la v1.** Decisión explícita del dueño; ver
  *Assumptions* y el riesgo asociado en *Open questions*.

## Functional requirements

### Aplicación de escritorio

- **FR-1** — La aplicación se distribuye como binario nativo para macOS,
  Windows y Linux y arranca sin requerir Node, Python ni ninguna dependencia
  previa en la máquina. *Aceptación:* en una máquina limpia de cada sistema, el
  instalador deja la app abriendo hasta la pantalla principal.
- **FR-2** — La app levanta el servidor local al arrancar y lo termina al
  cerrarse, sin dejar procesos huérfanos. *Aceptación:* tras cerrar la app no
  queda ningún proceso escuchando en el puerto configurado.
- **FR-3** — La barra de título es propia de la app y respeta las convenciones
  de cada sistema operativo en posición y forma de los controles de ventana.
  *Aceptación:* en Windows los controles están a la derecha; en macOS a la
  izquierda; en ambos cierran, minimizan y maximizan.
- **FR-4** — La ventana se puede redimensionar y la interfaz sigue siendo
  usable por debajo del ancho de diseño. *Aceptación:* a 1024 px de ancho
  ninguna pantalla tiene scroll horizontal ni contenido cortado.
- **FR-5** — El estado del servidor local, el gasto del día y el tope diario
  están visibles desde cualquier pantalla sin navegar. *Aceptación:* el pie del
  panel lateral muestra dirección del servidor, indicador de vivo y
  `gastado/tope` en todas las pantallas.

### Primera vez y llaves

- **FR-6** — En el primer arranque la app guía la conexión de proveedores en
  tres pasos con progreso visible, y permite terminar con **una sola** llave
  conectada. *Aceptación:* conectando sólo FAL, el wizard deja continuar y la
  app queda operativa para imagen, video y SVG.
- **FR-7** — El onboarding termina con una generación real ejecutada por el
  usuario, no con un formulario guardado. *Aceptación:* el último paso produce
  un asset visible en la biblioteca.
- **FR-8** — Las llaves se guardan cifradas en la máquina y la interfaz dice
  dónde quedaron guardadas. *Aceptación:* las llaves no aparecen en texto plano
  en ningún archivo de configuración legible.
- **FR-9** — La app permite elegir el origen de los secretos entre almacén
  cifrado, archivo `.env` y un gestor externo, y usa el resto como respaldo.
  *Aceptación:* cambiando el origen y reiniciando, la app sigue encontrando las
  llaves.
- **FR-10** — Cada llave se puede probar contra su proveedor y la interfaz
  muestra conectado o sin llave por proveedor. *Aceptación:* con una llave
  inválida el estado pasa a error y el router deja de proponer sus modelos.
- **FR-11** — El router sólo propone modelos cuyo proveedor tiene llave válida.
  *Aceptación:* sin llave de Tripo3D, ningún flujo ofrece generación 3D.

### Migración

- **FR-12** — Al arrancar, la app detecta una biblioteca de Da Vinci existente
  e informa cuántos registros encontró. *Aceptación:* con `~/.davinci` presente,
  Ajustes muestra el conteo real de registros detectados.
- **FR-13** — La migración importa los registros y sus archivos a la biblioteca
  nueva en una acción, sin borrar el origen. *Aceptación:* tras migrar, los
  assets aparecen en la galería con prompt, modelo y costo, y `~/.davinci` sigue
  intacto.
- **FR-14** — La migración es reintentable y no duplica registros.
  *Aceptación:* correrla dos veces deja el mismo conteo que correrla una vez.

### Generar

- **FR-15** — El usuario elige tipo de asset, escribe el prompt y recibe
  modelos sugeridos por el router, pudiendo forzar otro manualmente.
  *Aceptación:* cambiando el tipo de asset, la lista de modelos sugeridos cambia.
- **FR-16** — Antes de ejecutar, la interfaz muestra el costo estimado, el
  acumulado del día y el tope. *Aceptación:* el costo mostrado coincide con lo
  registrado tras la generación, dentro del margen que declare el proveedor.
- **FR-17** — Una generación por encima del umbral configurado exige
  confirmación explícita; por debajo se ejecuta directo. *Aceptación:* con
  umbral en $0.10, una generación de $0.04 no pide confirmación y una de $0.50 sí.
- **FR-18** — Existe un modo de sólo estimar que calcula el costo sin llamar a
  ningún proveedor. *Aceptación:* en ese modo no se registra gasto ni se crea
  ningún asset.
- **FR-19** — Se pueden adjuntar referencias (archivos locales, assets de la
  biblioteca o URLs) a una generación. *Aceptación:* un asset de la biblioteca
  arrastrado al formulario queda adjunto y viaja al proveedor que lo soporta.

### Biblioteca

- **FR-20** — La galería lista todos los assets con vista de grilla y de lista,
  búsqueda por prompt, modelo o proyecto, y filtros por tipo y favoritos.
  *Aceptación:* buscando un fragmento de prompt aparecen sólo los assets que lo
  contienen.
- **FR-21** — El detalle de un asset muestra prompt completo, metadatos,
  archivo en disco y sus derivados. *Aceptación:* un asset generado a partir de
  otro muestra el vínculo en ambas direcciones.
- **FR-22** — Desde el detalle se puede usar el asset como referencia de una
  generación nueva en una acción. *Aceptación:* el asset queda adjunto en el
  formulario de generación sin copiar rutas a mano.
- **FR-23** — La galería tiene estado vacío con la acción que corresponde, y
  borrar pide confirmación diciendo qué se borra. *Aceptación:* sin assets, la
  pantalla ofrece generar el primero en vez de mostrar una grilla vacía.
- **FR-24** — Cada asset se puede abrir en el explorador de archivos del
  sistema. *Aceptación:* la acción abre Finder, Explorador o el gestor de
  archivos de Linux en la carpeta del asset.

### Cola y actividad

- **FR-25** — Los trabajos en curso, en cola y fallidos se ven en una pantalla
  con su estado, modelo, costo y error si lo hubo. *Aceptación:* un job que
  falla muestra el mensaje del proveedor, no un error genérico.
- **FR-26** — La cola persiste en disco y sobrevive al cierre de la app.
  *Aceptación:* cerrando la app con jobs en cola y reabriendo, los jobs siguen
  ahí.
- **FR-27** — Al reabrir tras un cierre con trabajo pendiente, la app ofrece
  reanudar o descartar los jobs interrumpidos, indicando que no se cobraron.
  *Aceptación:* los jobs interrumpidos no generan cargo hasta que el usuario
  decide reanudarlos.
- **FR-28** — La concurrencia de jobs es configurable y la cola se puede pausar.
  *Aceptación:* con concurrencia en 1, nunca hay dos jobs corriendo a la vez.
- **FR-29** — Un job fallido reintenta automáticamente con espera creciente
  hasta el límite configurado. *Aceptación:* un fallo por límite de tasa
  reintenta en vez de darse por perdido al primer intento.

### Gastos

- **FR-30** — Una pantalla muestra el gasto del período con totales, evolución
  en el tiempo y desglose por modelo. *Aceptación:* la suma del desglose por
  modelo coincide con el total del período.
- **FR-31** — El gasto se puede exportar a un archivo tabular.
  *Aceptación:* el archivo exportado abre en una planilla con una fila por
  generación.
- **FR-32** — Existe un tope de gasto diario configurable que bloquea nuevas
  generaciones al alcanzarse. *Aceptación:* alcanzado el tope, generar muestra
  el bloqueo y no llama a ningún proveedor.

### Chat con agente

- **FR-33** — La app detecta agentes de línea de comandos instalados en la
  máquina y permite elegir cuál usar. *Aceptación:* con un agente instalado, la
  app lo detecta sin que el usuario escriba su ruta.
- **FR-34** — Si no hay ningún agente instalado, la pantalla de chat explica
  cuál instalar y cómo, sin romper el resto de la app. *Aceptación:* sin agente,
  las otras pantallas funcionan normalmente.
- **FR-35** — El usuario conversa con el agente y el agente genera assets que
  aterrizan en la misma biblioteca, con el mismo cost gate. *Aceptación:* un
  asset generado desde el chat aparece en la galería con su prompt y costo.
- **FR-36** — El chat muestra el costo acumulado de la sesión y el costo
  estimado de la próxima acción antes de ejecutarla. *Aceptación:* una
  generación por encima del umbral pide confirmación también desde el chat.
- **FR-37** — Se pueden adjuntar archivos y assets de la biblioteca como
  referencias del mensaje. *Aceptación:* el asset adjunto llega al agente como
  referencia y no como texto.
- **FR-38** — El modo de permisos del agente es configurable y la app declara
  qué puede tocar. *Aceptación:* el directorio de trabajo del agente es visible
  y modificable en Ajustes.

### Navegación

- **FR-39** — Una paleta de comandos abre con atajo de teclado y busca
  acciones, modelos, assets y destinos de navegación en un solo campo.
  *Aceptación:* escribiendo el nombre de un modelo aparece junto con su costo.
- **FR-40** — Los atajos de teclado se muestran con los símbolos del sistema
  operativo en curso. *Aceptación:* en Windows y Linux se muestra `Ctrl`, no `⌘`.

### Ajustes y servidor local

- **FR-41** — Ajustes agrupa proveedores, agentes, almacenamiento, servidor,
  presupuesto, apariencia y opciones avanzadas en secciones navegables.
  *Aceptación:* cada sección es alcanzable en un clic desde cualquier otra.
- **FR-42** — El servidor local escucha por defecto sólo en la interfaz de
  loopback, y exponerlo en la red exige una acción explícita con advertencia.
  *Aceptación:* por defecto, otra máquina de la red no alcanza el servidor.
- **FR-43** — El servidor expone un endpoint compatible con la API de imágenes
  de OpenAI, protegido por una llave propia que se puede regenerar.
  *Aceptación:* un cliente de OpenAI apuntado al servidor local genera una
  imagen cambiando sólo la URL base y la llave.
- **FR-44** — El puerto es configurable y, si está ocupado, la app toma el
  siguiente libre y lo informa. *Aceptación:* con el puerto ocupado, la app
  abre igual y muestra el puerto real en uso.
- **FR-45** — El servidor se puede reiniciar y detener desde la interfaz, y sus
  registros son consultables. *Aceptación:* tras detenerlo, el indicador del
  panel lateral pasa a caído.
- **FR-46** — La carpeta de assets es configurable y se puede abrir desde la
  app. *Aceptación:* cambiando la carpeta, las generaciones nuevas aterrizan
  ahí.
- **FR-47** — El tema sigue al sistema operativo y se puede forzar claro u
  oscuro. *Aceptación:* cambiando el tema del sistema con la app abierta, la
  interfaz acompaña.
- **FR-48** — Existe una acción destructiva para borrar la biblioteca que
  enumera exactamente qué borra y exige confirmación escrita.
  *Aceptación:* la confirmación dice cuántos registros y cuántos archivos se
  eliminan.

## Non-functional requirements

- **NFR-1** — *Constraint del dueño:* la app se construye con Tauri v2 y se
  distribuye para macOS, Windows y Linux desde una única base de código.
- **NFR-2** — *Constraint del dueño:* la v1 se publica **sin firmar ni
  notarizar**. La documentación de instalación tiene que explicar, por sistema,
  cómo autorizar la app la primera vez.
- **NFR-3** — *Constraint del dueño:* el modelo es traé-tu-propia-llave. No hay
  intermediación de llaves, ni proxy, ni cobro.
- **NFR-4** — Las llaves de API sólo viajan hacia el proveedor dueño de esa
  llave. Ningún dato de uso, prompt o asset sale de la máquina sin acción
  explícita del usuario.
- **NFR-5** — La telemetría, si existe, es anónima y está apagada por defecto.
- **NFR-6** — La app abre hasta pantalla usable en menos de 3 segundos en
  hardware de gama media, con la biblioteca ya poblada.
- **NFR-7** — La galería se mantiene fluida con al menos 5.000 assets.
- **NFR-8** — Las tipografías se distribuyen con la app. La interfaz no pide
  recursos a ningún servidor externo para renderizar.
- **NFR-9** — La app es utilizable sin conexión salvo en el momento de generar:
  navegar la biblioteca, ver gastos y configurar funcionan offline.
- **NFR-10** — Toda la interfaz es alcanzable por teclado, y los estados de
  foco son visibles.
- **NFR-11** — El idioma de la interfaz es español, con la arquitectura
  preparada para agregar otros sin reescribir pantallas.
- **NFR-12** — El instalador de cada plataforma pesa menos de 150 MB.
- **NFR-13** — Un fallo del servidor local no cierra la app: la interfaz lo
  informa y ofrece reiniciarlo.

## Assumptions

Decisiones tomadas en la conversación con el dueño el 2026-09-28. Quedan acá
para poder discutirlas.

- **A1** — **Rebrand total a Reverón.** El producto, el paquete, la skill y el
  sitio pasan a llamarse Reverón. Da Vinci queda como nombre histórico y la
  única referencia que sobrevive es la migración de la biblioteca vieja.
- **A2** — **El chat entra en la v1.** Es el diferencial del producto, aunque
  dependa de software que Reverón no controla y sea la pantalla más cara de
  construir.
- **A3** — **La v1 sale sin firmar.** Se asume la fricción de Gatekeeper y
  SmartScreen en la primera instalación a cambio de no comprometer presupuesto
  anual.
- **A4** — **El PRD 001 está entregado.** Su código está en `main`; sus 27
  tareas en backlog se retiran y este PRD numera sus fases desde F1.
- **A5** — El servidor local sigue siendo el mismo que ya existe, reusado por
  la app de escritorio. Cómo se empaqueta es decisión de arquitectura, no de
  producto.
- **A6** — El diseño de `docs/layout.pen` es la referencia visual acordada. Sus
  17 pantallas definen el alcance de la interfaz.
- **A7** — El tema oscuro es el único diseñado hoy. Los temas claro y azul que
  la pantalla de apariencia ofrece son deuda de diseño, no de implementación.

## Open questions

- **Q1 — ¿Cómo se empaqueta el servidor local?** Reusar el servidor que ya
  existe implica distribuir su motor de ejecución con la app, lo que impacta
  NFR-12 (150 MB). La alternativa es reescribirlo en el lenguaje nativo de la
  app, que es mucho más trabajo. *Decide:* arquitectura, con el dueño.
- **Q2 — ¿Cómo se guardan las llaves en cada sistema?** El diseño nombra a la
  vez el llavero del sistema operativo y un almacén cifrado propio, que son
  cosas distintas y se comportan distinto en Windows y Linux. FR-8 exige elegir
  una. *Decide:* arquitectura.
- **Q3 — ¿Cuál es el costo real de la v1 sin firmar?** A3 ahorra dinero pero
  ataca directo la métrica de activación: el usuario enfrenta una advertencia
  de seguridad antes de ver el producto. Habría que medir el abandono en la
  primera instalación y revisar la decisión con ese dato. *Decide:* el dueño,
  con datos de la primera release.
- **Q4 — ¿Qué pasa con el ícono fuera de macOS?** El diseño lo entrega sin
  fondo asumiendo que el sistema le aplica la forma. Windows y Linux no hacen
  eso. Falta la variante con fondo propio. *Decide:* diseño.
- **Q5 — ¿Qué se hace con la skill y el CLI existentes?** A1 los renombra, pero
  no dice si se siguen publicando como paquete independiente o sólo viven
  dentro de la app. *Decide:* el dueño.
- **Q6 — ¿Cómo se actualiza la app?** No hay requisito de actualización
  automática en este PRD. Sin firma, el actualizador de Tauri tiene
  restricciones propias. *Decide:* el dueño, antes de F7.

## Milestones

- **M1 — La app abre**: shell de escritorio, panel lateral, navegación entre
  pantallas, tema, servidor local arrancando y muriendo con la app.
  FR-1, FR-2, FR-3, FR-4, FR-5, FR-44, FR-45, NFR-6, NFR-8, NFR-13.
- **M2 — Primera vez**: onboarding de tres pasos, guardado cifrado de llaves,
  prueba de conexión, detección y migración de la biblioteca de Da Vinci.
  FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, NFR-4.
- **M3 — Generar**: estudio con router, cost gate, referencias, modo de sólo
  estimar y tope diario.
  FR-15, FR-16, FR-17, FR-18, FR-19, FR-32.
- **M4 — La biblioteca**: galería con búsqueda y filtros, detalle con linaje,
  reuso como referencia, estados vacío y de borrado.
  FR-20, FR-21, FR-22, FR-23, FR-24, NFR-7.
- **M5 — Conversar**: chat con agente externo, detección del agente, costo por
  sesión, referencias adjuntas y paleta de comandos.
  FR-33, FR-34, FR-35, FR-36, FR-37, FR-38, FR-39, FR-40.
- **M6 — Controlar**: actividad con recuperación de trabajos interrumpidos,
  gastos con exportación, y las siete secciones de ajustes incluyendo el
  endpoint compatible y la exposición en red.
  FR-25, FR-26, FR-27, FR-28, FR-29, FR-30, FR-31, FR-41, FR-42, FR-43,
  FR-46, FR-47, FR-48, NFR-5, NFR-10, NFR-11.
- **M7 — Distribuir**: empaquetado para los tres sistemas, íconos por
  plataforma, instaladores, documentación de instalación sin firma y primera
  release pública.
  FR-1, NFR-1, NFR-2, NFR-12.
