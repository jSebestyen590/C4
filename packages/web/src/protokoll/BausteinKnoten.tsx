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
import { useState, type ComponentType } from 'react';
import {
  type BausteinAnwaerterDaten,
  type BausteinBeschlussDaten,
  type BausteinDatenVon,
  type BausteinEventDaten,
  type BausteinTyp,
  type BausteinVergangenesEventDaten,
} from '@c4/shared';
import { BestaetigenDialog } from '../BestaetigenDialog';
import {
  AnwaerterFormular,
  BeschlussFormular,
  EventFormular,
  VergangenesEventFormular,
  type FormularProps,
} from './BausteinFormulare';
import { BAUSTEIN_SYMBOL, BAUSTEIN_TITEL, SlashIcon } from './symbole';

/** Marks the form area: events from in here belong to the inputs, not to ProseMirror. */
const FORMULAR_ATTRIBUT = 'data-baustein-formular';

/** Content allowed in the free text; no Bausteine inside Bausteine. */
const FREITEXT = '(paragraph | heading | bulletList | orderedList | blockquote)+';

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
                )}
              </Group>
              <Formular daten={daten} aendern={aendern} editierbar={editierbar} />
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

function bausteinKnoten<T extends BausteinTyp>(
  typ: T,
  Formular: ComponentType<FormularProps<BausteinDatenVon[T]>>,
) {
  return Node.create({
    name: typ,
    group: 'block',
    content: FREITEXT,
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
      return ReactNodeViewRenderer(
        (props) => <BausteinAnsicht typ={typ} Formular={Formular} props={props} />,
        {
          stopEvent: ({ event }) =>
            event.target instanceof Element &&
            event.target.closest(`[${FORMULAR_ATTRIBUT}]`) !== null,
        },
      );
    },
  });
}

export const BausteinEventKnoten = bausteinKnoten<'bausteinEvent'>(
  'bausteinEvent',
  EventFormular as ComponentType<FormularProps<BausteinEventDaten>>,
);
export const BausteinVergangenesEventKnoten = bausteinKnoten<'bausteinVergangenesEvent'>(
  'bausteinVergangenesEvent',
  VergangenesEventFormular as ComponentType<FormularProps<BausteinVergangenesEventDaten>>,
);
export const BausteinAnwaerterKnoten = bausteinKnoten<'bausteinAnwaerter'>(
  'bausteinAnwaerter',
  AnwaerterFormular as ComponentType<FormularProps<BausteinAnwaerterDaten>>,
);
export const BausteinBeschlussKnoten = bausteinKnoten<'bausteinBeschluss'>(
  'bausteinBeschluss',
  BeschlussFormular as ComponentType<FormularProps<BausteinBeschlussDaten>>,
);

export const BAUSTEIN_KNOTEN = [
  BausteinEventKnoten,
  BausteinVergangenesEventKnoten,
  BausteinAnwaerterKnoten,
  BausteinBeschlussKnoten,
];
