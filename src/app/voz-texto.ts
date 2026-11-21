/**
 * Markdown → texto para leer en voz alta, y cortes en partes cortas para que la lectura empiece
 * rápido (se sintetiza parte por parte). Lo usan el navegador y el servidor de voz.
 */

/** Largo máximo de cada parte, en caracteres. */
export const MAX_PARTE = 600;

/** Quita el formato Markdown y deja frases que se puedan leer. */
export function textoParaVoz(markdown: string): string {
  const lineas: string[] = [];
  let enCodigo = false;
  for (const cruda of markdown.split('\n')) {
    const linea = cruda.trim();
    if (linea.startsWith('```')) {
      enCodigo = !enCodigo;
      continue;
    }
    if (enCodigo) continue;
    // Separadores de tabla y reglas horizontales.
    if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(linea) || /^(-{3,}|\*{3,}|_{3,})$/.test(linea)) {
      continue;
    }
    let texto = linea;
    if (texto.startsWith('|')) {
      // Fila de tabla: celdas separadas por coma, sin las vacías.
      const celdas = texto
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      texto = celdas.join(', ');
      if (texto && !/[.!?:]$/.test(texto)) texto += '.';
    }
    texto = texto
      .replace(/^#{1,6}\s+(.*)$/, (_, t: string) => (/[.!?:]$/.test(t) ? t : `${t}.`))
      .replace(/^>\s?/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/(^|[\s(])[*_]([^*_]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
      .replace(/[*_~]{1,3}/g, '')
      .replace(/\[([^\]]*)\]/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    lineas.push(texto);
  }
  // Las líneas vacías marcan párrafos; las demás se juntan.
  return lineas
    .join('\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

/** Corta el texto en partes de hasta `max` caracteres, por párrafo y después por frase. */
export function partirParaVoz(texto: string, max = MAX_PARTE): string[] {
  const partes: string[] = [];
  let actual = '';
  const empujar = (fragmento: string) => {
    if (!fragmento) return;
    if (actual && actual.length + fragmento.length + 1 > max) {
      partes.push(actual);
      actual = '';
    }
    if (fragmento.length > max) {
      // Frase larguísima: se corta por espacios.
      let resto = fragmento;
      while (resto.length > max) {
        const corte = resto.lastIndexOf(' ', max);
        const i = corte > max / 2 ? corte : max;
        partes.push(resto.slice(0, i).trim());
        resto = resto.slice(i).trim();
      }
      actual = resto;
      return;
    }
    actual = actual ? `${actual} ${fragmento}` : fragmento;
  };
  for (const parrafo of texto.split(/\n{2,}/)) {
    const frases = parrafo.match(/[^.!?]+[.!?]+["»”)]*\s*|[^.!?]+$/g) ?? [parrafo];
    for (const frase of frases) empujar(frase.trim());
    // Cada párrafo cierra parte si ya es larga, para que las pausas caigan en lugares naturales.
    if (actual.length > max * 0.6) {
      partes.push(actual);
      actual = '';
    }
  }
  if (actual) partes.push(actual);
  return partes;
}
