import {
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconChevronLeft } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ausVorlage,
  berlinZuUtc,
  datumBerlin,
  eventEingabeSchema,
  heuteBerlin,
  schichtBezeichnung,
  zeitBerlin,
  type DienstformDto,
  type SchichtArt,
  type DienstPerson,
  type EventDto,
  type EventKategorieDto,
  type VorlageDto,
} from '@c4/shared';
import { useApi } from '../api';
import { DatumFeld } from '../DatumFeld';
import {
  bedarfeZuEingabe,
  KopfFelder,
  neuerKey,
  SchichtListeEditor,
  ZeitpunktFelder,
  type KopfWerte,
  type SchichtBasis,
  type Zeitpunkt,
} from '../KalenderFormular';
import { PersonName } from '../KalenderAnzeige';
import {
  kalenderInvalidieren,
  useDienstformen,
  useEventKategorien,
  useKalenderEvent,
  useVorlagen,
} from '../kalenderDaten';
import { ApiFehler, fehlerText, pruefen } from '../warenApi';

interface EventSchichtForm extends SchichtBasis {
  /** Set for Schichten that already exist, so their Dienste are kept. */
  id?: string;
  beginn: Zeitpunkt;
  ende: Zeitpunkt;
}

interface EventWerte extends KopfWerte {
  beginn: Zeitpunkt;
  ende: Zeitpunkt;
  schichten: EventSchichtForm[];
}

/** A Dienst that saving would delete (the API answers 409 with this list). */
interface Betroffener {
  dienstId: string;
  schichtId: string;
  schichtArt: SchichtArt;
  schichtBeginn: string;
  schichtEnde: string;
  dienstformId: string;
  person: DienstPerson;
  grund: 'schicht' | 'bedarf';
}

const zeitpunktAusIso = (iso: string): Zeitpunkt => ({
  datum: datumBerlin(iso),
  zeit: zeitBerlin(iso),
});

interface EventDaten {
  titel: string;
  beschreibung: string | null;
  kategorieId: string | null;
  beginn: string;
  ende: string;
  fehltHinweisStunden: number | null;
  schichten: {
    id?: string;
    art: EventSchichtForm['art'];
    beginn: string;
    ende: string;
    bedarfe: { dienstformId: string; minimum: number; wunsch: number }[];
  }[];
}

function werteAus(e: EventDaten): EventWerte {
  return {
    titel: e.titel,
    beschreibung: e.beschreibung ?? '',
    kategorieId: e.kategorieId,
    hinweisStunden: e.fehltHinweisStunden ?? '',
    beginn: zeitpunktAusIso(e.beginn),
    ende: zeitpunktAusIso(e.ende),
    schichten: e.schichten.map((s) => ({
      key: s.id ?? neuerKey(),
      id: s.id,
      art: s.art,
      beginn: zeitpunktAusIso(s.beginn),
      ende: zeitpunktAusIso(s.ende),
      bedarfe: s.bedarfe.map((b) => ({ ...b })),
    })),
  };
}

const werteAusEvent = (e: EventDto): EventWerte =>
  werteAus({
    ...e,
    kategorieId: e.kategorie?.id ?? null,
    fehltHinweisStunden: e.fehltHinweisStunden,
  });

function leereWerte(datum: string): EventWerte {
  return {
    titel: '',
    beschreibung: '',
    kategorieId: null,
    hinweisStunden: '',
    beginn: { datum, zeit: '20:00' },
    ende: { datum, zeit: '23:00' },
    schichten: [],
  };
}

const zuIso = (z: Zeitpunkt): string | null =>
  z.datum && z.zeit ? berlinZuUtc(z.datum, z.zeit) : null;

/** Form values -> API input; a German error text when something is missing or invalid. */
function eingabeBauen(
  w: EventWerte,
): { fehler: string } | { json: NonNullable<ReturnType<typeof rohEingabe>> } {
  const roh = rohEingabe(w);
  if (!roh)
    return {
      fehler:
        'Bitte gib bei allen Zeiten Datum und Uhrzeit an und wähle bei jedem Bedarf eine Dienstform.',
    };
  const geprueft = eventEingabeSchema.safeParse(roh);
  if (!geprueft.success)
    return { fehler: geprueft.error.issues[0]?.message ?? 'Ungültige Eingabe.' };
  return { json: roh };
}

