import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  aplicarSkin,
  atuendoPorRol,
  catalogoBase,
  crearCatalogo,
  Oficina,
  paqueteFiestasPatrias,
  paqueteHalloween,
  paqueteNavidad,
  plano,
  registrarPaquete,
} from '@jules/oficina';
import type {
  AgenteOficina,
  Atuendo,
  MetricasRender,
  PaqueteSkins,
  PresenciaJules,
} from '@jules/oficina';
import { Burbuja } from './Burbuja';
import { fechaChileA } from './hora';
import { IndicadorAmbiente } from './IndicadorAmbiente';
import { Leyenda } from './Leyenda';
import { PanelFps } from './PanelFps';
import type { Calidad } from './PanelFps';
import {
  almacenLocal,
  cargarAmbiente,
  cargarAtuendos,
  guardarAmbiente,
  guardarAtuendos,
} from './persistencia';
import type { AtuendosGuardados } from './persistencia';
import { resumir } from './resumen';
import { SelectorAmbiente } from './SelectorAmbiente';
import { SelectorPresencia } from './SelectorPresencia';
import { Vestidor } from './Vestidor';
import { PanelAgentes } from './PanelAgentes';
import { PanelTrabajo } from './PanelTrabajo';
import { Lector } from './Lector';
import { DetalleAgente } from './DetalleAgente';
import { Configuracion } from './Configuracion';
import { alCambiarZona } from './zona';
import { vozNexa } from './voz';
import { agentesDeLaOficina, leerOficina, type EstadoOficina, type Tarea } from './trabajo';
import './estilos.css';

const paquetes = [paqueteHalloween, paqueteNavidad, paqueteFiestasPatrias];
const catalogo = paquetes.reduce(registrarPaquete, crearCatalogo(catalogoBase));
const idsAmbientes = plano.ambientes.map((a) => a.id);
/** Cada cuánto se pregunta al servidor por las tareas. */
const SONDEO_MS = 2000;
/** Recuerda si el panel de agentes quedó visible (preferencia de este navegador). */
const CLAVE_PANEL_AGENTES = 'oficina-panel-agentes';

function leerPanelAgentes(): boolean {
  try {
    return almacenLocal()?.getItem(CLAVE_PANEL_AGENTES) !== 'oculto';
  } catch {
    return true;
  }
}

/**
 * La oficina que trabaja: los agentes reales de `servidor/trabajo/agentes.ts`, con su estado
 * sacado de sus tareas, el panel de encargos, el lector y el vestidor. Nexa saluda al abrir,
 * lee en voz alta y escucha los dictados. Teclas: A muestra u oculta el panel de agentes, N hace
 * que la cámara siga a Nexa (de nuevo N vuelve a la vista general) y R muestra el rendimiento.
 */
