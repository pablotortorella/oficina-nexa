import { partirParaVoz, textoParaVoz } from './voz-texto';

/**
 * Voz de Nexa en el navegador.
 * - Habla con la voz local del servidor (Piper, `/api/voz/hablar`), parte por parte: mientras
 *   suena una parte ya se pide la siguiente. La velocidad cambia sin cambiar el tono
 *   (`preservesPitch`). Un analizador mide el volumen para mover la boca de Nexa.
 *   Si el servidor no tiene voz, usa la del navegador (sin volumen real: la boca se simula).
 * - Graba dictados con el micrófono y los transcribe en el servidor (whisper.cpp). El audio
 *   solo viaja a tu propio servidor local y no se guarda.
 */

export type EstadoVoz = { hablando: boolean; nivel: number; error?: string };
type Oyente = (estado: EstadoVoz) => void;

export const VELOCIDADES = [1, 1.25, 1.5, 2] as const;

class VozNexa {
  private oyentes = new Set<Oyente>();
  private estado: EstadoVoz = { hablando: false, nivel: 0 };
  private turno = 0;
  private audio: HTMLAudioElement | null = null;
  private contexto: AudioContext | null = null;
  private analizador: AnalyserNode | null = null;
  private muestras: Uint8Array<ArrayBuffer> | null = null;
  private velocidad = 1;
  private reloj = 0;
  private urls: string[] = [];

  suscribir(oyente: Oyente) {
    this.oyentes.add(oyente);
    oyente(this.estado);
    return () => void this.oyentes.delete(oyente);
  }

  private emitir(cambios: Partial<EstadoVoz>) {
    this.estado = { ...this.estado, ...cambios };
    for (const o of this.oyentes) o(this.estado);
  }

  setVelocidad(v: number) {
    this.velocidad = v;
    if (this.audio) this.audio.playbackRate = v;
    if (typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking) {
      // La voz del navegador no cambia de velocidad a mitad de frase: se aplica en la próxima.
    }
  }

  /** Corta lo que esté diciendo. */
  detener() {
    this.turno++;
    this.audio?.pause();
    this.audio = null;
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    cancelAnimationFrame(this.reloj);
    this.emitir({ hablando: false, nivel: 0 });
  }

  /** Lee un texto (Markdown o plano). Resuelve al terminar o al ser cortado. */
  async decir(texto: string): Promise<void> {
    this.detener();
    const turno = this.turno;
    const partes = partirParaVoz(textoParaVoz(texto));
    if (partes.length === 0) return;
    this.emitir({ hablando: true, error: undefined });
    try {
      let siguiente = this.sintetizar(partes[0] ?? '');
      for (let i = 0; i < partes.length; i++) {
        const url = await siguiente;
        if (turno !== this.turno) return;
        if (i + 1 < partes.length) siguiente = this.sintetizar(partes[i + 1] ?? '');
        await this.reproducir(url, turno);
        if (turno !== this.turno) return;
      }
    } catch (error) {
      if (turno !== this.turno) return;
      if ((error as Error).name === 'SinVozLocal') {
        await this.decirConNavegador(partes, turno);
      } else {
        this.emitir({ error: (error as Error).message });
      }
    } finally {
      if (turno === this.turno) this.detener();
    }
  }

  /** Saluda según la hora de Bogotá, con el saludo estirado que arma el servidor. */
  async saludar(): Promise<void> {
    this.detener();
    const turno = this.turno;
    const { momento, texto } = saludoDeNexa();
    this.emitir({ hablando: true, error: undefined });
    try {
      const res = await fetch(`/api/voz/saludo/${momento}`);
      if (!res.ok) throw new Error('sin saludo local');
      const url = URL.createObjectURL(await res.blob());
      this.urls.push(url);
      if (turno !== this.turno) return;
      await this.reproducir(url, turno);
    } catch {
      if (turno === this.turno) await this.decirConNavegador([texto], turno);
    } finally {
      if (turno === this.turno) this.detener();
    }
  }

