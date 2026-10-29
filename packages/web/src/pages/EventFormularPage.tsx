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
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ausVorlage,
  serieEventErsetzen,
  serieEventNeutral,
  berlinZuUtc,
  datumBerlin,
  betriebDatum,
  eventEingabeSchema,
  heuteBerlin,
  schichtBezeichnung,
  zeitenAus,
  zeitspanne,
  type DienstformDto,
  type SchichtArt,
  type DienstPerson,
  type EventDto,
  type EventEingabe,
  type EventKategorieDto,
  type EventArt,
  type TeilnahmeDto,
  type TeilnahmeKreis,
  type VorlageDto,
} from '@c4/shared';
import { kalenderLink } from '../kalenderZeit';
import { useApi } from '../api';
import { DatumFeld } from '../DatumFeld';
import {
  bedarfFelder,
  fehlerAusIssues,
  KopfFelder,
  neueSchichtWerte,
  neuerKey,
  SchichtListeEditor,
  teilnahmeNachKategorie,
  UhrzeitFelder,
  type KopfWerte,
  type SchichtFehler,
  type SchichtBasis,
} from '../KalenderFormular';
import { PersonName } from '../KalenderAnzeige';
import {
  eingeladeneAus,
  keineTeilnahme,
  TeilnahmeFelder,
  teilnahmeKreisAus,
  teilnahmeWerteAus,
  type TeilnahmeWerte,
} from '../TeilnahmeFelder';
import {
  kalenderInvalidieren,
  useDienstformen,
  useEventKategorien,
  useKalenderEvent,
  useKalenderEvents,
  useSerien,
  useVorlagen,
} from '../kalenderDaten';
import { ApiFehler, fehlerText, pruefen } from '../warenApi';

interface EventSchichtForm extends SchichtBasis {
  /** Set for Schichten that already exist, so their Dienste are kept. */
  id?: string;
  /** Date of an Aufbau/Putzen Schicht; Betrieb Schichten follow the event date. */
  datum: string;
  beginnZeit: string;
  endeZeit: string;
}

interface EventWerte extends KopfWerte {
  datum: string;
  beginnZeit: string;
  endeZeit: string;
  teilnahme: TeilnahmeWerte;
  schichten: EventSchichtForm[];
}

/** A Dienst that saving would delete (the API answers 409 with this list). */
interface Betroffener {
  dienstId: string;
  schichtId: string;
  schichtArt: SchichtArt;
  schichtBeginn: string;
  schichtEnde: string;
  dienstformId: string | null;
  person: DienstPerson;
  grund: 'schicht' | 'bedarf';
}

/** What saving would delete (the API answers 409 with these lists). */
interface Entfernung {
  dienste: Betroffener[];
  teilnahmen: TeilnahmeDto[];
}

interface EventDaten {
  titel: string;
  beschreibung: string | null;
  kategorieId: string | null;
  beginn: string;
  ende: string;
  teilnahmeStatus: TeilnahmeKreis;
  /** Subs of the individually invited members. */
  eingeladen: readonly string[];
  schichten: {
    id?: string;
    art: EventSchichtForm['art'];
    beginn: string;
    ende: string;
    bedarfe?: { dienstformId: string; minimum: number; wunsch: number }[];
    minimum?: number | null;
    wunsch?: number | null;
  }[];
}

function werteAus(e: EventDaten): EventWerte {
  return {
    ...zeitenAus(e.beginn, e.ende),
    titel: e.titel,
    beschreibung: e.beschreibung ?? '',
    kategorieId: e.kategorieId,
    teilnahme: teilnahmeWerteAus(e.teilnahmeStatus, e.eingeladen),
    schichten: e.schichten.map((s) => ({
      key: s.id ?? neuerKey(),
      id: s.id,
      art: s.art,
      ...zeitenAus(s.beginn, s.ende),
      bedarfe:
        s.art === 'betrieb' && s.bedarfe?.length
          ? s.bedarfe.map((b) => ({ ...b }))
          : neueSchichtWerte().bedarfe,
      minimum: s.minimum ?? 1,
      wunsch: s.wunsch ?? 2,
    })),
  };
}

const werteAusEvent = (e: EventDto): EventWerte =>
  werteAus({
    ...e,
    kategorieId: e.kategorie?.id ?? null,
    eingeladen: e.teilnahmen.filter((t) => t.eingeladen).map((t) => t.person.sub),
  });

function leereWerte(datum: string): EventWerte {
  return {
    titel: '',
    beschreibung: '',
    kategorieId: null,
    datum,
    beginnZeit: '20:00',
    endeZeit: '23:00',
    teilnahme: keineTeilnahme(),
    schichten: [],
  };
}

