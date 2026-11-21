import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ejecutarCodex, type OpcionesCodex, type ResultadoCodex } from './codex';
import { lanzador } from './comandos';
import { compatibleEfectivo, leerConfig, type Motor } from './config';

/**
 * Los motores con los que trabajan los agentes, todos con la misma forma (texto en, texto out):
 * - `codex`: Codex CLI con tu plan de ChatGPT (`codex.ts`).
 * - `claude`: Claude Code con tu suscripción de Claude. Sin herramientas (salvo búsqueda web
 *   para quien investiga), sin MCP, sin tu configuración de usuario y en una carpeta vacía.
 * - `compatible`: cualquier API con el formato de OpenAI (DeepSeek, Ollama local, etc.),
 *   con la URL, el modelo y la clave de la configuración. Sin búsqueda web.
 */

export type Opciones = Omit<OpcionesCodex, 'modelo'>;
export type Resultado = ResultadoCodex;

/** ¿Este motor puede buscar en la web? */
export const tieneWeb = (motor: Motor) => motor !== 'compatible';

/** Une el corte por tiempo con la cancelación del usuario. */
function senal(timeoutMs: number, signal?: AbortSignal) {
  const tiempo = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([tiempo, signal]) : tiempo;
}

async function ejecutarClaude(o: Opciones): Promise<Resultado> {
  if (o.signal?.aborted) return { motivo: 'cancelado' };
  const carpeta = await mkdtemp(join(tmpdir(), 'oficina-claude-'));
  const modelo = leerConfig().claude?.modelo;
  const herramientas = o.web ? ['WebSearch', 'WebFetch'] : [];
  const args = [
    '-p',
    '--output-format', 'json',
    '--tools', herramientas.join(','),
    ...(herramientas.length ? ['--allowedTools', ...herramientas] : []),
    '--strict-mcp-config',
    '--setting-sources', 'project',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--effort', o.esfuerzo ?? 'low',
    '--system-prompt', o.sistema,
    ...(modelo ? ['--model', modelo] : []),
  ];
  const { comando, antes } = lanzador('claude');
  try {
    return await new Promise<Resultado>((resolver) => {
      const hijo = spawn(comando, [...antes, ...args], { cwd: carpeta, stdio: ['pipe', 'pipe', 'ignore'] });
      let salida = '';
      let fin: 'timeout' | 'cancelado' | null = null;
      const reloj = setTimeout(() => {
        fin = 'timeout';
        hijo.kill();
      }, o.timeoutMs);
      const alCancelar = () => {
        fin = 'cancelado';
        hijo.kill();
      };
      o.signal?.addEventListener('abort', alCancelar, { once: true });
      const limpiar = () => {
        clearTimeout(reloj);
        o.signal?.removeEventListener('abort', alCancelar);
      };
      hijo.stdout.on('data', (d: Buffer) => {
        salida += d.toString();
      });
      hijo.on('error', () => {
        limpiar();
        resolver({ motivo: 'error_api' });
      });
      hijo.on('close', () => {
        limpiar();
        if (fin) return resolver({ motivo: fin });
        try {
          const datos = JSON.parse(salida) as { result?: unknown; is_error?: boolean };
          const texto = typeof datos.result === 'string' ? datos.result.trim() : '';
          if (datos.is_error) {
            console.warn('[claude] respondió con error');
            return resolver({ motivo: 'error_api' });
          }
          resolver(texto ? { texto } : { motivo: 'malformada' });
        } catch {
          resolver({ motivo: salida.trim() ? 'malformada' : 'error_api' });
        }
      });
      hijo.stdin.on('error', () => {});
      hijo.stdin.end(o.orden);
    });
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}

async function ejecutarCompatible(o: Opciones): Promise<Resultado> {
  const c = compatibleEfectivo();
  if (!c.url || !c.modelo) return { motivo: 'sin_configurar' };
  if (c.preset !== 'ollama' && !c.clave) return { motivo: 'sin_configurar' };
  let res: Response;
  try {
    res = await fetch(`${c.url}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(c.clave ? { authorization: `Bearer ${c.clave}` } : {}),
      },
      body: JSON.stringify({
        model: c.modelo,
        messages: [
          { role: 'system', content: o.sistema },
          { role: 'user', content: o.orden },
        ],
        stream: false,
      }),
      signal: senal(o.timeoutMs, o.signal),
    });
  } catch (error) {
    if (o.signal?.aborted) return { motivo: 'cancelado' };
    return { motivo: (error as Error).name === 'TimeoutError' ? 'timeout' : 'sin_conexion' };
  }
  if (!res.ok) {
    console.warn(`[compatible] ${c.nombre} respondió ${res.status}`);
    return { motivo: res.status === 401 || res.status === 403 ? 'sin_configurar' : 'error_api' };
  }
  try {
    const datos = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const contenido = datos.choices?.[0]?.message?.content;
    // Los modelos que razonan (DeepSeek R1 y otros) a veces devuelven el razonamiento entre <think>.
    const texto = typeof contenido === 'string' ? contenido.replace(/<think>[\s\S]*?<\/think>/g, '').trim() : '';
    return texto ? { texto } : { motivo: 'malformada' };
  } catch {
    return { motivo: 'malformada' };
  }
}

const HOST_DEL_MOTOR: Record<Exclude<Motor, 'compatible'>, string> = {
  codex: 'https://chatgpt.com',
  claude: 'https://api.anthropic.com',
};

/** ¿Llegamos al servicio? Para distinguir «sin internet o sin VPN» de otros errores. */
async function hayConexion(motor: Motor): Promise<boolean> {
  const url = motor === 'compatible' ? compatibleEfectivo().url : HOST_DEL_MOTOR[motor];
  if (!url) return true;
  try {
    await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
    return true;
  } catch {
    return false;
  }
}

/** Corre un encargo con el motor elegido. Si falla, revisa si fue por falta de conexión. */
export async function ejecutar(motor: Motor, o: Opciones): Promise<Resultado> {
  const resultado =
    motor === 'claude'
      ? await ejecutarClaude(o)
      : motor === 'compatible'
        ? await ejecutarCompatible(o)
        : await ejecutarCodex({ ...o, modelo: leerConfig().codex?.modelo || process.env.CODEX_MODEL?.trim() || undefined });
  if ('motivo' in resultado && resultado.motivo === 'error_api' && !(await hayConexion(motor))) {
    return { motivo: 'sin_conexion' };
  }
  return resultado;
}
