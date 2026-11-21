import {
  BufferGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  TorusGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Jules con la apariencia de Nexa (referencia: `referencias/nexa.webp`): humanoide IA de placas
 * crema y articulaciones grafito, melena bob con un mechón curvo, ojos grandes, módulo circular
 * cian a un costado de la cabeza y tableta cian en la mano derecha. Figura procedural por bloques
 * (mismo lenguaje que las personas): cada grupo de piezas se funde en una sola geometría con
 * color por vértice. Medidas en metros con los pies en y = 0. La figura mira hacia +z, así que
 * su mano derecha (la de la tableta) queda en -x.
 */
export const COLORES = {
  piel: '#d9a27e',
  pelo: '#2b211d',
  placa: '#e6d5bf',
  placaSombra: '#cdbba3',
  articulacion: '#2e3036',
  acento: '#d07a3c',
  ojo: '#2a1f1c',
  brillo: '#fff8ee',
  tableta: '#2a2e38',
  modulo: '#1e2126',
  labio: '#5a2e2a',
} as const;

/** Cian que brilla: anillo del módulo y pantalla de la tableta. */
export const CIAN = '#46dbe8';

/** Dónde están las articulaciones, en el sistema de la figura. */
export const HOMBRO_X = 0.31;
export const HOMBRO_Y = 1.2;
export const CUELLO_Y = 1.3;
export const CODO_Y = -0.3;

type Tupla = [number, number, number];

function pieza(g: BufferGeometry, color: string, m: Matrix4): BufferGeometry {
  const copia = g;
  copia.applyMatrix4(m);
  const n = copia.getAttribute('position').count;
  const c = new Color(color);
  const colores = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(colores, i * 3);
  copia.setAttribute('color', new Float32BufferAttribute(colores, 3));
  return copia;
}

const mover = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
  new Matrix4()
    .makeTranslation(x, y, z)
    .multiply(new Matrix4().makeRotationFromEuler(new Euler(rx, ry, rz)));

function bloque(
  [w, h, d]: Tupla,
  [x, y, z]: Tupla,
  color: string,
  radio = 0.025,
  rot: Tupla = [0, 0, 0],
  base?: Matrix4,
): BufferGeometry {
  const m = (base ?? new Matrix4()).clone().multiply(mover(x, y, z, ...rot));
  return pieza(new RoundedBoxGeometry(w, h, d, 2, radio), color, m);
}

const fundir = (partes: BufferGeometry[]) => {
  const g = mergeGeometries(partes);
  if (!g) throw new Error('Jules: las piezas no comparten atributos');
  return g;
};

/** Lado del módulo de la cabeza: el derecho de la figura (-x), como en la referencia. */
const LADO_MODULO = -1;
const MODULO_X = 0.3;
const MODULO_Y = 0.2;

/** Piernas segmentadas, botas con suela, cadera, cintura, pecho con insignia y cuello. */
function crearCuerpo(): BufferGeometry {
  const c = COLORES;
  const partes: BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const x = s * 0.1;
    // Bota crema con suela grafito.
    partes.push(bloque([0.19, 0.035, 0.31], [x, 0.018, 0.04], c.articulacion, 0.012));
    partes.push(bloque([0.18, 0.1, 0.29], [x, 0.08, 0.04], c.placa, 0.04));
    // Tobillo, canilla, rodilla, muslo.
    partes.push(bloque([0.11, 0.07, 0.11], [x, 0.16, 0], c.articulacion, 0.02));
    partes.push(bloque([0.16, 0.25, 0.18], [x, 0.31, 0], c.placa, 0.04));
    partes.push(bloque([0.12, 0.07, 0.13], [x, 0.465, 0], c.articulacion, 0.02));
    partes.push(bloque([0.18, 0.25, 0.2], [x, 0.62, 0], c.placa, 0.045));
  }
  // Cadera crema y cintura grafito.
  partes.push(bloque([0.38, 0.13, 0.24], [0, 0.78, 0], c.placa, 0.05));
  partes.push(bloque([0.33, 0.07, 0.21], [0, 0.875, 0], c.articulacion, 0.025));
  // Pecho: placa grande, con una placa más baja en sombra para marcar el abdomen.
  partes.push(bloque([0.4, 0.1, 0.24], [0, 0.95, 0], c.placaSombra, 0.04));
  partes.push(bloque([0.48, 0.24, 0.27], [0, 1.1, 0], c.placa, 0.06));
  // Insignia naranja en el lado izquierdo del pecho.
  partes.push(bloque([0.08, 0.026, 0.012], [0.11, 1.15, 0.137], c.acento, 0.006));
  // Hombros grafito (de ahí cuelgan los brazos), collar y cuello segmentado.
  partes.push(bloque([0.6, 0.06, 0.2], [0, 1.2, 0], c.articulacion, 0.025));
  partes.push(bloque([0.18, 0.04, 0.15], [0, 1.24, 0], c.articulacion, 0.015));
  partes.push(bloque([0.1, 0.1, 0.1], [0, CUELLO_Y - 0.02, 0], c.articulacion, 0.025));
  return fundir(partes);
}

