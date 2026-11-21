import { useEffect, useRef, useState } from 'react';
import { grabarDictado, type Grabacion } from './voz';

interface Props {
  /** Recibe el texto transcripto para sumarlo al campo (vos lo revisás antes de enviar). */
  onTexto: (texto: string) => void;
  /** Avisa si está escuchando o transcribiendo, para la presencia de Nexa. */
  onEstado?: (estado: 'reposo' | 'escuchando' | 'pensando') => void;
  etiqueta: string;
}

/** Botón de micrófono: un toque empieza a grabar, otro termina y transcribe con Whisper. */
export function BotonMic({ onTexto, onEstado, etiqueta }: Props) {
  const [estado, setEstado] = useState<'reposo' | 'escuchando' | 'pensando'>('reposo');
  const [error, setError] = useState<string | null>(null);
  const grabacion = useRef<Grabacion | null>(null);

  const cambiar = (e: 'reposo' | 'escuchando' | 'pensando') => {
    setEstado(e);
    onEstado?.(e);
  };

  // Si el panel se cierra mientras graba, se suelta el micrófono.
  useEffect(() => () => grabacion.current?.cancelar(), []);

  const tocar = async () => {
    setError(null);
    if (estado === 'reposo') {
      try {
        grabacion.current = await grabarDictado();
        cambiar('escuchando');
      } catch {
        setError('No tengo acceso al micrófono.');
      }
      return;
    }
    if (estado !== 'escuchando' || !grabacion.current) return;
    cambiar('pensando');
    try {
      const texto = await grabacion.current.terminar();
      if (texto) onTexto(texto);
      else setError('No escuché nada.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude transcribir.');
    } finally {
      grabacion.current = null;
      cambiar('reposo');
    }
  };

  const titulo =
    estado === 'escuchando' ? 'Terminar y transcribir' : estado === 'pensando' ? 'Transcribiendo…' : etiqueta;
  return (
    <span className="mic-envoltorio">
      <button
        type="button"
        className={`btn-mic mic-${estado}`}
        onClick={() => void tocar()}
        disabled={estado === 'pensando'}
        aria-label={titulo}
        title={titulo}
        aria-pressed={estado === 'escuchando'}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          {estado === 'escuchando' ? (
            <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
          ) : (
            <path
              fill="currentColor"
              d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
            />
          )}
        </svg>
        <span className="mic-texto">
          {estado === 'escuchando' ? 'Grabando…' : estado === 'pensando' ? 'Transcribiendo…' : ''}
        </span>
      </button>
      {error && <span className="mic-error">{error}</span>}
    </span>
  );
}
