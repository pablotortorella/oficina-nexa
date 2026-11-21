import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Connect, type Plugin } from 'vite';
import { esJson, esLocal, leerCuerpo, responder } from './plugin-orden';
import { configVoz, Voz } from './voz';

/**
 * Plugin de Vite con la voz local de Nexa (solo este equipo y esta página):
 * - `GET  /api/voz`: qué está disponible `{ hablar, escuchar }`.
 * - `GET  /api/voz/saludo/(dia|tarde|noche)`: el saludo de Nexa, con la última palabra estirada.
 * - `POST /api/voz/hablar` `{ texto }`: devuelve `audio/wav` con la voz de Nexa (Piper).
 * - `POST /api/voz/dictado` (cuerpo: el audio grabado): devuelve `{ texto }` (whisper.cpp).
 *   El audio no se guarda.
 */

export const RUTA_VOZ = '/api/voz';
const MAX_AUDIO = 15 * 1024 * 1024;

async function leerBinario(req: IncomingMessage, max: number): Promise<Buffer | null> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of req) {
    const buffer = Buffer.isBuffer(parte) ? parte : Buffer.from(parte);
    total += buffer.length;
    if (total > max) return null;
    partes.push(buffer);
  }
  return Buffer.concat(partes);
}

const nombreError = (error: unknown) => (error instanceof Error ? error.name : 'desconocido');

export function crearManejadorVoz(voz: () => Voz) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (!esLocal(req)) return responder(res, 403, { error: 'solo desde este equipo' });
      const ruta = (req.url ?? '/').split('?')[0]?.replace(/\/+$/, '') ?? '';
      if (req.method === 'GET' && ruta === '') {
        return responder(res, 200, { hablar: voz().puedeHablar, escuchar: voz().puedeEscuchar });
      }
      const saludo = /^\/saludo\/(dia|tarde|noche)$/.exec(ruta);
      if (req.method === 'GET' && saludo) {
        if (!voz().puedeHablar) return responder(res, 503, { error: 'Piper no está instalado' });
        try {
          const audio = await voz().saludar(saludo[1] as 'dia' | 'tarde' | 'noche');
          res.statusCode = 200;
          res.setHeader('content-type', 'audio/wav');
          res.setHeader('cache-control', 'no-store');
          return void res.end(audio);
        } catch (error) {
          console.warn(`[voz] no pude armar el saludo (${nombreError(error)})`);
          return responder(res, 500, { error: 'no pude armar el saludo' });
        }
      }
      if (req.method !== 'POST') {
        res.setHeader('allow', 'GET, POST');
        return responder(res, 405, { error: 'método no permitido' });
      }

      if (ruta === '/hablar') {
        if (!esJson(req.headers['content-type'])) {
          return responder(res, 415, { error: 'se espera application/json' });
        }
        const texto = await leerCuerpo(req, 16 * 1024);
        if (texto === null) return responder(res, 413, { error: 'texto demasiado largo' });
        let datos: unknown;
        try {
          datos = JSON.parse(texto);
        } catch {
          return responder(res, 400, { error: 'JSON inválido' });
        }
        const frase = (datos as { texto?: unknown } | null)?.texto;
        if (typeof frase !== 'string' || !frase.trim()) {
          return responder(res, 400, { error: 'falta el texto' });
        }
        if (!voz().puedeHablar) return responder(res, 503, { error: 'Piper no está instalado' });
        try {
          const audio = await voz().hablar(frase);
          res.statusCode = 200;
          res.setHeader('content-type', 'audio/wav');
          res.setHeader('cache-control', 'no-store');
          return void res.end(audio);
        } catch (error) {
          console.warn(`[voz] no pude sintetizar (${nombreError(error)})`);
          return responder(res, 500, { error: 'no pude generar la voz' });
        }
      }

      if (ruta === '/dictado') {
        const tipo = (req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
        if (!tipo.startsWith('audio/')) return responder(res, 415, { error: 'se espera audio' });
        const audio = await leerBinario(req, MAX_AUDIO);
        if (audio === null) return responder(res, 413, { error: 'audio demasiado largo' });
        if (audio.length === 0) return responder(res, 400, { error: 'audio vacío' });
        if (!voz().puedeEscuchar) {
          return responder(res, 503, { error: 'whisper.cpp o su modelo no están instalados' });
        }
        try {
          return responder(res, 200, { texto: await voz().escuchar(audio) });
        } catch (error) {
          console.warn(`[voz] no pude transcribir (${nombreError(error)})`);
          return responder(res, 500, { error: 'no pude transcribir el audio' });
        }
      }
      return responder(res, 404, { error: 'ruta desconocida' });
    } catch (error) {
      console.warn(`[voz] fallo interno (${nombreError(error)})`);
      return responder(res, 500, { error: 'fallo interno' });
    }
  };
}

interface ConMiddlewares {
  middlewares: Connect.Server;
  httpServer?: { on(evento: 'close', f: () => void): unknown } | null;
}

export function pluginVoz(): Plugin {
  let voz: Voz | null = null;
  let env: Record<string, string> = {};
  const obtener = () => (voz ??= new Voz(configVoz(env)));
  const atender = crearManejadorVoz(obtener);
  const montar = ({ middlewares, httpServer }: ConMiddlewares) => {
    middlewares.use(RUTA_VOZ, (req, res) => void atender(req, res));
    httpServer?.on('close', () => voz?.detener());
  };
  return {
    name: 'nexa-voz',
    configResolved(config) {
      env = loadEnv(config.mode, config.root, '');
    },
    configureServer: montar,
  };
}
