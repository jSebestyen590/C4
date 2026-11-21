import type { ResolvedPos } from '@tiptap/pm/model';
import { FORMULAR_ATTRIBUT } from './formular';

// Tab order of a Baustein card: form fields, then the Notizen (the free text lives in the same
// ProseMirror root as the form, so the browser never tabs into it on its own).

const sichtbar = (el: HTMLElement): boolean =>
  typeof el.checkVisibility !== 'function' ||
  el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });

/**
 * Whether the browser's Tab stops at this radio: only the checked one of a group (or the first if none is
 * checked) is a stop, the others are reached with the arrow keys.
 */
function radioIstStopp(radio: HTMLInputElement, wurzel: HTMLElement): boolean {
  if (!radio.name) return true;
  const gruppe = Array.from(
    wurzel.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  ).filter((r) => r.name === radio.name && r.form === radio.form && !r.disabled && sichtbar(r));
  const gewaehlt = gruppe.find((r) => r.checked);
  return radio === (gewaehlt ?? gruppe[0]);
}

/** Elements of `wurzel` that take part in the Tab order, in document order. */
export function tabbareFelder(wurzel: HTMLElement): HTMLElement[] {
  return Array.from(
    wurzel.querySelectorAll<HTMLElement>('input, textarea, select, button, a[href], [tabindex]'),
  ).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !(el as HTMLInputElement).disabled &&
      (el as HTMLInputElement).type !== 'hidden' &&
      el.closest('[hidden], [aria-hidden="true"], [inert]') === null &&
      sichtbar(el) &&
      (!(el instanceof HTMLInputElement) || el.type !== 'radio' || radioIstStopp(el, wurzel)),
  );
}

/**
 * Whether Tab from `el` would leave the form `wurzel`: no tab stop follows it there. Not "is the last
 * stop": `el` may itself be no stop of its own (e.g. a radio of a group whose checked one is the stop).
 */
export function istLetztesFeld(wurzel: HTMLElement, el: Element): boolean {
  if (el === wurzel || !wurzel.contains(el)) return false;
  const gruppe = el instanceof HTMLInputElement && el.type === 'radio' && el.name ? el : null;
  return !tabbareFelder(wurzel).some(
    (f) =>
      f !== el &&
      // Tab leaves a radio group, whichever of its radios has the focus.
      !(gruppe && f instanceof HTMLInputElement && f.type === 'radio' && f.name === gruppe.name) &&
      (el.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  );
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
