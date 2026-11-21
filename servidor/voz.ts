import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { carpetaDatos, enWindows, exe } from './comandos';
import { join } from 'node:path';

/**
 * Voz local de Nexa, sin servicios externos:
 * - Habla con Piper (voz argentina `es_AR-daniela-high`), en `~/.local/share/piper`.
 * - Escucha con whisper.cpp en la GPU (Vulkan), con los mismos ajustes que la skill
 *   probada para transcribir en español: `large-v3-turbo`, `-mc 0 -bs 5` y VAD. Usa `whisper-server`
 *   para dejar el modelo cargado entre dictados. Los audios se borran apenas se transcriben.
 * Sin GPU dedicada (por ejemplo, una notebook con gráficos integrados) Whisper corre en CPU con el
 * modelo cuantizado `large-v3-turbo-q5_0`: la integrada resultó más lenta que la CPU.
 * Rutas configurables con `PIPER_DIR`, `PIPER_VOZ`, `WHISPER_MODELOS` y `WHISPER_SERVER`;
 * `WHISPER_GPU=1|0` fuerza o apaga la GPU. En Windows todo vive en %LOCALAPPDATA%\oficina-nexa.
 */

export interface ConfigVoz {
  piperDir: string;
  voz: string;
  modelosWhisper: string;
  /** Ejecutable de whisper-server (en Linux, el del sistema). */
  whisperServer: string;
  /** `undefined` = detectar si hay GPU Vulkan dedicada. */
  gpu?: boolean;
}

export function configVoz(env: Record<string, string | undefined>): ConfigVoz {
  return {
    piperDir: env.PIPER_DIR?.trim() || carpetaDatos('piper'),
    voz: env.PIPER_VOZ?.trim() || 'es_AR-daniela-high',
    modelosWhisper: env.WHISPER_MODELOS?.trim() || carpetaDatos('whisper-cpp-models'),
    whisperServer:
      env.WHISPER_SERVER?.trim() ||
      (enWindows ? carpetaDatos('whisper', 'whisper-server.exe') : 'whisper-server'),
    ...(env.WHISPER_GPU?.trim() === '1' ? { gpu: true } : env.WHISPER_GPU?.trim() === '0' ? { gpu: false } : {}),
  };
}

const PUERTO_WHISPER = 5181;
const MAX_TEXTO_VOZ = 1500;
/** Vocabulario que Whisper suele escribir mal, como pista. */
const PISTA_DICTADO =
  'Encargo para la oficina: OKRs, Product Owner, Team Topologies, Lean, Toyota Kata, Kleer, LinkedIn, retrospectiva, facilitación.';

/** Corre un proceso y espera que termine; rechaza si sale con error. */
function correr(comando: string, args: string[], entrada?: string, cwd?: string): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(comando, args, { cwd, stdio: ['pipe', 'ignore', 'pipe'] });
    let error = '';
    hijo.stderr.on('data', (d: Buffer) => {
      error = (error + d.toString()).slice(-400);
    });
    hijo.on('error', rechazar);
    hijo.on('close', (c) =>
      c === 0 ? resolver() : rechazar(new Error(`${comando} salió con ${c}: ${error}`)),
    );
    hijo.stdin.on('error', () => {});
    hijo.stdin.end(entrada ?? '');
  });
}

export class Voz {
  private cola: Promise<unknown> = Promise.resolve();
  private whisper: ChildProcess | null = null;
  private whisperListo: Promise<void> | null = null;

  constructor(private readonly config: ConfigVoz) {}

  private get piper() {
    return join(this.config.piperDir, 'bin', 'piper', exe('piper'));
  }

  private get modeloVoz() {
    return join(this.config.piperDir, 'voces', `${this.config.voz}.onnx`);
  }

  get puedeHablar() {
    return existsSync(this.piper) && existsSync(this.modeloVoz);
  }

  private gpuDetectada: boolean | null = null;

