# instalar-entorno.ps1 — deja una computadora con Windows lista para usar la Oficina de Nexa.
#
# Uso, desde la carpeta del proyecto, en PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\instalar-entorno.ps1            instala lo que falte
#   powershell -ExecutionPolicy Bypass -File .\instalar-entorno.ps1 -Revisar   solo revisa
#
# Se puede correr de nuevo: salta lo que ya está. Antes de cada instalación o descarga dice qué
# baja, de dónde y cuánto pesa, y pide confirmación. Usa winget para Node, Git, ffmpeg y Ollama.
# Todo lo demás va a %LOCALAPPDATA%\oficina-nexa (no toca otras carpetas del sistema).
#
# Qué deja listo:
#   1. Node.js (LTS), Git y las dependencias del proyecto (npm install).
#   2. Tus datos: nombre, carpeta de trabajo y con qué IA trabajan los agentes
#      (oficina.config.json; se cambian después desde ⚙ Configuración).
#   3. El motor: Codex (plan de ChatGPT), Claude Code (suscripción de Claude),
#      DeepSeek (clave de API) u Ollama (modelo local).
#   4. Dictado: ffmpeg + whisper.cpp (CPU) + modelo large-v3-turbo-q5_0 (574 MB).
#   5. Voz de Nexa: Piper + voz argentina es_AR-daniela-high (114 MB).
#   6. El archivo .env, y una prueba de voz y dictado.
param([switch]$Revisar)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest es mucho más rápido sin barra
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Proyecto = $PSScriptRoot
$Datos = Join-Path $env:LOCALAPPDATA 'oficina-nexa'
$Modelos = if ($env:WHISPER_MODELOS) { $env:WHISPER_MODELOS } else { Join-Path $Datos 'whisper-cpp-models' }
$PiperDir = if ($env:PIPER_DIR) { $env:PIPER_DIR } else { Join-Path $Datos 'piper' }
$WhisperDir = Join-Path $Datos 'whisper'
$Voz = if ($env:PIPER_VOZ) { $env:PIPER_VOZ } else { 'es_AR-daniela-high' }
$Config = Join-Path $Proyecto 'oficina.config.json'
$Pendientes = New-Object System.Collections.Generic.List[string]

