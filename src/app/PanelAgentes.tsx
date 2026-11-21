import { departamentosBase } from '@jules/oficina';
import { TEXTO_ESTADO, tareaActiva, tareasDe, type EstadoOficina, type Tarea } from './trabajo';

/** Tareas que esperan algo de vos: revisar, dar el ok para empezar o mirar un error. */
const AVISAN = new Set<Tarea['estado']>(['para_revisar', 'esperando_aprobacion', 'error']);

interface Props {
  oficina: EstadoOficina | null;
  seleccionadoId: string | null;
  /** Elegir un agente lo selecciona y lleva la cámara hasta él; elegirlo de nuevo lo suelta. */
  onElegir: (id: string | null) => void;
}

/** Avisos pendientes de un agente: cuántos y si alguno es un error. */
export function avisosDe(oficina: EstadoOficina, agenteId: string) {
  const pendientes = tareasDe(oficina, agenteId).filter((t) => AVISAN.has(t.estado));
  return { total: pendientes.length, error: pendientes.some((t) => t.estado === 'error') };
}

/**
 * Lista de los agentes siempre a mano: estado, qué están haciendo y una marca con la cantidad
 * de cosas que esperan tu decisión. Se muestra u oculta con la tecla A.
 */
export function PanelAgentes({ oficina, seleccionadoId, onElegir }: Props) {
  const agentes = oficina?.agentes ?? [];
  const totalAvisos = oficina
    ? agentes.reduce((suma, a) => suma + avisosDe(oficina, a.id).total, 0)
    : 0;

  return (
    <nav className="hud panel-agentes" aria-label="Agentes">
      <div className="panel-agentes-cabecera">
        <h2>Agentes</h2>
        {totalAvisos > 0 && (
          <span className="marca-aviso" aria-label={`${totalAvisos} esperan tu decisión`}>
            {totalAvisos}
          </span>
        )}
        <kbd title="Mostrar u ocultar con la tecla A">A</kbd>
      </div>
      {agentes.length === 0 ? (
        <p className="nota">Esperando al servidor de la oficina…</p>
      ) : (
        <ul>
          {agentes.map((a) => {
            const activa = oficina ? tareaActiva(tareasDe(oficina, a.id)) : undefined;
            const avisos = oficina ? avisosDe(oficina, a.id) : { total: 0, error: false };
            const estado = avisos.error
              ? 'error'
              : activa?.estado === 'trabajando' || activa?.estado === 'en_cola'
                ? 'trabajando'
                : activa
                  ? 'esperando'
                  : 'libre';
            const sala = departamentosBase.find((d) => d.id === a.departamento)?.nombre;
            const elegido = a.id === seleccionadoId;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  className="fila-agente"
                  aria-pressed={elegido}
                  onClick={() => onElegir(elegido ? null : a.id)}
                  title={elegido ? `Soltar a ${a.nombre}` : `Ir con ${a.nombre}${sala ? ` (${sala})` : ''}`}
                >
                  <i className={`punto punto-${estado}`} aria-hidden="true" />
                  <span className="fila-agente-texto">
                    <b>{a.nombre}</b>
                    <span>
                      {a.puesto} · {activa ? TEXTO_ESTADO[activa.estado] : 'Libre'}
                    </span>
                  </span>
                  {avisos.total > 0 && (
                    <span
                      className={avisos.error ? 'marca-aviso marca-error' : 'marca-aviso'}
                      aria-label={`${avisos.total} ${avisos.total === 1 ? 'aviso' : 'avisos'}`}
                    >
                      {avisos.total}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
