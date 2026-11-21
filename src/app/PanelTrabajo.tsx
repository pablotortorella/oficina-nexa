import { useEffect, useState } from 'react';
import { departamentosBase } from '@jules/oficina';
import type { EstadoAgente } from '@jules/oficina';
import { BotonMic } from './BotonMic';
import { textoPlano } from './Markdown';
import {
  actuar,
  encargar,
  tomarOficina,
  TEXTO_ESTADO,
  tareaActiva,
  tareasDe,
  type AccionTarea,
  type AgenteTrabajo,
  type EstadoOficina,
  type Tarea,
} from './trabajo';
import { zonaActual } from './zona';

type EstadoMic = 'reposo' | 'escuchando' | 'pensando';

interface Props {
  oficina: EstadoOficina | null;
  /** El servidor no respondió en el último sondeo. */
  sinServidor: boolean;
  agente: AgenteTrabajo | undefined;
  estado: EstadoAgente | undefined;
  /** Pide un sondeo inmediato después de una acción. */
  onCambio: () => void;
  onVestir: () => void;
  /** Abre el lector con el resultado de una tarea. */
  onLeer: (tarea: Tarea) => void;
  /** Nexa escucha mientras grabás y piensa mientras transcribe. */
  onMic: (estado: EstadoMic) => void;
}

