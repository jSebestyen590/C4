import type { ResolvedPos } from '@tiptap/pm/model';
import { FORMULAR_ATTRIBUT } from './formular';

// Tab order of a Baustein card: form fields, then the Notizen (the free text lives in the same
// ProseMirror root as the form, so the browser never tabs into it on its own).

/** Elements of `wurzel` that take part in the Tab order, in document order. */
export function tabbareFelder(wurzel: HTMLElement): HTMLElement[] {
  return Array.from(
    wurzel.querySelectorAll<HTMLElement>('input, textarea, select, button, a[href], [tabindex]'),
  ).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !(el as HTMLInputElement).disabled &&
      (el as HTMLInputElement).type !== 'hidden' &&
      el.closest('[hidden], [aria-hidden="true"]') === null,
  );
}

/** Whether `el` is the last field in the Tab order of `wurzel`. */
export function istLetztesFeld(wurzel: HTMLElement, el: Element): boolean {
  const felder = tabbareFelder(wurzel);
  return felder.length > 0 && felder[felder.length - 1] === el;
}

/**
 * Depth of the Baustein whose very first text block the cursor is at the start of (not inside a list or
 * quote: there Shift+Tab has its own meaning), or `null`.
 */
export function bausteinAnfangTiefe(
  $from: ResolvedPos,
  istBaustein: (name: string) => boolean,
): number | null {
  const tiefe = $from.depth - 1;
  if (tiefe < 0 || !$from.parent.isTextblock || $from.parentOffset !== 0) return null;
  if (!istBaustein($from.node(tiefe).type.name) || $from.index(tiefe) !== 0) return null;
  return tiefe;
}

/** The last field of the form of the Baustein card `karte` (its own form, not that of nested ones). */
export function letztesFormularFeld(karte: HTMLElement): HTMLElement | undefined {
  const formular = karte.querySelector<HTMLElement>(`[${FORMULAR_ATTRIBUT}]`);
  return formular ? tabbareFelder(formular).at(-1) : undefined;
}
