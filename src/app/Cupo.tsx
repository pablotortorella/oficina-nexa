import type { Cupo as DatosCupo, VentanaCupo } from './trabajo';

const ZONA = 'America/Bogota';

/** «se renueva 22:46» si es hoy, «se renueva jue 27, 09:10» si no. */
function renueva(iso: string | undefined, ahora: Date): string {
  if (!iso) return '';
  const fecha = new Date(iso);
  const dia = (d: Date) => d.toLocaleDateString('es-AR', { timeZone: ZONA });
  const hora = fecha.toLocaleTimeString('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
  if (dia(fecha) === dia(ahora)) return `se renueva a las ${hora}`;
  const cuando = fecha.toLocaleDateString('es-AR', { timeZone: ZONA, weekday: 'short', day: 'numeric' });
  return `se renueva el ${cuando}, ${hora}`;
}

function nombreVentana(v: VentanaCupo, respaldo: string): string {
  if (v.minutos === 300) return '5 horas';
  if (v.minutos === 10080) return 'Semana';
  if (v.minutos % 1440 === 0) return `${v.minutos / 1440} días`;
  if (v.minutos % 60 === 0) return `${v.minutos / 60} horas`;
  return respaldo;
}

function Barra({ v, respaldo, ahora }: { v: VentanaCupo; respaldo: string; ahora: Date }) {
  // Si ya pasó el reinicio, el dato es viejo: la ventana arrancó de cero.
  const vencida = v.reinicio ? Date.parse(v.reinicio) < ahora.getTime() : false;
  const usado = vencida ? 0 : Math.max(0, Math.min(100, v.usado));
  const nivel = usado >= 90 ? 'alto' : usado >= 70 ? 'medio' : 'bajo';
  return (
    <div className="cupo-fila">
      <span className="cupo-nombre">{nombreVentana(v, respaldo)}</span>
      <span
        className="cupo-barra"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={usado}
        aria-label={`Cupo ${nombreVentana(v, respaldo)}`}
      >
        <span className={`cupo-uso cupo-${nivel}`} style={{ width: `${usado}%` }} />
      </span>
      <span className="cupo-pct">{Math.round(usado)}%</span>
      <span className="cupo-renueva">{vencida ? 'renovado' : renueva(v.reinicio, ahora)}</span>
    </div>
  );
}

/** Cuánto llevás usado del cupo de ChatGPT (Codex), con el que trabajan los agentes. */
export function Cupo({ cupo }: { cupo: DatosCupo | null | undefined }) {
  const ahora = new Date();
  if (!cupo || (!cupo.corto && !cupo.semanal)) {
    return (
      <div className="cupo">
        <span className="cupo-titulo">Cupo de ChatGPT</span>
        <span className="nota">Aparece después del primer encargo.</span>
      </div>
    );
  }
  const leido = new Date(cupo.leido).toLocaleTimeString('es-AR', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <div className="cupo" title={`Dato leído a las ${leido}. Se actualiza con cada encargo.`}>
      <span className="cupo-titulo">Cupo de ChatGPT (Codex)</span>
      {cupo.corto && <Barra v={cupo.corto} respaldo="Corto" ahora={ahora} />}
      {cupo.semanal && <Barra v={cupo.semanal} respaldo="Largo" ahora={ahora} />}
    </div>
  );
}