/** Minutos y segundos desde `desde` hasta ahora. */
function transcurrido(desde: string | undefined, ahora: number): string {
  if (!desde) return '';
  const s = Math.max(0, Math.floor((ahora - Date.parse(desde)) / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', {
    timeZone: zonaActual(),
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Aviso de solo mirar cuando la oficina está abierta en otra computadora, con el botón para tomarla. */
function AvisoOtraCompu({ oficina, onCambio }: { oficina: EstadoOficina | null; onCambio: () => void }) {
  const [tomando, setTomando] = useState(false);
  const otra = oficina?.abiertaEn;
  if (!otra) return null;
  const hora = new Date(otra.desde).toLocaleTimeString('es-AR', {
    timeZone: zonaActual(),
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <div className="aviso-otra-compu" role="status">
      <p>
        <strong>Solo mirar:</strong> la oficina está abierta en <b>{otra.host}</b> (desde las {hora}).
      </p>
      <button
        type="button"
        className="btn principal"
        disabled={tomando}
        onClick={async () => {
          setTomando(true);
          try {
            await tomarOficina();
            onCambio();
          } finally {
            setTomando(false);
          }
        }}
      >
        {tomando ? 'Tomando la oficina…' : 'Usar la oficina acá'}
      </button>
      <p className="nota">{otra.host} pasa a solo mirar en menos de un minuto. Lo que estaba haciendo sigue acá.</p>
    </div>
  );
}

/** Suma el texto dictado a lo que ya había escrito. */
const sumar = (previo: string, nuevo: string) => (previo.trim() ? `${previo.trimEnd()} ${nuevo}` : nuevo);

/** Panel de un agente real: encargos, progreso, revisión del resultado e historial. */
export function PanelTrabajo({
  oficina,
  sinServidor,
  agente,
  estado,
  onCambio,
  onVestir,
  onLeer,
  onMic,
}: Props) {
  const [encargo, setEncargo] = useState('');
  const [cambios, setCambios] = useState('');
  const [comentario, setComentario] = useState('');
  const [pidiendoCambios, setPidiendoCambios] = useState(false);
  const [empujon, setEmpujon] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const tareas = oficina && agente ? tareasDe(oficina, agente.id) : [];
  const activa = tareaActiva(tareas);
  const trabajando = activa?.estado === 'trabajando';

  // Al cambiar de agente o de tarea se limpia lo escrito a medias.
  useEffect(() => {
    setEncargo('');
    setError(null);
  }, [agente?.id]);
  useEffect(() => {
    setCambios('');
    setComentario('');
    setPidiendoCambios(false);
    setEmpujon(false);
  }, [agente?.id, activa?.id, activa?.version]);

  useEffect(() => {
    if (!trabajando) return;
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, [trabajando]);

  const correr = async (accion: () => Promise<unknown>, alTerminar?: () => void) => {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      alTerminar?.();
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.');
    } finally {
      setOcupado(false);
    }
  };

  const sobre = (t: Tarea, accion: AccionTarea, texto?: string, alTerminar?: () => void) =>
    correr(() => actuar(t.id, accion, texto), alTerminar);

  if (!agente) {
    return (
      <aside className="hud detalle trabajo" aria-live="polite">
        <AvisoOtraCompu oficina={oficina} onCambio={onCambio} />
        {sinServidor ? (
          <p className="aviso-error">
            El servidor de la oficina no responde. Revisá que esté corriendo <code>npm run dev</code>.
          </p>
        ) : (
          <p className="nota">
            {oficina?.agentes.length
              ? `Tocá a ${new Intl.ListFormat('es', { type: 'disjunction' }).format(oficina.agentes.map((a) => a.nombre))} para encargarles algo.`
              : 'Tocá a un agente para encargarle algo.'}
          </p>
        )}
        {oficina && <p className="nota">Todo lo que hacen queda en {oficina.espacio}</p>}
      </aside>
    );
  }

  const depto = departamentosBase.find((d) => d.id === agente.departamento);
  const enCola = tareas.filter((t) => t.estado === 'en_cola' && t.id !== activa?.id).length;
  const historial = tareas.filter((t) => t.id !== activa?.id).slice(0, 5);
  const ocupadoAgente = activa?.estado === 'trabajando' || activa?.estado === 'en_cola';

  const descartar = (t: Tarea) => {
    // Empujoncito: la primera vez sin comentario, pregunta por qué.
    if (!comentario.trim() && !empujon) {
      setEmpujon(true);
      return;
    }
    void sobre(t, 'descartar', comentario.trim() || undefined);
  };

  return (
    <aside className="hud detalle trabajo" aria-live="polite">
      <AvisoOtraCompu oficina={oficina} onCambio={onCambio} />
      <div>
        <h2>{agente.nombre}</h2>
        <div className="sub">
          {agente.puesto}
          {depto ? ` · ${depto.nombre}` : ''}
          {agente.web ? ' · busca en la web' : ''}
        </div>
      </div>

      {activa ? (
        <div className={`estado estado-${estado ?? 'libre'}`}>
          <strong>
            {TEXTO_ESTADO[activa.estado]}
            {activa.estado === 'trabajando' && ` · ${transcurrido(activa.iniciada, ahora)}`}
            {activa.version > 0 && activa.estado !== 'trabajando' && ` · versión ${activa.version}`}
          </strong>
          <span>{activa.titulo ?? activa.encargo}</span>
          {activa.cambios.length > 0 && activa.estado === 'trabajando' && (
            <span className="nota">Aplicando: {activa.cambios.at(-1)}</span>
          )}
        </div>
      ) : (
        <div className="estado estado-libre">
          <strong>Libre</strong>
          <span>Esperando un encargo.</span>
        </div>
      )}

      {activa?.estado === 'trabajando' && (
        <div className="acciones">
          <button type="button" className="btn" disabled={ocupado} onClick={() => sobre(activa, 'cancelar')}>
            Cancelar
          </button>
        </div>
      )}

      {activa?.estado === 'esperando_aprobacion' && (
        <>
          <p className="nota">{activa.motivoAprobacion ?? 'Nexa quiere tu ok antes de empezar.'}</p>
          <div className="acciones">
            <button type="button" className="btn principal" disabled={ocupado} onClick={() => sobre(activa, 'iniciar')}>
              Empezar
            </button>
            <button type="button" className="btn" disabled={ocupado} onClick={() => sobre(activa, 'descartar')}>
              Descartar
            </button>
          </div>
        </>
      )}

      {activa?.estado === 'para_revisar' && (
        <>
          <button
            type="button"
            className="resultado-previa"
            onClick={() => onLeer(activa)}
            aria-label={`Leer el resultado completo de ${agente.nombre}`}
          >
            {textoPlano(activa.resultado ?? '').slice(0, 320)}…
            <span className="previa-leer">Leer completo</span>
          </button>
          {pidiendoCambios ? (
            <form
              className="encargo-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (cambios.trim())
                  void sobre(activa, 'cambios', cambios, () => {
                    setCambios('');
                    setPidiendoCambios(false);
                  });
              }}
            >
              <div className="campo-con-mic">
                <textarea
                  value={cambios}
                  onChange={(e) => setCambios(e.target.value)}
                  placeholder="Qué querés que cambie…"
                  rows={3}
                  maxLength={2000}
                  autoFocus
                  aria-label="Cambios pedidos"
                />
                <BotonMic etiqueta="Dictar los cambios" onTexto={(t) => setCambios((p) => sumar(p, t))} onEstado={onMic} />
              </div>
              <div className="acciones">
                <button type="submit" className="btn principal" disabled={ocupado || !cambios.trim()}>
                  Enviar cambios
                </button>
                <button type="button" className="btn" onClick={() => setPidiendoCambios(false)}>
                  Volver
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="campo-con-mic">
                <textarea
                  value={comentario}
                  onChange={(e) => {
                    setComentario(e.target.value);
                    if (e.target.value.trim()) setEmpujon(false);
                  }}
                  placeholder={`Comentario para ${agente.nombre} (opcional): qué te gustó, qué no. Lo va a tener en cuenta.`}
                  rows={2}
                  maxLength={2000}
                  aria-label={`Comentario para ${agente.nombre}`}
                />
                <BotonMic etiqueta="Dictar el comentario" onTexto={(t) => setComentario((p) => sumar(p, t))} onEstado={onMic} />
              </div>
              {empujon && (
                <p className="empujon" role="status">
                  ¿Lo descartás sin contarle por qué? Una línea alcanza para que {agente.nombre} aprenda.
                </p>
              )}
              <div className="acciones">
                <button type="button" className="btn" onClick={() => onLeer(activa)}>
                  Leer
                </button>
                <button
                  type="button"
                  className="btn principal"
                  disabled={ocupado}
                  onClick={() => sobre(activa, 'aprobar', comentario.trim() || undefined)}
                >
                  Aprobar
                </button>
                <button type="button" className="btn" disabled={ocupado} onClick={() => setPidiendoCambios(true)}>
                  Pedir cambios
                </button>
                <button type="button" className="btn" disabled={ocupado} onClick={() => descartar(activa)}>
                  {empujon ? 'Descartar igual' : 'Descartar'}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {activa?.estado === 'error' && (
        <>
          <p className="aviso-error">{activa.error ?? 'Algo falló.'}</p>
          <div className="acciones">
            <button type="button" className="btn principal" disabled={ocupado} onClick={() => sobre(activa, 'reintentar')}>
              Reintentar
            </button>
            <button type="button" className="btn" disabled={ocupado} onClick={() => sobre(activa, 'descartar')}>
              Descartar
            </button>
          </div>
        </>
      )}

      <form
        className="encargo-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (encargo.trim()) void correr(() => encargar(agente.id, encargo), () => setEncargo(''));
        }}
      >
        <div className="campo-con-mic">
          <textarea
            value={encargo}
            onChange={(e) => setEncargo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
            }}
            placeholder={`Nuevo encargo para ${agente.nombre}…`}
            rows={3}
            maxLength={2000}
            aria-label={`Encargo para ${agente.nombre}`}
          />
          <BotonMic etiqueta="Dictar el encargo" onTexto={(t) => setEncargo((p) => sumar(p, t))} onEstado={onMic} />
        </div>
        {!encargo && (
          <div className="chips">
            {agente.ejemplos.map((ej) => (
              <button key={ej} type="button" className="chip" onClick={() => setEncargo(ej)}>
                {ej}
              </button>
            ))}
          </div>
        )}
        <div className="acciones">
          <button
            type="submit"
            className="btn principal"
            disabled={ocupado || !encargo.trim() || Boolean(oficina?.abiertaEn)}
          >
            {ocupadoAgente ? 'Encargar (queda en cola)' : 'Encargar'}
          </button>
          <button type="button" className="btn" onClick={onVestir}>
            Vestir
          </button>
        </div>
        {enCola > 0 && <p className="nota">{enCola} en cola después de esto.</p>}
      </form>

      {error && <p className="aviso-error">{error}</p>}

      {historial.length > 0 && (
        <details className="historial">
          <summary>Historial</summary>
          <ul>
            {historial.map((t) => (
              <li key={t.id}>
                <span className={`chip-estado chip-${t.estado}`}>{TEXTO_ESTADO[t.estado]}</span>
                <span className="historial-titulo">
                  {t.resultado ? (
                    <button type="button" className="enlace" onClick={() => onLeer(t)}>
                      {t.titulo ?? t.encargo}
                    </button>
                  ) : (
                    (t.titulo ?? t.encargo)
                  )}
                </span>
                {t.comentario && <span className="historial-comentario">«{t.comentario}»</span>}
                <span className="nota">
                  {fecha(t.actualizada)}
                  {t.archivo ? ` · ${t.archivo}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </aside>
  );
}
