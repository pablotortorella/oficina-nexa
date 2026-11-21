import { Cupo } from './Cupo';
import type { Resumen } from './resumen';
import type { Cupo as DatosCupo } from './trabajo';

/** Marca y burbuja de Nexa: resumen de la oficina y qué decisiones esperan. */
interface Props {
  resumen: Resumen;
  cupo?: DatosCupo | null;
  motor?: string;
  nombreMotor?: string;
}

export function Burbuja({ resumen, cupo, motor, nombreMotor }: Props) {
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
      {motor === 'codex' || !motor ? (
        <Cupo cupo={cupo} />
      ) : (
        <p className="cupo nota">
          Trabajan con {nombreMotor ?? motor}. El cupo solo se puede ver con ChatGPT.
        </p>
      )}
    </header>
  );
}
