# Diseño de referencia

Exportado de `docs/layout.pen` el 2026-09-28, a escala 1:1 (1440×900).

**El `.pen` está cifrado y sólo se abre con el MCP de Pencil.** Estas imágenes
existen para que cualquiera —persona o agente— pueda ver contra qué se está
construyendo sin depender de esa herramienta. Si el diseño cambia, hay que
re-exportarlas.

## Cómo usarlas

Cuando una tarea diga "según `docs/layout.pen`", abrí la imagen que le
corresponde y **comparala contra lo que construiste**. La descripción en prosa
de la spec fija el comportamiento; la imagen fija la forma. Las dos mandan.

Mirá específicamente: espaciados, tamaños de tipografía, jerarquía visual,
qué está alineado con qué, y los estados vacíos o de error que la spec nombra
pero no describe pixel a pixel.

## Índice

| Imagen | Pantalla | Tarea |
| --- | --- | --- |
| `componente-sidebar.png` | Panel lateral, 240 px | F1.5.T2 |
| `chat.png` | Chat con agente | F5.2.T1, F5.2.T2 |
| `estudio.png` | Estudio | F3.1.T1, F3.1.T2, F3.2.T2 |
| `galeria.png` | Galería, grilla | F4.1.T1 |
| `galeria-lista.png` | Galería, vista de lista | F4.1.T1 |
| `galeria-vacia.png` | Galería sin assets | F4.1.T2 |
| `galeria-borrar.png` | Confirmación de borrado | F4.3.T1 |
| `detalle-asset.png` | Detalle con linaje | F4.2.T1, F4.2.T2 |
| `actividad.png` | Cola y recuperación | F6.2.T1 |
| `gastos.png` | Gastos | F6.3.T2 |
| `onboarding.png` | Asistente de tres pasos | F2.3.T2 |
| `command-palette.png` | Paleta ⌘K | F5.3.T1 |
| `ajustes-proveedores.png` | Ajustes · Proveedores | F2.3.T1, F6.4.T1 |
| `ajustes-agentes.png` | Ajustes · Agentes y almacenamiento | F6.4.T1 |
| `ajustes-servidor.png` | Ajustes · Servidor & API | F6.4.T2 |
| `ajustes-presupuesto.png` | Ajustes · Presupuesto | F6.4.T2 |
| `ajustes-apariencia.png` | Ajustes · Apariencia | F6.4.T2 |
| `ajustes-avanzado.png` | Ajustes · Avanzado | F6.4.T2 |
| `board-identidad.png` | Marca, paleta, tipografía, ícono | F7.1.T1 |

## Los valores exactos no se sacan de la imagen

Los colores y las tipografías están en `ui/src/styles/tokens.css`, que salió de
las variables del `.pen`. **Usá los tokens por nombre, nunca un color leído a
ojo de la captura.** Si un valor falta en los tokens, es un bug de los tokens y
se arregla ahí, no en la pantalla.
