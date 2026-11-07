import { Button, Menu, Modal, Stack, Text, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import type { Editor } from '@tiptap/react';
import { useState } from 'react';
import { bausteinEinfuegen, imListenpunkt, imVerschachtelbaren, zitatEinfuegen } from './einfuegen';
import { SlashListe } from './SlashListe';
import {
  bausteinEintraege,
  anwesenheitPerson,
  slashEintraege,
  slashStufe,
  type SlashDaten,
  type SlashEintrag,
} from './slashLogik';
import { SlashIcon } from './symbole';

type Liste = 'vorlagen' | 'events' | 'erscheint' | 'geht';

const LISTEN: Record<Liste, { wort: string; titel: string; suche: string }> = {
  vorlagen: { wort: 'event', titel: 'Event einfügen', suche: 'Vorlage suchen' },
  events: { wort: 'vergangenes', titel: 'Vergangenes Event einfügen', suche: 'Event suchen' },
  erscheint: { wort: 'erscheint', titel: 'Erscheint einfügen', suche: 'Person suchen' },
  geht: { wort: 'geht', titel: 'Geht einfügen', suche: 'Person suchen' },
};

/**
 * Toolbar button "Baustein": the same choices as the slash menu (the "/" is awkward on phone keyboards).
 * Event and Vergangenes Event open a searchable list of Vorlagen / past events in a modal.
 */
export function BausteinMenue({
  editor,
  daten,
  onBild,
}: Readonly<{ editor: Editor; daten: SlashDaten; onBild?: () => void }>) {
  const [liste, setListe] = useState<Liste | null>(null);
  const [suche, setSuche] = useState('');
  // Inside an Abstimmung / Meinungsbild neither of them can be inserted.
  const [ohneVerschachtelt, setOhneVerschachtelt] = useState(false);
  const [ohneZitat, setOhneZitat] = useState(false);

  const waehlen = (e: SlashEintrag) => {
    if (e.aktion.art === 'weiter') {
      setSuche('');
      const { stufe } = slashStufe(e.aktion.text);
      if (stufe !== 'bausteine') setListe(stufe);
      return;
    }
    setListe(null);
    if (e.aktion.art === 'zitat') {
      zitatEinfuegen(editor);
      return;
    }
    if (e.aktion.art === 'bild') {
      onBild?.();
      return;
    }
    bausteinEinfuegen(editor, e.aktion.wahl);
    const sub = anwesenheitPerson(e.aktion.wahl);
    if (sub) daten.anwesenheit?.(sub);
  };

  const eintraege = liste ? slashEintraege(`${LISTEN[liste].wort} ${suche}`, daten) : [];

  return (
    <>
      <Menu
        position="bottom-start"
        withinPortal
        width={300}
        onOpen={() => {
          setOhneVerschachtelt(imVerschachtelbaren(editor.state));
          setOhneZitat(imListenpunkt(editor.state));
        }}
      >
        <Menu.Target>
          <Button
            variant="default"
            size="md"
            leftSection={<IconPlus size={18} />}
            aria-label="Baustein einfügen"
            // Keeps the cursor position of the editor.
            onMouseDown={(ev) => ev.preventDefault()}
          >
            Baustein
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {bausteinEintraege('', ohneVerschachtelt, ohneZitat).map((e) => (
            <Menu.Item
              key={e.schluessel}
              leftSection={<SlashIcon symbol={e.symbol} />}
              mih={48}
              onClick={() => waehlen(e)}
            >
              <Text size="sm" fw={600}>
                {e.titel}
              </Text>
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'normal' }}>
                {e.beschreibung}
              </Text>
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      <Modal
        opened={liste !== null}
        onClose={() => setListe(null)}
        title={liste ? LISTEN[liste].titel : ''}
      >
        <Stack gap="xs">
          <TextInput
            placeholder={liste ? LISTEN[liste].suche : ''}
            value={suche}
            onChange={(e) => setSuche(e.currentTarget.value)}
            data-autofocus
          />
          {eintraege.length > 0 ? (
            <SlashListe eintraege={eintraege} onWaehlen={waehlen} />
          ) : (
            <Text size="sm" c="dimmed">
              Nichts gefunden
            </Text>
          )}
        </Stack>
      </Modal>
    </>
  );
}
