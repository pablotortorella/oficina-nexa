import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

/**
 * Cómo lanzar un programa en Linux, macOS y Windows sin pasar por un shell (los argumentos
 * nunca se reinterpretan). En Windows, los programas instalados con `npm -g` (codex, claude)
 * son atajos `.cmd` que Node no puede lanzar sin shell: se lee el atajo y se corre el script
 * de Node que apunta, con el mismo Node de la oficina.
 */

export const enWindows = process.platform === 'win32';

export interface Lanzador {
  comando: string;
  /** Argumentos que van antes de los del programa (el script de Node, en Windows). */
  antes: string[];
}

/** Carpeta de datos de la oficina fuera del proyecto (modelos, voz). */
export function carpetaDatos(...partes: string[]): string {
  const base = enWindows
    ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'oficina-nexa')
    : join(homedir(), '.local', 'share');
  return join(base, ...partes);
}

function buscarEnPath(nombre: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const ruta = join(dir, nombre);
    if (existsSync(ruta)) return ruta;
  }
  return null;
}

const cache = new Map<string, Lanzador>();

export function lanzador(nombre: string): Lanzador {
  const guardado = cache.get(nombre);
  if (guardado) return guardado;
  let resultado: Lanzador = { comando: nombre, antes: [] };
  if (enWindows) {
    const exe = buscarEnPath(`${nombre}.exe`);
    const cmd = exe ? null : buscarEnPath(`${nombre}.cmd`);
    if (exe) resultado = { comando: exe, antes: [] };
    else if (cmd) {
      // Atajo de npm: ... "%dp0%\node_modules\@openai\codex\bin\codex.js" %*
      const texto = readFileSync(cmd, 'utf8');
      const js = /"%~?dp0%?\\([^"]+\.(?:c|m)?js)"/i.exec(texto)?.[1];
      if (js) resultado = { comando: process.execPath, antes: [join(dirname(cmd), js)] };
    }
  }
  cache.set(nombre, resultado);
  return resultado;
}

/** Nombre de un ejecutable propio (Piper, whisper-server): con `.exe` en Windows. */
export const exe = (nombre: string) => (enWindows ? `${nombre}.exe` : nombre);
