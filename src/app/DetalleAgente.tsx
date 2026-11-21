import { useEffect, useRef, useState } from 'react';
import { departamentosBase } from '@jules/oficina';
import { cuerpoCompletoDe } from './avatares';
import { leerDatosAgente, type AgenteTrabajo, type DatosAgente } from './trabajo';

type Carga =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'lista'; datos: DatosAgente };

interface Props {
  agente: AgenteTrabajo;
  onCerrar: () => void;
}

/** Ventana con el detalle de un agente: su imagen de cuerpo completo, sus características y lo que aprendió. */
export function DetalleAgente({ agente, onCerrar }: Props) {
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' });
  const [imagenRota, setImagenRota] = useState(false);
  const cerrar = useRef<HTMLButtonElement>(null);
  const imagen = cuerpoCompletoDe(agente.id);
  const depto = departamentosBase.find((d) => d.id === agente.departamento);
  const idTitulo = `detalle-agente-${agente.id}`;

  useEffect(() => cerrar.current?.focus(), []);
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [onCerrar]);

  // Los aprendizajes y la IA se piden cada vez que se abre la ventana (o se cambia de agente).
  useEffect(() => {
    let vigente = true;
    setCarga({ estado: 'cargando' });
    setImagenRota(false);
    void leerDatosAgente(agente.id).then(
      (datos) => {
        if (vigente) setCarga({ estado: 'lista', datos });
      },
      (e: unknown) => {
        if (vigente) setCarga({ estado: 'error', mensaje: e instanceof Error ? e.message : 'No se pudo leer.' });
      },
    );
    return () => {
      vigente = false;
    };
  }, [agente.id]);

  // Lo más nuevo primero.
  const aprendizajes = carga.estado === 'lista' ? [...carga.datos.aprendizajes].reverse() : [];

  return (
    <div className="lector-fondo" role="presentation" onClick={onCerrar}>
      <section
        className="detalle-agente"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        onClick={(e) => e.stopPropagation()}
      >
        {imagen && !imagenRota && (
          <figure className="detalle-agente-figura">
            <img
              src={imagen}
              alt={`${agente.nombre}, ${agente.puesto}, de cuerpo completo`}
              onError={() => setImagenRota(true)}
            />
          </figure>
        )}
        <div className="detalle-agente-contenido">
          <header className="lector-cabecera">
            <div>
              <div className="sub">
                {agente.puesto}
                {depto ? ` · ${depto.nombre}` : ''}
              </div>
              <h2 id={idTitulo}>{agente.nombre}</h2>
            </div>
            <button ref={cerrar} type="button" className="btn-cerrar" onClick={onCerrar} aria-label="Cerrar">
              ×
            </button>
          </header>

          <div className="detalle-agente-cuerpo" tabIndex={0}>
            <section aria-label="Características">
              <h3>Características</h3>
              <dl className="datos-agente">
                <dt>Busca en la web</dt>
                <dd>{agente.web ? 'Sí, con fuentes enlazadas' : 'No, trabaja con tu contexto y el encargo'}</dd>
                <dt>IA con la que trabaja</dt>
                <dd>{carga.estado === 'lista' ? carga.datos.nombreMotor : carga.estado === 'cargando' ? '…' : 'No pude leerla'}</dd>
                <dt>Su carpeta</dt>
                <dd>
                  <code>{agente.carpeta}/</code>
                </dd>
                <dt>Encargos típicos</dt>
                <dd>
                  <ul className="datos-agente-lista">
                    {agente.ejemplos.map((ej) => (
                      <li key={ej}>{ej}</li>
                    ))}
                  </ul>
                </dd>
              </dl>
            </section>

            <section aria-label="Aprendizajes">
              <h3>Aprendizajes</h3>
              {carga.estado === 'cargando' && <p className="nota">Leyendo el contexto de {agente.nombre}…</p>}
              {carga.estado === 'error' && (
                <p className="aviso-error" role="alert">
                  No pude leer los aprendizajes: {carga.mensaje}
                </p>
              )}
              {carga.estado === 'lista' &&
                (aprendizajes.length === 0 ? (
                  <p className="nota">
                    Todavía no aprendió nada de vos. Cuando aprobás o descartás un resultado y dejás un comentario,
                    queda acá y {agente.nombre} lo tiene en cuenta en los próximos encargos.
                  </p>
                ) : (
                  <ul className="aprendizajes">
                    {aprendizajes.map((texto, i) => (
                      <li key={`${aprendizajes.length - i}-${texto}`}>{texto}</li>
                    ))}
                  </ul>
                ))}
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
