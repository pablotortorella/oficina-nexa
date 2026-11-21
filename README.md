# Oficina de Nexa

Una oficina 3D en el navegador donde agentes de IA hacen trabajo real: escriben borradores,
investigan con fuentes y diseñan talleres. Nexa, la orquestadora, los coordina, saluda, lee los
resultados en voz alta y escucha tus encargos dictados.

Está basada en **[la Oficina de Jules](https://www.elkis.dev/guias/oficina-de-jules) de Elkis Dev**
(licencia MIT, ver `LICENSE` y `LICENCIAS.md`). La guía original está en `LEEME.md`.

## Qué cambia respecto del original

- **Agentes que trabajan de verdad** (en `http://127.0.0.1:5180/`): Andrés (redactor de contenido),
  Víctor (investigador, con búsqueda web) y Joaquín (diseñador de talleres). Les encargás algo,
  trabajan con [Codex](https://github.com/openai/codex) usando tu plan de ChatGPT (sin clave de API)
  y entregan un Markdown que aprobás, corregís o descartás. Todo queda en una carpeta de trabajo
  (por defecto `~/Dropbox/oficina-trabajo`), con un `contexto.md` por agente que aprende de tus
  comentarios.
- **Nexa** reemplaza a Jules: nueva apariencia 3D, carácter de orquestadora y voz local en español
  rioplatense con [Piper](https://github.com/rhasspy/piper). Saluda al abrir, lee resúmenes o
  documentos completos (1x a 2x) y mueve la boca al hablar.
- **Dictado** con [whisper.cpp](https://github.com/ggerganov/whisper.cpp), en GPU si hay una dedicada
  y en CPU si no. El audio no se guarda.
- **Lector** con formato, copiar como texto o Markdown, cupo de ChatGPT visible, candado para no
  abrir la oficina en dos computadoras a la vez, y respuestas en español rioplatense.

Los agentes no tienen herramientas: no ejecutan comandos, no leen tus archivos y no envían nada.
Los archivos los escribe el servidor local, siempre dentro de la carpeta de cada agente.

## Instalar

En Linux, desde la carpeta del proyecto:

```bash
bash instalar-entorno.sh
```

Revisa e instala lo que falte (Node 22+, dependencias, Codex, ffmpeg, whisper.cpp, Piper y los
modelos), pidiendo confirmación antes de cada descarga. Con `--revisar` solo informa.
Después:

```bash
npm run dev
```

y abrí `http://127.0.0.1:5180/` en Chrome. La configuración opcional está en `.env.example`.

## Voces del recorrido

El recorrido guiado original (`/?presentacion`) usa las voces de Elkis y Jules, que tienen licencia
de uso personal y **no están en este repositorio**. Para tenerlo con voz, copiá
`public/presentacion/` desde [el zip original](https://www.elkis.dev/hub/descargas/oficina-jules.zip).

## Seguridad

El servidor solo escucha en `127.0.0.1` y solo acepta pedidos de la propia página. No lo publiques
en un servidor ni lo expongas a la red.
