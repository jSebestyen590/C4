import { Box, Button, Drawer, useMantineTheme } from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { RichTextEditor, type RichTextEditorLabels } from '@mantine/tiptap';
import { IconListTree, IconQuotes } from '@tabler/icons-react';
import Blockquote from '@tiptap/extension-blockquote';
import { auswahlNachAenderung, type ExternArt } from './slashLogik';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  anwesenheitsVerlauf,
  stimmenPruefen,
  type ProtokollArt,
  type ProtokollDokument,
  type ProtokollMitgliedDto,
} from '@c4/shared';
import './protokoll.css';
import { BAUSTEIN_KNOTEN } from './BausteinKnoten';
import { BlockVerschieben } from './verschieben';
import { PunktVerschieben } from './punktVerschieben';
import { ZitatInline } from './ZitatInline';
import {
  anwesenheitsKandidaten,
  type AnwesenheitMitglied,
  type AnwesenheitPerson,
} from './anwesenheit';
import { BausteinMenue } from './BausteinMenue';
import { Gliederung } from './GliederungBaum';
import { aktiveStelleId } from './gliederung';
import { dokumentNormalisieren } from './bausteinLogik';
import { useSlashDaten } from './daten';
import { mitgliedName } from '../mitglied';
import { ProtokollKontext } from './kontext';
import { useKategorieNamen } from './useKategorieNamen';
import {
  absatzAmEndeEinfuegen,
  AbschnittKnoten,
  ListenPunkt,
  ProtokollAbsicherung,
  ProtokollDokumentKnoten,
} from './schema';
import type { ErwaehnungPerson } from './erwaehnungLogik';
import { ErwaehnungKnoten } from './ErwaehnungKnoten';
import { erwaehnungErweiterung, type ErwaehnungSteuerung } from './ErwaehnungErweiterung';
import { slashErweiterung, type SlashSteuerung } from './SlashErweiterung';
import { SlashPopup, type SlashZustand } from './SlashPopup';
import {
  bildDateiWaehlen,
  bildErweiterung,
  bildMeldung,
  type BildSteuerung,
} from './BildHochladen';
import type { BilderZugriff } from './bilderDaten';

const LABELS: Partial<RichTextEditorLabels> = {
  boldControlLabel: 'Fett',
  italicControlLabel: 'Kursiv',
  h2ControlLabel: 'Überschrift',
  h3ControlLabel: 'Zwischenüberschrift',
  bulletListControlLabel: 'Aufzählung',
  orderedListControlLabel: 'Nummerierte Liste',
  blockquoteControlLabel: 'Zitat als Absatz',
  linkControlLabel: 'Link einfügen',
  unlinkControlLabel: 'Link entfernen',
  undoControlLabel: 'Rückgängig',
  redoControlLabel: 'Wiederholen',
  linkEditorInputLabel: 'Adresse des Links',
  linkEditorInputPlaceholder: 'https://…',
  linkEditorExternalLink: 'Link öffnet in neuem Tab',
  linkEditorInternalLink: 'Link öffnet im selben Tab',
  linkEditorSave: 'Übernehmen',
};

const KEINE_MITGLIEDER: readonly AnwesenheitMitglied[] = [];
const KEINE_NAMEN: readonly string[] = [];
const KEINE_BILDER: Readonly<Record<string, string>> = {};

/** Height of the app header (`AppLayout`): the sticky toolbar sits right below it. */
const HEADER_HOEHE = 56;

/**
 * Editor of the minutes: three fixed sections with text and Bausteine (Event, Vergangenes Event,
 * Anwärter:in, Beschluss). Uncontrolled after mount: `inhalt` is the initial document; every change of
 * the document (also of the fields of a Baustein) reports the complete document through `onChange`.
 */
