import { ActionIcon, Group, Paper, Stack, Text } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconTrash } from '@tabler/icons-react';
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
  istBausteinInNotizen,
  type BausteinAnwaerterDaten,
  type BausteinAufnahmeDaten,
  type BausteinBeschlussDaten,
  type BausteinDatenVon,
  type BausteinEmDaten,
  type BausteinEventDaten,
  type BausteinMeinungsbildDaten,
  type BausteinTyp,
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
  VergangenesEventFormular,
  type FormularProps,
} from './BausteinFormulare';
import { blockVerschieben, type Richtung } from './verschieben';
import { BAUSTEIN_SYMBOL, BAUSTEIN_TITEL, SlashIcon } from './symbole';

/** Text content allowed in the free text of every Baustein. */
const TEXT = 'paragraph | heading | bulletList | orderedList | blockquote';
/**
 * Free text of a Baustein: text, and an Abstimmung / Meinungsbild (group `innerbaustein`) at the cursor.
 * Those two take plain text only, so there are no Bausteine inside Bausteine beyond that one level.
 */
const FREITEXT = `(${TEXT} | innerbaustein)+`;
const FREITEXT_NUR_TEXT = `(${TEXT})+`;

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
  const kannVerschieben = useEditorState({
    editor,
    selector: (s) => {
      const pos = getPos();
      const geht = (r: Richtung) =>
        pos !== undefined && blockVerschieben(s.editor.state, pos, r) !== null;
      return { hoch: geht('hoch'), runter: geht('runter') };
    },
    equalityFn: (a, b) => !!b && a.hoch === b.hoch && a.runter === b.runter,
  });
  const verschieben = (richtung: Richtung) => {
    const pos = getPos();
    if (pos === undefined) return;
    const tr = blockVerschieben(editor.state, pos, richtung);
    if (tr) editor.view.dispatch(tr);
    editor.view.focus();
  };
  const daten = node.attrs.daten as BausteinDatenVon[T];

  // Always applies to the latest fields of the node, so quick successive edits do not overwrite each other.
  const aendern = (f: (alt: BausteinDatenVon[T]) => BausteinDatenVon[T]) => {
    const pos = getPos();
    if (pos === undefined) return;
    const aktuell = editor.state.doc.nodeAt(pos);
    if (aktuell?.type !== node.type) return;
    const neu = f(aktuell.attrs.daten as BausteinDatenVon[T]);
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, { ...aktuell.attrs, daten: neu }),
    );
  };

  const hatText = node.textContent.trim() !== '';
  return (
    <NodeViewWrapper className="protokoll-baustein" data-baustein={typ}>
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
                      color="gray"
                      size={44}
                      aria-label={`${BAUSTEIN_TITEL[typ]} nach oben verschieben`}
                      title="Nach oben verschieben"
                      disabled={!kannVerschieben.hoch}
                      onClick={() => verschieben('hoch')}
                    >
                      <IconArrowUp size={20} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size={44}
                      aria-label={`${BAUSTEIN_TITEL[typ]} nach unten verschieben`}
                      title="Nach unten verschieben"
                      disabled={!kannVerschieben.runter}
                      onClick={() => verschieben('runter')}
                    >
                      <IconArrowDown size={20} />
                    </ActionIcon>
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
              {typ === 'bausteinBeschluss' && (
                <BeschlussHinweis
                  id={node.attrs.id as string}
                  daten={daten as unknown as BausteinBeschlussDaten}
                />
              )}
              {typ === 'bausteinAufnahme' && (
                <BeschlussHinweis
                  id={node.attrs.id as string}
                  daten={(daten as unknown as BausteinAufnahmeDaten).abstimmung}
                />
              )}
              {typ === 'bausteinMeinungsbild' && (
                <MeinungsbildHinweis id={node.attrs.id as string} />
              )}
              {typ === 'bausteinEm' && (daten as unknown as BausteinEmDaten).abstimmung && (
                <BeschlussHinweis
                  id={node.attrs.id as string}
                  daten={(daten as unknown as BausteinEmDaten).abstimmung!}
                />
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

function bausteinKnoten(typ: BausteinTyp, ansicht: (props: ReactNodeViewProps) => ReactElement) {
  return Node.create({
    name: typ,
    group: istBausteinInNotizen(typ) ? 'block innerbaustein' : 'block',
    content: istBausteinInNotizen(typ) ? FREITEXT_NUR_TEXT : FREITEXT,
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
      return ['div', mergeAttributes(HTMLAttributes, { 'data-baustein': typ }), 0];
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
  BausteinVergangenesEventKnoten,
  BausteinAnwaerterKnoten,
  BausteinBeschlussKnoten,
  BausteinEmKnoten,
  BausteinAnwesenheitKnoten,
  BausteinMeinungsbildKnoten,
  BausteinAufnahmeKnoten,
];
