#!/bin/bash
# instalar-entorno.sh — deja una máquina lista para usar la Oficina de Nexa.
#
# Uso, desde la carpeta del proyecto:
#   bash instalar-entorno.sh            instala lo que falte y prueba todo
#   bash instalar-entorno.sh --revisar  solo revisa, sin instalar ni descargar nada
#
# Es IDEMPOTENTE: se puede correr de nuevo y salta lo que ya está. Usa `sudo` solo para `apt`
# (y solo si faltan paquetes); el resto va a tu $HOME. Antes de cada descarga dice qué baja,
# de dónde y cuánto pesa, y pide confirmación.
#
# Qué deja listo:
#   1. Node.js 22 o superior y las dependencias del proyecto (npm install).
#   2. Codex CLI con tu sesión de ChatGPT (los agentes trabajan con tu plan, sin clave de API).
#   3. ffmpeg y whisper.cpp (apt) + modelo de Whisper para dictar:
#        con GPU dedicada  -> ggml-large-v3-turbo.bin (1,6 GB)
#        sin GPU dedicada  -> ggml-large-v3-turbo-q5_0.bin (574 MB), en CPU
#      Los modelos van a ~/.local/share/whisper-cpp-models (si ya están, no se bajan de nuevo).
#   4. Piper + la voz argentina de Nexa (es_AR-daniela-high) en ~/.local/share/piper.
#   5. El archivo .env y la carpeta de trabajo (~/Dropbox/oficina-trabajo, la sincroniza Dropbox).
set -u

REVISAR=0
for a in "$@"; do
  case "$a" in
    --revisar) REVISAR=1 ;;
    -h | --help) sed -n 2,23p "$0"; exit 0 ;;
  esac
done

PROYECTO="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
MODELOS="${WHISPER_MODELOS:-$HOME/.local/share/whisper-cpp-models}"
PIPER="${PIPER_DIR:-$HOME/.local/share/piper}"
VOZ="${PIPER_VOZ:-es_AR-daniela-high}"
ESPACIO="${OFICINA_TRABAJO:-$HOME/Dropbox/oficina-trabajo}"
PENDIENTES=()

ok() { echo "✅ $*"; }
warn() { echo "⚠️  $*"; }
info() { echo "👉 $*"; }
falta() { echo "❌ $*"; PENDIENTES+=("$*"); }

# Pregunta sí/no (por defecto sí). En modo --revisar siempre responde no.
confirmar() {
  [ "$REVISAR" = 1 ] && return 1
  local r
  read -r -p "   ¿$1? [S/n] " r
  [[ -z "$r" || "$r" =~ ^[sSyY] ]]
}

# Descarga con confirmación: descargar <destino> <url> <tamaño legible> <tamaño mínimo en bytes>
descargar() {
  local destino="$1" url="$2" legible="$3" minimo="$4"
  if [ -f "$destino" ] && [ "$(stat -c %s "$destino")" -ge "$minimo" ]; then
    ok "Ya está: $(basename "$destino")"
    return 0
  fi
  info "Falta $(basename "$destino") ($legible), desde $(echo "$url" | sed -E 's#https?://([^/]+)/.*#\1#')."
  if ! confirmar "Lo descargo"; then
    falta "Sin descargar: $(basename "$destino")"
    return 1
  fi
  mkdir -p "$(dirname "$destino")"
  if curl -L -f -C - --retry 3 -o "$destino" "$url" && [ "$(stat -c %s "$destino")" -ge "$minimo" ]; then
    ok "Descargado: $(basename "$destino")"
  else
    falta "Falló la descarga de $(basename "$destino") (corré el script de nuevo para reanudarla)"
    return 1
  fi
}

echo "=== Oficina de Nexa — entorno en $(hostname) ($(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-?}"), $(uname -m)) ==="
echo "Proyecto: $PROYECTO"
[ "$REVISAR" = 1 ] && echo "(modo revisar: no instala ni descarga nada)"
[ -f "$PROYECTO/package.json" ] || { echo "❌ No encuentro package.json en $PROYECTO (¿Dropbox terminó de sincronizar?)"; exit 1; }

libre_home=$(df -Pm "$HOME" | awk 'NR==2{print $4}')
[ "$libre_home" -lt 2500 ] && warn "Quedan ${libre_home} MB libres en \$HOME; los modelos de voz y dictado ocupan hasta ~1,8 GB."

# --- 1) Node.js y dependencias ---------------------------------------------------------------
echo; echo "— 1. Node.js"
version_node=$(node -v 2>/dev/null | sed 's/^v//; s/\..*//')
if [ -n "$version_node" ] && [ "$version_node" -ge 22 ]; then
  ok "Node $(node -v)"
