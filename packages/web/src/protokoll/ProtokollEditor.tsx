import { RichTextEditor, type RichTextEditorLabels } from '@mantine/tiptap';
import Blockquote from '@tiptap/extension-blockquote';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  anwesenheitsVerlauf,
  type ProtokollArt,
  type ProtokollDokument,
  type ProtokollMitgliedDto,
} from '@c4/shared';
import './protokoll.css';
import { BAUSTEIN_KNOTEN } from './BausteinKnoten';
import { BlockVerschieben } from './verschieben';
import type { AnwesenheitPerson } from './anwesenheit';
import { BausteinMenue } from './BausteinMenue';
import { dokumentNormalisieren } from './bausteinLogik';
import { useSlashDaten } from './daten';
import { ProtokollKontext } from './kontext';
import {
  absatzAmEndeEinfuegen,
  AbschnittKnoten,
  ProtokollAbsicherung,
  ProtokollDokumentKnoten,
} from './schema';
import { slashErweiterung, type SlashSteuerung } from './SlashErweiterung';
import { SlashPopup, type SlashZustand } from './SlashPopup';

const LABELS: Partial<RichTextEditorLabels> = {
  boldControlLabel: 'Fett',
  italicControlLabel: 'Kursiv',
  h2ControlLabel: 'Überschrift',
  h3ControlLabel: 'Zwischenüberschrift',
  bulletListControlLabel: 'Aufzählung',
  orderedListControlLabel: 'Nummerierte Liste',
  blockquoteControlLabel: 'Zitat',
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
}>) {
  const slashDaten = useSlashDaten(sitzungBeginn, teilnahme);
  // The document as the quorum needs it (a little behind the typing).
  const [dokument, setDokument] = useState(inhalt);
  const dokumentTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(dokumentTimer.current), []);
  const slashDatenRef = useRef(slashDaten);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    slashDatenRef.current = slashDaten;
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
      if (neu?.query !== slashRef.current?.query) setAuswahl(0);
      slashRef.current = neu;
      setSlash(neu);
    },
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
        const eintrag = z.eintraege[Math.min(auswahlRef.current, n - 1)];
        if (eintrag) z.waehlen(eintrag);
        return true;
      }
      return false;
    },
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
      Link.configure({
        openOnClick: 'whenNotEditable',
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
      Placeholder.configure({
        placeholder: 'Schreib etwas oder tippe / für einen Baustein oder ein Zitat',
      }),
      ...BAUSTEIN_KNOTEN,
      ProtokollAbsicherung,
      BlockVerschieben,
      slashErweiterung(steuerung),
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

  useEditableSync(editor, editierbar);

  const kontext = useMemo(
    () => ({
      sitzungBeginn,
      art,
      teilnahme,
      ems,
      verlauf: anwesenheitsVerlauf(dokument, {
        art,
        teilnahme,
        ems: ems.filter((e) => e.ausgewaehlt),
      }),
    }),
    [sitzungBeginn, art, teilnahme, ems, dokument],
  );

  return (
    <ProtokollKontext.Provider value={kontext}>
      <RichTextEditor
        editor={editor}
        labels={LABELS}
        className="protokoll-editor"
        withTypographyStyles
        styles={{
          root: editierbar ? undefined : { border: 'none' },
          control: { width: 44, height: 44 },
          content: { background: 'transparent' },
        }}
      >
        {editierbar && editor && (
          <RichTextEditor.Toolbar
            sticky
            stickyOffset={`calc(${HEADER_HOEHE}px + env(safe-area-inset-top))`}
            className="protokoll-toolbar protokoll-nicht-drucken"
          >
            <BausteinMenue editor={editor} daten={slashDaten} />
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
      {editierbar && <SlashPopup zustand={slash} auswahl={auswahl} onZeiger={setAuswahl} />}
    </ProtokollKontext.Provider>
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
