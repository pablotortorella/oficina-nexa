import type { KeyboardEvent } from 'react';

type Tecla = KeyboardEvent<HTMLTextAreaElement>;

/**
 * Ctrl+Enter (Cmd+Enter en Mac) en un campo donde le escribís a un agente. Enter solo sigue
 * agregando un salto de línea, y no cuenta mientras el teclado compone un carácter (tildes con
 * tecla muerta, IME).
 */
const esCtrlEnter = (e: Tecla) =>
  e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing;

/** `onKeyDown` que ejecuta `enviar` con Ctrl+Enter. */
export function alCtrlEnter(enviar: () => void) {
  return (e: Tecla) => {
    if (!esCtrlEnter(e)) return;
    e.preventDefault();
    enviar();
  };
}

/**
 * `onKeyDown` para un campo dentro de un `<form>`: Ctrl+Enter lo envía como su botón principal,
 * y no hace nada si ese botón está deshabilitado (`requestSubmit` no lo mira por su cuenta).
 */
export function ctrlEnterEnviaFormulario(e: Tecla) {
  if (!esCtrlEnter(e)) return;
  e.preventDefault();
  const form = e.currentTarget.form;
  const boton = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!form || boton?.disabled) return;
  form.requestSubmit(boton ?? undefined);
}
