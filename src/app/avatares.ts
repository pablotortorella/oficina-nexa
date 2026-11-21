/**
 * Imágenes de los agentes, en `public/avatares_agentes/`. Cada personaje tiene un retrato
 * cuadrado y una imagen de cuerpo completo. Los PNG originales (`<nombre>_portrait.png`,
 * `<nombre>_fullbody.png`) pesan más de 2 MB; la oficina usa las copias WebP livianas
 * (`_portrait_256.webp` y `_fullbody_640.webp`).
 */

/** Id del agente en `servidor/trabajo/agentes.ts` → nombre de los archivos de su personaje. */
const PERSONAJES = new Map<string, string>([
  ['redactor', 'andres'],
  ['investigador', 'victor'],
  ['talleres', 'joaquin'],
  ['comercial', 'valeria'],
  ['contadora', 'diana'],
]);

const CARPETA = '/avatares_agentes';

/** Retrato cuadrado del agente, o `undefined` si todavía no tiene imagen. */
export function retratoDe(agenteId: string): string | undefined {
  const personaje = PERSONAJES.get(agenteId);
  return personaje ? `${CARPETA}/${personaje}_portrait_256.webp` : undefined;
}

/** Imagen de cuerpo completo del agente, o `undefined` si todavía no tiene. */
export function cuerpoCompletoDe(agenteId: string): string | undefined {
  const personaje = PERSONAJES.get(agenteId);
  return personaje ? `${CARPETA}/${personaje}_fullbody_640.webp` : undefined;
}