/** Begin and end instants of a Schicht form; Betrieb follows the event date, see `betriebDatum`. */
function schichtSpanne(w: EventWerte, s: EventSchichtForm) {
  const datum = s.art === 'betrieb' ? betriebDatum(w.datum, w.beginnZeit, s.beginnZeit) : s.datum;
  return datum && s.beginnZeit && s.endeZeit ? zeitspanne(datum, s.beginnZeit, s.endeZeit) : null;
}

/** Form values -> API input; German error texts (general and per Schicht field) when invalid. */
function eingabeBauen(
  w: EventWerte,
  art: EventArt | null,
): { fehler: string; schichtFehler?: Record<number, SchichtFehler> } | { json: EventEingabe } {
  const roh = rohEingabe(w, art);
  if (!roh) return { fehler: 'Bitte gib bei allen Zeiten ein Datum und Uhrzeiten an.' };
  const geprueft = eventEingabeSchema.safeParse(roh);
  if (!geprueft.success) {
    const { schichten, allgemein } = fehlerAusIssues(geprueft.error.issues);
    return { fehler: allgemein ?? 'Ungültige Eingabe.', schichtFehler: schichten };
  }
  return { json: geprueft.data };
}

/** Only what the Kategorie's kind allows is sent: Schichten for Dienste, the circle for Teilnahme. */
function rohEingabe(w: EventWerte, art: EventArt | null) {
  if (!w.datum || !w.beginnZeit || !w.endeZeit) return null;
  const schichten = [];
  for (const s of art === 'teilnahme' ? [] : w.schichten) {
    const spanne = schichtSpanne(w, s);
    if (!spanne) return null;
    schichten.push({ id: s.id, ...spanne, ...bedarfFelder(s) });
  }
  return {
    titel: w.titel,
    beschreibung: w.beschreibung,
    kategorieId: w.kategorieId,
    ...zeitspanne(w.datum, w.beginnZeit, w.endeZeit),
    teilnahmeStatus: art === 'teilnahme' ? teilnahmeKreisAus(w.teilnahme) : null,
    eingeladen: art === 'teilnahme' ? eingeladeneAus(w.teilnahme) : [],
    schichten,
  };
}

