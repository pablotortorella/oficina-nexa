import { Cupo } from './Cupo';
import type { Resumen } from './resumen';
import type { Cupo as DatosCupo } from './trabajo';

/** Marca y burbuja de Nexa: resumen de la oficina y qué decisiones esperan. */
export function Burbuja({ resumen, cupo }: { resumen: Resumen; cupo?: DatosCupo | null }) {
  const { linea, mensaje } = resumen;
  return (
    <header className="hud burbuja" aria-live="polite">
      <h1>
        <span className="orbe" aria-hidden="true" />
        Oficina de Nexa
      </h1>
      <p className="burbuja-resumen">{linea}</p>
      <p className="burbuja-mensaje">
        {mensaje.negrita && <b>{mensaje.negrita}</b>}
        {mensaje.resto}
      </p>
      <Cupo cupo={cupo} />
    </header>
  );
}
