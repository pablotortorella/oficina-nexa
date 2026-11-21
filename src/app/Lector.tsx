import { useEffect, useRef, useState } from 'react';
import { retratoDe } from './avatares';
import { Markdown, textoPlano } from './Markdown';
import type { Tarea } from './trabajo';
import { VELOCIDADES, vozNexa } from './voz';

const NOMBRE_CORTO = { codex: 'ChatGPT', claude: 'Claude', compatible: 'un modelo compatible con OpenAI' } as const;

interface Props {
  tarea: Tarea;
  nombreAgente: string;
  velocidad: number;
  onVelocidad: (v: number) => void;
  onCerrar: () => void;
}

/** Lector a pantalla casi completa: el resultado formateado, copiar y escucharlo con la voz de Nexa. */
export function Lector({ tarea, nombreAgente, velocidad, onVelocidad, onCerrar }: Props) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const [hablando, setHablando] = useState(false);
  const cerrar = useRef<HTMLButtonElement>(null);

  useEffect(() => vozNexa.suscribir((e) => setHablando(e.hablando)), []);
  useEffect(() => {
    cerrar.current?.focus();
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [onCerrar]);

  const texto = tarea.resultado ?? '';
  const retrato = retratoDe(tarea.agenteId);

  const copiar = async (que: 'texto' | 'markdown') => {
    try {
      await navigator.clipboard.writeText(que === 'texto' ? textoPlano(texto) : texto);
      setCopiado(que === 'texto' ? 'Texto copiado' : 'Markdown copiado');
    } catch {
      setCopiado('No pude copiar');
    }
    setTimeout(() => setCopiado(null), 2000);
  };

  const resumen =
    tarea.resumen ??
    `${nombreAgente} terminó «${tarea.titulo ?? tarea.encargo}». El resumen todavía se está preparando, así que te leo el comienzo. ${textoPlano(texto).slice(0, 400)}`;

  return (
    <div className="lector-fondo" role="presentation" onClick={onCerrar}>
      <section
        className="lector"
        role="dialog"
        aria-modal="true"
        aria-label={`Resultado de ${nombreAgente}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="lector-cabecera">
          <div className="lector-titulo">
            {retrato && (
              <img
                className="lector-retrato"
                src={retrato}
                alt=""
                onError={(e) => {
                  e.currentTarget.hidden = true;
                }}
              />
            )}
            <div>
              <div className="sub">
                {nombreAgente} · versión {tarea.version}
                {tarea.motor ? ` · hecho con ${NOMBRE_CORTO[tarea.motor]}` : ''}
              </div>
              <h2>{tarea.titulo ?? tarea.encargo}</h2>
            </div>
          </div>
          <button ref={cerrar} type="button" className="btn-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="lector-barra">
          <div className="lector-grupo">
            {hablando ? (
              <button type="button" className="btn" onClick={() => vozNexa.detener()}>
                Detener
              </button>
            ) : (
              <>
                <button type="button" className="btn" onClick={() => void vozNexa.decir(resumen)}>
                  Escuchar resumen
                </button>
                <button type="button" className="btn" onClick={() => void vozNexa.decir(texto)}>
                  Escuchar todo
                </button>
              </>
            )}
            <div className="seg" role="group" aria-label="Velocidad de lectura">
              {VELOCIDADES.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={v === velocidad}
                  onClick={() => {
                    onVelocidad(v);
                    vozNexa.setVelocidad(v);
                  }}
                >
                  {String(v).replace('.', ',')}x
                </button>
              ))}
            </div>
          </div>
          <div className="lector-grupo">
            <button type="button" className="btn" onClick={() => void copiar('texto')}>
              Copiar
            </button>
            <button type="button" className="btn" onClick={() => void copiar('markdown')}>
              Copiar Markdown
            </button>
            {copiado && (
              <span className="nota" role="status">
                {copiado}
              </span>
            )}
          </div>
        </div>

        <div className="lector-cuerpo" tabIndex={0}>
          <Markdown texto={texto} />
        </div>
        {tarea.archivo && <p className="nota ruta lector-ruta">{tarea.archivo}</p>}
      </section>
    </div>
  );
}
