/** Marks the form area of a Baustein: events from in here belong to the inputs, not to ProseMirror. */
export const FORMULAR_ATTRIBUT = 'data-baustein-formular';

const BEDIENBAR = 'input, textarea, select, button, a[href], label, [role="option"], [tabindex]';

/**
 * `onMouseDown` of the form area. The form sits in a `contenteditable=false` island of the editable
 * ProseMirror root, and `stopEvent` keeps ProseMirror out of its events. A click on a spot of the form that
 * is no control (label, padding, gap) would then be handled by the browser alone: it moves the focus to the
 * editable root and puts a caret at the nearest editable position, i.e. into the Notizen of this Baustein
 * or of a later one. Preventing the default of such clicks keeps the focus where it is.
 */
export function formularMausTaste(e: { target: EventTarget; preventDefault: () => void }): void {
  if (e.target instanceof Element && e.target.closest(BEDIENBAR) === null) e.preventDefault();
}