  private async sintetizar(texto: string): Promise<string> {
    const res = await fetch('/api/voz/hablar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texto }),
    });
    if (res.status === 503 || res.status === 404) {
      const e = new Error('sin voz local');
      e.name = 'SinVozLocal';
      throw e;
    }
    if (!res.ok) throw new Error('No pude generar la voz de Nexa.');
    const url = URL.createObjectURL(await res.blob());
    this.urls.push(url);
    return url;
  }

  private conectar(audio: HTMLAudioElement) {
    try {
      this.contexto ??= new AudioContext();
      if (this.contexto.state === 'suspended') void this.contexto.resume();
      const fuente = this.contexto.createMediaElementSource(audio);
      this.analizador = this.contexto.createAnalyser();
      this.analizador.fftSize = 512;
      this.muestras = new Uint8Array(new ArrayBuffer(this.analizador.fftSize));
      fuente.connect(this.analizador);
      this.analizador.connect(this.contexto.destination);
    } catch {
      this.analizador = null;
    }
  }

  /** Volumen (RMS) del audio que suena, unas 20 veces por segundo, para la boca de Nexa. */
  private medir(turno: number) {
    let ultimo = 0;
    const paso = (t: number) => {
      if (turno !== this.turno || !this.audio) return;
      if (t - ultimo > 50 && this.analizador && this.muestras) {
        ultimo = t;
        this.analizador.getByteTimeDomainData(this.muestras);
        let suma = 0;
        for (const m of this.muestras) suma += ((m - 128) / 128) ** 2;
        const rms = Math.sqrt(suma / this.muestras.length);
        this.emitir({ nivel: Math.min(1, rms * 4) });
      }
      this.reloj = requestAnimationFrame(paso);
    };
    this.reloj = requestAnimationFrame(paso);
  }

  private reproducir(url: string, turno: number): Promise<void> {
    return new Promise((resolver, rechazar) => {
      const audio = new Audio(url);
      audio.preservesPitch = true;
      audio.playbackRate = this.velocidad;
      this.audio = audio;
      this.conectar(audio);
      audio.onended = () => resolver();
      audio.onerror = () => rechazar(new Error('No pude reproducir la voz.'));
      audio
        .play()
        .then(() => this.medir(turno))
        .catch(rechazar);
    });
  }

  /** Voz del navegador: prioriza Argentina, Colombia, México y después cualquier español. */
  private decirConNavegador(partes: string[], turno: number): Promise<void> {
    if (typeof speechSynthesis === 'undefined') return Promise.resolve();
    const voces = speechSynthesis.getVoices();
    const voz =
      ['es-AR', 'es-CO', 'es-MX', 'es-US', 'es-419'].map((l) => voces.find((v) => v.lang === l)).find(Boolean) ??
      voces.find((v) => v.lang.startsWith('es'));
    const simular = setInterval(() => {
      if (turno !== this.turno) return clearInterval(simular);
      this.emitir({ nivel: 0.25 + Math.random() * 0.45 });
    }, 90);
    return new Promise((resolver) => {
      partes.forEach((parte, i) => {
        const u = new SpeechSynthesisUtterance(parte);
        if (voz) u.voice = voz;
        u.lang = voz?.lang ?? 'es-AR';
        u.rate = this.velocidad;
        if (i === partes.length - 1) {
          u.onend = () => {
            clearInterval(simular);
            resolver();
          };
        }
        speechSynthesis.speak(u);
      });
    });
  }
}

export const vozNexa = new VozNexa();

/** Saludo según la hora de Bogotá, estirado como lo diría Nexa. */
export function saludoDeNexa(ahora = new Date()): { momento: 'dia' | 'tarde' | 'noche'; texto: string } {
  const hora = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota', hour: '2-digit', hourCycle: 'h23' }).format(ahora),
  );
  if (hora >= 5 && hora < 12) return { momento: 'dia', texto: '¡Buen díííaaa!' };
  if (hora >= 12 && hora < 19) return { momento: 'tarde', texto: '¡Buenas tardeeees!' };
  return { momento: 'noche', texto: '¡Buenas nocheeees!' };
}

/* ---------------- Dictado ---------------- */

export interface Grabacion {
  /** Termina de grabar y devuelve el texto transcripto. */
  terminar: () => Promise<string>;
  cancelar: () => void;
}

/** Empieza a grabar con el micrófono. El navegador pide permiso la primera vez. */
export async function grabarDictado(): Promise<Grabacion> {
  const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
  const tipo = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
  const grabadora = new MediaRecorder(flujo, tipo ? { mimeType: tipo } : undefined);
  const trozos: Blob[] = [];
  grabadora.ondataavailable = (e) => {
    if (e.data.size > 0) trozos.push(e.data);
  };
  grabadora.start();
  const soltar = () => flujo.getTracks().forEach((t) => t.stop());
  return {
    cancelar: () => {
      grabadora.onstop = null;
      if (grabadora.state !== 'inactive') grabadora.stop();
      soltar();
    },
    terminar: () =>
      new Promise((resolver, rechazar) => {
        grabadora.onstop = async () => {
          soltar();
          const audio = new Blob(trozos, { type: grabadora.mimeType || 'audio/webm' });
          try {
            const res = await fetch('/api/voz/dictado', {
              method: 'POST',
              headers: { 'content-type': audio.type.split(';')[0] || 'audio/webm' },
              body: audio,
            });
            const datos = (await res.json().catch(() => ({}))) as { texto?: string; error?: string };
            if (!res.ok) throw new Error(datos.error ?? 'No pude transcribir.');
            resolver(datos.texto ?? '');
          } catch (e) {
            rechazar(e instanceof Error ? e : new Error('No pude transcribir.'));
          }
        };
        if (grabadora.state !== 'inactive') grabadora.stop();
      }),
  };
}
