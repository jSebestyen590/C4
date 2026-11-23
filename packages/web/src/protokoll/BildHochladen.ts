import { notifications } from '@mantine/notifications';
import { Extension, type Editor } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { BILD_TYP } from '@c4/shared';
import { ApiFehler } from '../warenApi';
import type { BilderZugriff } from './bilderDaten';
import { BILD_FEHLER, bildPut, bildSkalieren, istBilddatei } from './bildLogik';
import { einfuegeStelle, fokusSetzen, type TextBereich } from './einfuegen';

// Inserting an image: pick a file, scale it to a JPEG, upload it to S3 and then put the image node into
// the document. While that runs, a placeholder with the progress is drawn at the insertion point (a
// decoration, not part of the document, so the autosave never sees an image without a key).

interface Platzhalter {
  id: string;
  pos: number;
  anteil: number;
}

interface PlatzhalterMeta {
  add?: Platzhalter;
  fortschritt?: { id: string; anteil: number };
  entfernen?: string;
}

const SCHLUESSEL = new PluginKey<Platzhalter[]>('bildHochladen');

/** What the editor gives the upload (reads current values, never goes stale). */
export interface BildSteuerung {
  zugriff: () => BilderZugriff | undefined;
  fehler: (text: string) => void;
}

export const bildMeldung = (text: string) =>
  notifications.show({ color: 'red', message: text, autoClose: 8000 });

function platzhalterDom(anteil: number): HTMLElement {
  const prozent = Math.round(anteil * 100);
  const el = document.createElement('div');
  el.className = 'protokoll-bild-platzhalter';
  el.contentEditable = 'false';
  el.setAttribute('role', 'status');
  el.setAttribute('data-testid', 'bild-platzhalter');
  const text = document.createElement('div');
  text.textContent = `Bild wird hochgeladen … ${prozent} %`;
  const balken = document.createElement('div');
  balken.className = 'protokoll-bild-balken';
  const fuellung = document.createElement('div');
  fuellung.style.width = `${prozent}%`;
  balken.appendChild(fuellung);
  el.append(text, balken);
  return el;
}

/** The placeholders of uploads in progress (positions follow the document). */
export function bildErweiterung() {
  return Extension.create({
    name: 'bildHochladen',
    addProseMirrorPlugins() {
      return [
        new Plugin<Platzhalter[]>({
          key: SCHLUESSEL,
          state: {
            init: () => [],
            apply(tr, alt) {
              let neu = alt;
              if (tr.docChanged) neu = neu.map((p) => ({ ...p, pos: tr.mapping.map(p.pos, -1) }));
              const meta = tr.getMeta(SCHLUESSEL) as PlatzhalterMeta | undefined;
              if (meta?.add) neu = [...neu, meta.add];
              if (meta?.fortschritt) {
                const f = meta.fortschritt;
                neu = neu.map((p) => (p.id === f.id ? { ...p, anteil: f.anteil } : p));
              }
              if (meta?.entfernen) neu = neu.filter((p) => p.id !== meta.entfernen);
              return neu;
            },
          },
          props: {
            decorations(state) {
              const liste = SCHLUESSEL.getState(state) ?? [];
              if (liste.length === 0) return null;
              return DecorationSet.create(
                state.doc,
                liste.map((p) =>
                  Decoration.widget(p.pos, () => platzhalterDom(p.anteil), {
                    key: `${p.id}-${Math.round(p.anteil * 100)}`,
                    side: -1,
                    ignoreSelection: true,
                  }),
                ),
              );
            },
          },
        }),
      ];
    },
  });
}

/** Number of uploads in progress (for tests and the "leave page" hint). */
export const bilderImUpload = (editor: Editor): number =>
  SCHLUESSEL.getState(editor.state)?.length ?? 0;

const meldung = (err: unknown): string => {
  const text = err instanceof Error ? err.message : '';
  if (err instanceof ApiFehler || (Object.values(BILD_FEHLER) as string[]).includes(text)) {
    return text;
  }
  return BILD_FEHLER.hochladen;
};

/**
 * Uploads `datei` and inserts it as an image at `pos` (the block boundary the cursor leads to, see
 * `einfuegeStelle`). Resolves when it is in the document or has failed (the failure is reported).
 */
export async function bildStarten(
  editor: Editor,
  steuerung: BildSteuerung,
  datei: File,
  pos: number,
): Promise<void> {
  const zugriff = steuerung.zugriff();
  if (!zugriff) {
    steuerung.fehler(BILD_FEHLER.hochladen);
    return;
  }
  if (!istBilddatei(datei)) {
    steuerung.fehler(BILD_FEHLER.keinBild);
    return;
  }
  const id = globalThis.crypto.randomUUID();
  const stelle = einfuegeStelle(editor.state.doc, pos, BILD_TYP);
  const melden = (m: PlatzhalterMeta) => {
    if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(SCHLUESSEL, m));
  };
  melden({ add: { id, pos: stelle.von, anteil: 0 } });
  try {
    const blob = await bildSkalieren(datei);
    const { uploadUrl, schluessel } = await zugriff.uploadVorbereiten(blob.size);
    await bildPut(uploadUrl, blob, (anteil) => melden({ fortschritt: { id, anteil } }));
    zugriff.hinzufuegen(schluessel, URL.createObjectURL(blob));
    if (editor.isDestroyed) return;
    const platz = SCHLUESSEL.getState(editor.state)?.find((p) => p.id === id);
    const tr = editor.state.tr.setMeta(SCHLUESSEL, { entfernen: id } satisfies PlatzhalterMeta);
    const ziel = einfuegeStelle(tr.doc, platz?.pos ?? stelle.von, BILD_TYP);
    const knoten = editor.state.schema.nodes[BILD_TYP]!.create({
      schluessel,
      breite: 'voll',
      ausrichtung: 'mitte',
      beschreibung: '',
    });
    // Only inserts: an empty paragraph at the spot stays and ends up behind the image.
    editor.view.dispatch(tr.insert(ziel.von, knoten).scrollIntoView());
    // The description is the next thing to fill in.
    fokusSetzen(editor, ziel.von, 'beschreibung');
  } catch (err) {
    console.error('Uploading a protocol image failed', err);
    melden({ entfernen: id });
    steuerung.fehler(meldung(err));
  }
}

/**
 * Opens the file picker (`image/*`: the camera on phones) and uploads the chosen image at the cursor.
 * `loeschen` is the typed "/bild" of the slash menu, removed right away. Must run in a user gesture.
 */
export function bildDateiWaehlen(
  editor: Editor,
  steuerung: BildSteuerung,
  loeschen?: TextBereich,
): void {
  if (loeschen) editor.view.dispatch(editor.state.tr.delete(loeschen.from, loeschen.to));
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  input.setAttribute('data-testid', 'bild-datei');
  input.addEventListener('change', () => {
    const datei = input.files?.[0];
    input.remove();
    if (datei && !editor.isDestroyed) {
      void bildStarten(editor, steuerung, datei, editor.state.selection.from);
    }
  });
  input.addEventListener('cancel', () => input.remove());
  document.body.appendChild(input);
  input.click();
}
