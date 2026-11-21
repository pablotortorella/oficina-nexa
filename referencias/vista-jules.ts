import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import {
  CIAN,
  CODO_Y,
  COLORES,
  CUELLO_Y,
  HOMBRO_X,
  HOMBRO_Y,
  geometriasJules,
} from '../src/oficina/render/jules/modelo';

/** Arma la figura de pie igual que `Jules.tsx`, sin animación. */
function figura(): Group {
  const g = geometriasJules();
  const cuerpo = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const cian = new MeshBasicMaterial({ color: CIAN, toneMapped: false });
  const raiz = new Group();
  raiz.add(new Mesh(g.cuerpo, cuerpo));
  const cabeza = new Group();
  cabeza.position.y = CUELLO_Y;
  cabeza.add(new Mesh(g.cabeza, cuerpo), new Mesh(g.modulo, cian));
  const boca = new Mesh(g.boca, new MeshStandardMaterial({ color: COLORES.labio }));
  boca.position.set(0, 0.095, 0.192);
  cabeza.add(boca);
  raiz.add(cabeza);
  const tableta = new Group();
  tableta.position.set(-HOMBRO_X, HOMBRO_Y, 0);
  tableta.add(new Mesh(g.brazoTableta, cuerpo), new Mesh(g.pantalla, cian));
  raiz.add(tableta);
  const libre = new Group();
  libre.position.set(HOMBRO_X, HOMBRO_Y, 0);
  libre.rotation.z = 0.12;
  libre.add(new Mesh(g.brazoSuperior, cuerpo));
  const codo = new Group();
  codo.position.y = CODO_Y;
  codo.add(new Mesh(g.brazoInferior, cuerpo));
  libre.add(codo);
  raiz.add(libre);
  return raiz;
}

const escena = new Scene();
escena.background = new Color('#e9e9e9');
escena.add(new HemisphereLight('#ffffff', '#b8b0a4', 1.6));
const sol = new DirectionalLight('#ffffff', 2.2);
sol.position.set(2, 4, 5);
escena.add(sol);

// Frente, tres cuartos (lado del módulo), perfil derecho y espalda.
[0, Math.PI / 4, Math.PI / 2, Math.PI].forEach((giro, i) => {
  const f = figura();
  f.rotation.y = giro;
  f.position.x = (i - 1.5) * 1.05;
  escena.add(f);
});

const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);
const camara = new OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
camara.position.set(0, 0.95, 10);

function ajustar() {
  const ancho = window.innerWidth;
  const alto = window.innerHeight;
  renderer.setSize(ancho, alto);
  const medioAlto = 1.05;
  const medioAncho = Math.max(2.3, (medioAlto * ancho) / alto);
  camara.left = -medioAncho;
  camara.right = medioAncho;
  camara.top = medioAlto;
  camara.bottom = -medioAlto;
  camara.updateProjectionMatrix();
  renderer.render(escena, camara);
}
window.addEventListener('resize', ajustar);
ajustar();
