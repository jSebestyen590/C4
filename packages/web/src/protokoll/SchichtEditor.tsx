import { ZeitFeld } from '../ZeitFeld';
import {
  ActionIcon,
  Badge,
  Button,
  Grid,
  Group,
  Indicator,
  Menu,
  Modal,
  MultiSelect,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { IconPlus, IconTrash, IconUsers } from '@tabler/icons-react';
import { useState } from 'react';
import type { BausteinSchicht } from '@c4/shared';
import {
  anzahlSetzen,
  bedarfEntfernen,
  bedarfHinzufuegen,
  bedarfSetzen,
  MAX_SCHICHTEN,
  schichtKurz,
  schichtNeu,
  schichtPersonen,
  schichtPersonenSetzen,
  schichtZeitSetzen,
  tagVersatzFuerDatum,
} from './bausteinLogik';
import { DatumFeld } from '../DatumFeld';
import { tageDazu } from '../kalenderZeit';
import { mitgliedOptionen, useMitgliederListe } from '../organisator';
import { LokalZahl } from './LokalFelder';

const ART_TITEL = { betrieb: 'Betrieb', aufbau: 'Aufbau', putzen: 'Putzen' } as const;

/** Persons that can be entered for a Dienst: Mitglieder, Anwärter:innen and EMs (not external ones). */
const EINTRAG_STATI = new Set(['anwaerter', 'mitglied', 'em']);

/**
 * Icon button (with a count badge) that opens a modal to enter the persons of a Dienst. No names
 * outside the modal.
 */
function PersonenKnopf({
  titel,
  personen,
  onChange,
}: Readonly<{ titel: string; personen: readonly string[]; onChange: (p: string[]) => void }>) {
  const [offen, setOffen] = useState(false);
  const mitglieder = useMitgliederListe();
  const liste = (mitglieder.data ?? []).filter(
    (m) => EINTRAG_STATI.has(m.status) && !m.deaktiviert,
  );
  const optionen = mitgliedOptionen(liste);
  // Already entered people that are not (or no longer) in the list stay visible and removable.
  for (const sub of personen) {
    if (!optionen.some((o) => o.value === sub)) optionen.push({ value: sub, label: 'Unbekannt' });
  }
  return (
    <>
      <Indicator label={personen.length} size={18} disabled={personen.length === 0} offset={4}>
        <ActionIcon
          variant="light"
          size={42}
          aria-label="Personen eintragen"
          onClick={() => setOffen(true)}
        >
          <IconUsers size={20} />
        </ActionIcon>
      </Indicator>
      <Modal opened={offen} onClose={() => setOffen(false)} title={`Personen: ${titel}`} centered>
        <Stack gap="sm">
          <MultiSelect
            size="md"
            label="Personen"
            placeholder={personen.length === 0 ? 'Person suchen' : undefined}
            searchable
            clearable
            data={optionen}
            value={[...personen]}
            onChange={onChange}
            nothingFoundMessage="Niemand gefunden"
            maxValues={50}
          />
          <Button onClick={() => setOffen(false)}>Fertig</Button>
        </Stack>
      </Modal>
    </>
  );
}

/**
 * Dienste of an Event Baustein: shows the Schichten, adjusts times and head counts (all values stay
 * valid), enters persons and adds / removes Schichten and Bedarfe (with or without a Vorlage).
 */
export function SchichtEditor({
  schichten,
  dienstformName,
  dienstformen,
  zeiten,
  datum,
  onChange,
}: Readonly<{
  schichten: readonly BausteinSchicht[];
  dienstformName: (id: string) => string;
  /** Active Dienstformen that can be added (id and name). */
  dienstformen: readonly { id: string; name: string }[];
  /** Times of the event: the default of a new Schicht. */
  zeiten: { beginnZeit: string | null; endeZeit: string | null };
  /** Date of the event: Aufbau/Putzen show their own date from it (`tagVersatz`). */
  datum: string | null;
  onChange: (schichten: BausteinSchicht[]) => void;
}>) {
  const ersetzen = (index: number, neu: BausteinSchicht) =>
    onChange(schichten.map((s, i) => (i === index ? neu : s)));
  return (
    <Stack gap="xs">
      {schichten.map((s, i) => (
        <Paper key={i} withBorder p="xs" radius="md">
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Badge variant="light" size="lg">
                {ART_TITEL[s.art]}
              </Badge>
              <ActionIcon
                variant="subtle"
                color="red"
                size={42}
                aria-label={`${ART_TITEL[s.art]} entfernen`}
                onClick={() => onChange(schichten.filter((_, j) => j !== i))}
              >
                <IconTrash size={20} />
              </ActionIcon>
            </Group>
            <Grid gap="xs" align="flex-end">
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <SimpleGrid
                  cols={{ base: 2, sm: s.art === 'betrieb' ? 2 : 3 }}
                  spacing="xs"
                  style={{ alignItems: 'end' }}
                >
                  <ZeitFeld
                    label="Beginn"
                    value={s.beginnZeit}
                    onWert={(w) => ersetzen(i, schichtZeitSetzen(s, 'beginnZeit', w))}
                    style={{ minWidth: 0 }}
                  />
                  <ZeitFeld
                    label="Ende"
                    value={s.endeZeit}
                    onWert={(w) => ersetzen(i, schichtZeitSetzen(s, 'endeZeit', w))}
                    style={{ minWidth: 0 }}
                  />
                  {s.art !== 'betrieb' && (
                    <DatumFeld
                      tippbar
                      label="Datum"
                      loeschbar={false}
                      disabled={!datum}
                      placeholder={datum ? undefined : 'Erst Eventdatum wählen'}
                      value={datum ? tageDazu(datum, s.tagVersatz) : ''}
                      onWert={(neu) => {
                        if (datum && neu) {
                          ersetzen(i, { ...s, tagVersatz: tagVersatzFuerDatum(datum, neu) });
                        }
                      }}
                      style={{ minWidth: 0 }}
                    />
                  )}
                </SimpleGrid>
              </Grid.Col>
              {s.art === 'betrieb' ? (
                s.bedarfe.map((b, j) => {
                  const name = dienstformName(b.dienstformId);
                  return (
                    <Grid.Col key={b.dienstformId} span={{ base: 12, sm: 6 }}>
                      <Group gap="xs" wrap="nowrap" align="flex-end">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <LokalZahl
                            label={`${name} Minimum`}
                            min={1}
                            wert={b.minimum}
                            onWert={(minimum) => ersetzen(i, bedarfSetzen(s, j, { minimum }))}
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <LokalZahl
                            label={`${name} Wunsch`}
                            min={b.minimum}
                            wert={b.wunsch}
                            onWert={(wunsch) => ersetzen(i, bedarfSetzen(s, j, { wunsch }))}
                          />
                        </div>
                        <PersonenKnopf
                          titel={name}
                          personen={schichtPersonen(s, j)}
                          onChange={(p) => ersetzen(i, schichtPersonenSetzen(s, j, p))}
                        />
                        {s.bedarfe.length > 1 && (
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size={42}
                            aria-label={`${name} entfernen`}
                            onClick={() => ersetzen(i, bedarfEntfernen(s, j))}
                          >
                            <IconTrash size={18} />
                          </ActionIcon>
                        )}
                      </Group>
                    </Grid.Col>
                  );
                })
              ) : (
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <Group gap="xs" wrap="nowrap" align="flex-end">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <LokalZahl
                        label="Minimum"
                        min={0}
                        wert={s.minimum}
                        onWert={(minimum) => ersetzen(i, anzahlSetzen(s, { minimum }))}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <LokalZahl
                        label="Wunsch"
                        min={Math.max(1, s.minimum)}
                        wert={s.wunsch}
                        onWert={(wunsch) => ersetzen(i, anzahlSetzen(s, { wunsch }))}
                      />
                    </div>
                    <PersonenKnopf
                      titel={ART_TITEL[s.art]}
                      personen={schichtPersonen(s)}
                      onChange={(p) => ersetzen(i, schichtPersonenSetzen(s, 0, p))}
                    />
                  </Group>
                </Grid.Col>
              )}
            </Grid>
            {s.art === 'betrieb' && (
              <DienstformMenue
                dienstformen={dienstformen.filter(
                  (d) => !s.bedarfe.some((b) => b.dienstformId === d.id),
                )}
                onWahl={(id) => ersetzen(i, bedarfHinzufuegen(s, id))}
              />
            )}
          </Stack>
        </Paper>
      ))}
      <Menu position="bottom-start" withinPortal>
        <Menu.Target>
          <Button
            variant="light"
            leftSection={<IconPlus size={18} />}
            disabled={schichten.length >= MAX_SCHICHTEN || dienstformen.length === 0}
          >
            Dienst hinzufügen
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {(['aufbau', 'betrieb', 'putzen'] as const).map((art) => (
            <Menu.Item
              key={art}
              onClick={() => {
                const form = dienstformen[0];
                if (form) onChange([...schichten, schichtNeu(art, zeiten, form.id)]);
              }}
            >
              {ART_TITEL[art]}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      {dienstformen.length === 0 && (
        <Text size="xs" c="dimmed">
          Lege zuerst eine Dienstform an, um Dienste hinzuzufügen.
        </Text>
      )}
    </Stack>
  );
}

/** "Dienstform hinzufügen" for a Betrieb: the Dienstformen it does not have yet; hidden when none is left. */
function DienstformMenue({
  dienstformen,
  onWahl,
}: Readonly<{
  dienstformen: readonly { id: string; name: string }[];
  onWahl: (id: string) => void;
}>) {
  if (dienstformen.length === 0) return null;
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <Button variant="subtle" leftSection={<IconPlus size={18} />}>
          Dienstform hinzufügen
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {dienstformen.map((d) => (
          <Menu.Item key={d.id} onClick={() => onWahl(d.id)}>
            {d.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

/** Read-only list of the Schichten, one line each. */
export function SchichtListe({
  schichten,
  dienstformName,
}: Readonly<{ schichten: readonly BausteinSchicht[]; dienstformName: (id: string) => string }>) {
  return (
    <Stack gap={2}>
      {schichten.map((s, i) => (
        <Text key={i} size="sm">
          {schichtKurz(s, dienstformName)}
        </Text>
      ))}
    </Stack>
  );
}
