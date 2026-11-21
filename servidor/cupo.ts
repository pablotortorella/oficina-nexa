import { existsSync } from 'node:fs';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Cupo de la suscripción de ChatGPT que usa Codex: la ventana corta (5 horas) y la semanal,
 * con el porcentaje usado y cuándo se reinicia cada una. Codex no lo informa por stdout, pero
 * lo anota en el archivo de cada sesión (`~/.codex/sessions/AAAA/MM/DD/rollout-…-<id>.jsonl`).
 * La oficina lee ese dato después de cada ejecución y borra el archivo de sesión, para no
 * llenar tu historial de Codex con ejecuciones de la oficina. Al arrancar toma el último dato
 * de cualquier sesión de Codex (el cupo es uno solo, lo uses desde donde lo uses).
 */

export interface VentanaCupo {
  /** Porcentaje usado, 0 a 100. */
  usado: number;
  /** Largo de la ventana en minutos (300 = 5 horas, 10080 = semana). */
  minutos: number;
  /** Cuándo se reinicia (ISO). */
  reinicio?: string;
}

export interface Cupo {
  corto?: VentanaCupo;
  semanal?: VentanaCupo;
  /** Cuándo se leyó el dato (ISO). */
  leido: string;
}

const carpetaSesiones = () =>
  join(process.env.CODEX_HOME?.trim() || join(homedir(), '.codex'), 'sessions');

let ultimo: Cupo | null = null;

export const cupoActual = () => ultimo;

function ventana(v: unknown): VentanaCupo | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const { used_percent, window_minutes, resets_at } = v as Record<string, unknown>;
  if (typeof used_percent !== 'number' || typeof window_minutes !== 'number') return undefined;
  return {
    usado: used_percent,
    minutos: window_minutes,
    ...(typeof resets_at === 'number' ? { reinicio: new Date(resets_at * 1000).toISOString() } : {}),
  };
}

/** Último `rate_limits` de un archivo de sesión, o `null`. */
async function cupoDe(archivo: string): Promise<Cupo | null> {
  const lineas = (await readFile(archivo, 'utf8').catch(() => '')).split('\n').reverse();
  for (const linea of lineas) {
    if (!linea.includes('"rate_limits"')) continue;
    try {
      const buscar = (o: unknown): unknown => {
        if (typeof o !== 'object' || o === null) return undefined;
        const r = (o as Record<string, unknown>).rate_limits;
        if (r) return r;
        for (const v of Object.values(o)) {
          const encontrado = buscar(v);
          if (encontrado) return encontrado;
        }
        return undefined;
      };
      const limites = buscar(JSON.parse(linea)) as Record<string, unknown> | undefined;
      if (!limites) continue;
      const corto = ventana(limites.primary);
      const semanal = ventana(limites.secondary);
      if (!corto && !semanal) continue;
      return { ...(corto ? { corto } : {}), ...(semanal ? { semanal } : {}), leido: new Date().toISOString() };
    } catch {
      // Línea cortada: probar la anterior.
    }
  }
  return null;
}

/** Las carpetas de días, de la más nueva a la más vieja (máximo `dias`). */
async function diasRecientes(dias: number): Promise<string[]> {
  const raiz = carpetaSesiones();
  if (!existsSync(raiz)) return [];
  const salida: string[] = [];
  const ordenadas = async (c: string) =>
    (await readdir(c).catch(() => [] as string[])).filter((n) => /^\d+$/.test(n)).sort().reverse();
  for (const anio of await ordenadas(raiz)) {
    for (const mes of await ordenadas(join(raiz, anio))) {
      for (const dia of await ordenadas(join(raiz, anio, mes))) {
        salida.push(join(raiz, anio, mes, dia));
        if (salida.length >= dias) return salida;
      }
    }
  }
  return salida;
}

/** Al arrancar: el dato más reciente de cualquier sesión de Codex de los últimos días. */
export async function leerCupoInicial(): Promise<void> {
  const archivos: { ruta: string; cuando: number }[] = [];
  for (const dia of await diasRecientes(10)) {
    for (const nombre of await readdir(dia).catch(() => [] as string[])) {
      if (!nombre.endsWith('.jsonl')) continue;
      const ruta = join(dia, nombre);
      const info = await stat(ruta).catch(() => null);
      if (info) archivos.push({ ruta, cuando: info.mtimeMs });
    }
  }
  archivos.sort((a, b) => b.cuando - a.cuando);
  for (const { ruta, cuando } of archivos.slice(0, 15)) {
    const cupo = await cupoDe(ruta);
    if (cupo) {
      // Lo que se leyó de una sesión vieja vale desde cuando se escribió, no desde ahora.
      if (!ultimo || Date.parse(ultimo.leido) < cuando) ultimo = { ...cupo, leido: new Date(cuando).toISOString() };
      return;
    }
  }
}

/** Después de una ejecución de la oficina: lee el cupo de su sesión y borra el archivo. */
export async function registrarSesion(idSesion: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(idSesion)) return;
  for (const dia of await diasRecientes(2)) {
    const nombre = (await readdir(dia).catch(() => [] as string[])).find((n) =>
      n.endsWith(`${idSesion}.jsonl`),
    );
    if (!nombre) continue;
    const ruta = join(dia, nombre);
    const cupo = await cupoDe(ruta);
    if (cupo) ultimo = cupo;
    await rm(ruta, { force: true });
    return;
  }
}