/** Cabeza: cara, ojos grandes, cejas, melena bob en bloques, mechón curvo y módulo lateral. */
function crearCabeza(): BufferGeometry {
  const c = COLORES;
  const partes: BufferGeometry[] = [];
  // Cara.
  partes.push(bloque([0.38, 0.38, 0.36], [0, 0.22, 0], c.piel, 0.09));
  for (const s of [-1, 1]) {
    // Ojos grandes con un brillo, y cejas finas.
    partes.push(bloque([0.066, 0.09, 0.012], [s * 0.088, 0.225, 0.18], c.ojo, 0.024));
    partes.push(bloque([0.022, 0.022, 0.006], [s * 0.088 + 0.014, 0.252, 0.187], c.brillo, 0.006));
    partes.push(bloque([0.072, 0.012, 0.01], [s * 0.088, 0.295, 0.18], c.ojo, 0.005, [0, 0, -s * 0.12]));
  }
  // Melena bob: tapa, flequillo en dos mechones, laterales hasta la mandíbula y nuca.
  partes.push(bloque([0.5, 0.14, 0.46], [0, 0.42, -0.01], c.pelo, 0.06));
  partes.push(bloque([0.27, 0.11, 0.09], [-0.08, 0.36, 0.18], c.pelo, 0.035, [0, 0, 0.12]));
  partes.push(bloque([0.21, 0.1, 0.09], [0.12, 0.365, 0.18], c.pelo, 0.035, [0, 0, -0.16]));
  for (const s of [-1, 1]) {
    partes.push(bloque([0.09, 0.37, 0.37], [s * 0.235, 0.17, -0.02], c.pelo, 0.04));
  }
  partes.push(bloque([0.52, 0.43, 0.15], [0, 0.18, -0.2], c.pelo, 0.05));
  // Mechón curvo hacia arriba.
  partes.push(bloque([0.08, 0.1, 0.07], [0.0, 0.5, -0.03], c.pelo, 0.03, [0, 0, -0.2]));
  partes.push(bloque([0.07, 0.08, 0.065], [0.035, 0.565, -0.03], c.pelo, 0.028, [0, 0, -0.55]));
  partes.push(bloque([0.075, 0.05, 0.06], [0.085, 0.59, -0.03], c.pelo, 0.022, [0, 0, -1.1]));
  // Disco oscuro del módulo (el anillo cian que brilla va en `crearModulo`).
  partes.push(
    bloque([0.04, 0.13, 0.13], [LADO_MODULO * MODULO_X, MODULO_Y, 0], c.modulo, 0.03),
  );
  return fundir(partes);
}

/** Anillo cian del módulo lateral: geometría aparte para dibujarla con material que brilla. */
function crearModulo(): BufferGeometry {
  const anillo = new TorusGeometry(0.048, 0.013, 6, 24);
  anillo.applyMatrix4(
    mover(LADO_MODULO * (MODULO_X + 0.022), MODULO_Y, 0, 0, Math.PI / 2, 0),
  );
  return anillo;
}

/** Hombrera: crema, o naranja en el hombro izquierdo como en la referencia. */
function hombrera(color: string, base?: Matrix4): BufferGeometry {
  return bloque([0.16, 0.13, 0.17], [0, -0.02, 0], color, 0.045, [0, 0, 0], base);
}

