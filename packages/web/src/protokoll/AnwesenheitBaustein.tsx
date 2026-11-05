import {
  ActionIcon,
  Anchor,
  Flex,
  Group,
  Select,
  SegmentedControl,
  Stack,
  Text,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ANWESENHEIT_ARTEN, type AnwesenheitArt, type BausteinAnwesenheitDaten } from '@c4/shared';
import { BestaetigenDialog } from '../BestaetigenDialog';
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
 * Compact block "<Person> erscheint / geht <Uhrzeit>" with the quorum at that point and an optional note.
 * One row on wide screens, wraps on phones.
 */
export function AnwesenheitAnsicht({ props }: Readonly<{ props: ReactNodeViewProps }>) {
  const { editor, node, getPos, deleteNode } = props;
  const editierbar = useEditorState({ editor, selector: (s) => s.editor.isEditable });
  const { teilnahme, verlauf, onErscheint } = useProtokollKontext();
  const [loeschen, setLoeschen] = useState(false);
  const daten = node.attrs.daten as BausteinAnwesenheitDaten;
  const id = node.attrs.id as string;
  const stand = verlauf.bausteine[id];
  const person = teilnahme.find((t) => t.sub === daten.sub);
  const hatText = node.textContent.trim() !== '';

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
      className={`protokoll-baustein protokoll-anwesenheit${!editierbar && !hatText ? ' protokoll-ohne-text' : ''}`}
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
                  if (sub && daten.art === 'erscheint') onErscheint?.(sub);
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
              <SegmentedControl
                size="md"
                aria-label="Erscheint oder geht"
                value={daten.art}
                onChange={(art) => aendern((d) => ({ ...d, art: art as AnwesenheitArt }))}
                data={ANWESENHEIT_ARTEN.map((a) => ({ value: a, label: ART_LABEL[a] }))}
              />
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
                size={44}
                className="protokoll-nicht-drucken"
                aria-label="Anwesenheit entfernen"
                onClick={() => (hatText ? setLoeschen(true) : deleteNode())}
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
      <NodeViewContent className="protokoll-baustein-text protokoll-anwesenheit-text" />
      {loeschen && (
        <BestaetigenDialog
          titel="Anwesenheit entfernen"
          bestaetigenText="Entfernen"
          onClose={() => setLoeschen(false)}
          onBestaetigt={() => {
            deleteNode();
            return Promise.resolve();
          }}
        >
          <Text>
            Der Eintrag samt seiner Bemerkung wird entfernt. Mit „Rückgängig“ holst du ihn zurück.
          </Text>
        </BestaetigenDialog>
      )}
    </NodeViewWrapper>
  );
}