function Ok($t) { Write-Host "OK  $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "!!  $t" -ForegroundColor Yellow }
function Info($t) { Write-Host "->  $t" -ForegroundColor Cyan }
function Falta($t) { Write-Host "XX  $t" -ForegroundColor Red; $Pendientes.Add($t) }

function Confirmar($pregunta) {
  if ($Revisar) { return $false }
  $r = Read-Host "    ¿$pregunta? [S/n]"
  return ($r -eq '' -or $r -match '^[sSyY]')
}

function Refrescar-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Tiene($comando) { return [bool](Get-Command $comando -ErrorAction SilentlyContinue) }

function Instalar-Winget($id, $nombre) {
  if (-not (Tiene 'winget')) { Falta "Instalar $nombre a mano (no hay winget en esta computadora)"; return }
  if (Confirmar "Instalo $nombre con winget ($id)") {
    winget install --id $id -e --accept-source-agreements --accept-package-agreements
    Refrescar-Path
  }
}

# Descargar <destino> <url> <tamaño legible> <tamaño mínimo en bytes>
function Descargar($destino, $url, $legible, $minimo) {
  if ((Test-Path $destino) -and ((Get-Item $destino).Length -ge $minimo)) { Ok "Ya está: $(Split-Path $destino -Leaf)"; return $true }
  $host_ = ([Uri]$url).Host
  Info "Falta $(Split-Path $destino -Leaf) ($legible), desde $host_."
  if (-not (Confirmar 'Lo descargo')) { Falta "Sin descargar: $(Split-Path $destino -Leaf)"; return $false }
  New-Item -ItemType Directory -Force -Path (Split-Path $destino) | Out-Null
  try {
    Invoke-WebRequest -Uri $url -OutFile $destino -UseBasicParsing
    if ((Get-Item $destino).Length -ge $minimo) { Ok "Descargado: $(Split-Path $destino -Leaf)"; return $true }
  } catch { }
  Falta "Falló la descarga de $(Split-Path $destino -Leaf) (corré el script de nuevo)"
  return $false
}

function Leer-Config {
  if (Test-Path $Config) { try { return Get-Content $Config -Raw -Encoding UTF8 | ConvertFrom-Json } catch { } }
  return [pscustomobject]@{}
}

function Guardar-Config($cambios) {
  $c = Leer-Config
  foreach ($k in $cambios.Keys) {
    if ($null -ne $cambios[$k] -and $cambios[$k] -ne '') { $c | Add-Member -NotePropertyName $k -NotePropertyValue $cambios[$k] -Force }
  }
  $json = $c | ConvertTo-Json -Depth 5
  [IO.File]::WriteAllText($Config, $json + "`n", (New-Object Text.UTF8Encoding $false))
}

Write-Host "=== Oficina de Nexa — entorno en $env:COMPUTERNAME (Windows) ===" -ForegroundColor White
Write-Host "Proyecto: $Proyecto"
if ($Revisar) { Write-Host '(modo revisar: no instala ni descarga nada)' }
if (-not (Test-Path (Join-Path $Proyecto 'package.json'))) { Write-Host 'No encuentro package.json en esta carpeta.' -ForegroundColor Red; exit 1 }

# --- 1) Node.js, Git y dependencias ---------------------------------------------------------------
Write-Host "`n- 1. Node.js y Git"
$versionNode = 0
if (Tiene 'node') { $versionNode = [int]((node -v) -replace '^v(\d+).*', '$1') }
if ($versionNode -ge 22) { Ok "Node $(node -v)" } else {
  Aviso 'Hace falta Node 22 o superior.'
  Instalar-Winget 'OpenJS.NodeJS.LTS' 'Node.js LTS'
  if ((Tiene 'node') -and [int]((node -v) -replace '^v(\d+).*', '$1') -ge 22) { Ok "Node $(node -v)" } else { Falta 'Node 22+ (cerrá y abrí PowerShell después de instalarlo, y corré el script de nuevo)' }
}
if (Tiene 'git') { Ok "Git $((git --version) -replace 'git version ', '')" } else {
  Info 'Falta Git (Claude Code lo necesita en Windows, y sirve para actualizar la oficina).'
  Instalar-Winget 'Git.Git' 'Git'
  if (-not (Tiene 'git')) { Falta 'Git' }
}
if (Tiene 'npm') {
  if ((Test-Path (Join-Path $Proyecto 'node_modules\vite')) -and (Test-Path (Join-Path $Proyecto 'node_modules\three'))) { Ok 'Dependencias del proyecto ya instaladas.' }
  elseif (Confirmar 'Corro npm install (unos 90 paquetes, ~60 MB)') {
    Push-Location $Proyecto; npm install; $exito = $LASTEXITCODE -eq 0; Pop-Location
    if ($exito) { Ok 'npm install listo.' } else { Falta 'npm install falló' }
  } else { Falta 'Dependencias del proyecto (npm install)' }
}

# --- 2) Tus datos -------------------------------------------------------------------------------
Write-Host "`n- 2. Tus datos"
$c = Leer-Config
$Nombre = $c.nombre
if (-not $Nombre -and -not $Revisar) { $Nombre = Read-Host '    ¿Cómo te llamás? (así te llaman los agentes)' }
if ($Nombre) { Ok "Nombre: $Nombre" } else { Aviso 'Sin nombre: los agentes te hablan sin nombrarte.' }

$Espacio = $c.espacio
if (-not $Espacio) {
  $dropbox = Join-Path $HOME 'Dropbox'
  $sugerida = if (Test-Path $dropbox) { Join-Path $dropbox 'oficina-trabajo' } else { Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'oficina-trabajo' }
  if (-not $Revisar) { $Espacio = Read-Host "    ¿Dónde guardo el trabajo de los agentes? [$sugerida]" }
  if (-not $Espacio) { $Espacio = $sugerida }
}
Ok "Carpeta de trabajo: $Espacio"

$Motor = $c.motor
$Preset = if ($c.compatible) { $c.compatible.preset } else { $null }
if (-not $Motor -and -not $Revisar) {
  Write-Host '    ¿Con qué IA trabajan los agentes?'
  Write-Host '      1) ChatGPT (Codex): usa tu plan de ChatGPT'
  Write-Host '      2) Claude: usa tu suscripción de Claude'
  Write-Host '      3) DeepSeek: clave de API (paga, barata; servidores en China)'
  Write-Host '      4) Ollama: modelo local, gratis y sin internet (necesita una máquina potente)'
  switch (Read-Host '    Elegí 1, 2, 3 o 4 [1]') {
    '2' { $Motor = 'claude' }
    '3' { $Motor = 'compatible'; $Preset = 'deepseek' }
    '4' { $Motor = 'compatible'; $Preset = 'ollama' }
    default { $Motor = 'codex' }
  }
}
if (-not $Motor) { $Motor = 'codex' }
if (-not $Revisar) {
  $cambios = @{ nombre = $Nombre; espacio = $Espacio; motor = $Motor }
  if ($Preset) {
    $comp = if ($c.compatible) { $c.compatible } else { [pscustomobject]@{} }
    $comp | Add-Member -NotePropertyName preset -NotePropertyValue $Preset -Force
    $cambios.compatible = $comp
  }
  Guardar-Config $cambios
  Ok 'Guardado en oficina.config.json (cambialo cuando quieras desde ⚙ Configuración).'
}

# --- 3) Motor de IA -----------------------------------------------------------------------------
Write-Host "`n- 3. Motor de IA: $Motor$(if ($Preset) { " ($Preset)" })"
function Instalar-Cli($comando, $paquete, $nombre) {
  if (Tiene $comando) { Ok "${nombre}: $(& $comando --version 2>$null | Select-Object -First 1)"; return }
  Info "Falta $nombre (paquete npm $paquete)."
  if (Confirmar "Lo instalo con npm install -g $paquete") {
    npm install -g $paquete; Refrescar-Path
    if (Tiene $comando) { Ok "$nombre instalado." } else { Falta "No pude instalar $nombre" }
  } else { Falta $nombre }
}
switch ($Motor) {
  'codex' {
    Instalar-Cli 'codex' '@openai/codex' 'Codex'
    if (Tiene 'codex') {
      $estado = (codex login status 2>&1) -join ' '
      if ($estado -match 'logged in') { Ok "Sesión de Codex: $estado" } else { Falta "Iniciar sesión en Codex: corré 'codex login' y elegí tu cuenta de ChatGPT" }
    }
  }
  'claude' {
    Instalar-Cli 'claude' '@anthropic-ai/claude-code' 'Claude Code'
    if ((Test-Path (Join-Path $HOME '.claude\.credentials.json')) -or $env:ANTHROPIC_API_KEY) { Ok 'Claude Code tiene una sesión guardada.' }
    else { Falta "Iniciar sesión en Claude: corré 'claude', seguí los pasos con tu cuenta y salí con /exit" }
  }
  'compatible' {
    if ($Preset -eq 'ollama') {
      if (-not (Tiene 'ollama')) { Instalar-Winget 'Ollama.Ollama' 'Ollama' }
      if (Tiene 'ollama') {
        $modelo = if ($c.compatible -and $c.compatible.modelo) { $c.compatible.modelo } else { 'deepseek-r1:8b' }
        if ((ollama list 2>$null) -match [regex]::Escape(($modelo -split ':')[0])) { Ok "Modelo $modelo descargado." }
        elseif (Confirmar "Descargo el modelo $modelo con ollama pull (unos 5 GB)") { ollama pull $modelo }
        else { Falta "Modelo de Ollama: ollama pull $modelo" }
      } else { Falta 'Ollama' }
    } else {
      if ($c.compatible -and $c.compatible.clave) { Ok 'Clave de DeepSeek guardada.' }
      elseif (-not $Revisar) {
        $segura = Read-Host '    Pegá tu clave de API de DeepSeek (Enter para después)' -AsSecureString
        $clave = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
        if ($clave) {
          $comp = (Leer-Config).compatible; if (-not $comp) { $comp = [pscustomobject]@{} }
          $comp | Add-Member -NotePropertyName preset -NotePropertyValue 'deepseek' -Force
          $comp | Add-Member -NotePropertyName clave -NotePropertyValue $clave -Force
          Guardar-Config @{ compatible = $comp }
          Ok 'Clave guardada en oficina.config.json (no se sube a GitHub).'
        } else { Falta 'Clave de DeepSeek: cargala en ⚙ Configuración' }
      } else { Falta 'Clave de DeepSeek' }
    }
  }
}

# --- 4) Dictado: ffmpeg + whisper.cpp ------------------------------------------------------------
Write-Host "`n- 4. Dictado (whisper.cpp, en CPU)"
if (Tiene 'ffmpeg') { Ok 'ffmpeg instalado.' } else {
  Instalar-Winget 'Gyan.FFmpeg' 'ffmpeg'
  if (-not (Tiene 'ffmpeg')) { Falta 'ffmpeg (si lo acabás de instalar, abrí una PowerShell nueva y corré el script de nuevo)' }
}
$servidorWhisper = Join-Path $WhisperDir 'whisper-server.exe'
if (Test-Path $servidorWhisper) { Ok 'whisper.cpp ya instalado.' } else {
  Info 'Falta whisper.cpp para Windows (zip oficial de github.com/ggml-org/whisper.cpp, ~10 MB).'
  if (Confirmar 'Lo descargo') {
    try {
      $versiones = Invoke-RestMethod 'https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=15' -UseBasicParsing
      $zip = $versiones | ForEach-Object { $_.assets } | Where-Object { $_.name -eq 'whisper-bin-x64.zip' } | Select-Object -First 1
      if (-not $zip) { throw 'sin zip' }
      $tmp = Join-Path $env:TEMP "whisper-$([guid]::NewGuid())"
      New-Item -ItemType Directory -Force -Path $tmp | Out-Null
      Invoke-WebRequest -Uri $zip.browser_download_url -OutFile (Join-Path $tmp 'whisper.zip') -UseBasicParsing
      Expand-Archive (Join-Path $tmp 'whisper.zip') -DestinationPath (Join-Path $tmp 'x') -Force
      $exe = Get-ChildItem (Join-Path $tmp 'x') -Recurse -Filter 'whisper-server.exe' | Select-Object -First 1
      if (-not $exe) { throw 'sin whisper-server.exe' }
      New-Item -ItemType Directory -Force -Path $WhisperDir | Out-Null
      Copy-Item (Join-Path $exe.DirectoryName '*') $WhisperDir -Recurse -Force   # con sus DLL
      Remove-Item $tmp -Recurse -Force
      Ok "whisper.cpp instalado en $WhisperDir"
    } catch { Falta 'No pude instalar whisper.cpp (el dictado no va a estar; el resto funciona)' }
  } else { Falta 'whisper.cpp' }
}
$Modelo = Join-Path $Modelos 'ggml-large-v3-turbo-q5_0.bin'
$null = Descargar $Modelo 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin' '574 MB' 570000000
$null = Descargar (Join-Path $Modelos 'ggml-silero-v5.1.2.bin') 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin' '0,9 MB' 800000

# --- 5) Piper y la voz de Nexa -------------------------------------------------------------------
Write-Host "`n- 5. Voz de Nexa (Piper)"
$piperExe = Join-Path $PiperDir 'bin\piper\piper.exe'
if (Test-Path $piperExe) { Ok 'Piper ya instalado.' } else {
  $zipPiper = Join-Path $env:TEMP 'piper_windows_amd64.zip'
  if (Descargar $zipPiper 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip' '22 MB' 15000000) {
    New-Item -ItemType Directory -Force -Path (Join-Path $PiperDir 'bin') | Out-Null
    Expand-Archive $zipPiper -DestinationPath (Join-Path $PiperDir 'bin') -Force
    Remove-Item $zipPiper -Force
    if (Test-Path $piperExe) { Ok "Piper instalado en $PiperDir" } else { Falta 'Piper se descomprimió en un lugar inesperado' }
  }
}
$baseVoz = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high'
$null = Descargar (Join-Path $PiperDir "voces\$Voz.onnx") "$baseVoz/$Voz.onnx" '114 MB' 100000000
$null = Descargar (Join-Path $PiperDir "voces\$Voz.onnx.json") "$baseVoz/$Voz.onnx.json" '7 KB' 1000

# --- 6) .env ---------------------------------------------------------------------------------------
Write-Host "`n- 6. Configuración"
$env_ = Join-Path $Proyecto '.env'
if (Test-Path $env_) { Ok '.env presente.' }
elseif (-not $Revisar) {
  (Get-Content (Join-Path $Proyecto '.env.example') -Encoding UTF8) -replace '^MOTOR=api$', 'MOTOR=codex' | Set-Content $env_ -Encoding UTF8
  Ok '.env creado desde .env.example.'
} else { Falta '.env (se crea desde .env.example)' }

# --- 7) Prueba: Nexa dice una frase y Whisper la transcribe -----------------------------------------
Write-Host "`n- 7. Prueba"
$cli = Join-Path $WhisperDir 'whisper-cli.exe'
$vozModelo = Join-Path $PiperDir "voces\$Voz.onnx"
if ((Test-Path $piperExe) -and (Test-Path $vozModelo) -and (Test-Path $cli) -and (Test-Path $Modelo) -and (Tiene 'ffmpeg')) {
  $tmp = Join-Path $env:TEMP "prueba-nexa-$([guid]::NewGuid())"
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  'Hola, soy Nexa. La oficina está lista en esta computadora.' | & $piperExe --model $vozModelo --output_file (Join-Path $tmp 'nexa.wav') *> $null
  & ffmpeg -v error -y -i (Join-Path $tmp 'nexa.wav') -ac 1 -ar 16000 (Join-Path $tmp '16k.wav')
  $inicio = Get-Date
  $texto = (& $cli -m $Modelo -f (Join-Path $tmp '16k.wav') -l es -mc 0 -bs 5 -nt 2>$null) -join ' '
  Remove-Item $tmp -Recurse -Force
  if ($texto.Trim()) { Ok "Voz y dictado funcionan ($([int]((Get-Date) - $inicio).TotalSeconds) s). Whisper entendió: «$($texto.Trim())»" }
  else { Falta 'La prueba de dictado no devolvió texto' }
} else { Aviso 'Salteo la prueba: falta Piper, la voz, whisper.cpp, el modelo o ffmpeg.' }

# --- Resumen ---------------------------------------------------------------------------------------
Write-Host "`n=== Resumen ===" -ForegroundColor White
if ($Pendientes.Count -eq 0) { Ok 'Todo listo. Para abrir la oficina:' } else {
  Write-Host 'Falta resolver:'
  $Pendientes | ForEach-Object { Write-Host "  - $_" }
  Write-Host "`nCuando esté, para abrir la oficina:"
}
Write-Host "  cd `"$Proyecto`""
Write-Host '  npm run dev'
Write-Host '  y abrí http://127.0.0.1:5180/ en Chrome o Edge'
