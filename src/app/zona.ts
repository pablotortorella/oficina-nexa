import { fijarZonaHoraria } from '@jules/oficina';

/**
 * Zona horaria de la oficina en este navegador. Por defecto, la de la computadora (si la
 * notebook cambia sola de zona al viajar, la oficina la sigue). Se puede fijar otra desde
 * Configuración; queda guardada en este navegador.
 */

const CLAVE = 'oficina.zonaHoraria';

export const zonaDeLaComputadora = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function leerGuardada(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

let fijada = leerGuardada();
const oyentes = new Set<() => void>();

/** Zona efectiva: la fijada a mano, o la de la computadora. */
export const zonaActual = () => fijada ?? zonaDeLaComputadora();
export const zonaFijada = () => fijada;

/** Fija una zona (o `null` para volver a la automática). */
export function fijarZona(z: string | null) {
  fijada = z;
  try {
    if (z) localStorage.setItem(CLAVE, z);
    else localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento: vale para esta visita.
  }
  fijarZonaHoraria(zonaActual());
  for (const o of oyentes) o();
}

export function alCambiarZona(o: () => void) {
  oyentes.add(o);
  return () => void oyentes.delete(o);
}

/** Todas las zonas que conoce el navegador, para el selector. */
export function zonasDisponibles(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (k: string) => string[] };
  return intl.supportedValuesOf?.('timeZone') ?? [zonaDeLaComputadora()];
}

// Al cargar, la escena toma la zona guardada.
fijarZonaHoraria(zonaActual());
