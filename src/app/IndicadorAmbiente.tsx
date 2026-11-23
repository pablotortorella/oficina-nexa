import { plano } from '@jules/oficina';

interface Props {
  ambienteId: string | null;
  onSalir: () => void;
  /** Vuelve al encuadre inicial de toda la casa. */
  onVistaGeneral: () => void;
}

/** Nombre del ambiente activo con su botón «Salir», y «Vista general» (tecla Esc) siempre a mano. */
export function IndicadorAmbiente({ ambienteId, onSalir, onVistaGeneral }: Props) {
  const ambiente = plano.ambientes.find((a) => a.id === ambienteId);
  return (
    <div className="hud indicador-ambiente">
      {ambiente && (
        <span>
          <small>Dentro de</small>
          <b>{ambiente.nombre}</b>
        </span>
      )}
      {ambiente && (
        <button type="button" className="btn" onClick={onSalir}>
          Salir
        </button>
      )}
      <button
        type="button"
        className="btn btn-con-tecla"
        onClick={onVistaGeneral}
        title="Volver a la vista general de la casa (tecla Esc)"
      >
        Vista general <kbd>Esc</kbd>
      </button>
    </div>
  );
}