export function Lab() {
  const [oficina, setOficina] = useState<EstadoOficina | null>(null);
  const [sinServidor, setSinServidor] = useState(false);
  const [panelFps, setPanelFps] = useState(false);
  const [panelAgentes, setPanelAgentes] = useState(leerPanelAgentes);
  const [siguiendoNexa, setSiguiendoNexa] = useState(false);
  const siguiendoNexaRef = useRef(false);
  /** El agente se eligió desde el panel: la cámara va hasta él. */
  const [enfoquePanel, setEnfoquePanel] = useState(false);
  const [leyendo, setLeyendo] = useState<{ tarea: Tarea; agente: string } | null>(null);
  const [velocidad, setVelocidad] = useState(1);
  const [voz, setVoz] = useState({ hablando: false, nivel: 0 });
  const [mic, setMic] = useState<'reposo' | 'escuchando' | 'pensando'>('reposo');
  const [configAbierta, setConfigAbierta] = useState(false);
  // Al cambiar la zona horaria se vuelve a dibujar (horas del panel, cupo, luz).
  const [, setVersionZona] = useState(0);
  useEffect(() => alCambiarZona(() => setVersionZona((v) => v + 1)), []);
  const ultimoJson = useRef('');
  const [atuendos, setAtuendos] = useState<AtuendosGuardados>(cargarAtuendos);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [vestidorAbierto, setVestidorAbierto] = useState(false);
  const [detallesAbiertos, setDetallesAbiertos] = useState(false);
  const hayVentanaAbierta = configAbierta || detallesAbiertos || leyendo !== null || vestidorAbierto;
  const cerrarDetalles = useCallback(() => setDetallesAbiertos(false), []);
  const [metricas, setMetricas] = useState<MetricasRender>({ webgl: true });
  const [calidad, setCalidad] = useState<Calidad>('auto');
  const [visible, setVisible] = useState(true);
  const [hora, setHora] = useState<number | null>(null);
  const [presencia, setPresencia] = useState<PresenciaJules>('reposo');
  const [nivelVoz, setNivelVoz] = useState<number | undefined>(undefined);
  const [vista, setVista] = useState(0);
  const [ambienteId, setAmbienteId] = useState<string | null>(() => cargarAmbiente(idsAmbientes));

  const sondear = useCallback(async () => {
    try {
      const datos = await leerOficina();
      setSinServidor(false);
      // Solo se reconstruye la escena si algo cambió.
      const json = JSON.stringify(datos);
      if (json !== ultimoJson.current) {
        ultimoJson.current = json;
        setOficina(datos);
      }
    } catch {
      setSinServidor(true);
    }
  }, []);

  useEffect(() => {
    void sondear();
    const reloj = setInterval(() => void sondear(), SONDEO_MS);
    return () => clearInterval(reloj);
  }, [sondear]);

  /** N: la cámara sigue a Nexa; al soltarla vuelve a la vista general. */
  const alternarNexa = useCallback(() => {
    const seguir = !siguiendoNexaRef.current;
    siguiendoNexaRef.current = seguir;
    setSiguiendoNexa(seguir);
    setAmbienteId(null);
    if (!seguir) {
      setEnfoquePanel(false);
      setVista((v) => v + 1);
    }
  }, []);

  /** Esc o el botón «Vista general»: sale del ambiente, suelta el enfoque y deja de seguir a Nexa. */
  const irAVistaGeneral = useCallback(() => {
    setAmbienteId(null);
    setEnfoquePanel(false);
    siguiendoNexaRef.current = false;
    setSiguiendoNexa(false);
    setVista((v) => v + 1);
  }, []);

  useEffect(() => {
    try {
      almacenLocal()?.setItem(CLAVE_PANEL_AGENTES, panelAgentes ? 'visible' : 'oculto');
    } catch {
      // Sin almacenamiento, el panel vuelve a mostrarse en la próxima visita.
    }
  }, [panelAgentes]);

  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      const destino = e.target as HTMLElement | null;
      if (destino && (['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName) || destino.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      // Con una ventana abierta (configuración, detalles, vestidor, lector), Esc solo la cierra.
      if (e.key === 'Escape') {
        if (!hayVentanaAbierta) irAVistaGeneral();
        return;
      }
      const tecla = e.key.toLowerCase();
      if (tecla === 'r') setPanelFps((v) => !v);
      else if (tecla === 'a') setPanelAgentes((v) => !v);
      else if (tecla === 'n') alternarNexa();
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [alternarNexa, irAVistaGeneral, hayVentanaAbierta]);

  // La voz de Nexa mueve su boca; el micrófono la pone a escuchar o a pensar.
  useEffect(() => vozNexa.suscribir((e) => setVoz({ hablando: e.hablando, nivel: e.nivel })), []);

  // Saludo al abrir. Si el navegador bloquea el audio hasta que toques la página, saluda con
  // tu primer toque o tecla.
  useEffect(() => {
    let saludo = false;
    const saludar = () => {
      if (saludo) return;
      saludo = true;
      quitar();
      void vozNexa.saludar();
    };
    const quitar = () => {
      window.removeEventListener('pointerdown', saludar);
      window.removeEventListener('keydown', saludar);
    };
    const intento = setTimeout(async () => {
      try {
        // Probar si el navegador deja sonar audio sin un toque previo.
        const contexto = new AudioContext();
        const permitido = contexto.state === 'running';
        void contexto.close();
        if (permitido) saludar();
        else {
          window.addEventListener('pointerdown', saludar, { once: true });
          window.addEventListener('keydown', saludar, { once: true });
        }
      } catch {
        saludar();
      }
    }, 1200);
    return () => {
      clearTimeout(intento);
      quitar();
    };
  }, []);

  const presenciaNexa: PresenciaJules = voz.hablando
    ? 'hablando'
    : mic !== 'reposo'
      ? mic
      : presencia;
  const nivelNexa = voz.hablando ? voz.nivel : nivelVoz;

  const agentes = useMemo(() => (oficina ? agentesDeLaOficina(oficina) : []), [oficina]);

  useEffect(() => guardarAtuendos(atuendos), [atuendos]);
  useEffect(() => guardarAmbiente(ambienteId), [ambienteId]);

  const agentesVista = useMemo<AgenteOficina[]>(
    () => agentes.map((a) => (atuendos[a.id] ? { ...a, atuendo: atuendos[a.id] } : a)),
    [agentes, atuendos],
  );
  const indice = agentes.findIndex((a) => a.id === seleccionadoId);
  const seleccionado = agentes[indice];
  const agenteTrabajo = oficina?.agentes.find((a) => a.id === seleccionadoId);
  const horaSimulada = useMemo(() => (hora === null ? undefined : fechaChileA(hora)), [hora]);
  const resumen = useMemo(() => resumir(agentes), [agentes]);
  const alMedir = useCallback((m: MetricasRender) => setMetricas(m), []);

  const atuendoBase = (a: AgenteOficina, i: number): Atuendo =>
    atuendos[a.id] ?? atuendoPorRol(a.rol, i);

  const vestir = (id: string, atuendo: Atuendo) =>
    setAtuendos((prev) => ({ ...prev, [id]: atuendo }));

  const disfrazarATodos = (paquete: PaqueteSkins) => {
    const disfraces = paquete.disfraces ?? [];
    if (disfraces.length === 0) return;
    setAtuendos(
      Object.fromEntries(
        agentes.map((a, i) => [
          a.id,
          aplicarSkin(
            catalogo,
            atuendoPorRol(a.rol, i),
            disfraces[i % disfraces.length]?.atuendo ?? {},
          ),
        ]),
      ),
    );
  };

  const quitarDisfraz = (id: string) =>
    setAtuendos((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([clave]) => clave !== id)),
    );

  const seleccionar = (id: string | null) => {
    setSeleccionadoId(id);
    if (id === null) {
      setVestidorAbierto(false);
      setDetallesAbiertos(false);
      setEnfoquePanel(false);
    }
  };

  /** Desde el panel: selecciona y lleva la cámara (o a Nexa, si la estás siguiendo) hasta el agente. */
  const elegirDesdePanel = (id: string | null) => {
    seleccionar(id);
    setEnfoquePanel(id !== null);
  };

  return (
    <div className={vestidorAbierto ? 'lab con-vestidor' : 'lab'}>
      <div className="escena">
        <Oficina
          agentes={agentesVista}
          catalogo={catalogo}
          seleccionadoId={seleccionadoId}
          onSeleccionar={seleccionar}
          onMetricas={alMedir}
          visible={visible}
          calidad={calidad}
          horaChile={horaSimulada}
          enfocadoId={vestidorAbierto || enfoquePanel ? seleccionadoId : null}
          enfocaJules={siguiendoNexa}
          ambienteId={ambienteId}
          onAmbiente={setAmbienteId}
          vistaGeneral={vista}
          presenciaJules={presenciaNexa}
          nivelVozJules={nivelNexa}
        />
      </div>
      <div className="columna-izq">
        <Burbuja
        resumen={resumen}
        cupo={oficina?.cupo}
        motor={oficina?.motor}
        nombreMotor={oficina?.nombreMotor}
      />
      <button
        type="button"
        className="hud btn-config"
        onClick={() => setConfigAbierta(true)}
        aria-label="Configuración"
        title="Configuración: tu nombre, la IA de los agentes y la zona horaria"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 0 0 1.7 1L11 21h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.5L19.4 13ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
            transform="translate(-1 0)"
          />
        </svg>
      </button>
        {panelAgentes && (
          <PanelAgentes
            oficina={oficina}
            seleccionadoId={seleccionadoId}
            onElegir={elegirDesdePanel}
          />
        )}
      </div>
      <div className="atajos">
        <button
          type="button"
          className="hud btn-atajo siempre"
          aria-pressed={panelAgentes}
          onClick={() => setPanelAgentes((v) => !v)}
          title="Mostrar u ocultar el panel de agentes (tecla A)"
        >
          Agentes <kbd>A</kbd>
        </button>
        <button
          type="button"
          className="hud btn-atajo siempre"
          aria-pressed={siguiendoNexa}
          onClick={alternarNexa}
          title={siguiendoNexa ? 'Dejar de seguir a Nexa y volver a la vista general (tecla N)' : 'Que la cámara siga a Nexa (tecla N)'}
        >
          {siguiendoNexa ? 'Siguiendo a Nexa' : 'Seguir a Nexa'} <kbd>N</kbd>
        </button>
        <button
          type="button"
          className="hud btn-atajo"
          aria-pressed={panelFps}
          onClick={() => setPanelFps((v) => !v)}
          title="Mostrar u ocultar el panel de rendimiento (tecla R)"
        >
          Rendimiento <kbd>R</kbd>
        </button>
      </div>
      {panelFps && (
        <PanelFps
          metricas={metricas}
          cantidades={[agentes.length]}
          cantidad={agentes.length}
          onCantidad={() => {}}
          calidad={calidad}
          onCalidad={setCalidad}
          visible={visible}
          onVisible={setVisible}
          hora={hora}
          onHora={setHora}
        >
          <SelectorAmbiente ambienteId={ambienteId} onAmbiente={setAmbienteId} />
          <SelectorPresencia
            presencia={presencia}
            onPresencia={setPresencia}
            nivelVoz={nivelVoz}
            onNivelVoz={setNivelVoz}
          />
        </PanelFps>
      )}
      <Leyenda />
      <IndicadorAmbiente
        ambienteId={ambienteId}
        onSalir={() => setAmbienteId(null)}
        onVistaGeneral={irAVistaGeneral}
      />
      <PanelTrabajo
        oficina={oficina}
        sinServidor={sinServidor}
        agente={agenteTrabajo}
        estado={seleccionado?.estado}
        onCambio={() => void sondear()}
        onVestir={() => setVestidorAbierto(true)}
        onDetalles={() => setDetallesAbiertos(true)}
        onLeer={(tarea) =>
          setLeyendo({
            tarea,
            agente: oficina?.agentes.find((a) => a.id === tarea.agenteId)?.nombre ?? 'El agente',
          })
        }
        onMic={setMic}
      />
      {configAbierta && (
        <Configuracion
          agentes={oficina?.agentes ?? []}
          onCerrar={() => setConfigAbierta(false)}
          onGuardado={() => void sondear()}
        />
      )}
      {detallesAbiertos && agenteTrabajo && <DetalleAgente agente={agenteTrabajo} onCerrar={cerrarDetalles} />}
      {leyendo && (
        <Lector
          tarea={
            // Si mientras leés llega el resumen u otra versión, se muestra lo último.
            oficina?.tareas.find((t) => t.id === leyendo.tarea.id) ?? leyendo.tarea
          }
          nombreAgente={leyendo.agente}
          velocidad={velocidad}
          onVelocidad={setVelocidad}
          onCerrar={() => {
            vozNexa.detener();
            setLeyendo(null);
          }}
        />
      )}
      {vestidorAbierto && seleccionado && (
        <Vestidor
          catalogo={catalogo}
          agente={seleccionado}
          atuendo={aplicarSkin(catalogo, atuendoBase(seleccionado, indice), {})}
          onCambiar={(a) => vestir(seleccionado.id, a)}
          paquetes={paquetes}
          onTodosDisfrazados={disfrazarATodos}
          onQuitarDisfraz={() => quitarDisfraz(seleccionado.id)}
          onCerrar={() => setVestidorAbierto(false)}
        />
      )}
    </div>
  );
}