export function ProtokollEditor({
  inhalt,
  editierbar,
  onChange,
  sitzungBeginn,
  art,
  teilnahme,
  ems = [],
  mitglieder = KEINE_MITGLIEDER,
  onAnwesenheit,
  emsFreitext = KEINE_NAMEN,
  gaeste = KEINE_NAMEN,
  onExternHinzufuegen,
  onEnde,
  bilder,
  aktiveStelleRef,
}: Readonly<{
  inhalt: ProtokollDokument;
  editierbar: boolean;
  onChange?: (dokument: ProtokollDokument) => void;
  sitzungBeginn: string;
  /** Art of the Sitzung (quorum rule). */
  art: ProtokollArt;
  /** The attendance list with the values that count right now (live, incl. Kopf overrides). */
  teilnahme: readonly AnwesenheitPerson[];
  /** The active EMs (selectable in a Neues EM block); `ausgewaehlt` = counts as present. */
  ems?: readonly (ProtokollMitgliedDto & { ausgewaehlt?: boolean })[];
  /** All members: the choices of the @mention list and the names shown for mentions. */
  mitglieder?: readonly AnwesenheitMitglied[];
  /** A person got an Erscheint / Geht block (inserted or set); not called when read-only. */
  onAnwesenheit?: (sub: string) => void;
  /** The EM chips (EMs without the app) and guest chips of the Kopf. */
  emsFreitext?: readonly string[];
  gaeste?: readonly string[];
  /** /erscheint or /geht with an unknown name: the chip is to be created in the Kopf. */
  onExternHinzufuegen?: (art: ExternArt, name: string) => void;
  /** /ende: the end of the Sitzung (`HH:MM`) is to be set in the Kopf. */
  onEnde?: (uhrzeit: string) => void;
  /** Image URLs and uploads of the protocol; without it images cannot be added. */
  bilder?: BilderZugriff;
  /** Filled with a function that returns the document place of the cursor (see `aktiveStelleId`). */
  aktiveStelleRef?: MutableRefObject<(() => string | null) | null>;
}>) {
  const bilderRef = useRef(bilder);
  useEffect(() => {
    bilderRef.current = bilder;
  });
  const [bildSteuerung] = useState<BildSteuerung>(() => ({
    zugriff: () => bilderRef.current,
    fehler: bildMeldung,
  }));
  const onAnwesenheitRef = useRef(onAnwesenheit);
  useEffect(() => {
    onAnwesenheitRef.current = onAnwesenheit;
  });
  const anwesenheit = useCallback((sub: string) => onAnwesenheitRef.current?.(sub), []);
  const onExternRef = useRef(onExternHinzufuegen);
  const onEndeRef = useRef(onEnde);
  useEffect(() => {
    onExternRef.current = onExternHinzufuegen;
    onEndeRef.current = onEnde;
  });
  const externHinzufuegen = useCallback(
    (art: ExternArt, name: string) => onExternRef.current?.(art, name),
    [],
  );
  const ende = useCallback((uhrzeit: string) => onEndeRef.current?.(uhrzeit), []);
  const kandidaten = useMemo(
    () => anwesenheitsKandidaten(teilnahme, ems, mitglieder),
    [teilnahme, ems, mitglieder],
  );
  const basisDaten = useSlashDaten(sitzungBeginn, kandidaten, emsFreitext, gaeste);
  const slashDaten = useMemo(
    () => ({ ...basisDaten, anwesenheit, externHinzufuegen, ende }),
    [basisDaten, anwesenheit, externHinzufuegen, ende],
  );
  // The document as the quorum needs it (a little behind the typing).
  const [dokument, setDokument] = useState(inhalt);
  const dokumentTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(dokumentTimer.current), []);
  const personenRef = useRef<readonly ErwaehnungPerson[]>(mitglieder);
  const slashDatenRef = useRef(slashDaten);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    slashDatenRef.current = slashDaten;
    personenRef.current = mitglieder;
    onChangeRef.current = onChange;
  });

  const [slash, setSlash] = useState<SlashZustand | null>(null);
  const [auswahl, setAuswahlState] = useState(0);
  const slashRef = useRef<SlashZustand | null>(null);
  const auswahlRef = useRef(0);
  const setAuswahl = (index: number) => {
    auswahlRef.current = index;
    setAuswahlState(index);
  };

  // Stable bridge between the suggestion plugin (created once) and this component.
  const [steuerung] = useState<SlashSteuerung>(() => ({
    daten: () => slashDatenRef.current,
    zustand: (neu) => {
      const kennung = (z: SlashZustand | null) =>
        z && { query: z.query, schluessel: z.eintraege.map((e) => e.schluessel) };
      setAuswahl(auswahlNachAenderung(kennung(slashRef.current), kennung(neu), auswahlRef.current));
      slashRef.current = neu;
      setSlash(neu);
    },
    bild: (e, loeschen) => bildDateiWaehlen(e, bildSteuerung, loeschen),
    taste: (e) => {
      const z = slashRef.current;
      const n = z?.eintraege.length ?? 0;
      if (!z || n === 0) return false;
      if (e.key === 'ArrowDown') {
        setAuswahl((auswahlRef.current + 1) % n);
        return true;
      }
      if (e.key === 'ArrowUp') {
        setAuswahl((auswahlRef.current - 1 + n) % n);
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        z.waehlen(Math.min(auswahlRef.current, n - 1));
        return true;
      }
      return false;
    },
  }));

  const [erwaehnungSteuerung] = useState<ErwaehnungSteuerung>(() => ({
    personen: () => personenRef.current,
    zustand: steuerung.zustand,
    taste: steuerung.taste,
  }));

  const editor = useEditor({
    extensions: [
      ProtokollDokumentKnoten,
      AbschnittKnoten,
      StarterKit.configure({
        document: false,
        heading: { levels: [2, 3] },
        // Replaced by the Blockquote below (quotes hold paragraphs only).
        blockquote: false,
        // Replaced by `ListenPunkt` (a Baustein may stand in a list item).
        listItem: false,
        // Not part of the minutes (and `trailingNode` would append a paragraph after the last section).
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: false,
        trailingNode: false,
      }),
      // Quotes hold plain paragraphs only (the default `block+` would let Bausteine nest inside).
      Blockquote.extend({ content: 'paragraph+' }),
      ListenPunkt,
      ZitatInline,
      Link.configure({
        openOnClick: 'whenNotEditable',
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
      Placeholder.configure({
        placeholder:
          'Schreib etwas oder tippe / für einen Baustein oder ein Zitat, @ für eine Erwähnung',
      }),
      ...BAUSTEIN_KNOTEN,
      ProtokollAbsicherung,
      BlockVerschieben,
      PunktVerschieben,
      ErwaehnungKnoten,
      bildErweiterung(),
      slashErweiterung(steuerung),
      // After the slash menu: it yields while that is open.
      erwaehnungErweiterung(erwaehnungSteuerung),
    ],
    content: dokumentNormalisieren(inhalt, editierbar),
    editable: editierbar,
    onUpdate: ({ editor: e }) => {
      const json = e.getJSON() as ProtokollDokument;
      onChangeRef.current?.(json);
      clearTimeout(dokumentTimer.current);
      dokumentTimer.current = setTimeout(() => setDokument(json), 200);
    },
  });

  useEffect(() => {
    if (!aktiveStelleRef || !editor) return;
    aktiveStelleRef.current = () => aktiveStelleId(editor.state.doc, editor.state.selection.head);
    return () => {
      aktiveStelleRef.current = null;
    };
  }, [aktiveStelleRef, editor]);

  useEditableSync(editor, editierbar);

  // The outline sits beside the editor from `lg` (the app's own sidebar takes the left from `md`),
  // below that it slides in from the right.
  const theme = useMantineTheme();
  const breit = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`, false);
  const [gliederungOffen, { open: oeffnen, close: schliessen }] = useDisclosure(false);
  const kategorien = useKategorieNamen(sitzungBeginn);
  const personName = useCallback(
    (sub: string) => {
      const m = [...teilnahme, ...ems].find((p) => p.sub === sub);
      return m ? mitgliedName(m) : undefined;
    },
    [teilnahme, ems],
  );

  const kontext = useMemo(
    () => ({
      sitzungBeginn,
      art,
      teilnahme,
      kandidaten,
      ems,
      mitglieder,
      emsFreitext,
      gaeste,
      onAnwesenheit: anwesenheit,
      bilder: bilder?.urls ?? KEINE_BILDER,
      bilderErneuern: bilder?.erneuern,
      verlauf: anwesenheitsVerlauf(dokument, {
        art,
        teilnahme,
        ems: ems.filter((e) => e.ausgewaehlt),
        emsFreitext,
      }),
      stimmen: stimmenPruefen(dokument, {
        art,
        teilnahme,
        ems: ems.filter((e) => e.ausgewaehlt),
      }).pruefungen,
    }),
    [
      sitzungBeginn,
      art,
      teilnahme,
      kandidaten,
      ems,
      mitglieder,
      emsFreitext,
      gaeste,
      dokument,
      anwesenheit,
      bilder,
    ],
  );

  return (
    <ProtokollKontext.Provider value={kontext}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--mantine-spacing-md)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <RichTextEditor
            editor={editor}
            labels={LABELS}
            className="protokoll-editor"
            withTypographyStyles
            styles={{
              root: editierbar ? undefined : { border: 'none' },
              control: { width: 42, height: 42 },
              content: { background: 'transparent' },
            }}
          >
            {editierbar && editor && (
              <RichTextEditor.Toolbar
                sticky
                stickyOffset={`calc(${HEADER_HOEHE}px + env(safe-area-inset-top))`}
                className="protokoll-toolbar protokoll-nicht-drucken"
              >
                <BausteinMenue
                  editor={editor}
                  daten={slashDaten}
                  onBild={() => bildDateiWaehlen(editor, bildSteuerung)}
                />
                {!breit && (
                  <Button
                    variant="default"
                    size="md"
                    leftSection={<IconListTree size={18} />}
                    onClick={oeffnen}
                    // Keeps the cursor position of the editor.
                    onMouseDown={(ev) => ev.preventDefault()}
                  >
                    Gliederung
                  </Button>
                )}
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.Bold />
                  <RichTextEditor.Italic />
                </RichTextEditor.ControlsGroup>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.H2 />
                  <RichTextEditor.H3 />
                </RichTextEditor.ControlsGroup>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.BulletList />
                  <RichTextEditor.OrderedList />
                  <RichTextEditor.Blockquote />
                  <ZitatImTextKnopf editor={editor} />
                </RichTextEditor.ControlsGroup>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.Link />
                  <RichTextEditor.Unlink />
                </RichTextEditor.ControlsGroup>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.Undo />
                  <RichTextEditor.Redo />
                </RichTextEditor.ControlsGroup>
              </RichTextEditor.Toolbar>
            )}
            <RichTextEditor.Content />
          </RichTextEditor>
        </div>
        {editierbar && editor && breit && (
          <Box
            component="aside"
            className="protokoll-nicht-drucken"
            aria-label="Gliederung"
            style={{
              // Grows with the window, so long titles (e.g. Abstimmungen) are cut less.
              flex: '0 0 clamp(19rem, 28vw, 32rem)',
              position: 'sticky',
              top: `calc(${HEADER_HOEHE}px + env(safe-area-inset-top) + var(--mantine-spacing-xs))`,
              maxHeight: `calc(100dvh - ${HEADER_HOEHE}px - env(safe-area-inset-top) - 2 * var(--mantine-spacing-md))`,
              overflowY: 'auto',
              padding: 'var(--mantine-spacing-xs)',
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-md)',
            }}
          >
            <Gliederung editor={editor} personName={personName} kategorien={kategorien} />
          </Box>
        )}
      </div>
      {editierbar && editor && !breit && (
        <Drawer
          opened={gliederungOffen}
          onClose={schliessen}
          position="right"
          size="min(24rem, 100%)"
          title="Gliederung"
        >
          <Gliederung
            editor={editor}
            personName={personName}
            kategorien={kategorien}
            onGewaehlt={schliessen}
          />
        </Drawer>
      )}
      {editierbar && <SlashPopup zustand={slash} auswahl={auswahl} onZeiger={setAuswahl} />}
    </ProtokollKontext.Provider>
  );
}

/** Toolbar toggle for the inline quote („…“ in the middle of a sentence). */
function ZitatImTextKnopf({ editor }: Readonly<{ editor: Editor }>) {
  const aktiv = useEditorState({ editor, selector: (s) => s.editor.isActive('zitatInline') });
  return (
    <RichTextEditor.Control
      aria-label="Zitat im Text"
      title="Zitat im Text"
      active={aktiv}
      onClick={() => editor.chain().focus().toggleMark('zitatInline').run()}
    >
      <IconQuotes size={16} stroke={1.5} />
    </RichTextEditor.Control>
  );
}

/**
 * Follows the `editierbar` prop. Switching does not report a document change; an empty transaction
 * tells the node views (they read `isEditable`) to render again. A section that ends with a Baustein gets
 * its trailing paragraph when it becomes editable.
 */
function useEditableSync(editor: Editor | null, editierbar: boolean): void {
  useEffect(() => {
    if (!editor || editor.isEditable === editierbar) return;
    editor.setEditable(editierbar, false);
    const tr = editor.state.tr.setMeta('addToHistory', false);
    if (editierbar) absatzAmEndeEinfuegen(tr);
    editor.view.dispatch(tr);
  }, [editor, editierbar]);
}
