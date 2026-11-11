import {
  ActionIcon,
  Anchor,
  Flex,
  Group,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { NodeViewWrapper, useEditorState, type ReactNodeViewProps } from '@tiptap/react';
import { Link } from 'react-router-dom';
import { type AnwesenheitArt, type BausteinAnwesenheitDaten } from '@c4/shared';
import { mitgliedLink } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { anwesenheitUhrzeit, mitgliedernText, personenOptionen } from './anwesenheit';
import { istZeit } from './bausteinLogik';
import { FORMULAR_ATTRIBUT } from './formular';
import { useProtokollKontext } from './kontext';
import { LokalText } from './LokalFelder';
import { SlashIcon } from './symbole';

const ART_LABEL: Record<AnwesenheitArt, string> = { erscheint: 'Erscheint', geht: 'Geht' };

/**
 * Compact block "<Person> erscheint / geht <Uhrzeit>" with the quorum at that point (no free text).
 * One row on wide screens, wraps on phones.
 */
export function AnwesenheitAnsicht({ props }: Readonly<{ props: ReactNodeViewProps }>) {
  const { editor, node, getPos, deleteNode } = props;
  const editierbar = useEditorState({ editor, selector: (s) => s.editor.isEditable });
  const { teilnahme, verlauf, onAnwesenheit } = useProtokollKontext();
  const daten = node.attrs.daten as BausteinAnwesenheitDaten;
  const id = node.attrs.id as string;
  const stand = verlauf.bausteine[id];
  const person = teilnahme.find((t) => t.sub === daten.sub);

  // Always applies to the latest fields of the node, so quick successive edits do not overwrite each other.
  const aendern = (f: (alt: BausteinAnwesenheitDaten) => BausteinAnwesenheitDaten) => {
    const pos = getPos();
    if (pos === undefined) return;
    const aktuell = editor.state.doc.nodeAt(pos);
    if (aktuell?.type !== node.type) return;
    const neu = f(aktuell.attrs.daten as BausteinAnwesenheitDaten);
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, { ...aktuell.attrs, daten: neu }),
    );
  };

  const optionen = personenOptionen(teilnahme);
  const status = new Map(teilnahme.map((t) => [t.sub, t.status]));

  const quorum = stand && stand.gesamt > 0 && (
    <Text size="xs" c="dimmed">
      {stand.anwesend} von {mitgliedernText(stand.gesamt)} anwesend
      {stand.wechsel && (
        <Text span size="xs" fw={600} c={stand.beschlussfaehig ? 'green' : 'red'}>
          {' '}
          → {stand.beschlussfaehig ? 'Jetzt beschlussfähig' : 'Nicht mehr beschlussfähig'}
        </Text>
      )}
    </Text>
  );

  return (
    <NodeViewWrapper
      className="protokoll-baustein protokoll-anwesenheit"
      data-baustein="bausteinAnwesenheit"
    >
      <div contentEditable={false} {...{ [FORMULAR_ATTRIBUT]: '' }}>
        <Stack gap={4} className="protokoll-anwesenheit-kopf">
          {editierbar ? (
            <Flex gap="xs" align="center" wrap="wrap">
              <Select
                size="md"
                aria-label="Person"
                placeholder="Person wählen"
                data-fokus="person"
                searchable
                nothingFoundMessage="Niemand gefunden"
                data={optionen}
                value={daten.sub}
                onChange={(sub) => {
                  aendern((d) => ({
                    ...d,
                    sub,
                    uhrzeit: sub && !d.uhrzeit ? anwesenheitUhrzeit() : d.uhrzeit,
                  }));
                  if (sub) onAnwesenheit?.(sub);
                }}
                style={{ flex: '1 1 11rem', minWidth: 0 }}
                renderOption={({ option }) => {
                  const s = status.get(option.value);
                  return s ? (
                    <StatusName status={s}>{option.label}</StatusName>
                  ) : (
                    <span>{option.label}</span>
                  );
                }}
              />
              {/* Fixed when inserted (/erscheint or /geht); to change it, remove the block and insert the other. */}
              <Group gap={6} wrap="nowrap" data-testid="anwesenheit-art">
                <SlashIcon symbol={daten.art} size={18} />
                <Text>{ART_LABEL[daten.art]}</Text>
              </Group>
              <LokalText
                type="time"
                size="md"
                aria-label="Uhrzeit"
                wert={daten.uhrzeit}
                onWert={(w) => {
                  if (w === '' || istZeit(w)) aendern((d) => ({ ...d, uhrzeit: w }));
                }}
                w={120}
              />
              <ActionIcon
                variant="subtle"
                color="red"
                size={42}
                className="protokoll-nicht-drucken"
                aria-label="Anwesenheit entfernen"
                onClick={() => deleteNode()}
              >
                <IconTrash size={20} />
              </ActionIcon>
            </Flex>
          ) : (
            <Group gap="xs" wrap="nowrap" align="flex-start">
              <span style={{ flexShrink: 0, display: 'flex', paddingTop: 2 }}>
                <SlashIcon symbol={daten.art} size={18} />
              </span>
              <Text style={{ overflowWrap: 'anywhere' }}>
                {person ? (
                  <Anchor component={Link} to={mitgliedLink(person)} underline="never">
                    <StatusName status={person.status}>
                      {person.username ?? `${person.vorname} ${person.nachname}`.trim()}
                    </StatusName>
                  </Anchor>
                ) : (
                  'Unbekannt'
                )}{' '}
                {daten.art === 'erscheint' ? 'erscheint' : 'geht'}
                {daten.uhrzeit && ` um ${daten.uhrzeit} Uhr`}
              </Text>
            </Group>
          )}
          {quorum}
        </Stack>
      </div>
    </NodeViewWrapper>
  );
}
