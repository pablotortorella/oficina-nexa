import type { ReactNode } from 'react';

/**
 * Markdown → elementos de React, para leer los resultados de los agentes. Cubre lo que usan:
 * títulos, párrafos, listas, tablas, citas, código, reglas, negrita, cursiva, código en línea y
 * enlaces. No usa HTML crudo (nada de `dangerouslySetInnerHTML`): el texto del modelo nunca se
 * interpreta como HTML. Los enlaces solo abren http(s), en otra pestaña.
 */

const esEnlaceSeguro = (url: string) => /^https?:\/\//i.test(url);

/** Negrita, cursiva, código y enlaces dentro de una línea. */
function enLinea(texto: string, clave: string): ReactNode[] {
  const salida: ReactNode[] = [];
  const patron = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,;:!?]|$)|(https?:\/\/[^\s)]+))/g;
  let ultimo = 0;
  let n = 0;
  for (let m = patron.exec(texto); m; m = patron.exec(texto)) {
    if (m.index > ultimo) salida.push(texto.slice(ultimo, m.index));
    const k = `${clave}-${n++}`;
    if (m[2] ?? m[3]) salida.push(<strong key={k}>{enLinea(m[2] ?? m[3] ?? '', k)}</strong>);
    else if (m[4]) salida.push(<code key={k}>{m[4]}</code>);
    else if (m[5] && m[6]) {
      salida.push(
        esEnlaceSeguro(m[6]) ? (
          <a key={k} href={m[6]} target="_blank" rel="noopener noreferrer">
            {enLinea(m[5], k)}
          </a>
        ) : (
          m[5]
        ),
      );
    } else if (m[8]) {
      salida.push(m[7] ?? '', <em key={k}>{m[8]}</em>);
    } else if (m[9]) {
      salida.push(
        <a key={k} href={m[9]} target="_blank" rel="noopener noreferrer">
          {m[9]}
        </a>,
      );
    }
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) salida.push(texto.slice(ultimo));
  return salida;
}

const celdas = (fila: string) =>
  fila
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

const esSeparadorTabla = (l: string) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(l.trim());

export function Markdown({ texto }: { texto: string }) {
  const lineas = texto.replace(/\r\n/g, '\n').split('\n');
  const bloques: ReactNode[] = [];
  let i = 0;
  let b = 0;
  const clave = () => `b${b++}`;

  while (i < lineas.length) {
    const linea = lineas[i] ?? '';
    const t = linea.trim();
    if (!t) {
      i++;
      continue;
    }
    if (t.startsWith('```')) {
      const codigo: string[] = [];
      i++;
      while (i < lineas.length && !(lineas[i] ?? '').trim().startsWith('```')) codigo.push(lineas[i++] ?? '');
      i++;
      bloques.push(
        <pre key={clave()}>
          <code>{codigo.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    const titulo = /^(#{1,6})\s+(.*)$/.exec(t);
    if (titulo) {
      const nivel = Math.min(4, (titulo[1] ?? '#').length);
      const k = clave();
      const contenido = enLinea(titulo[2] ?? '', k);
      bloques.push(
        nivel === 1 ? <h1 key={k}>{contenido}</h1> : nivel === 2 ? <h2 key={k}>{contenido}</h2> : nivel === 3 ? <h3 key={k}>{contenido}</h3> : <h4 key={k}>{contenido}</h4>,
      );
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      bloques.push(<hr key={clave()} />);
      i++;
      continue;
    }
    if (t.startsWith('|') && esSeparadorTabla(lineas[i + 1] ?? '')) {
      const k = clave();
      const cabecera = celdas(t);
      i += 2;
      const filas: string[][] = [];
      while (i < lineas.length && (lineas[i] ?? '').trim().startsWith('|')) filas.push(celdas(lineas[i++] ?? ''));
      bloques.push(
        <div className="md-tabla" key={k}>
          <table>
            <thead>
              <tr>
                {cabecera.map((c, j) => (
                  <th key={j}>{enLinea(c, `${k}h${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, r) => (
                <tr key={r}>
                  {f.map((c, j) => (
                    <td key={j}>{enLinea(c, `${k}${r}-${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (t.startsWith('>')) {
      const k = clave();
      const cita: string[] = [];
      while (i < lineas.length && (lineas[i] ?? '').trim().startsWith('>')) {
        cita.push((lineas[i++] ?? '').trim().replace(/^>\s?/, ''));
      }
      bloques.push(<blockquote key={k}>{enLinea(cita.join(' '), k)}</blockquote>);
      continue;
    }
    const lista = /^([-*+]|\d+[.)])\s+/.exec(t);
    if (lista) {
      const ordenada = /\d/.test(lista[1] ?? '');
      const k = clave();
      const items: string[] = [];
      while (i < lineas.length) {
        const actual = (lineas[i] ?? '').trim();
        const item = /^([-*+]|\d+[.)])\s+(.*)$/.exec(actual);
        if (item && /\d/.test(item[1] ?? '') === ordenada) {
          items.push(item[2] ?? '');
          i++;
        } else if (actual && !item && items.length > 0 && /^\s{2,}/.test(lineas[i] ?? '')) {
          items[items.length - 1] += ` ${actual}`;
          i++;
        } else break;
      }
      const lis = items.map((it, j) => <li key={j}>{enLinea(it, `${k}${j}`)}</li>);
      bloques.push(ordenada ? <ol key={k}>{lis}</ol> : <ul key={k}>{lis}</ul>);
      continue;
    }
    // Párrafo: junta las líneas hasta una vacía o un bloque especial.
    const k = clave();
    const parrafo: string[] = [];
    while (i < lineas.length) {
      const actual = (lineas[i] ?? '').trim();
      if (!actual || /^(#{1,6}\s|```|>|[-*+]\s|\d+[.)]\s|\|)/.test(actual) || /^(-{3,}|\*{3,}|_{3,})$/.test(actual)) break;
      parrafo.push(actual);
      i++;
    }
    bloques.push(<p key={k}>{enLinea(parrafo.join(' '), k)}</p>);
  }
  return <div className="md">{bloques}</div>;
}

/** Markdown → texto plano para pegar en LinkedIn u otro lugar que no entiende Markdown. */
export function textoPlano(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) =>
      l
        .replace(/^#{1,6}\s+/, '')
        .replace(/^>\s?/, '')
        .replace(/^[*+]\s+/, '- ')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)'),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
