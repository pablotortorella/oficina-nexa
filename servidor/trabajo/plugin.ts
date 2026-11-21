import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Connect, type Plugin } from 'vite';
import {
  compatibleEfectivo,
  configPublica,
  fijarRaiz,
  guardarConfig,
  leerConfig,
  MOTORES,
  NOMBRE_MOTOR,
  PRESETS,
  type Motor,
} from '../config';
import { cupoActual, leerCupoInicial } from '../cupo';
import { ejecutar } from '../motores';
import { esJson, esLocal, leerCuerpo, responder } from '../plugin-orden';
import { espacioPorDefecto, OficinaDeTrabajo } from './oficina';

/**
 * Plugin de Vite con la API de la oficina que trabaja, con las mismas defensas que
 * `/api/orden` (solo este equipo y esta página):
 * - `GET  /api/trabajo`: agentes, tareas y el cupo de la suscripción de ChatGPT (Codex).
 * - `POST /api/trabajo/tareas` `{ agenteId, encargo }`: nuevo encargo.
 * - `POST /api/trabajo/tareas/:id/:accion` `{ texto? }`: iniciar, aprobar, cambios,
 *   descartar, cancelar o reintentar.
 * - `POST /api/trabajo/tomar`: usar la oficina desde esta computadora (la otra pasa a solo mirar).
 * - `GET|POST /api/trabajo/config`: la configuración local (nombre, motores), sin claves.
 * El espacio de trabajo es `OFICINA_TRABAJO` del `.env`, o `~/Dropbox/oficina-trabajo`.
 */

export const RUTA_TRABAJO = '/api/trabajo';
const MAX_CUERPO_TRABAJO = 16 * 1024;

interface ConMiddlewares {
  middlewares: Connect.Server;
  httpServer?: { on(evento: 'close', f: () => void): unknown } | null;
}

async function leerJson(req: IncomingMessage): Promise<Record<string, unknown> | string> {
  if (!esJson(req.headers['content-type'])) return 'se espera application/json';
  const texto = await leerCuerpo(req, MAX_CUERPO_TRABAJO);
  if (texto === null) return 'cuerpo demasiado grande';
  if (!texto.trim()) return {};
  try {
    const datos = JSON.parse(texto) as unknown;
    return typeof datos === 'object' && datos !== null && !Array.isArray(datos)
      ? (datos as Record<string, unknown>)
      : 'JSON inválido';
  } catch {
    return 'JSON inválido';
  }
}

export function crearManejadorTrabajo(
  oficina: () => OficinaDeTrabajo,
  entorno: () => Record<string, string> = () => ({}),
) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (!esLocal(req)) return responder(res, 403, { error: 'solo desde este equipo' });
      // Connect quita el prefijo montado: aquí `url` empieza en '/'.
      const ruta = (req.url ?? '/').split('?')[0]?.replace(/\/+$/, '') ?? '';
      if (req.method === 'GET' && ruta === '') {
        const motor = leerConfig().motor ?? 'codex';
        return responder(res, 200, {
          ...(await oficina().estado()),
          motor,
          nombreMotor: motor === 'compatible' ? compatibleEfectivo().nombre : NOMBRE_MOTOR[motor],
          cupo: cupoActual(),
        });
      }
      if (req.method === 'GET' && ruta === '/config') {
        const publica = configPublica();
        return responder(res, 200, {
          // El nombre puede venir del .env de una instalación anterior.
          config: { ...publica, nombre: publica.nombre ?? (entorno().TU_NOMBRE?.trim() || undefined) },
          motores: MOTORES.map((id) => ({ id, nombre: NOMBRE_MOTOR[id] })),
          presets: PRESETS,
        });
      }
      if (req.method !== 'POST') {
        res.setHeader('allow', 'GET, POST');
        return responder(res, 405, { error: 'método no permitido' });
      }
      const cuerpo = await leerJson(req);
      if (typeof cuerpo === 'string') return responder(res, 400, { error: cuerpo });

      if (ruta === '/config') {
        guardarConfig(cuerpo);
        return responder(res, 200, { config: configPublica() });
      }
      if (ruta === '/tomar') {
        await oficina().tomar();
        return responder(res, 200, { ok: true });
      }
      if (ruta === '/tareas') {
        const agenteId = typeof cuerpo.agenteId === 'string' ? cuerpo.agenteId : '';
        const tarea = await oficina().crear(agenteId, cuerpo.encargo);
        if (typeof tarea === 'string') return responder(res, 400, { error: tarea });
        return responder(res, 201, { tarea });
      }
      const accion = /^\/tareas\/([0-9a-f-]{36})\/([a-z]+)$/.exec(ruta);
      if (accion) {
        const [, id = '', nombre = ''] = accion;
        const error = await oficina().accion(id, nombre, cuerpo.texto);
        if (error) return responder(res, 400, { error });
        return responder(res, 200, { ok: true });
      }
      return responder(res, 404, { error: 'ruta desconocida' });
    } catch (error) {
      console.warn(
        `[trabajo] fallo interno (${error instanceof Error ? error.name : 'desconocido'})`,
      );
      return responder(res, 500, { error: 'fallo interno' });
    }
  };
}

export function pluginTrabajo(): Plugin {
  let oficina: OficinaDeTrabajo | null = null;
  let env: Record<string, string> = {};
  const obtener = () => {
    oficina ??= new OficinaDeTrabajo({
      // La carpeta se elige al arrancar: cambiarla en Configuración pide reiniciar la oficina.
      espacio: leerConfig().espacio || env.OFICINA_TRABAJO?.trim() || espacioPorDefecto(),
      ejecutar,
      motorDe: (agenteId): Motor => {
        const c = leerConfig();
        return c.motorPorAgente?.[agenteId] ?? c.motor ?? 'codex';
      },
      nombre: () => leerConfig().nombre || env.TU_NOMBRE?.trim() || undefined,
    });
    return oficina;
  };
  const atender = crearManejadorTrabajo(obtener, () => env);
  const montar = ({ middlewares, httpServer }: ConMiddlewares) => {
    middlewares.use(RUTA_TRABAJO, (req, res) => void atender(req, res));
    // Arranca la oficina con el servidor para retomar lo que quedó en cola.
    obtener();
    void leerCupoInicial();
    httpServer?.on('close', () => oficina?.cerrar());
  };
  return {
    name: 'jules-trabajo',
    configResolved(config) {
      env = loadEnv(config.mode, config.root, '');
      fijarRaiz(config.root);
      // El motor compatible lee su clave del .env si no está en la configuración.
      for (const k of ['COMPATIBLE_API_KEY', 'DEEPSEEK_API_KEY'] as const) {
        if (env[k] && !process.env[k]) process.env[k] = env[k];
      }
    },
    configureServer: montar,
  };
}