function Formular({
  anfang,
  eventId,
  ersetzeSerie = false,
  serieName,
  dienstformen,
  kategorien,
}: Readonly<{
  anfang: EventWerte;
  eventId?: string;
  /** Saving detaches the (generated) event from its series, e.g. a planned event replaced by another event. */
  ersetzeSerie?: boolean;
  /** Name of the series the replaced event belonged to. */
  serieName?: string;
  dienstformen: DienstformDto[];
  kategorien: EventKategorieDto[];
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [werte, setWerte] = useState(anfang);
  const [fehler, setFehler] = useState<string | null>(null);
  const [schichtFehler, setSchichtFehler] = useState<Record<number, SchichtFehler>>({});
  const [laeuft, setLaeuft] = useState(false);
  const [entfernung, setEntfernung] = useState<Entfernung | null>(null);
  const art = kategorien.find((k) => k.id === werte.kategorieId)?.art ?? null;

  const eventBeginnIso =
    werte.datum && werte.beginnZeit ? berlinZuUtc(werte.datum, werte.beginnZeit) : undefined;

  const speichern = async (bestaetigt: boolean) => {
    const ergebnis = eingabeBauen(werte, art);
    if ('fehler' in ergebnis) {
      setSchichtFehler(ergebnis.schichtFehler ?? {});
      return setFehler(ergebnis.fehler);
    }
    setFehler(null);
    setSchichtFehler({});
    setLaeuft(true);
    try {
      const json = {
        ...ergebnis.json,
        ...(bestaetigt && { bestaetigt: true }),
        ...(ersetzeSerie && { ersetzeSerie: true }),
      };
      let id = eventId;
      if (eventId) {
        const res = await api.kalender.events[':id'].$put({ param: { id: eventId }, json });
        if (res.status === 409) {
          const body = (await res.json()) as {
            error: string;
            betroffene?: Betroffener[];
            teilnahmen?: TeilnahmeDto[];
          };
          if (body.betroffene?.length || body.teilnahmen?.length) {
            setEntfernung({ dienste: body.betroffene ?? [], teilnahmen: body.teilnahmen ?? [] });
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
      setEntfernung(null);
      notifications.show({ color: 'green', message: 'Das Event wurde gespeichert.' });
      void navigate(`/kalender/events/${id}`);
    } catch (e) {
      setEntfernung(null);
      setFehler(fehlerText(e, 'Das Event konnte nicht gespeichert werden.'));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Stack>
      {ersetzeSerie && (
        <Alert color="blue">
          Dieses Event ersetzt {serieName ? `„${serieName}“` : 'das Serien-Event'} an diesem Tag.
          Eingetragene Dienste bleiben erhalten. Es sind nur Kategorien mit Diensten wählbar, ein
          Serien-Event wird nie zu einem Event mit Teilnahme.
        </Alert>
      )}
      <KopfFelder
        werte={werte}
        onChange={(k) => setWerte(teilnahmeNachKategorie(werte, { ...werte, ...k }, kategorien))}
        kategorien={ersetzeSerie ? kategorien.filter((k) => k.art !== 'teilnahme') : kategorien}
      />
      <DatumFeld
        label="Datum"
        value={werte.datum}
        onWert={(datum) => setWerte({ ...werte, datum })}
        loeschbar={false}
      />
      <UhrzeitFelder
        beginn={werte.beginnZeit}
        ende={werte.endeZeit}
        onChange={(z) => setWerte({ ...werte, ...z })}
      />
      {art === null && (
        <Text size="sm" c="dimmed">
          Wähle eine Kategorie. Danach erscheinen je nach Art die Schichten oder die Teilnahme.
        </Text>
      )}
      {art === 'teilnahme' && (
        <TeilnahmeFelder
          werte={werte.teilnahme}
          onChange={(teilnahme) => setWerte({ ...werte, teilnahme })}
        />
      )}
      {art === 'dienste' && (
        <SchichtListeEditor<EventSchichtForm>
          schichten={werte.schichten}
          onChange={(schichten) => setWerte({ ...werte, schichten })}
          dienstformen={dienstformen}
          fehler={schichtFehler}
          neu={() => ({
            key: neuerKey(),
            ...neueSchichtWerte(),
            datum: werte.datum,
            beginnZeit: werte.beginnZeit,
            endeZeit: werte.endeZeit,
          })}
          untertitel={(s) => {
            const spanne = schichtSpanne(werte, s);
            return spanne ? schichtBezeichnung({ art: s.art, ...spanne }, eventBeginnIso) : null;
          }}
          zeitFelder={(s, aendern, f) => (
            <Stack gap="xs">
              {s.art !== 'betrieb' && (
                <DatumFeld
                  label="Datum"
                  value={s.datum}
                  onWert={(datum) => aendern({ datum })}
                  loeschbar={false}
                />
              )}
              <UhrzeitFelder
                beginn={s.beginnZeit}
                ende={s.endeZeit}
                onChange={aendern}
                beginnNaechsterTag={s.art === 'betrieb' && s.beginnZeit < werte.beginnZeit}
                fehler={f.ende}
              />
            </Stack>
          )}
        />
      )}
      {fehler && <Alert color="red">{fehler}</Alert>}
      <Group grow preventGrowOverflow={false}>
        <Button
          variant="default"
          component={Link}
          to={eventId ? `/kalender/events/${eventId}` : kalenderLink(werte.datum)}
        >
          Abbrechen
        </Button>
        <Button loading={laeuft} onClick={() => void speichern(false)}>
          Speichern
        </Button>
      </Group>

      <Modal
        opened={entfernung !== null}
        onClose={() => setEntfernung(null)}
        title={
          entfernung?.dienste.length && entfernung.teilnahmen.length
            ? 'Dienste und Teilnahmen werden entfernt'
            : entfernung?.teilnahmen.length
              ? 'Teilnahmen werden entfernt'
              : 'Dienste werden entfernt'
        }
      >
        <Stack>
          <Text size="sm">
            Wenn du speicherst, verlieren diese Personen ihren Dienst bzw. ihre Teilnahme. Sie
            bekommen eine Benachrichtigung, sobald das eingeschaltet ist.
          </Text>
          <Stack gap={4}>
            {entfernung?.dienste.map((b) => {
              const form = dienstformen.find((d) => d.id === b.dienstformId)?.name ?? 'Dienst';
              const schicht = schichtBezeichnung(
                { art: b.schichtArt, beginn: b.schichtBeginn, ende: b.schichtEnde },
                eventBeginnIso,
              );
              return (
                <Text key={b.dienstId} size="sm">
                  <PersonName person={b.person} verlinken={false} mitQuelle={false} /> –{' '}
                  {b.grund === 'schicht'
                    ? `Schicht „${schicht}“ entfällt`
                    : b.dienstformId === null
                      ? `Dienst ohne Dienstform passt nicht zur Betriebs-Schicht „${schicht}“`
                      : `kein Bedarf mehr für ${form} in „${schicht}“`}
                </Text>
              );
            })}
            {entfernung?.teilnahmen.map((t) => (
              <Text key={t.person.sub} size="sm">
                <PersonName person={t.person} verlinken={false} mitQuelle={false} /> –{' '}
                {t.zustand === 'absage'
                  ? 'Absage entfällt'
                  : t.eingeladen
                    ? 'Einladung entfällt'
                    : 'Teilnahme entfällt'}
              </Text>
            ))}
          </Stack>
          <Group grow preventGrowOverflow={false}>
            <Button variant="default" onClick={() => setEntfernung(null)}>
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

/** The `?datum=` preset if it is a real YYYY-MM-DD date, otherwise today. */
function datumAusSuche(wert: string | null): string {
  if (wert && /^\d{4}-\d{2}-\d{2}$/.test(wert)) {
    const d = new Date(`${wert}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === wert) return wert;
  }
  return heuteBerlin();
}

/** New event: choose a Vorlage and a date first, then edit everything. */
function NeuesEvent({
  dienstformen,
  kategorien,
}: Readonly<{ dienstformen: DienstformDto[]; kategorien: EventKategorieDto[] }>) {
  const vorlagen = useVorlagen();
  const [vorlageId, setVorlageId] = useState<string | null>(null);
  const [suche] = useSearchParams();
  const [datum, setDatum] = useState(() => datumAusSuche(suche.get('datum')));
  const [anfang, setAnfang] = useState<{
    werte: EventWerte;
    ersetzt?: EventDto;
  } | null>(null);
  const [serienFrage, setSerienFrage] = useState<EventDto | null>(null);
  const tagesEvents = useKalenderEvents(datum, datum);
  const serien = useSerien();
  const serieNameVon = (e?: EventDto) =>
    serien.data?.find((x) => x.id === e?.serie)?.name ?? 'Serie';

  if (anfang) {
    return (
      <Formular
        anfang={anfang.werte}
        {...(anfang.ersetzt && { eventId: anfang.ersetzt.id, ersetzeSerie: true })}
        serieName={serieNameVon(anfang.ersetzt)}
        dienstformen={dienstformen}
        kategorien={kategorien}
      />
    );
  }
  const vorlage: VorlageDto | undefined = vorlagen.data?.find((v) => v.id === vorlageId);
  const vorlageKategorie = kategorien.find((k) => k.id === vorlage?.kategorieId);
  // A planned series event on that day can be replaced instead of doubled. Only Dienste events are
  // ever replaced, and only by a Dienste Vorlage (or by a free event): participation is never involved.
  const serienEvent =
    vorlageKategorie?.art !== 'teilnahme'
      ? tagesEvents.data?.find(
          (e) =>
            e.serie !== null &&
            e.art !== 'teilnahme' &&
            (!vorlage || serien.data?.find((x) => x.id === e.serie)?.vorlageId !== vorlage.id) &&
            !e.abgesagt &&
            datumBerlin(e.beginn) === datum,
        )
      : undefined;
  const neuAnlegen = () =>
    setAnfang({
      werte: vorlage ? werteAus(ausVorlage(vorlage, datum, vorlageKategorie)) : leereWerte(datum),
    });
  const weiter = () => {
    if (serienEvent) setSerienFrage(serienEvent);
    else neuAnlegen();
  };
  const ersetzen = () => {
    if (!serienFrage) return;
    setAnfang({
      werte: werteAus(
        vorlage
          ? serieEventErsetzen(serienFrage, vorlage, vorlageKategorie)
          : serieEventNeutral(serienFrage),
      ),
      ersetzt: serienFrage,
    });
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
      <Button disabled={!datum} loading={tagesEvents.isPending && !!datum} onClick={weiter}>
        Weiter
      </Button>

      <Modal
        opened={serienFrage !== null}
        onClose={() => setSerienFrage(null)}
        title={`${serieNameVon(serienFrage ?? undefined)} ersetzen?`}
      >
        <Stack>
          <Text size="sm">
            An diesem Tag ist „{serieNameVon(serienFrage ?? undefined)}“ eingeplant. Möchtest du das
            Event durch dieses ersetzen? Eingetragene Dienste bleiben erhalten.
          </Text>
          <Button onClick={ersetzen}>Ersetzen</Button>
          <Button variant="light" onClick={neuAnlegen}>
            Zusätzlich anlegen
          </Button>
          <Button variant="default" onClick={() => setSerienFrage(null)}>
            Abbrechen
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}

/** `/kalender/events/neu` and `/kalender/events/:id/bearbeiten`. */
export function EventFormularPage() {
  const { id } = useParams();
  const [suche] = useSearchParams();
  const event = useKalenderEvent(id);
  const dienstformen = useDienstformen();
  const kategorien = useEventKategorien();

  const laedt = (id && event.isPending) || dienstformen.isPending || kategorien.isPending;
  const fehler = event.isError || dienstformen.isError || kategorien.isError;
  return (
    <Stack maw={700}>
      <Anchor
        component={Link}
        to={id ? `/kalender/events/${id}` : kalenderLink(suche.get('datum'))}
        size="sm"
      >
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
