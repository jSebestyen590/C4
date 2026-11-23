import { ActionIcon, Group, Paper, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconPhoto, IconTrash } from '@tabler/icons-react';
import {
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { useRef } from 'react';
import {
  BILD_AUSRICHTUNGEN,
  BILD_BESCHREIBUNG_MAX,
  BILD_BREITEN,
  BILD_TYP,
  type BildAusrichtung,
  type BildBreite,
} from '@c4/shared';
import { fokusSetzen } from './einfuegen';
import { FORMULAR_ATTRIBUT, formularMausTaste } from './formular';
import { istLetztesFeld } from './tabFolge';
import { useProtokollKontext } from './kontext';
import { LokalText } from './LokalFelder';

const BREITE_LABEL: Record<BildBreite, string> = { voll: 'Voll', halb: 'Halb' };
const AUSRICHTUNG_LABEL: Record<BildAusrichtung, string> = {
  links: 'Links',
  mitte: 'Mitte',
  rechts: 'Rechts',
};

/** Card of an image in the editor: preview, "Beschreibung" and (at section level) width and position. */
function BildAnsicht({ editor, node, getPos, deleteNode, updateAttributes }: ReactNodeViewProps) {
  const editierbar = useEditorState({ editor, selector: (s) => s.editor.isEditable });
  const kontext = useProtokollKontext();
  const schluessel = node.attrs.schluessel as string;
  const breite = node.attrs.breite as BildBreite;
  const ausrichtung = node.attrs.ausrichtung as BildAusrichtung;
  const beschreibung = node.attrs.beschreibung as string;
  const url = kontext.bilder[schluessel];
  const pos = getPos();
  // Width and position only count at section level; in notes the images sit in a column beside the text.
  const obenEbene =
    pos !== undefined && editor.state.doc.resolve(pos).parent.type.name === 'abschnitt';
  const erneuert = useRef(false);

  return (
    <NodeViewWrapper className="protokoll-bild" data-bild={schluessel}>
      <Paper withBorder p="sm" radius="md">
        <div
          contentEditable={false}
          {...{ [FORMULAR_ATTRIBUT]: '' }}
          onMouseDown={formularMausTaste}
          onKeyDown={(e) => {
            // Tab on the last field of the form continues behind the image.
            if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
            if (!editierbar || !istLetztesFeld(e.currentTarget, e.target as Element)) return;
            const stelle = getPos();
            if (stelle === undefined) return;
            e.preventDefault();
            fokusSetzen(editor, stelle, 'nach');
          }}
        >
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Group gap="xs" wrap="nowrap" c="dimmed">
                <IconPhoto size={18} />
                <Text size="sm" fw={600} c="dimmed">
                  Bild
                </Text>
              </Group>
              {editierbar && (
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size={42}
                  className="protokoll-nicht-drucken"
                  aria-label="Bild entfernen"
                  onClick={() => deleteNode()}
                >
                  <IconTrash size={20} />
                </ActionIcon>
              )}
            </Group>
            {url ? (
              <img
                src={url}
                alt={beschreibung}
                className="protokoll-bild-vorschau"
                onError={() => {
                  // One refresh per card: the URL may have expired.
                  if (erneuert.current) return;
                  erneuert.current = true;
                  kontext.bilderErneuern?.();
                }}
              />
            ) : (
              <Text size="sm" c="dimmed">
                Bild nicht verfügbar
              </Text>
            )}
            {editierbar ? (
              <>
                <LokalText
                  label="Beschreibung"
                  placeholder="Was ist zu sehen?"
                  data-fokus="beschreibung"
                  size="md"
                  maxLength={BILD_BESCHREIBUNG_MAX}
                  wert={beschreibung}
                  onWert={(wert) => updateAttributes({ beschreibung: wert })}
                />
                {obenEbene && (
                  <>
                    <div>
                      <Text size="sm" fw={500} mb={4}>
                        Breite
                      </Text>
                      <SegmentedControl
                        fullWidth
                        size="md"
                        aria-label="Breite"
                        value={breite}
                        data={BILD_BREITEN.map((b) => ({ value: b, label: BREITE_LABEL[b] }))}
                        onChange={(v) => updateAttributes({ breite: v })}
                      />
                    </div>
                    <div>
                      <Text size="sm" fw={500} mb={4}>
                        Position
                      </Text>
                      <SegmentedControl
                        fullWidth
                        size="md"
                        aria-label="Position"
                        value={ausrichtung}
                        data={BILD_AUSRICHTUNGEN.map((a) => ({
                          value: a,
                          label: AUSRICHTUNG_LABEL[a],
                        }))}
                        onChange={(v) => updateAttributes({ ausrichtung: v })}
                      />
                    </div>
                  </>
                )}
              </>
            ) : (
              beschreibung && (
                <Text size="sm" c="dimmed">
                  {beschreibung}
                </Text>
              )
            )}
          </Stack>
        </div>
      </Paper>
    </NodeViewWrapper>
  );
}

/**
 * An image of the minutes (block, atom). Group `bild`, not `block`: it may stand in a section and in the
 * free text of a Baustein, but not in lists or quotes.
 */
export const BildKnoten = Node.create({
  name: BILD_TYP,
  group: 'bild',
  atom: true,
  selectable: true,
  draggable: false,
  isolating: true,

  addAttributes() {
    return {
      schluessel: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-schluessel') ?? '',
        renderHTML: (attrs) => ({ 'data-schluessel': attrs.schluessel as string }),
      },
      breite: {
        default: 'voll',
        parseHTML: (el) => el.getAttribute('data-breite') ?? 'voll',
        renderHTML: (attrs) => ({ 'data-breite': attrs.breite as string }),
      },
      ausrichtung: {
        default: 'mitte',
        parseHTML: (el) => el.getAttribute('data-ausrichtung') ?? 'mitte',
        renderHTML: (attrs) => ({ 'data-ausrichtung': attrs.ausrichtung as string }),
      },
      beschreibung: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-beschreibung') ?? '',
        renderHTML: (attrs) => ({ 'data-beschreibung': attrs.beschreibung as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-protokoll-bild]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-protokoll-bild': '' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BildAnsicht, {
      stopEvent: ({ event }) =>
        event.target instanceof Element && event.target.closest(`[${FORMULAR_ATTRIBUT}]`) !== null,
    });
  },
});