function rohEingabe(w: EventWerte) {
  const beginn = zuIso(w.beginn);
  const ende = zuIso(w.ende);
  if (!beginn || !ende) return null;
  const schichten = [];
  for (const s of w.schichten) {
    const sb = zuIso(s.beginn);
    const se = zuIso(s.ende);
    const bedarfe = bedarfeZuEingabe(s.bedarfe);
    if (!sb || !se || !bedarfe) return null;
    schichten.push({ id: s.id, art: s.art, beginn: sb, ende: se, bedarfe });
  }
  return {
    titel: w.titel,
    beschreibung: w.beschreibung,
    kategorieId: w.kategorieId,
    beginn,
    ende,
    fehltHinweisStunden: w.hinweisStunden === '' ? null : w.hinweisStunden,
    schichten,
  };
}

function Formular({
  anfang,
  eventId,
  dienstformen,
  kategorien,
}: Readonly<{
  anfang: EventWerte;
  eventId?: string;
  dienstformen: DienstformDto[];
  kategorien: EventKategorieDto[];
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [werte, setWerte] = useState(anfang);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [betroffene, setBetroffene] = useState<Betroffener[] | null>(null);

  const speichern = async (bestaetigt: boolean) => {
    const ergebnis = eingabeBauen(werte);
    if ('fehler' in ergebnis) return setFehler(ergebnis.fehler);
    setFehler(null);
    setLaeuft(true);
    try {
      const json = bestaetigt ? { ...ergebnis.json, bestaetigt: true } : ergebnis.json;
      let id = eventId;
      if (eventId) {
        const res = await api.kalender.events[':id'].$put({ param: { id: eventId }, json });
        if (res.status === 409) {
          const body = (await res.json()) as { error: string; betroffene?: Betroffener[] };
          if (body.betroffene?.length) {
            setBetroffene(body.betroffene);
            return;
          }
          throw new ApiFehler(409, body.error);
        }
        await pruefen(res);
      } else {
        const res = await api.kalender.events.$post({ json });
        await pruefen(res);
        id = ((await res.json()) as { id: string }).id;
      }
      await kalenderInvalidieren(qc);
      setBetroffene(null);
      notifications.show({ color: 'green', message: 'Das Event wurde gespeichert.' });
      void navigate(`/kalender/events/${id}`);
    } catch (e) {
      setBetroffene(null);
      setFehler(fehlerText(e, 'Das Event konnte nicht gespeichert werden.'));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Stack>
      <KopfFelder
        werte={werte}
        onChange={(k) => setWerte({ ...werte, ...k })}
        kategorien={kategorien}
      />
      <ZeitpunktFelder
        label="Beginn"
        wert={werte.beginn}
        onChange={(beginn) => setWerte({ ...werte, beginn })}
      />
      <ZeitpunktFelder
        label="Ende"
        wert={werte.ende}
        onChange={(ende) => setWerte({ ...werte, ende })}
      />
      <SchichtListeEditor<EventSchichtForm>
        schichten={werte.schichten}
        onChange={(schichten) => setWerte({ ...werte, schichten })}
        dienstformen={dienstformen}
        neu={() => ({
          key: neuerKey(),
          art: 'betrieb',
          beginn: werte.beginn,
          ende: werte.ende,
          bedarfe: [],
        })}
        untertitel={(s) => {
          const beginn = zuIso(s.beginn);
          const ende = zuIso(s.ende);
          return beginn && ende
            ? schichtBezeichnung({ art: s.art, beginn, ende }, zuIso(werte.beginn) ?? undefined)
            : null;
        }}
        zeitFelder={(s, aendern) => (
          <Stack gap="xs">
            <ZeitpunktFelder
              label="Beginn"
              wert={s.beginn}
              onChange={(beginn) => aendern({ beginn })}
            />
            <ZeitpunktFelder label="Ende" wert={s.ende} onChange={(ende) => aendern({ ende })} />
          </Stack>
        )}
      />
      {fehler && <Alert color="red">{fehler}</Alert>}
      <Group grow preventGrowOverflow={false}>
        <Button
          variant="default"
          component={Link}
          to={eventId ? `/kalender/events/${eventId}` : '/kalender'}
        >
          Abbrechen
        </Button>
        <Button loading={laeuft} onClick={() => void speichern(false)}>
          Speichern
        </Button>
      </Group>

      <Modal
        opened={betroffene !== null}
        onClose={() => setBetroffene(null)}
        title="Dienste werden entfernt"
      >
        <Stack>
          <Text size="sm">
            Wenn du speicherst, verlieren diese Personen ihren Dienst. Sie bekommen eine
            Benachrichtigung, sobald das eingeschaltet ist.
          </Text>
          <Stack gap={4}>
            {betroffene?.map((b) => {
              const form = dienstformen.find((d) => d.id === b.dienstformId)?.name ?? 'Dienst';
              const schicht = schichtBezeichnung(
                { art: b.schichtArt, beginn: b.schichtBeginn, ende: b.schichtEnde },
                zuIso(werte.beginn) ?? undefined,
              );
              return (
                <Text key={b.dienstId} size="sm">
                  <PersonName person={b.person} verlinken={false} mitQuelle={false} /> –{' '}
                  {b.grund === 'schicht'
                    ? `Schicht „${schicht}“ entfällt`
                    : `kein Bedarf mehr für ${form} in „${schicht}“`}
                </Text>
              );
            })}
          </Stack>
          <Group grow preventGrowOverflow={false}>
            <Button variant="default" onClick={() => setBetroffene(null)}>
              Abbrechen
            </Button>
            <Button color="red" loading={laeuft} onClick={() => void speichern(true)}>
              Trotzdem speichern
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

/** New event: choose a Vorlage and a date first, then edit everything. */
function NeuesEvent({
  dienstformen,
  kategorien,
}: Readonly<{ dienstformen: DienstformDto[]; kategorien: EventKategorieDto[] }>) {
  const vorlagen = useVorlagen();
  const [vorlageId, setVorlageId] = useState<string | null>(null);
  const [datum, setDatum] = useState(heuteBerlin());
  const [anfang, setAnfang] = useState<EventWerte | null>(null);

  if (anfang) {
    return <Formular anfang={anfang} dienstformen={dienstformen} kategorien={kategorien} />;
  }
  const weiter = () => {
    const vorlage: VorlageDto | undefined = vorlagen.data?.find((v) => v.id === vorlageId);
    setAnfang(vorlage ? werteAus(ausVorlage(vorlage, datum)) : leereWerte(datum));
  };
  return (
    <Stack>
      <Select
        label="Vorlage"
        placeholder="Ohne Vorlage"
        clearable
        data={(vorlagen.data ?? []).map((v) => ({ value: v.id, label: v.titel }))}
        value={vorlageId}
        onChange={setVorlageId}
        disabled={vorlagen.isPending}
      />
      <DatumFeld label="Datum" value={datum} onWert={setDatum} />
      <Button disabled={!datum} onClick={weiter}>
        Weiter
      </Button>
    </Stack>
  );
}

/** `/kalender/events/neu` and `/kalender/events/:id/bearbeiten`. */
export function EventFormularPage() {
  const { id } = useParams();
  const event = useKalenderEvent(id);
  const dienstformen = useDienstformen();
  const kategorien = useEventKategorien();

  const laedt = (id && event.isPending) || dienstformen.isPending || kategorien.isPending;
  const fehler = event.isError || dienstformen.isError || kategorien.isError;
  return (
    <Stack maw={700}>
      <Anchor component={Link} to={id ? `/kalender/events/${id}` : '/kalender'} size="sm">
        <Group gap={4} wrap="nowrap">
          <IconChevronLeft size={16} />
          {id ? 'Zurück zum Event' : 'Zurück zum Kalender'}
        </Group>
      </Anchor>
      <Title order={2}>{id ? 'Event bearbeiten' : 'Event anlegen'}</Title>
      {fehler ? (
        <Alert color="red">Die Daten konnten nicht geladen werden.</Alert>
      ) : laedt ? (
        <Loader m="md" />
      ) : id ? (
        <Formular
          anfang={werteAusEvent(event.data!)}
          eventId={id}
          dienstformen={dienstformen.liste}
          kategorien={kategorien.liste}
        />
      ) : (
        <NeuesEvent dienstformen={dienstformen.liste} kategorien={kategorien.liste} />
      )}
    </Stack>
  );
}