  /** ¿Hay una GPU Vulkan dedicada? La integrada no conviene (más lenta que la CPU). */
  private get conGpu(): boolean {
    if (this.config.gpu !== undefined) return this.config.gpu;
    if (this.gpuDetectada === null) {
      try {
        const resumen = execFileSync('vulkaninfo', ['--summary'], {
          encoding: 'utf8',
          timeout: 10_000,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        this.gpuDetectada = resumen.includes('PHYSICAL_DEVICE_TYPE_DISCRETE_GPU');
      } catch {
        this.gpuDetectada = false;
      }
    }
    return this.gpuDetectada;
  }

  /** Modelo de Whisper: completo en GPU, cuantizado en CPU; si falta uno, el otro. */
  private get modeloWhisper(): string | null {
    const completo = join(this.config.modelosWhisper, 'ggml-large-v3-turbo.bin');
    const liviano = join(this.config.modelosWhisper, 'ggml-large-v3-turbo-q5_0.bin');
    const orden = this.conGpu ? [completo, liviano] : [liviano, completo];
    return orden.find((m) => existsSync(m)) ?? null;
  }

  get puedeEscuchar() {
    const servidor = this.config.whisperServer;
    const hayServidor = servidor.includes('/') || servidor.includes('\\') ? existsSync(servidor) : true;
    return this.modeloWhisper !== null && hayServidor;
  }

  /** Texto → WAV con Piper. De a una síntesis por vez: Piper ya usa todos los núcleos. */
  hablar(texto: string): Promise<Buffer> {
    const limpio = texto.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO_VOZ);
    const tarea = this.cola.then(async () => {
      const carpeta = await mkdtemp(join(tmpdir(), 'oficina-voz-'));
      try {
        const salida = join(carpeta, 'voz.wav');
        await correr(this.piper, ['--model', this.modeloVoz, '--output_file', salida], limpio);
        return await readFile(salida);
      } finally {
        await rm(carpeta, { recursive: true, force: true });
      }
    });
    this.cola = tarea.catch(() => {});
    return tarea;
  }

  private saludos = new Map<string, Promise<Buffer>>();

  /**
   * Saludo de Nexa con la última palabra estirada («Buen díííaaa»). Piper ignora las vocales
   * repetidas, así que la última palabra se sintetiza aparte, más lenta, y se une con ffmpeg
   * quitando el silencio del medio. Se arma una vez por momento del día y queda en memoria.
   */
  saludar(momento: 'dia' | 'tarde' | 'noche'): Promise<Buffer> {
    const partes = {
      dia: ['¡Buen', 'díííaaa!'],
      tarde: ['¡Buenas', 'tardeeees!'],
      noche: ['¡Buenas', 'nocheeees!'],
    }[momento];
    const guardado = this.saludos.get(momento);
    if (guardado) return guardado;
    const tarea = this.cola.then(async () => {
      const carpeta = await mkdtemp(join(tmpdir(), 'oficina-saludo-'));
      try {
        const a = join(carpeta, 'a.wav');
        const b = join(carpeta, 'b.wav');
        const salida = join(carpeta, 'saludo.wav');
        await correr(this.piper, ['--model', this.modeloVoz, '--output_file', a], partes[0]);
        await correr(
          this.piper,
          ['--model', this.modeloVoz, '--length_scale', '2.3', '--output_file', b],
          partes[1],
        );
        const filtro =
          '[0:a]areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse[x];' +
          '[1:a]silenceremove=start_periods=1:start_threshold=-45dB[y];[x][y]concat=n=2:v=0:a=1';
        await correr('ffmpeg', ['-v', 'error', '-y', '-i', a, '-i', b, '-filter_complex', filtro, salida]);
        return await readFile(salida);
      } finally {
        await rm(carpeta, { recursive: true, force: true });
      }
    });
    this.cola = tarea.catch(() => {});
    this.saludos.set(momento, tarea);
    tarea.catch(() => this.saludos.delete(momento));
    return tarea;
  }

  /** Arranca `whisper-server` una sola vez y espera a que responda. */
  private iniciarWhisper(): Promise<void> {
    if (this.whisperListo) return this.whisperListo;
    const modelos = this.config.modelosWhisper;
    const vad = join(modelos, 'ggml-silero-v5.1.2.bin');
    const args = [
      '-m', this.modeloWhisper ?? join(modelos, 'ggml-large-v3-turbo.bin'),
      '-l', 'es',
      '-t', String(Math.max(2, Math.min(8, availableParallelism()))),
      ...(this.conGpu ? [] : ['-ng']),
      '-mc', '0',
      '-bs', '5',
      ...(existsSync(vad) ? ['--vad', '-vm', vad] : []),
      // La pista de vocabulario va al arrancar: el servidor la ignora si llega en cada pedido.
      '--prompt', PISTA_DICTADO,
      '--host', '127.0.0.1',
      '--port', String(PUERTO_WHISPER),
    ];
    this.whisper = spawn(this.config.whisperServer, args, { stdio: 'ignore' });
    this.whisper.on('exit', () => {
      this.whisper = null;
      this.whisperListo = null;
    });
    this.whisperListo = (async () => {
      for (let i = 0; i < 120; i++) {
        if (!this.whisper) throw new Error('whisper-server no arrancó');
        try {
          await fetch(`http://127.0.0.1:${PUERTO_WHISPER}/`);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      throw new Error('whisper-server no respondió a tiempo');
    })();
    this.whisperListo.catch(() => this.detener());
    return this.whisperListo;
  }

  /** Audio grabado en el navegador → texto. El audio se borra al terminar. */
  async escuchar(audio: Buffer): Promise<string> {
    await this.iniciarWhisper();
    const carpeta = await mkdtemp(join(tmpdir(), 'oficina-dictado-'));
    try {
      const entrada = join(carpeta, 'entrada');
      const wav = join(carpeta, 'audio.wav');
      await writeFile(entrada, audio);
      await correr('ffmpeg', ['-v', 'error', '-y', '-i', entrada, '-ac', '1', '-ar', '16000', wav]);
      const formulario = new FormData();
      formulario.append('file', new Blob([await readFile(wav)], { type: 'audio/wav' }), 'audio.wav');
      formulario.append('response_format', 'json');
      formulario.append('prompt', PISTA_DICTADO);
      const res = await fetch(`http://127.0.0.1:${PUERTO_WHISPER}/inference`, {
        method: 'POST',
        body: formulario,
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`whisper-server respondió ${res.status}`);
      const datos = (await res.json()) as { text?: string };
      return (datos.text ?? '').replace(/\s+/g, ' ').trim();
    } finally {
      await rm(carpeta, { recursive: true, force: true });
    }
  }

  detener() {
    this.whisper?.kill();
    this.whisper = null;
    this.whisperListo = null;
  }
}