else
  warn "Hace falta Node 22 o superior (tenés: $(node -v 2>/dev/null || echo 'ninguno'))."
  if confirmar "Instalo nodejs y npm con apt (pide sudo)"; then
    sudo apt install -y nodejs npm || true
  fi
  version_node=$(node -v 2>/dev/null | sed 's/^v//; s/\..*//')
  if [ -n "$version_node" ] && [ "$version_node" -ge 22 ]; then ok "Node $(node -v)"; else falta "Node 22+ (si apt trae uno viejo, instalalo desde nodejs.org o con nvm)"; fi
fi

if command -v npm >/dev/null 2>&1; then
  if [ -d "$PROYECTO/node_modules/vite" ] && [ -d "$PROYECTO/node_modules/three" ]; then
    ok "Dependencias del proyecto ya instaladas."
  else
    info "Faltan las dependencias del proyecto (unos 90 paquetes de npm, ~60 MB)."
    if confirmar "Corro npm install"; then
      (cd "$PROYECTO" && npm install) && ok "npm install listo." || falta "npm install falló"
    else
      falta "Dependencias del proyecto (npm install)"
    fi
  fi
fi

# --- 2) Codex CLI ----------------------------------------------------------------------------
echo; echo "— 2. Codex (los agentes trabajan con tu plan de ChatGPT)"
if command -v codex >/dev/null 2>&1; then
  ok "Codex $(codex --version 2>/dev/null | awk '{print $NF}')"
else
  info "Falta Codex CLI (paquete npm @openai/codex)."
  if confirmar "Lo instalo con npm install -g @openai/codex"; then
    npm install -g @openai/codex && ok "Codex instalado." || falta "No pude instalar Codex (¿npm global necesita otro prefijo? probá: npm config set prefix ~/.npm-global)"
  else
    falta "Codex CLI"
  fi
fi
if command -v codex >/dev/null 2>&1; then
  if codex login status 2>&1 | grep -qi "logged in"; then
    ok "Sesión de Codex: $(codex login status 2>&1 | head -1)"
  else
    falta "Iniciar sesión en Codex: corré 'codex login' y elegí tu cuenta de ChatGPT"
  fi
fi

# --- 3) ffmpeg, whisper.cpp y modelo de dictado ------------------------------------------------
echo; echo "— 3. Dictado (whisper.cpp)"
paquetes=()
for p in ffmpeg whisper.cpp libggml0-backend-vulkan vulkan-tools; do
  dpkg -s "$p" >/dev/null 2>&1 || paquetes+=("$p")
done
if [ "${#paquetes[@]}" -eq 0 ]; then
  ok "ffmpeg, whisper.cpp y Vulkan ya instalados."
else
  info "Faltan paquetes apt: ${paquetes[*]} (~80 MB)."
  if confirmar "Los instalo con apt (pide sudo)"; then
    sudo apt install -y "${paquetes[@]}" || warn "apt no pudo instalar todo."
  fi
  for p in "${paquetes[@]}"; do dpkg -s "$p" >/dev/null 2>&1 || falta "Paquete apt: $p"; done
fi

GPU=0
if [ "${WHISPER_GPU:-}" = 1 ]; then GPU=1
elif [ "${WHISPER_GPU:-}" = 0 ]; then GPU=0
elif command -v vulkaninfo >/dev/null 2>&1 && vulkaninfo --summary 2>/dev/null | grep -q PHYSICAL_DEVICE_TYPE_DISCRETE_GPU; then GPU=1
fi
if [ "$GPU" = 1 ]; then
  ok "GPU dedicada: el dictado usa la GPU con el modelo completo."
  descargar "$MODELOS/ggml-large-v3-turbo.bin" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin" "1,6 GB" 1600000000
  MODELO="$MODELOS/ggml-large-v3-turbo.bin"
else
  ok "Sin GPU dedicada: el dictado usa la CPU con el modelo cuantizado (más liviano)."
  descargar "$MODELOS/ggml-large-v3-turbo-q5_0.bin" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin" "574 MB" 570000000
  MODELO="$MODELOS/ggml-large-v3-turbo-q5_0.bin"
fi
descargar "$MODELOS/ggml-silero-v5.1.2.bin" "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin" "0,9 MB" 800000

# --- 4) Piper y la voz de Nexa ---------------------------------------------------------------
echo; echo "— 4. Voz de Nexa (Piper)"
case "$(uname -m)" in
  x86_64) PAQUETE_PIPER="piper_linux_x86_64.tar.gz" ;;
  aarch64 | arm64) PAQUETE_PIPER="piper_linux_aarch64.tar.gz" ;;
  *) PAQUETE_PIPER="" ;;
