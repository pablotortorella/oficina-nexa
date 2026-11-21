import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lanzador } from './comandos';
import { registrarSesion } from './cupo';

/**
 * Motor de texto con `codex exec`, la CLI de Codex con la sesión de ChatGPT del usuario (sin
 * clave de API). Codex es un agente, así que corre sin herramientas: sin shell, sin MCP ni
 * configuración del usuario, sandbox de solo lectura y en una carpeta temporal vacía. Después de
 * cada ejecución se lee el cupo de la suscripción y se borra el archivo de sesión (`cupo.ts`). Solo
 * puede escribir texto y, si se pide, buscar en la web. Los archivos los escribe el servidor,
 * nunca Codex. La orden va por stdin y los argumentos como arreglo (sin shell): nada de lo que
 * escriba el usuario se interpreta como comando.
 */

export type ResultadoCodex =
  | { texto: string }
  | { motivo: 'timeout' | 'error_api' | 'malformada' | 'cancelado' | 'sin_conexion' | 'sin_configurar' };

export interface OpcionesCodex {
  /** Instrucciones del agente (el prompt de sistema). */
  sistema: string;
  /** El mensaje del usuario, tal cual. */
  orden: string;
  /** Modelo de Codex; vacío usa el que trae Codex por defecto. */
  modelo?: string;
  timeoutMs: number;
  /** Búsqueda web en vivo (solo para agentes que investigan). */
  web?: boolean;
  /** Cuánto razona: `low` para respuestas cortas, `medium` o `high` para documentos. */
  esfuerzo?: 'low' | 'medium' | 'high';
  /** Cancela la ejecución y mata el proceso. */
  signal?: AbortSignal;
}

export type EjecutarCodex = (opciones: OpcionesCodex) => Promise<ResultadoCodex>;

/** Todo lo que Codex podría usar para actuar fuera de la conversación. */
const SIN_HERRAMIENTAS = [
  'shell_tool',
  'unified_exec',
  'apps',
  'plugins',
  'multi_agent',
  'browser_use',
  'computer_use',
  'image_generation',
  'hooks',
  'view_image',
];

/** Valor TOML de una cadena: JSON produce una cadena básica TOML válida. */
const toml = (texto: string) => JSON.stringify(texto);

export const ejecutarCodex: EjecutarCodex = async ({
  sistema,
  orden,
  modelo,
  timeoutMs,
  web = false,
  esfuerzo = 'low',
  signal,
}) => {
  if (signal?.aborted) return { motivo: 'cancelado' };
  const carpeta = await mkdtemp(join(tmpdir(), 'oficina-codex-'));
  const salida = join(carpeta, 'respuesta.txt');
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--ignore-user-config',
    '--ignore-rules',
    '--sandbox',
    'read-only',
    '-C',
    carpeta,
    '--color',
    'never',
    ...SIN_HERRAMIENTAS.flatMap((f) => ['--disable', f]),
    '-c',
    `web_search=${toml(web ? 'live' : 'disabled')}`,
    '-c',
    `model_reasoning_effort=${toml(esfuerzo)}`,
    '-c',
    `developer_instructions=${toml(sistema)}`,
    ...(modelo ? ['-m', modelo] : []),
    '-o',
    salida,
    '-',
  ];
  let idSesion = '';
  try {
    const codigo = await new Promise<number | 'timeout' | 'error' | 'cancelado'>((resolver) => {
      const { comando, antes } = lanzador('codex');
      const hijo = spawn(comando, [...antes, ...args], { cwd: carpeta, stdio: ['pipe', 'pipe', 'pipe'] });
      // Codex anuncia «session id: …» al empezar: con eso se lee el cupo de su archivo de sesión.
      let encabezado = '';
      const mirar = (d: Buffer) => {
        if (idSesion || encabezado.length > 8000) return;
        encabezado += d.toString();
        idSesion = /session id:\s*([0-9a-f-]{36})/i.exec(encabezado)?.[1] ?? '';
      };
      hijo.stdout.on('data', mirar);
      hijo.stderr.on('data', mirar);
      const terminar = (motivo: 'timeout' | 'cancelado') => {
        hijo.kill();
        resolver(motivo);
      };
      const reloj = setTimeout(() => terminar('timeout'), timeoutMs);
      const alCancelar = () => terminar('cancelado');
      signal?.addEventListener('abort', alCancelar, { once: true });
      const limpiar = () => {
        clearTimeout(reloj);
        signal?.removeEventListener('abort', alCancelar);
      };
      hijo.on('error', () => {
        limpiar();
        resolver('error');
      });
      hijo.on('close', (c) => {
        limpiar();
        resolver(c ?? 1);
      });
      hijo.stdin.on('error', () => {});
      hijo.stdin.end(orden);
    });
    if (codigo === 'timeout' || codigo === 'cancelado') return { motivo: codigo };
    if (codigo !== 0) {
      console.warn(
        `[codex] terminó con ${codigo === 'error' ? 'error al iniciar' : `código ${codigo}`}`,
      );
      return { motivo: 'error_api' };
    }
    const texto = (await readFile(salida, 'utf8').catch(() => '')).trim();
    return texto ? { texto } : { motivo: 'malformada' };
  } finally {
    await rm(carpeta, { recursive: true, force: true });
    // Lee el cupo y borra la sesión, aunque la ejecución haya fallado o se haya cancelado.
    if (idSesion) await registrarSesion(idSesion).catch(() => {});
  }
};
