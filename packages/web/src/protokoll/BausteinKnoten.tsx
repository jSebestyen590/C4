import { ActionIcon, Group, Paper, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import {
  mergeAttributes,
  Node,
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { useState, type ComponentType, type ReactElement } from 'react';
import {
  BAUSTEIN_DATEN_SCHEMAS,
  istBausteinInNotizen,
  istThema,
  type BausteinAnwaerterDaten,
  type BausteinAufnahmeDaten,
  type BausteinAuswahlDaten,
  type BausteinBeschlussDaten,
  type BausteinDatenVon,
  type BausteinEmDaten,
  type BausteinEventDaten,
  type BausteinMeinungsbildDaten,
  type BausteinWahlDaten,
  type BausteinTyp,
  type BausteinThemaDaten,
  type BausteinVergangenesEventDaten,
} from '@c4/shared';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { AnwesenheitAnsicht } from './AnwesenheitBaustein';
import { BeschlussHinweis, MeinungsbildHinweis } from './BeschlussHinweis';
import { FORMULAR_ATTRIBUT } from './formular';
import {
  AnwaerterFormular,
  AufnahmeFormular,
  BeschlussFormular,
  EmFormular,
  EventFormular,
  MeinungsbildFormular,
  ThemaFormular,
  AuswahlFormular,
  WahlFormular,
  VergangenesEventFormular,
  type FormularProps,
} from './BausteinFormulare';
import { BAUSTEIN_SYMBOL, BAUSTEIN_TITEL, SlashIcon } from './symbole';
import { BildKnoten } from './BildKnoten';

/** Text content allowed in the free text of every Baustein. */
const TEXT = 'paragraph | heading | bulletList | orderedList | blockquote | bild';
/**
 * Free text of a Baustein that can hold others: text, an Abstimmung / Meinungsbild / Wahl (group
 * `innerbaustein`) and a Thema (group `thema`, any depth) at the cursor. The votes take plain text
 * only, so Bausteine nest only through Themen.
 */
const FREITEXT = `(${TEXT} | innerbaustein | thema)+`;
const FREITEXT_NUR_TEXT = `(${TEXT})+`;

/**
 * The data of a Baustein with the schema defaults filled in: nodes saved before a field existed lack it
 * in their raw attrs (e.g. `annahme` of a Wahl). Data the schema rejects (a draft) stay as they are.
 */
function mitStandardwerten<T extends BausteinTyp>(typ: T, daten: unknown): BausteinDatenVon[T] {
  const geprueft = BAUSTEIN_DATEN_SCHEMAS[typ].safeParse(daten);
  return (geprueft.success ? geprueft.data : daten) as BausteinDatenVon[T];
}

function BausteinAnsicht<T extends BausteinTyp>({
  typ,
  Formular,
  props,
}: Readonly<{
  typ: T;
  Formular: ComponentType<FormularProps<BausteinDatenVon[T]>>;
  props: ReactNodeViewProps;
}>) {
  const { editor, node, getPos, deleteNode } = props;
  const editierbar = useEditorState({ editor, selector: (s) => s.editor.isEditable });
  const [loeschen, setLoeschen] = useState(false);
  const daten = mitStandardwerten(typ, node.attrs.daten);

  // Always applies to the latest fields of the node, so quick successive edits do not overwrite each other.
  const aendern = (f: (alt: BausteinDatenVon[T]) => BausteinDatenVon[T]) => {
    const pos = getPos();
    if (pos === undefined) return;
    const aktuell = editor.state.doc.nodeAt(pos);
    if (aktuell?.type !== node.type) return;
    const neu = f(mitStandardwerten(typ, aktuell.attrs.daten));
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, { ...aktuell.attrs, daten: neu }),
    );
  };

  const hatText = node.textContent.trim() !== '';
  return (
    <NodeViewWrapper
      className="protokoll-baustein"
      data-baustein={typ}
      data-id={node.attrs.id as string}
    >
      <Paper withBorder p="sm" radius="md" shadow={props.selected ? 'sm' : undefined}>
        <Stack gap="xs">
          <div contentEditable={false} {...{ [FORMULAR_ATTRIBUT]: '' }}>
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Group gap="xs" wrap="nowrap" c="dimmed">
                  <SlashIcon symbol={BAUSTEIN_SYMBOL[typ]} size={18} />
                  <Text size="sm" fw={600} c="dimmed">
                    {BAUSTEIN_TITEL[typ]}
                  </Text>
                </Group>
                {editierbar && (
                  <Group gap={0} wrap="nowrap" className="protokoll-nicht-drucken">
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size={44}
                      className="protokoll-nicht-drucken"
                      aria-label={`${BAUSTEIN_TITEL[typ]} entfernen`}
                      onClick={() => setLoeschen(true)}
                    >
                      <IconTrash size={20} />
                    </ActionIcon>
                  </Group>
                )}
              </Group>
              <Formular daten={daten} aendern={aendern} editierbar={editierbar} />
              {typ === 'bausteinBeschluss' && <BeschlussHinweis id={node.attrs.id as string} />}
              {typ === 'bausteinAufnahme' && <BeschlussHinweis id={node.attrs.id as string} />}
              {typ === 'bausteinWahl' && <BeschlussHinweis id={node.attrs.id as string} />}
              {typ === 'bausteinAuswahl' && <BeschlussHinweis id={node.attrs.id as string} />}
              {typ === 'bausteinMeinungsbild' && (
                <MeinungsbildHinweis id={node.attrs.id as string} />
              )}
              {typ === 'bausteinEm' && (daten as unknown as BausteinEmDaten).abstimmung && (
                <BeschlussHinweis id={node.attrs.id as string} />
              )}
              {(editierbar || hatText) && (
                <Text size="xs" c="dimmed" fw={500}>
                  Notizen
                </Text>
              )}
            </Stack>
          </div>
          <NodeViewContent className="protokoll-baustein-text" />
        </Stack>
      </Paper>
      {loeschen && (
        <BestaetigenDialog
          titel={`${BAUSTEIN_TITEL[typ]} entfernen`}
          bestaetigenText="Entfernen"
          onClose={() => setLoeschen(false)}
          onBestaetigt={() => {
            deleteNode();
            return Promise.resolve();
          }}
        >
          <Text>
            Der Baustein samt seinen Notizen wird entfernt. Mit „Rückgängig“ holst du ihn zurück.
          </Text>
        </BestaetigenDialog>
      )}
    </NodeViewWrapper>
  );
}

