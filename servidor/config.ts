import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Configuración local de la oficina: `oficina.config.json` en la carpeta del proyecto (no se sube
 * a GitHub). La escriben el instalador y el panel de Configuración; manda sobre el `.env`.
 * La clave de un proveedor compatible con OpenAI vive acá y nunca se manda al navegador.
 */

export type Motor = 'codex' | 'claude' | 'compatible';
export const MOTORES: Motor[] = ['codex', 'claude', 'compatible'];
export type PresetCompatible = 'deepseek' | 'ollama' | 'otro';

export const PRESETS: Record<PresetCompatible, { url: string; modelo: string; nombre: string }> = {
  deepseek: { url: 'https://api.deepseek.com', modelo: 'deepseek-chat', nombre: 'DeepSeek' },
  ollama: { url: 'http://127.0.0.1:11434/v1', modelo: 'deepseek-r1:8b', nombre: 'Ollama (local)' },
  otro: { url: '', modelo: '', nombre: 'Otro compatible con OpenAI' },
};

export interface ConfigOficina {
  nombre?: string;
  espacio?: string;
  motor?: Motor;
  /** Motor de un agente en particular (vacío = el de la oficina). */
  motorPorAgente?: Record<string, Motor>;
  codex?: { modelo?: string };
  claude?: { modelo?: string };
  compatible?: { preset?: PresetCompatible; url?: string; modelo?: string; clave?: string };
}

let raiz = process.cwd();
export const fijarRaiz = (r: string) => {
  raiz = r;
};
const ruta = () => join(raiz, 'oficina.config.json');

const texto = (v: unknown, max = 300) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
const esMotor = (v: unknown): v is Motor => typeof v === 'string' && (MOTORES as string[]).includes(v);

/** Limpia lo que llega (del archivo o del panel): solo campos conocidos y con formato válido. */
export function sanear(crudo: unknown): ConfigOficina {
  if (typeof crudo !== 'object' || crudo === null) return {};
  const c = crudo as Record<string, unknown>;
  const salida: ConfigOficina = {};
  const nombre = texto(c.nombre, 60);
  if (nombre) salida.nombre = nombre;
  const espacio = texto(c.espacio, 500);
  if (espacio) salida.espacio = espacio;
  if (esMotor(c.motor)) salida.motor = c.motor;
  if (typeof c.motorPorAgente === 'object' && c.motorPorAgente !== null) {
    const porAgente: Record<string, Motor> = {};
    for (const [id, m] of Object.entries(c.motorPorAgente as Record<string, unknown>)) {
      if (/^[a-z0-9-]{1,40}$/.test(id) && esMotor(m)) porAgente[id] = m;
    }
    salida.motorPorAgente = porAgente;
  }
  const sub = (v: unknown) => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});
  const codex = texto(sub(c.codex).modelo, 80);
  if (codex) salida.codex = { modelo: codex };
  const claude = texto(sub(c.claude).modelo, 80);
  if (claude) salida.claude = { modelo: claude };
  const comp = sub(c.compatible);
  const preset = ['deepseek', 'ollama', 'otro'].includes(comp.preset as string)
    ? (comp.preset as PresetCompatible)
    : undefined;
  const url = texto(comp.url, 300);
  const modelo = texto(comp.modelo, 120);
  const clave = texto(comp.clave, 300);
  if (preset || url || modelo || clave) {
    salida.compatible = {
      ...(preset ? { preset } : {}),
      ...(url && /^https?:\/\//i.test(url) ? { url } : {}),
      ...(modelo ? { modelo } : {}),
      ...(clave ? { clave } : {}),
    };
  }
  return salida;
}

export function leerConfig(): ConfigOficina {
  if (!existsSync(ruta())) return {};
  try {
    return sanear(JSON.parse(readFileSync(ruta(), 'utf8')));
  } catch {
    return {};
  }
}

/**
 * Guarda los cambios del panel sobre lo que ya había. Una clave vacía no borra la guardada
 * (el navegador nunca la ve); para borrarla se manda `borrarClave`.
 */
export function guardarConfig(cambios: unknown): ConfigOficina {
  const actual = leerConfig();
  const nuevo = sanear(cambios);
  const borrarClave = (cambios as { borrarClave?: unknown } | null)?.borrarClave === true;
  const compatible = { ...actual.compatible, ...nuevo.compatible };
  if (!nuevo.compatible?.clave && actual.compatible?.clave) compatible.clave = actual.compatible.clave;
  if (borrarClave) delete compatible.clave;
  const final: ConfigOficina = {
    ...actual,
    ...nuevo,
    motorPorAgente: nuevo.motorPorAgente ?? actual.motorPorAgente,
    ...(Object.keys(compatible).length ? { compatible } : {}),
  };
  const tmp = `${ruta()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(final, null, 2)}\n`, 'utf8');
  renameSync(tmp, ruta());
  return final;
}

/** Lo que puede ver el navegador: todo menos la clave. */
export function configPublica(c: ConfigOficina = leerConfig()) {
  const { compatible, ...resto } = c;
  const { clave, ...comp } = compatible ?? {};
  return { ...resto, compatible: { ...comp, claveGuardada: Boolean(clave) } };
}

/** URL y modelo efectivos del motor compatible (preset + lo que se haya cambiado). */
export function compatibleEfectivo(c: ConfigOficina = leerConfig()) {
  const preset = c.compatible?.preset ?? 'deepseek';
  const base = PRESETS[preset];
  return {
    preset,
    nombre: base.nombre,
    url: (c.compatible?.url ?? base.url).replace(/\/+$/, ''),
    modelo: c.compatible?.modelo ?? base.modelo,
    clave: c.compatible?.clave ?? process.env.COMPATIBLE_API_KEY ?? process.env.DEEPSEEK_API_KEY,
  };
}

export const NOMBRE_MOTOR: Record<Motor, string> = {
  codex: 'ChatGPT (Codex)',
  claude: 'Claude',
  compatible: 'Compatible con OpenAI',
};
