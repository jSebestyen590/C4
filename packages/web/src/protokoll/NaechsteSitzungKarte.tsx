import { ZeitFeld } from '../ZeitFeld';
import { DatumFeld } from '../DatumFeld';
import { Anchor, Button, Paper, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { Link } from 'react-router-dom';
import {
  datumAnzeigen,
  datumBerlin,
  zeitBerlin,
  type ProtokollKopf,
  type ProtokollNaechsteSitzung,
  type ProtokollNaechsteSitzungVorschlag,
} from '@c4/shared';
import { tagAnzeigen } from '../kalenderZeit';
import { naechsteSitzungWert, type NaechsteSitzungWert } from './dokumentDaten';

const optionText = (e: ProtokollNaechsteSitzungVorschlag): string =>
  `${tagAnzeigen(e.beginn)} ${zeitBerlin(e.beginn)} · ${e.titel}`;

/** "Di, 11.11.2026, 20:00" of a value (the time only when known). */
const wertText = (w: NaechsteSitzungWert): string => {
  const tag = tagAnzeigen(`${w.datum}T12:00:00Z`);
  return w.uhrzeit ? `${tag}, ${w.uhrzeit}` : tag;
};

/**
 * "Nächste Sitzung" below the editor: the calendar's suggestion (automatic) or a value entered by hand
 * (a Sitzung of the calendar, or date and time). Not part of the TipTap document; lives in the Kopf.
 */
export function NaechsteSitzungKarte({
  kopf,
  vorschlag,
  optionen,
  editierbar,
  onChange,
}: Readonly<{
  kopf: ProtokollKopf;
  vorschlag: ProtokollNaechsteSitzungVorschlag | null;
  /** Upcoming Sitzungen to pick from. */
  optionen: readonly ProtokollNaechsteSitzungVorschlag[];
  editierbar: boolean;
  onChange: (kopf: ProtokollKopf) => void;
}>) {
  const wert = naechsteSitzungWert(kopf, vorschlag);
  const von = kopf.naechsteSitzung;
  const setzen = (neu: ProtokollNaechsteSitzung | null) =>
    onChange({ ...kopf, naechsteSitzung: neu });
  const titel = von
    ? vorschlag && von.eventId === vorschlag.eventId
      ? vorschlag.titel
      : optionen.find((o) => o.eventId === von.eventId)?.titel
    : vorschlag?.titel;
  const ortFeld = (
    <TextInput
      size="md"
      label="Ort"
      value={kopf.naechsteSitzungOrt}
      maxLength={100}
      onChange={(e) => onChange({ ...kopf, naechsteSitzungOrt: e.currentTarget.value })}
    />
  );
  const quelle = wert?.eventId ? '(aus dem Kalender)' : '(von Hand)';

  return (
    <Paper withBorder p="sm" radius="md" data-testid="naechste-sitzung-karte">
      <Stack gap="xs">
        <Text fw={700}>Nächste Sitzung</Text>
        {wert ? (
          <Text size="sm">
            {wertText(wert)}
            {titel && ` · ${titel}`}{' '}
            <Text span c="dimmed">
              {quelle}
            </Text>
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            Keine nächste Sitzung im Kalender gefunden.
          </Text>
        )}
        {wert?.eventId && (
          <Anchor
            component={Link}
            to={`/kalender/events/${encodeURIComponent(wert.eventId)}`}
            target="_blank"
            rel="noopener"
            size="sm"
          >
            Im Kalender öffnen
          </Anchor>
        )}
        {editierbar && !von && ortFeld}
        {editierbar && !von && (
          <Button
            variant="default"
            size="md"
            w={{ base: '100%', sm: 'auto' }}
            style={{ alignSelf: 'flex-start' }}
            onClick={() =>
              setzen(
                wert
                  ? { eventId: wert.eventId, datum: wert.datum, uhrzeit: wert.uhrzeit }
                  : { eventId: null, datum: '', uhrzeit: '' },
              )
            }
          >
            Ändern
          </Button>
        )}
        {editierbar && von && (
          <Stack gap="xs">
            {optionen.length > 0 && (
              <Select
                allowDeselect={false}
                size="md"
                label="Sitzung aus dem Kalender"
                placeholder="Sitzung auswählen"
                clearable
                data={optionen.map((o) => ({ value: o.eventId, label: optionText(o) }))}
                value={optionen.some((o) => o.eventId === von.eventId) ? von.eventId : null}
                onChange={(id) => {
                  const o = optionen.find((x) => x.eventId === id);
                  setzen(
                    o
                      ? {
                          eventId: o.eventId,
                          datum: datumBerlin(o.beginn),
                          uhrzeit: zeitBerlin(o.beginn),
                        }
                      : { eventId: null, datum: '', uhrzeit: '' },
                  );
                }}
              />
            )}
            <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xs" style={{ alignItems: 'end' }}>
              <DatumFeld
                tippbar
                label="Datum"
                value={von.datum}
                onWert={(datum) => setzen({ eventId: null, datum, uhrzeit: von.uhrzeit })}
              />
              <ZeitFeld
                label="Uhrzeit"
                value={von.uhrzeit}
                onWert={(uhrzeit) => setzen({ eventId: null, datum: von.datum, uhrzeit })}
              />
              {ortFeld}
            </SimpleGrid>
            {von.datum && (
              <Text size="xs" c="dimmed">
                Im Protokoll steht: {datumAnzeigen(von.datum)}
                {von.uhrzeit && `, ${von.uhrzeit} Uhr`}
              </Text>
            )}
            <Button
              variant="default"
              size="md"
              w={{ base: '100%', sm: 'auto' }}
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setzen(null)}
            >
              Automatisch
            </Button>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
