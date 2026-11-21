import type { Actividad, AgenteOficina, EstadoAgente } from '@jules/oficina';

/**
 * Cliente de la oficina que trabaja (`/api/trabajo`, servido por `servidor/trabajo/plugin.ts`).
 * Los tipos reflejan lo que devuelve el servidor; si cambian allá, cambian acá.
 */

export type EstadoTarea =
  | 'esperando_aprobacion'
  | 'en_cola'
  | 'trabajando'
  | 'para_revisar'
  | 'aprobada'
  | 'descartada'
  | 'error';

export interface Tarea {
  id: string;
  agenteId: string;
  encargo: string;
  estado: EstadoTarea;
  creada: string;
  actualizada: string;
  iniciada?: string;
  cambios: string[];
  version: number;
  titulo?: string;
  resultado?: string;
  archivo?: string;
  error?: string;
  motivoAprobacion?: string;
  comentario?: string;
  resumen?: string;
}

export interface AgenteTrabajo {
  id: string;
  nombre: string;
  puesto: string;
  rol: string;
  departamento: string;
  carpeta: string;
  web: boolean;
  ejemplos: string[];
}

export interface VentanaCupo {
  usado: number;
  minutos: number;
  reinicio?: string;
}

/** Cupo de la suscripción de ChatGPT que usa Codex (ventana de 5 horas y semanal). */
export interface Cupo {
  corto?: VentanaCupo;
  semanal?: VentanaCupo;
  leido: string;
}

export interface EstadoOficina {
  espacio: string;
  agentes: AgenteTrabajo[];
  tareas: Tarea[];
  cupo?: Cupo | null;
  /** La oficina está abierta en otra computadora: desde acá solo se mira. */
  abiertaEn?: { host: string; desde: string; latido: string };
}

export type AccionTarea = 'iniciar' | 'aprobar' | 'cambios' | 'descartar' | 'cancelar' | 'reintentar';

const RUTA = '/api/trabajo';

async function pedir<T>(ruta: string, cuerpo?: unknown): Promise<T> {
  const res = await fetch(ruta, {
    method: cuerpo === undefined ? 'GET' : 'POST',
    headers: cuerpo === undefined ? undefined : { 'content-type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    cache: 'no-store',
  });
  const datos = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(datos.error ?? `error ${res.status}`);
  return datos as T;
}

export const leerOficina = () => pedir<EstadoOficina>(RUTA);

export const encargar = (agenteId: string, encargo: string) =>
  pedir<{ tarea: Tarea }>(`${RUTA}/tareas`, { agenteId, encargo });

export const actuar = (id: string, accion: AccionTarea, texto?: string) =>
  pedir<{ ok: true }>(`${RUTA}/tareas/${id}/${accion}`, texto === undefined ? {} : { texto });

/** Tareas de un agente, de la más nueva a la más vieja. */
export const tareasDe = (oficina: EstadoOficina, agenteId: string) =>
  oficina.tareas.filter((t) => t.agenteId === agenteId).reverse();

const ACTIVA: EstadoTarea[] = ['trabajando', 'para_revisar', 'esperando_aprobacion', 'error', 'en_cola'];

/** La tarea que define el estado del agente: la que trabaja, después la que espera, etc. */
export function tareaActiva(tareas: Tarea[]): Tarea | undefined {
  for (const estado of ACTIVA) {
    const t = tareas.find((x) => x.estado === estado);
    if (t) return t;
  }
  return undefined;
}

const ACTIVIDAD: Record<string, Actividad> = {
  redactor: 'escribiendo',
  investigador: 'leyendo',
  talleres: 'pensando',
};

export const TEXTO_ESTADO: Record<EstadoTarea, string> = {
  esperando_aprobacion: 'Espera tu ok para empezar',
  en_cola: 'En cola',
  trabajando: 'Trabajando',
  para_revisar: 'Listo para revisar',
  aprobada: 'Aprobada',
  descartada: 'Descartada',
  error: 'Falló',
};

/** Agentes para la escena 3D: el color y el texto salen de sus tareas reales. */
export function agentesDeLaOficina(oficina: EstadoOficina): AgenteOficina[] {
  return oficina.agentes.map((a) => {
    const activa = tareaActiva(tareasDe(oficina, a.id));
    let estado: EstadoAgente = 'libre';
    if (activa?.estado === 'trabajando' || activa?.estado === 'en_cola') estado = 'trabajando';
    else if (activa) estado = 'esperando_decision';
    const tarea = activa
      ? `${TEXTO_ESTADO[activa.estado]}: ${activa.titulo ?? activa.encargo}`
      : `${a.puesto}. Libre para un encargo.`;
    return {
      id: a.id,
      nombre: a.nombre,
      rol: a.rol,
      departamento: a.departamento,
      estado,
      ...(estado === 'trabajando' ? { actividad: ACTIVIDAD[a.id] ?? 'pensando' } : {}),
      tarea,
    };
  });
}
