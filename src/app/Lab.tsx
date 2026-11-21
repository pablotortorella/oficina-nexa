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
import { cargarAmbiente, cargarAtuendos, guardarAmbiente, guardarAtuendos } from './persistencia';
import type { AtuendosGuardados } from './persistencia';
import { resumir } from './resumen';
import { SelectorAmbiente } from './SelectorAmbiente';
import { SelectorPresencia } from './SelectorPresencia';
import { Vestidor } from './Vestidor';
import { PanelTrabajo } from './PanelTrabajo';
import { Lector } from './Lector';
import { vozNexa } from './voz';
import { agentesDeLaOficina, leerOficina, type EstadoOficina, type Tarea } from './trabajo';
import './estilos.css';

const paquetes = [paqueteHalloween, paqueteNavidad, paqueteFiestasPatrias];
const catalogo = paquetes.reduce(registrarPaquete, crearCatalogo(catalogoBase));
const idsAmbientes = plano.ambientes.map((a) => a.id);
/** Cada cuánto se pregunta al servidor por las tareas. */
const SONDEO_MS = 2000;

/**
 * La oficina que trabaja: los agentes reales de `servidor/trabajo/agentes.ts`, con su estado
 * sacado de sus tareas, el panel de encargos, el lector y el vestidor. Nexa saluda al abrir,
 * lee en voz alta y escucha los dictados. La tecla R muestra el panel de rendimiento.
 */
export function Lab() {
  const [oficina, setOficina] = useState<EstadoOficina | null>(null);
  const [sinServidor, setSinServidor] = useState(false);
  const [panelFps, setPanelFps] = useState(false);
  const [leyendo, setLeyendo] = useState<{ tarea: Tarea; agente: string } | null>(null);
  const [velocidad, setVelocidad] = useState(1);
  const [voz, setVoz] = useState({ hablando: false, nivel: 0 });
  const [mic, setMic] = useState<'reposo' | 'escuchando' | 'pensando'>('reposo');
  const ultimoJson = useRef('');
  const [atuendos, setAtuendos] = useState<AtuendosGuardados>(cargarAtuendos);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [vestidorAbierto, setVestidorAbierto] = useState(false);
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

  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      const destino = e.target as HTMLElement | null;
      if (destino && ['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'r' || e.key === 'R') setPanelFps((v) => !v);
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, []);

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
    if (id === null) setVestidorAbierto(false);
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
          enfocadoId={vestidorAbierto ? seleccionadoId : null}
          ambienteId={ambienteId}
          onAmbiente={setAmbienteId}
          vistaGeneral={vista}
          presenciaJules={presenciaNexa}
          nivelVozJules={nivelNexa}
        />
      </div>
      <Burbuja resumen={resumen} cupo={oficina?.cupo} />
      <button
        type="button"
        className="hud btn-atajo"
        aria-pressed={panelFps}
        onClick={() => setPanelFps((v) => !v)}
        title="Mostrar u ocultar el panel de rendimiento (tecla R)"
      >
        Rendimiento <kbd>R</kbd>
      </button>
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
        onVistaGeneral={() => {
          setAmbienteId(null);
          setVista((v) => v + 1);
        }}
      />
      <PanelTrabajo
        oficina={oficina}
        sinServidor={sinServidor}
        agente={oficina?.agentes.find((a) => a.id === seleccionadoId)}
        estado={seleccionado?.estado}
        onCambio={() => void sondear()}
        onVestir={() => setVestidorAbierto(true)}
        onLeer={(tarea) =>
          setLeyendo({
            tarea,
            agente: oficina?.agentes.find((a) => a.id === tarea.agenteId)?.nombre ?? 'El agente',
          })
        }
        onMic={setMic}
      />
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
