import { Plugin, PluginKey } from '@tiptap/pm/state';

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

/**
 * What a mousedown inside the editor hits: `text` = a place where a click legitimately sets the caret
 * (free text, also the Notizen of a Baustein), `bedienbar` = an input, button, label ... of a form,
 * `chrome` = the rest of a Baustein / Bild node view (header, padding, gaps, labels' surroundings).
 */
export type MausZiel = 'text' | 'bedienbar' | 'chrome';

export function mausZiel(ziel: EventTarget | null, wurzel: Element): MausZiel {
  if (!(ziel instanceof Element) || !wurzel.contains(ziel)) return 'text';
  const formular = ziel.closest(`[${FORMULAR_ATTRIBUT}]`);
  if (formular && wurzel.contains(formular)) {
    const steuerung = ziel.closest(BEDIENBAR);
    return steuerung && formular.contains(steuerung) ? 'bedienbar' : 'chrome';
  }
  const huelle = ziel.closest('[data-baustein], [data-bild]');
  if (!huelle || !wurzel.contains(huelle)) return 'text';
  const inhalt = ziel.closest('[data-node-view-content]');
  return inhalt && huelle.contains(inhalt) ? 'text' : 'chrome';
}

/**
 * Keeps clicks on the chrome of a Baustein from focusing the editor. Such a click is no place to type, but
 * the browser (and ProseMirror's own click handling) would focus the editable root and restore the stored
 * selection, which can be far away (e.g. the Notizen at the bottom), scrolling the page there. So:
 * - mousedown on chrome: default prevented and ProseMirror's handling skipped, the focus stays where it is;
 * - safety net: when the editor still gains focus right after such a mousedown (e.g. a click that
 *   closed a Select), it is blurred again at once. Keyboard focus and clicks on text are not affected.
 */
export const mausFokusSperre = new PluginKey('mausFokusSperre');
export function mausFokusPlugin(): Plugin {
  return new Plugin({
    key: mausFokusSperre,
    props: {
      handleDOMEvents: {
        mousedown: (view, event) => {
          if (mausZiel(event.target, view.dom) !== 'chrome') return false;
          event.preventDefault();
          return true;
        },
      },
    },
    view: (view) => {
      let chrome = false;
      const runter = (e: Event) => {
        const ziel = mausZiel(e.target, view.dom);
        chrome = ziel === 'chrome';
        if (chrome) e.preventDefault();
      };
      const weg = () => {
        setTimeout(() => (chrome = false), 0);
      };
      const fokus = (e: Event) => {
        if (!chrome || e.target !== view.dom) return;
        chrome = false;
        if (view.dom instanceof HTMLElement) view.dom.blur();
      };
      view.dom.addEventListener('mousedown', runter, true);
      document.addEventListener('mouseup', weg, true);
      view.dom.addEventListener('focusin', fokus);
      return {
        destroy: () => {
          view.dom.removeEventListener('mousedown', runter, true);
          document.removeEventListener('mouseup', weg, true);
          view.dom.removeEventListener('focusin', fokus);
        },
      };
    },
  });
}
