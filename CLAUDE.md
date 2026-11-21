# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Oficina de Nexa: una oficina 3D en el navegador (React Three Fiber) donde agentes de IA hacen
trabajo real y entregan Markdown. Es un fork de «Oficina de Jules» de Elkis Dev (MIT); la guía
original está en `LEEME.md` y el README describe lo que cambia. Todo el proyecto (código,
identificadores, comentarios, commits, textos de la UI) está en español rioplatense: seguí esa
convención.

## Comandos

- `npm run dev`: Vite en `http://127.0.0.1:5180/`. Levanta también el servidor local (las APIs
  son plugins de Vite, no hay un proceso aparte).
- `npm run build`: chequeo de tipos del front (`tsconfig.json`, solo `src/`) y del servidor
  (`tsconfig.servidor.json`, `servidor/` y `cerebro/`), y después `vite build`. Es la única
  verificación automática: no hay linter ni script de tests (existe `src/oficina/test-utils.ts`
  con azar determinista, pero ningún test en el repo).
- `bash instalar-entorno.sh` / `instalar-entorno.ps1`: instalador interactivo de dependencias
  externas (Node, Codex/Claude CLI, ffmpeg, whisper.cpp, Piper, modelos). `--revisar` / `-Revisar`
  solo informa. Los dos scripts deben mantenerse en paridad.

Node >= 22.

## Arquitectura

Dos modos de la página, elegidos en `src/app/main.tsx`:
- `/` → `Lab.tsx`: la oficina que trabaja (el modo principal de este fork).
- `/?presentacion` → `presentacion/Presentacion.tsx`: el recorrido guiado original de Jules, con
  sus frases locales y `/api/orden`. Sus mp3 no están en el repo (licencia personal).

### Capas

- `src/oficina/` (alias `@jules/oficina`, exporta por `index.ts`): motor 3D reutilizable — escena,
  mansión y ambientes, animación de personas, vestuario por rol, hora del día, rendimiento. No
  conoce el servidor; recibe `AgenteOficina[]`.
- `src/app/`: la UI de la oficina. `trabajo.ts` es el cliente de `/api/trabajo` y **duplica a mano
  los tipos del servidor** (`Tarea`, `EstadoTarea`, `Motor`…): si cambian en
  `servidor/trabajo/oficina.ts` o `servidor/config.ts`, hay que cambiarlos acá.
  `agentesDeLaOficina` traduce el estado de tareas a estados de la escena 3D.
- `servidor/`: corre dentro de Vite en Node. Tres plugins registrados en `vite.config.ts`:
  - `plugin-orden.ts` → `/api/orden` (órdenes del recorrido, vía `orden.ts`). También define
    `esLocal`, `esJson`, `leerCuerpo`, `responder`, que reusan los otros plugins: toda ruta nueva
    debe pasar por `esLocal` (solo loopback, mismo origen, sin `x-forwarded-for`).
  - `trabajo/plugin.ts` → `/api/trabajo` (agentes, tareas, acciones, config, «tomar» la oficina).
  - `plugin-voz.ts` → `/api/voz` (Piper para hablar, whisper.cpp para dictado; `voz.ts`).
- `cerebro/`: lógica pura del «cerebro de Jules» (riesgo, delegación, aprobación, detección de
  inyección, personalidad). El servidor lo usa solo a través de `servidor/cerebro.ts`.

### Oficina que trabaja (flujo de una tarea)

- `servidor/trabajo/agentes.ts` define los agentes reales (`AGENTES_TRABAJO`: redactor,
  investigador, talleres, comercial) con su `oficio` (prompt), carpeta, si tienen web y la
  plantilla de `contexto.md`. Agregar un agente es agregarlo acá; el front los recibe por la API.
- `servidor/trabajo/oficina.ts` (`OficinaDeTrabajo`): una cola por agente, estados
  `esperando_aprobacion → en_cola → trabajando → para_revisar → aprobada|descartada|error`.
  Antes de encolar pasa el encargo por `juzgar` (de `orden.ts`, el cerebro) para decidir si pide
  aprobación. Guarda en el espacio de trabajo: `tareas.json`, `sobre-mi.md` y por agente
  `<carpeta>/contexto.md` (los comentarios al aprobar/descartar se agregan a «Aprendizajes»).
  Los modelos solo devuelven texto; los archivos los escribe este módulo, siempre dentro de la
  carpeta del agente.
- Varias computadoras: el espacio de trabajo suele estar en Dropbox. `.oficina-abierta.json` es
  un candado con latido; solo la computadora que lo tiene ejecuta, las demás «solo miran», y
  `POST /api/trabajo/tomar` lo traspasa (manda la toma más reciente).
- `servidor/motores.ts` (`ejecutar`): misma interfaz para tres motores — `codex` (Codex CLI,
  `codex.ts`), `claude` (Claude Code en `-p`, sin herramientas salvo WebSearch/WebFetch para quien
  investiga, sin MCP ni config de usuario, en una carpeta temporal vacía) y `compatible` (API
  estilo OpenAI: DeepSeek, Ollama; sin web). Los agentes nunca deben recibir herramientas que
  ejecuten comandos o lean archivos.
- `servidor/comandos.ts` (`lanzador`): lanza CLIs sin shell en Linux/macOS/Windows (en Windows
  resuelve los `.cmd` de `npm -g`). Usarlo para cualquier proceso hijo nuevo.
- `servidor/cupo.ts`: cupo restante del plan de ChatGPT que muestra la UI.

### Configuración

- `oficina.config.json` (raíz, en `.gitignore`): nombre, espacio, motor global y por agente,
  modelos, y la clave del proveedor compatible. La escriben el instalador y el panel ⚙; manda
  sobre `.env`. `servidor/config.ts` la sanea; `configPublica()` es lo único que va al navegador
  (nunca claves).
- `.env` (ver `.env.example`): `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` para `/api/orden`,
  `OFICINA_TRABAJO` (por defecto `~/Dropbox/oficina-trabajo`), rutas de Piper y whisper.

### Otros

- `referencias/`: código y vista del Jules original, solo de consulta (no se compila).
- `public/presentacion/`: guiones y frases del recorrido; los mp3 y la alineación del dúo están
  ignorados por licencia y no deben agregarse al repo.