/** Brazo de la tableta (derecho): hombro, codo doblado hacia adelante y tableta en la mano. */
function crearBrazoTableta(): { brazo: BufferGeometry; pantalla: BufferGeometry } {
  const c = COLORES;
  const flexHombro = -0.2;
  const flexCodo = -1.45;
  const hombro = new Matrix4().makeRotationX(flexHombro);
  const codo = hombro
    .clone()
    .multiply(new Matrix4().makeTranslation(0, CODO_Y, 0))
    .multiply(new Matrix4().makeRotationX(flexCodo));
  const mano = codo.clone().multiply(new Matrix4().makeTranslation(0, -0.31, 0));
  const partes: BufferGeometry[] = [
    hombrera(c.placa, hombro),
    bloque([0.1, 0.06, 0.1], [0, -0.11, 0], c.articulacion, 0.02, [0, 0, 0], hombro),
    bloque([0.13, 0.15, 0.14], [0, -0.215, 0], c.placa, 0.035, [0, 0, 0], hombro),
    bloque([0.1, 0.07, 0.1], [0, 0, 0], c.articulacion, 0.025, [0, 0, 0], codo),
    bloque([0.125, 0.19, 0.135], [0, -0.13, 0], c.placa, 0.035, [0, 0, 0], codo),
    bloque([0.08, 0.04, 0.08], [0, -0.245, 0], c.articulacion, 0.015, [0, 0, 0], codo),
    bloque([0.1, 0.1, 0.09], [0, -0.01, 0], c.placa, 0.03, [0, 0, 0], mano),
  ];
  const tableta = mano.clone().multiply(mover(0, 0.1, 0.07, 0, 0.5, 0));
  partes.push(bloque([0.23, 0.31, 0.025], [0, 0, 0], c.tableta, 0.015, [0, 0, 0], tableta));
  // La pantalla se dibuja aparte, con material propio que brilla.
  const pantalla = new RoundedBoxGeometry(0.2, 0.27, 0.004, 1, 0.002);
  pantalla.applyMatrix4(tableta.clone().multiply(new Matrix4().makeTranslation(0, 0, 0.0135)));
  return { brazo: fundir(partes), pantalla };
}

/** Brazo libre (izquierdo): brazo superior con hombrera naranja, y antebrazo con mano. */
function crearBrazoLibre(): { superior: BufferGeometry; inferior: BufferGeometry } {
  const c = COLORES;
  return {
    superior: fundir([
      hombrera(c.acento),
      bloque([0.1, 0.06, 0.1], [0, -0.11, 0], c.articulacion, 0.02),
      bloque([0.13, 0.15, 0.14], [0, -0.215, 0], c.placa, 0.035),
    ]),
    inferior: fundir([
      bloque([0.1, 0.07, 0.1], [0, 0, 0], c.articulacion, 0.025),
      bloque([0.125, 0.19, 0.135], [0, -0.13, 0], c.placa, 0.035),
      bloque([0.08, 0.04, 0.08], [0, -0.245, 0], c.articulacion, 0.015),
      bloque([0.1, 0.1, 0.09], [0, -0.31, 0], c.placa, 0.03),
    ]),
  };
}

export interface GeometriasJules {
  cuerpo: BufferGeometry;
  cabeza: BufferGeometry;
  modulo: BufferGeometry;
  brazoTableta: BufferGeometry;
  pantalla: BufferGeometry;
  brazoSuperior: BufferGeometry;
  brazoInferior: BufferGeometry;
  boca: BufferGeometry;
}

let cache: GeometriasJules | null = null;

/** Geometrías de la figura, creadas una sola vez y compartidas. */
export function geometriasJules(): GeometriasJules {
  if (!cache) {
    const tableta = crearBrazoTableta();
    const libre = crearBrazoLibre();
    cache = {
      cuerpo: crearCuerpo(),
      cabeza: crearCabeza(),
      modulo: crearModulo(),
      brazoTableta: tableta.brazo,
      pantalla: tableta.pantalla,
      brazoSuperior: libre.superior,
      brazoInferior: libre.inferior,
      boca: new RoundedBoxGeometry(0.07, 0.018, 0.01, 1, 0.005),
    };
  }
  return cache;
}