const parseJson = (el: HTMLElement, attribut: string): unknown => {
  const roh = el.getAttribute(attribut);
  if (!roh) return null;
  try {
    return JSON.parse(roh) as unknown;
  } catch {
    return null;
  }
};

/** A Baustein without free text (no content): an atom. */
const OHNE_TEXT: readonly BausteinTyp[] = ['bausteinAnwesenheit'];

function bausteinKnoten(typ: BausteinTyp, ansicht: (props: ReactNodeViewProps) => ReactElement) {
  const ohneText = OHNE_TEXT.includes(typ);
  return Node.create({
    name: typ,
    // A Thema is no `block`: it may stand in a section and in Baustein notes, not in lists or quotes.
    group: istBausteinInNotizen(typ) ? 'block innerbaustein' : istThema(typ) ? 'thema' : 'block',
    ...(ohneText
      ? { atom: true }
      : { content: istBausteinInNotizen(typ) ? FREITEXT_NUR_TEXT : FREITEXT }),
    isolating: true,
    defining: true,
    draggable: false,
    // Not selectable as a whole, so Backspace after a Baustein cannot select and then delete it with its text.
    selectable: false,

    addAttributes() {
      return {
        id: {
          default: null,
          parseHTML: (el) => el.getAttribute('data-id'),
          renderHTML: (attrs) => (attrs.id ? { 'data-id': attrs.id as string } : {}),
        },
        daten: {
          default: null,
          parseHTML: (el) => parseJson(el, 'data-daten'),
          renderHTML: (attrs) => ({ 'data-daten': JSON.stringify(attrs.daten) }),
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-baustein="${typ}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      const attrs = mergeAttributes(HTMLAttributes, { 'data-baustein': typ });
      return ohneText ? ['div', attrs] : ['div', attrs, 0];
    },

    addNodeView() {
      return ReactNodeViewRenderer(ansicht, {
        stopEvent: ({ event }) =>
          event.target instanceof Element &&
          event.target.closest(`[${FORMULAR_ATTRIBUT}]`) !== null,
      });
    },
  });
}

/** A Baustein drawn as a card with a title, a form and the free text "Notizen". */
const karte =
  <T extends BausteinTyp>(
    typ: T,
    Formular: ComponentType<FormularProps<BausteinDatenVon[T]>>,
  ): ((props: ReactNodeViewProps) => ReactElement) =>
  (props) => <BausteinAnsicht typ={typ} Formular={Formular} props={props} />;

export const BausteinEventKnoten = bausteinKnoten(
  'bausteinEvent',
  karte('bausteinEvent', EventFormular as ComponentType<FormularProps<BausteinEventDaten>>),
);
export const BausteinThemaKnoten = bausteinKnoten(
  'bausteinThema',
  karte('bausteinThema', ThemaFormular as ComponentType<FormularProps<BausteinThemaDaten>>),
);
export const BausteinVergangenesEventKnoten = bausteinKnoten(
  'bausteinVergangenesEvent',
  karte(
    'bausteinVergangenesEvent',
    VergangenesEventFormular as ComponentType<FormularProps<BausteinVergangenesEventDaten>>,
  ),
);
export const BausteinAnwaerterKnoten = bausteinKnoten(
  'bausteinAnwaerter',
  karte(
    'bausteinAnwaerter',
    AnwaerterFormular as ComponentType<FormularProps<BausteinAnwaerterDaten>>,
  ),
);
export const BausteinBeschlussKnoten = bausteinKnoten(
  'bausteinBeschluss',
  karte(
    'bausteinBeschluss',
    BeschlussFormular as ComponentType<FormularProps<BausteinBeschlussDaten>>,
  ),
);
export const BausteinMeinungsbildKnoten = bausteinKnoten(
  'bausteinMeinungsbild',
  karte(
    'bausteinMeinungsbild',
    MeinungsbildFormular as ComponentType<FormularProps<BausteinMeinungsbildDaten>>,
  ),
);
export const BausteinWahlKnoten = bausteinKnoten(
  'bausteinWahl',
  karte('bausteinWahl', WahlFormular as ComponentType<FormularProps<BausteinWahlDaten>>),
);
export const BausteinAuswahlKnoten = bausteinKnoten(
  'bausteinAuswahl',
  karte('bausteinAuswahl', AuswahlFormular as ComponentType<FormularProps<BausteinAuswahlDaten>>),
);
export const BausteinAufnahmeKnoten = bausteinKnoten(
  'bausteinAufnahme',
  karte(
    'bausteinAufnahme',
    AufnahmeFormular as ComponentType<FormularProps<BausteinAufnahmeDaten>>,
  ),
);
export const BausteinEmKnoten = bausteinKnoten(
  'bausteinEm',
  karte('bausteinEm', EmFormular as ComponentType<FormularProps<BausteinEmDaten>>),
);
export const BausteinAnwesenheitKnoten = bausteinKnoten('bausteinAnwesenheit', (props) => (
  <AnwesenheitAnsicht props={props} />
));

export const BAUSTEIN_KNOTEN = [
  BausteinEventKnoten,
  BausteinThemaKnoten,
  BausteinVergangenesEventKnoten,
  BausteinAnwaerterKnoten,
  BausteinBeschlussKnoten,
  BausteinEmKnoten,
  BausteinAnwesenheitKnoten,
  BausteinMeinungsbildKnoten,
  BausteinAufnahmeKnoten,
  BausteinWahlKnoten,
  BausteinAuswahlKnoten,
  BildKnoten,
];
