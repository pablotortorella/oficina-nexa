# Oficina de Nexa

Una oficina 3D en el navegador donde agentes de IA hacen trabajo real: escriben borradores,
investigan con fuentes y diseñan talleres. Nexa, la orquestadora, los coordina, saluda, lee los
resultados en voz alta y escucha tus encargos dictados.

Está basada en **[la Oficina de Jules](https://www.elkis.dev/guias/oficina-de-jules) de Elkis Dev**
(licencia MIT, ver `LICENSE` y `LICENCIAS.md`). La guía original está en `LEEME.md`.

## Qué cambia respecto del original

- **Agentes que trabajan de verdad** (en `http://127.0.0.1:5180/`): Andrés (redactor de contenido),
  Víctor (investigador, con búsqueda web), Joaquín (diseñador de talleres), Valeria (ejecutiva
  comercial) y Diana (contadora). Les encargás algo y entregan un Markdown que aprobás, corregís o
  descartás. Trabajan con la IA que elijas, para toda la oficina o por agente:
  - **ChatGPT** con [Codex](https://github.com/openai/codex), usando tu plan (sin clave de API).
  - **Claude** con [Claude Code](https://docs.claude.com/en/docs/claude-code), usando tu suscripción.
  - **Compatible con OpenAI**: [DeepSeek](https://platform.deepseek.com) con clave de API, u
    [Ollama](https://ollama.com) con un modelo local (sin búsqueda web).

  Todo queda en una carpeta de trabajo que elegís al instalar, con un `contexto.md` por agente que
  aprende de tus comentarios.
- **Nexa** reemplaza a Jules: nueva apariencia 3D, carácter de orquestadora y voz local en español
  rioplatense con [Piper](https://github.com/rhasspy/piper). Saluda al abrir, lee resúmenes o
  documentos completos (1x a 2x) y mueve la boca al hablar.
- **Dictado** con [whisper.cpp](https://github.com/ggerganov/whisper.cpp), en GPU si hay una dedicada
  y en CPU si no. El audio no se guarda.
- **Lector** con formato, copiar como texto o Markdown, cupo de ChatGPT visible y respuestas en
  español rioplatense.
- **Varias computadoras**: si la carpeta de trabajo se sincroniza (por ejemplo con Dropbox), la oficina
  trabaja en una y las demás miran; «Usar la oficina acá» la pasa de una a otra con un clic.
- **⚙ Configuración**: tu nombre, la IA de cada agente y la zona horaria (por defecto, la de tu
  computadora).

Los agentes no tienen herramientas: no ejecutan comandos, no leen tus archivos y no envían nada.
Los archivos los escribe el servidor local, siempre dentro de la carpeta de cada agente.

## Primeros pasos

1. **Tené una suscripción para los agentes**: ChatGPT (Plus o superior, con Codex) o Claude (Pro o
   superior). También sirve una clave de API de DeepSeek, o Ollama si tu computadora es potente.
2. **Bajá el proyecto**:

   ```bash
   git clone https://github.com/pablotortorella/oficina-nexa.git
   cd oficina-nexa
   ```

3. **Corré el instalador**. Pregunta tu nombre, dónde guardar el trabajo y con qué IA trabajar;
   instala lo que falte (Node, dependencias, el programa de la IA, ffmpeg, whisper.cpp, Piper y los
   modelos), pidiendo confirmación antes de cada descarga, y al final prueba la voz y el dictado.
   - **Linux (Ubuntu)**: `bash instalar-entorno.sh`
   - **Windows**, en PowerShell: `powershell -ExecutionPolicy Bypass -File .\instalar-entorno.ps1`

   Con `--revisar` (Linux) o `-Revisar` (Windows) solo informa, sin instalar nada.
4. **Iniciá sesión** en el programa de tu IA si el instalador te lo pide (`codex login`, o abrir
   `claude` una vez).
5. **Contale a los agentes quién sos**: completá `sobre-mi.md` y el `contexto.md` de cada agente en
   tu carpeta de trabajo. Sin eso escriben genérico.
6. **Abrí la oficina**: `npm run dev` y entrá a `http://127.0.0.1:5180/` en Chrome o Edge.

La configuración se cambia después desde ⚙ en la oficina. Los ajustes avanzados están en
`.env.example`.

**Si viajás a China**: ChatGPT y Claude no funcionan allá sin VPN (la oficina te avisa si no llega
al servicio). DeepSeek sí funciona, y la voz de Nexa y el dictado corren en tu computadora sin
internet.

## Voces del recorrido

El recorrido guiado original (`/?presentacion`) usa las voces de Elkis y Jules, que tienen licencia
de uso personal y **no están en este repositorio**. Para tenerlo con voz, copiá
`public/presentacion/` desde [el zip original](https://www.elkis.dev/hub/descargas/oficina-jules.zip).

## Seguridad

El servidor solo escucha en `127.0.0.1` y solo acepta pedidos de la propia página. No lo publiques
en un servidor ni lo expongas a la red.
