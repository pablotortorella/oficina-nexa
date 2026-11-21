import { useEffect, useMemo, useRef, useState } from 'react';
import {
  guardarConfiguracion,
  leerConfiguracion,
  type AgenteTrabajo,
  type DatosConfig,
  type Motor,
} from './trabajo';
import { fijarZona, zonaDeLaComputadora, zonaFijada, zonasDisponibles } from './zona';

interface Props {
  agentes: AgenteTrabajo[];
  onCerrar: () => void;
  /** Avisa que cambió algo (para volver a leer la oficina). */
  onGuardado: () => void;
}

type Preset = 'deepseek' | 'ollama' | 'otro';

/** Panel de Configuración: tu nombre, con qué IA trabajan los agentes y la zona horaria. */
export function Configuracion({ agentes, onCerrar, onGuardado }: Props) {
  const [datos, setDatos] = useState<DatosConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const [nombre, setNombre] = useState('');
  const [motor, setMotor] = useState<Motor>('codex');
  const [porAgente, setPorAgente] = useState<Record<string, Motor | ''>>({});
  const [modeloClaude, setModeloClaude] = useState('');
  const [modeloCodex, setModeloCodex] = useState('');
  const [preset, setPreset] = useState<Preset>('deepseek');
  const [url, setUrl] = useState('');
  const [modelo, setModelo] = useState('');
  const [clave, setClave] = useState('');
  const [borrarClave, setBorrarClave] = useState(false);
  const [zona, setZona] = useState<string>(zonaFijada() ?? '');
  const cerrar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    leerConfiguracion()
      .then((d) => {
        setDatos(d);
        const c = d.config;
        setNombre(c.nombre ?? '');
        setMotor(c.motor ?? 'codex');
        setPorAgente(c.motorPorAgente ?? {});
        setModeloClaude(c.claude?.modelo ?? '');
        setModeloCodex(c.codex?.modelo ?? '');
        setPreset(c.compatible.preset ?? 'deepseek');
        setUrl(c.compatible.url ?? '');
        setModelo(c.compatible.modelo ?? '');
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    cerrar.current?.focus();
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [onCerrar]);

  const zonas = useMemo(zonasDisponibles, []);
  const usaCompatible = motor === 'compatible' || Object.values(porAgente).includes('compatible');
  const base = datos?.presets[preset];

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const motorPorAgente = Object.fromEntries(Object.entries(porAgente).filter(([, m]) => m));
      await guardarConfiguracion({
        nombre,
        motor,
        motorPorAgente,
        claude: { modelo: modeloClaude },
        codex: { modelo: modeloCodex },
        compatible: { preset, url: url || base?.url, modelo: modelo || base?.modelo, clave },
        borrarClave,
      });
      fijarZona(zona || null);
      setClave('');
      setBorrarClave(false);
      setAviso('Guardado. Los próximos encargos usan esta configuración.');
      onGuardado();
      setTimeout(() => setAviso(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const motores = datos?.motores ?? [];
  return (
    <div className="lector-fondo" role="presentation" onClick={onCerrar}>
      <section
        className="lector configuracion"
        role="dialog"
        aria-modal="true"
        aria-label="Configuración"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="lector-cabecera">
          <h2>Configuración</h2>
          <button ref={cerrar} type="button" className="btn-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </header>

        {!datos && !error && <p className="nota">Cargando…</p>}
        {error && <p className="aviso-error">{error}</p>}

        {datos && (
          <form
            className="config-cuerpo"
            onSubmit={(e) => {
              e.preventDefault();
              void guardar();
            }}
          >
            <fieldset>
              <legend>Vos</legend>
              <label>
                Tu nombre
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="Cómo te llaman los agentes" />
              </label>
            </fieldset>

            <fieldset>
              <legend>Con qué IA trabajan los agentes</legend>
              <label>
                Motor de la oficina
                <select value={motor} onChange={(e) => setMotor(e.target.value as Motor)}>
                  {motores.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <p className="nota">
                ChatGPT y Claude usan tu suscripción (con su programa instalado y la sesión iniciada). El
                compatible con OpenAI usa una clave de API (DeepSeek) o un modelo local (Ollama).
              </p>
              <div className="config-agentes">
                {agentes.map((a) => (
                  <label key={a.id}>
                    {a.nombre} <span className="nota">({a.puesto.toLowerCase()})</span>
                    <select
                      value={porAgente[a.id] ?? ''}
                      onChange={(e) => setPorAgente((p) => ({ ...p, [a.id]: e.target.value as Motor | '' }))}
                    >
                      <option value="">Como la oficina</option>
                      {motores.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="config-dos">
                <label>
                  Modelo de Claude
                  <input value={modeloClaude} onChange={(e) => setModeloClaude(e.target.value)} placeholder="Vacío: el de tu cuenta (opus, sonnet, haiku)" />
                </label>
                <label>
                  Modelo de ChatGPT (Codex)
                  <input value={modeloCodex} onChange={(e) => setModeloCodex(e.target.value)} placeholder="Vacío: el que trae Codex" />
                </label>
              </div>
            </fieldset>

            {usaCompatible && (
              <fieldset>
                <legend>Compatible con OpenAI</legend>
                <label>
                  Proveedor
                  <select
                    value={preset}
                    onChange={(e) => {
                      setPreset(e.target.value as Preset);
                      setUrl('');
                      setModelo('');
                    }}
                  >
                    {Object.entries(datos.presets).map(([id, p]) => (
                      <option key={id} value={id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="config-dos">
                  <label>
                    URL
                    <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={base?.url || 'https://…'} />
                  </label>
                  <label>
                    Modelo
                    <input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder={base?.modelo || 'nombre del modelo'} />
                  </label>
                </div>
                {preset !== 'ollama' && (
                  <label>
                    Clave de API
                    <input
                      type="password"
                      autoComplete="off"
                      value={clave}
                      onChange={(e) => setClave(e.target.value)}
                      placeholder={datos.config.compatible.claveGuardada ? 'Guardada (escribí otra para cambiarla)' : 'Pegá tu clave'}
                    />
                  </label>
                )}
                {datos.config.compatible.claveGuardada && preset !== 'ollama' && (
                  <label className="config-check">
                    <input type="checkbox" checked={borrarClave} onChange={(e) => setBorrarClave(e.target.checked)} />
                    Borrar la clave guardada
                  </label>
                )}
                <p className="nota">
                  La clave queda solo en esta computadora (oficina.config.json, que no se sube a GitHub). Los
                  servidores de DeepSeek están en China: no le encargues nada con información de clientes. Sin
                  búsqueda web: Víctor investiga con lo que sabe el modelo.
                </p>
              </fieldset>
            )}

            <fieldset>
              <legend>Zona horaria</legend>
              <label>
                Zona de la oficina
                <select value={zona} onChange={(e) => setZona(e.target.value)}>
                  <option value="">Automática: la de esta computadora ({zonaDeLaComputadora()})</option>
                  {zonas.map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <p className="nota">Mueve la luz de la escena, el saludo de Nexa y las horas del panel. Se guarda en este navegador.</p>
            </fieldset>

            <div className="acciones">
              <button type="submit" className="btn principal" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" className="btn" onClick={onCerrar}>
                Cerrar
              </button>
            </div>
            {aviso && (
              <p className="nota" role="status">
                {aviso}
              </p>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