esac
if [ -x "$PIPER/bin/piper/piper" ]; then
  ok "Piper ya instalado."
elif [ -z "$PAQUETE_PIPER" ]; then
  falta "Piper no tiene versión para $(uname -m): Nexa usará la voz del navegador"
else
  tmp="$(mktemp -d)"
  if descargar "$tmp/$PAQUETE_PIPER" "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/$PAQUETE_PIPER" "26 MB" 20000000; then
    if tar -tzf "$tmp/$PAQUETE_PIPER" | grep -qE '^/|\.\./'; then
      falta "El paquete de Piper trae rutas raras; no lo descomprimo"
    else
      mkdir -p "$PIPER/bin" && tar -xzf "$tmp/$PAQUETE_PIPER" -C "$PIPER/bin" && ok "Piper instalado en $PIPER/bin/piper."
    fi
  fi
  rm -rf "$tmp"
fi
BASE_VOZ="https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high"
descargar "$PIPER/voces/$VOZ.onnx" "$BASE_VOZ/$VOZ.onnx" "114 MB" 100000000
descargar "$PIPER/voces/$VOZ.onnx.json" "$BASE_VOZ/$VOZ.onnx.json" "7 KB" 1000

# --- 5) Configuración y carpeta de trabajo ---------------------------------------------------
echo; echo "— 5. Configuración"
if [ -f "$PROYECTO/.env" ]; then
  ok ".env presente (lo comparte Dropbox entre tus máquinas): MOTOR=$(grep -E '^MOTOR=' "$PROYECTO/.env" | cut -d= -f2)"
elif [ "$REVISAR" = 0 ]; then
  cp "$PROYECTO/.env.example" "$PROYECTO/.env" && sed -i 's/^MOTOR=api$/MOTOR=codex/' "$PROYECTO/.env"
  ok ".env creado desde .env.example con MOTOR=codex (completá TU_NOMBRE si querés)."
else
  falta ".env (se crea desde .env.example)"
fi
if [ -d "$ESPACIO" ]; then
  ok "Carpeta de trabajo: $ESPACIO ($(ls "$ESPACIO" | wc -l) elementos)"
else
  warn "Todavía no existe $ESPACIO: la crea la oficina al arrancar (o esperá a que Dropbox la sincronice)."
fi

# --- 6) Prueba de punta a punta: Nexa dice una frase y Whisper la transcribe -----------------
echo; echo "— 6. Prueba"
if [ -x "$PIPER/bin/piper/piper" ] && [ -f "$PIPER/voces/$VOZ.onnx" ] && command -v whisper-cli >/dev/null 2>&1 && [ -f "${MODELO:-}" ] && command -v ffmpeg >/dev/null 2>&1; then
  tmp="$(mktemp -d)"
  echo "Hola, soy Nexa. La oficina está lista en esta computadora." |
    "$PIPER/bin/piper/piper" --model "$PIPER/voces/$VOZ.onnx" --output_file "$tmp/nexa.wav" >/dev/null 2>&1
  ffmpeg -v error -y -i "$tmp/nexa.wav" -ac 1 -ar 16000 "$tmp/16k.wav"
  extra=(); [ "$GPU" = 0 ] && extra=(-ng)
  inicio=$(date +%s)
  texto=$(whisper-cli -m "$MODELO" -f "$tmp/16k.wav" -l es -mc 0 -bs 5 -nt "${extra[@]}" 2>/dev/null | tr -s ' \n' ' ' | sed 's/^ //')
  if [ -n "$texto" ]; then
    ok "Voz y dictado funcionan ($(($(date +%s) - inicio)) s). Whisper entendió: «$texto»"
  else
    falta "La prueba de dictado no devolvió texto (revisá whisper-cli a mano)"
  fi
  rm -rf "$tmp"
else
  warn "Salteo la prueba: falta Piper, la voz, whisper-cli, el modelo o ffmpeg."
fi

# --- Resumen ---------------------------------------------------------------------------------
echo; echo "=== Resumen ==="
if [ "${#PENDIENTES[@]}" -eq 0 ]; then
  ok "Todo listo. Para abrir la oficina:"
else
  echo "Falta resolver:"
  for p in "${PENDIENTES[@]}"; do echo "  - $p"; done
  echo; echo "Cuando esté, para abrir la oficina:"
fi
echo "  cd \"$PROYECTO\" && npm run dev"
echo "  y abrí http://127.0.0.1:5180/ en Chrome"
echo
info "Si la oficina ya está abierta en otra computadora, esta solo mira (ves las tareas, no podés"
info "encargar): cerrala allá con Ctrl + C y en menos de un minuto podés trabajar desde acá. Si la otra"
info "se apagó de golpe, la oficina se libera sola a los 2 minutos."
