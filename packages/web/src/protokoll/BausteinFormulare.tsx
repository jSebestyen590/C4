import {
  Anchor,
  ActionIcon,
  Alert,
  Autocomplete,
  Badge,
  Button,
  Group,
  MultiSelect,
  Paper,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import { IconAlertTriangle, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AUSWAHL_MAX_OPTIONEN,
  auswahlErgebnis,
  auswahlRunden,
  datumAnzeigen,
  datumBerlin,
  ERWAEHNUNG_GRUPPEN,
  eventDatenAusKalender,
  MEINUNGSBILD_MAX_OPTIONEN,
  WAHL_MAX_ANZAHL,
  WAHL_MAX_KANDIDATEN,
  WAHL_MAX_STICHWAHLEN,
  wahlErgebnis,
  wahlRunden,
  wahlStimmenProPerson,
  type BausteinAnwaerterDaten,
  type BausteinAufnahmeDaten,
  type BausteinAuswahlDaten,
  type BausteinBeschlussDaten,
  type BausteinEmDaten,
  type BausteinEmAbstimmung,
  type BausteinEventDaten,
  type BausteinMeinungsbildDaten,
  type BausteinWahlDaten,
  type BausteinThemaDaten,
  type BausteinTodoDaten,
  type BausteinVergangenesEventDaten,
  type EventDauer,
  type ProtokollMitgliedDto,
  type WahlErgebnis,
} from '@c4/shared';
import { aufnahmeOptionen, emKandidaten, personenOptionen } from './anwesenheit';
import { useProtokollKontext } from './kontext';
import { unwrap, useApi } from '../api';
import { DatumFeld } from '../DatumFeld';
import { useDienstformen, useEventKategorien, useVorlagen } from '../kalenderDaten';
import { mitgliedLink, mitgliedName } from '../mitglied';
import { mitgliedOptionen, useMitgliederListe } from '../organisator';
import { StatusName } from '../StatusAnzeige';
import {
  annahmeSchalterIds,
  eventKategorieSetzen,
  eventZeigtBis,
  kalenderEventLabel,
  auswahlOptionEntfernen,
  auswahlOptionHinzufuegen,
  auswahlOptionSetzen,
  eventBisSetzen,
  eventDatumSetzen,
  kandidatEntfernen,
  kandidatHinzufuegen,
  kalenderEventFuerBaustein,
  kandidatSetzen,
  annahmeSetzen,
  nichtAngetretenSetzen,
  optionEntfernen,
  optionHinzufuegen,
  optionSetzen,
  stichwahlEntfernen,
  stichwahlHinzufuegen,
  stichwahlSetzen,
  stimmeSetzen,
  ueberzaehligeStichwahlenEntfernen,
  wahlAnzahlSetzen,
  wahlStimmenProPersonSetzen,
  todoNurEinePerson,
  todoZustaendigSetzen,
  todoZustaendigWert,
  zeitWert,
} from './bausteinLogik';
import { GRUPPE_TITEL } from './erwaehnungLogik';
import { eventDatumText, useProtokollEvents } from './daten';
import { WiederholungHinweis } from './WiederholungHinweis';
import { ZeitFeld } from '../ZeitFeld';
import { LokalText, LokalTextbereich, LokalZahl } from './LokalFelder';
import { SchichtEditor, SchichtListe } from './SchichtEditor';
import { postenKeys } from '../queryKeys';

/** Fields of one Baustein type: `aendern` maps the current fields to the new ones (always on the latest state). */
export interface FormularProps<T> {
  daten: T;
  aendern: (f: (alt: T) => T) => void;
  editierbar: boolean;
}

const zweiSpalten = { gap: 'xs', preventGrowOverflow: false, align: 'flex-start' } as const;

function Mitglied({ sub }: Readonly<{ sub: string }>) {
  const mitglieder = useMitgliederListe();
  const m = mitglieder.data?.find((x) => x.sub === sub);
  if (!m) return <Text span>Unbekannt</Text>;
  return (
    <Anchor component={Link} to={mitgliedLink(m)} underline="never">
      <StatusName status={m.status}>{mitgliedName(m)}</StatusName>
    </Anchor>
  );
}

/** Opens in a new tab, so writing the protocol isn't interrupted. */
function KalenderLink({ eventId }: Readonly<{ eventId: string }>) {
  return (
    <Anchor
      component={Link}
      to={`/kalender/events/${encodeURIComponent(eventId)}`}
      target="_blank"
      rel="noopener"
      size="sm"
    >
      Im Kalender öffnen
    </Anchor>
  );
}

const datumKurz = (datum: string | null, bis?: string | null): string => {
  if (!datum) return 'Datum offen';
  return bis && bis !== datum
    ? `${datumAnzeigen(datum)} – ${datumAnzeigen(bis)}`
    : datumAnzeigen(datum);
};

// ---------------------------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------------------------

export function EventFormular({
  daten,
  aendern,
  editierbar,
}: Readonly<FormularProps<BausteinEventDaten>>) {
  const vorlagen = useVorlagen(true);
  const kategorien = useEventKategorien();
  const dienstformen = useDienstformen();
  const mitglieder = useMitgliederListe();
  const events = useProtokollEvents();

  const vorlage = vorlagen.data?.find((v) => v.id === daten.vorlageId);
  const kategorie = kategorien.liste.find(
    (k) => k.id === (daten.kategorieId ?? vorlage?.kategorieId),
  );
  const kategorieWert = daten.kategorieId ?? vorlage?.kategorieId ?? null;
  const dauer: EventDauer = kategorie?.dauer ?? 'eintaegig';
  const dienstformName = (id: string) => dienstformen.nachId.get(id)?.name ?? 'Dienstform';
  const vorlageText = daten.vorlageId
    ? `Vorlage: ${vorlage?.titel || kategorie?.name || (vorlagen.isPending ? '…' : 'gelöscht')}`
    : 'Ohne Vorlage';

  if (!editierbar) {
    const zeit =
      dauer !== 'ganztaegig' && daten.beginnZeit && daten.endeZeit
        ? `${daten.beginnZeit}–${daten.endeZeit} Uhr`
        : null;
    return (
      <Stack gap={4}>
        <Text fw={700} style={{ overflowWrap: 'anywhere' }}>
          {daten.name || 'Event ohne Name'}
        </Text>
        <Text size="sm">
          {[datumKurz(daten.datum, daten.bisDatum), zeit].filter(Boolean).join(' · ')}
        </Text>
        {daten.vorlageId && (
          <Text size="sm" c="dimmed">
            {vorlageText}
          </Text>
        )}
        {daten.kategorieId && (
          <Text size="sm">
            Kategorie:{' '}
            {kategorien.liste.find((k) => k.id === daten.kategorieId)?.name ??
              (kategorien.isPending ? '…' : 'Unbekannt')}
          </Text>
        )}
        {daten.schichten.length > 0 && (
          <SchichtListe schichten={daten.schichten} dienstformName={dienstformName} />
        )}
        {daten.verantwortlichSub && (
          <Text size="sm">
            Verantwortlich: <Mitglied sub={daten.verantwortlichSub} />
          </Text>
        )}
        {daten.eventId && <KalenderLink eventId={daten.eventId} />}
      </Stack>
    );
  }

  const kalenderOptionen = events.kommende.map((e) => ({
    value: e.id,
    label: kalenderEventLabel(e),
  }));
  if (daten.eventId && !kalenderOptionen.some((o) => o.value === daten.eventId)) {
    const e = events.alle.find((x) => x.id === daten.eventId);
    kalenderOptionen.unshift({
      value: daten.eventId,
      label: e ? kalenderEventLabel(e) : 'Verknüpftes Event',
    });
  }
  const kategorieOptionen = kategorien.aktive.map((k) => ({ value: k.id, label: k.name }));
  if (daten.kategorieId && !kategorieOptionen.some((o) => o.value === daten.kategorieId)) {
    const k = kategorien.liste.find((x) => x.id === daten.kategorieId);
    kategorieOptionen.unshift({ value: daten.kategorieId, label: k?.name ?? 'Unbekannt' });
  }
  const mehrtaegig = dauer !== 'eintaegig';
  // Single-day Kategorien have no "Bis"; without a Kategorie it is still open.
  const zeigeBis = eventZeigtBis(kategorie?.dauer);
  const tage = vorlage?.tage ?? 1;

  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed">
        {vorlageText}
      </Text>
      <Select
        allowDeselect={false}
        label="Im Kalender"
        data-fokus="kalender"
        description="Verknüpft den Baustein mit einem bestehenden Event und übernimmt dessen Angaben (Name, Datum, Zeiten, Kategorie, Verantwortliche:r, Dienste). Die Notizen bleiben."
        placeholder="Noch nicht im Kalender"
        searchable
        clearable
        data={kalenderOptionen}
        value={daten.eventId}
        onChange={(eventId) => {
          const e = eventId ? events.alle.find((x) => x.id === eventId) : undefined;
          aendern((d) =>
            e ? eventDatenAusKalender(kalenderEventFuerBaustein(e), d) : { ...d, eventId: eventId },
          );
        }}
        nothingFoundMessage="Kein Event gefunden"
      />
      {daten.eventId && <KalenderLink eventId={daten.eventId} />}
      <Select
        allowDeselect={false}
        label="Kategorie"
        description={
          kategorieWert
            ? undefined
            : 'Nötig, damit das Event beim Abschließen im Kalender angelegt werden kann.'
        }
        placeholder="Keine Kategorie"
        searchable
        // Without an own value the Vorlage's Kategorie counts (old data); it cannot be cleared then.
        clearable={!vorlage?.kategorieId || daten.kategorieId !== null}
        data={kategorieOptionen}
        value={kategorieWert}
        onChange={(kategorieId) => {
          const neu = kategorien.liste.find((k) => k.id === (kategorieId ?? vorlage?.kategorieId));
          aendern((d) => eventKategorieSetzen(d, kategorieId, neu?.dauer));
        }}
        nothingFoundMessage="Keine Kategorie gefunden"
      />
      <LokalText
        label="Name"
        data-fokus="name"
        wert={daten.name}
        maxLength={200}
        onWert={(name) => aendern((d) => ({ ...d, name }))}
      />
      <Group grow {...zweiSpalten}>
        <DatumFeld
          tippbar
          label={zeigeBis ? 'Von' : 'Datum'}
          data-fokus="datum"
          loeschbar={false}
          value={daten.datum ?? ''}
          onWert={(datum) => aendern((d) => eventDatumSetzen(d, datum || null, dauer, tage))}
          style={{ minWidth: 0 }}
        />
        {zeigeBis && (
          <DatumFeld
            tippbar
            label={mehrtaegig ? 'Bis' : 'Bis (optional)'}
            value={daten.bisDatum ?? ''}
            min={daten.datum ?? undefined}
            onWert={(bis) => aendern((d) => eventBisSetzen(d, bis || null))}
            style={{ minWidth: 0 }}
          />
        )}
      </Group>
      {dauer !== 'ganztaegig' && (
        <Group grow {...zweiSpalten}>
          <ZeitFeld
            label="Beginn"
            value={daten.beginnZeit ?? ''}
            onWert={(w) => {
              const zeit = zeitWert(w);
              if (zeit !== undefined) aendern((d) => ({ ...d, beginnZeit: zeit }));
            }}
            style={{ minWidth: 0 }}
          />
          <ZeitFeld
            label="Ende"
            value={daten.endeZeit ?? ''}
            onWert={(w) => {
              const zeit = zeitWert(w);
              if (zeit !== undefined) aendern((d) => ({ ...d, endeZeit: zeit }));
            }}
            style={{ minWidth: 0 }}
          />
        </Group>
      )}
      <Select
        allowDeselect={false}
        label="Verantwortliche:r"
        placeholder="Niemand"
        searchable
        clearable
        data={mitgliedOptionen(mitglieder.data ?? [])}
        value={daten.verantwortlichSub}
        onChange={(verantwortlichSub) => aendern((d) => ({ ...d, verantwortlichSub }))}
        nothingFoundMessage="Niemand gefunden"
      />
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Dienste
        </Text>
        {kategorie?.art === 'teilnahme' && (
          <Text size="xs" c="dimmed">
            Bei einer Kategorie mit Teilnahme statt Diensten werden die Dienste nicht übernommen.
          </Text>
        )}
        <SchichtEditor
          schichten={daten.schichten}
          dienstformName={dienstformName}
          dienstformen={dienstformen.aktive}
          zeiten={{ beginnZeit: daten.beginnZeit, endeZeit: daten.endeZeit }}
          onChange={(schichten) => aendern((d) => ({ ...d, schichten }))}
        />
      </Stack>
    </Stack>
  );
}

// ---------------------------------------------------------------------------------------------
// Vergangenes Event
// ---------------------------------------------------------------------------------------------

export function ThemaFormular({
  daten,
  aendern,
  editierbar,
}: Readonly<FormularProps<BausteinThemaDaten>>) {
  if (!editierbar) {
    return (
      <Text fw={700} style={{ overflowWrap: 'anywhere' }}>
        {daten.titel || 'Thema ohne Titel'}
      </Text>
    );
  }
  return (
    <LokalText
      label="Titel"
      placeholder="Titel"
      data-fokus="titel"
      wert={daten.titel}
      maxLength={200}
      onWert={(titel) => aendern((d) => ({ ...d, titel }))}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Todo
// ---------------------------------------------------------------------------------------------

const TODO_MODUS_HINWEIS = {
  einzeln: 'Jede Person hakt für sich ab.',
  gemeinsam: 'Eine Person hakt ab, dann ist es für alle erledigt.',
} as const;

export function TodoFormular({
  daten,
  aendern,
  editierbar,
}: Readonly<FormularProps<BausteinTodoDaten>>) {
  const mitglieder = useMitgliederListe();
  const liste = mitglieder.data ?? [];
  const status = new Map(liste.map((m) => [`p:${m.sub}`, m.status]));
  const gewaehlt = daten.zustaendig.map(todoZustaendigWert);

  if (!editierbar) {
    const namen = daten.zustaendig.map((z) => {
      if (z.art === 'gruppe') return `@${GRUPPE_TITEL[z.gruppe]}`;
      const m = liste.find((x) => x.sub === z.sub);
      return m ? mitgliedName(m) : 'Person offen';
    });
    return (
      <Text style={{ overflowWrap: 'anywhere' }}>
        <Text span fw={700}>
          Todo:
        </Text>{' '}
        {daten.titel || 'Ohne Titel'}
        {namen.length > 0 && ` – ${namen.join(', ')}`}
        {daten.faelligAm && ` (bis ${datumAnzeigen(daten.faelligAm)})`}
      </Text>
    );
  }

  const personen = mitgliedOptionen(liste.filter((m) => !m.deaktiviert)).map((o) => ({
    ...o,
    value: `p:${o.value}`,
  }));
  // Already chosen people that are not (or no longer) in the list stay visible and removable.
  for (const w of gewaehlt) {
    if (w.startsWith('p:') && !personen.some((o) => o.value === w)) {
      personen.push({ value: w, label: 'Unbekannt' });
    }
  }
  const gruppen = ERWAEHNUNG_GRUPPEN.map((g) => ({
    value: `g:${g}`,
    label: `@${GRUPPE_TITEL[g]}`,
  }));
  const nurEine = todoNurEinePerson(daten.zustaendig);

  // All fields (also "Abhaken") are always rendered and keep their place: moving or removing a focused
  // control inside the editor would throw the focus (and the phone keyboard) into the text.
  return (
    <Stack gap="xs">
      <LokalText
        label="Titel"
        placeholder="Titel"
        data-fokus="titel"
        wert={daten.titel}
        maxLength={200}
        onWert={(titel) => aendern((d) => ({ ...d, titel }))}
      />
      <MultiSelect
        label="Zuständig"
        placeholder={daten.zustaendig.length === 0 ? 'Personen oder Gruppen wählen' : undefined}
        size="md"
        searchable
        clearable
        nothingFoundMessage="Niemand gefunden"
        data={[
          { group: 'Gruppen', items: gruppen },
          { group: 'Personen', items: personen },
        ]}
        value={gewaehlt}
        onChange={(werte) => aendern((d) => todoZustaendigSetzen(d, werte))}
        renderOption={({ option }) => {
          const s = status.get(option.value);
          return s ? (
            <StatusName status={s}>{option.label}</StatusName>
          ) : (
            <span>{option.label}</span>
          );
        }}
      />
      <DatumFeld
        tippbar
        label="Deadline"
        loeschbar={false}
        value={daten.faelligAm ?? ''}
        onWert={(datum) => aendern((d) => ({ ...d, faelligAm: datum || null }))}
      />
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Abhaken
        </Text>
        <SegmentedControl
          fullWidth
          size="md"
          disabled={nurEine}
          value={daten.modus}
          data={[
            { value: 'einzeln', label: 'Einzeln' },
            { value: 'gemeinsam', label: 'Gemeinsam' },
          ]}
          onChange={(modus) =>
            aendern((d) => ({ ...d, modus: modus === 'gemeinsam' ? 'gemeinsam' : 'einzeln' }))
          }
        />
        <Text size="xs" c="dimmed">
          {nurEine
            ? 'Bei nur einer Person gibt es nichts zu wählen.'
            : TODO_MODUS_HINWEIS[daten.modus]}
        </Text>
      </Stack>
    </Stack>
  );
}

export function VergangenesEventFormular({
  daten,
  aendern,
  editierbar,
}: Readonly<FormularProps<BausteinVergangenesEventDaten>>) {
  const events = useProtokollEvents();
  if (!editierbar) {
    return (
      <Stack gap={4}>
        <Text fw={700} style={{ overflowWrap: 'anywhere' }}>
          {daten.name || 'Event ohne Name'}
        </Text>
        <Text size="sm">{datumKurz(daten.datum)}</Text>
        {daten.eventId && <KalenderLink eventId={daten.eventId} />}
      </Stack>
    );
  }
  const optionen = events.vergangene.map((e) => ({
    value: e.id,
    label: `${eventDatumText(e)} ${e.anzeigeTitel}`,
  }));
  if (daten.eventId && !optionen.some((o) => o.value === daten.eventId)) {
    optionen.unshift({
      value: daten.eventId,
      label:
        `${daten.datum ? datumAnzeigen(daten.datum) : ''} ${daten.name}`.trim() ||
        'Verknüpftes Event',
    });
  }
  return (
    <Stack gap="xs">
      <Select
        allowDeselect={false}
        label="Event aus dem Kalender"
        placeholder="Event wählen"
        searchable
        clearable
        data-fokus="event"
        data={optionen}
        value={daten.eventId}
        onChange={(id) => {
          const e = id ? events.alle.find((x) => x.id === id) : undefined;
          aendern((d) =>
            e
              ? { eventId: e.id, name: e.anzeigeTitel, datum: datumBerlin(e.beginn) }
              : { ...d, eventId: null },
          );
        }}
        nothingFoundMessage="Kein Event gefunden"
      />
      {daten.eventId ? (
        <Stack gap={2}>
          <Text fw={700} style={{ overflowWrap: 'anywhere' }}>
            {daten.name}
          </Text>
          <Text size="sm">{datumKurz(daten.datum)}</Text>
          <KalenderLink eventId={daten.eventId} />
        </Stack>
      ) : (
        <>
          <LokalText
            label="Name"
            data-fokus="name"
            wert={daten.name}
            maxLength={200}
            onWert={(name) => aendern((d) => ({ ...d, name }))}
          />
          <DatumFeld
            tippbar
            label="Datum"
            data-fokus="datum"
            value={daten.datum ?? ''}
            onWert={(datum) => aendern((d) => ({ ...d, datum: datum || null }))}
          />
        </>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------------------------
// Anwärter:in
// ---------------------------------------------------------------------------------------------

export function AnwaerterFormular({
  daten,
  aendern,
  editierbar,
}: Readonly<FormularProps<BausteinAnwaerterDaten>>) {
  if (!editierbar) {
    const name = `${daten.vorname} ${daten.nachname}`.trim();
    return (
      <Stack gap={2}>
        <Text fw={700} style={{ overflowWrap: 'anywhere' }}>
          {name || 'Name offen'}
        </Text>
        {daten.sub && (
          <Text size="sm">
            Eingeladen: <Mitglied sub={daten.sub} />
          </Text>
        )}
        {daten.email && (
          <Anchor href={`mailto:${daten.email}`} size="sm" style={{ overflowWrap: 'anywhere' }}>
            {daten.email}
          </Anchor>
        )}
      </Stack>
    );
  }
  return (
    <Stack gap="xs">
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
        <LokalText
          label="Vorname"
          data-fokus="vorname"
          autoComplete="off"
          wert={daten.vorname}
          maxLength={100}
          onWert={(vorname) => aendern((d) => ({ ...d, vorname }))}
        />
        <LokalText
          label="Nachname"
          data-fokus="nachname"
          autoComplete="off"
          wert={daten.nachname}
          maxLength={100}
          onWert={(nachname) => aendern((d) => ({ ...d, nachname }))}
        />
      </SimpleGrid>
      {daten.sub && (
        <Text size="sm">
          Eingeladen: <Mitglied sub={daten.sub} />
        </Text>
      )}
      <LokalText
        label="E-Mail (optional)"
        type="email"
        inputMode="email"
        autoComplete="off"
        disabled={!!daten.sub}
        description={daten.sub ? 'Die Einladung ist schon verschickt.' : undefined}
        wert={daten.email ?? ''}
        maxLength={200}
        onWert={(email) => aendern((d) => ({ ...d, email: email === '' ? null : email }))}
      />
    </Stack>
  );
}

/** A person of the app (bold in the color of their status, linked) or the free-text name. */
function PersonOderName({
  person,
  name,
}: Readonly<{ person: ProtokollMitgliedDto | undefined; name: string }>) {
  return (
    <Text fw={700} style={{ overflowWrap: 'anywhere' }}>
      {person ? (
        <Anchor component={Link} to={mitgliedLink(person)} underline="never">
          <StatusName status={person.status}>
            {person.username ?? (`${person.vorname} ${person.nachname}`.trim() || '–')}
          </StatusName>
        </Anchor>
      ) : (
        name || 'Person offen'
      )}
    </Text>
  );
}

/** Read-only vote: result badge and the counts. */
function StimmenAnzeige({ a }: Readonly<{ a: BausteinEmAbstimmung }>) {
  return (
    <Group gap="xs">
      {a.ergebnis && (
        <Badge color={a.ergebnis === 'angenommen' ? 'green' : 'red'} size="lg">
          {a.ergebnis === 'angenommen' ? 'Angenommen' : 'Abgelehnt'}
        </Badge>
      )}
      <Text size="sm">
        Ja {a.ja} · Nein {a.nein} · Enthaltung {a.enthaltung}
      </Text>
    </Group>
  );
}

/** Ja / Nein / Enthaltung and the Ergebnis (suggested from the votes, can be overridden). */
function StimmenFelder<T extends BausteinEmAbstimmung>({
  daten,
  aendern,
}: Readonly<{ daten: T; aendern: (f: (alt: T) => T) => void }>) {
  return (
    <>
      <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xs">
        <LokalZahl
          label="Ja"
          wert={daten.ja}
          onWert={(w) => aendern((d) => stimmeSetzen(d, 'ja', w))}
        />
        <LokalZahl
          label="Nein"
          wert={daten.nein}
          onWert={(w) => aendern((d) => stimmeSetzen(d, 'nein', w))}
        />
        <LokalZahl
          label="Enthaltung"
          wert={daten.enthaltung}
          onWert={(w) => aendern((d) => stimmeSetzen(d, 'enthaltung', w))}
        />
      </SimpleGrid>
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Ergebnis
        </Text>
        <SegmentedControl
          fullWidth
          size="md"
          value={daten.ergebnis ?? ''}
          data={[
            { value: 'angenommen', label: 'Angenommen' },
            { value: 'abgelehnt', label: 'Abgelehnt' },
          ]}
          onChange={(v) =>
            aendern((d) => ({ ...d, ergebnis: v === 'angenommen' || v === 'abgelehnt' ? v : null }))
          }
        />
      </Stack>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Beschluss
// ---------------------------------------------------------------------------------------------

export function BeschlussFormular({
  daten,
  aendern,
  editierbar,
}: Readonly<FormularProps<BausteinBeschlussDaten>>) {
  if (!editierbar) {
    return (
      <Stack gap={4}>
        <WiederholungHinweis art="Abstimmung" wiederholung={daten.wiederholung} />
        <Text style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
          {daten.antrag || 'Antrag offen'}
        </Text>
        <StimmenAnzeige a={daten} />
      </Stack>
    );
  }
  return (
    <Stack gap="xs">
      <WiederholungHinweis art="Abstimmung" wiederholung={daten.wiederholung} />
      <LokalTextbereich
        label="Antrag"
        data-fokus="antrag"
        autosize
        minRows={2}
        maxLength={2000}
        wert={daten.antrag}
        onWert={(antrag) => aendern((d) => ({ ...d, antrag }))}
      />
      <StimmenFelder daten={daten} aendern={aendern} />
    </Stack>
  );
}

// ---------------------------------------------------------------------------------------------
// Neues EM
// ---------------------------------------------------------------------------------------------

const KEINE_ABSTIMMUNG: BausteinEmAbstimmung = { ja: 0, nein: 0, enthaltung: 0, ergebnis: null };

export function EmFormular({
  daten,
  aendern,
  editierbar,
}: Readonly<FormularProps<BausteinEmDaten>>) {
  const { teilnahme, ems } = useProtokollKontext();
  const personen = emKandidaten(teilnahme, ems);
  const person = personen.find((p) => p.sub === daten.sub);
  const a = daten.abstimmung;

  if (!editierbar) {
    const name = daten.name.trim();
    return (
      <Stack gap={4}>
        <WiederholungHinweis art="Abstimmung" wiederholung={daten.wiederholung} />
        <PersonOderName person={person} name={name} />
        {a && daten.antragSub && (
          <Text size="sm">
            Beantragt von: <Mitglied sub={daten.antragSub} />
          </Text>
        )}
        {a && <StimmenAnzeige a={a} />}
      </Stack>
    );
  }
  const status = new Map(personen.map((p) => [p.sub, p.status]));
  return (
    <Stack gap="xs">
      <WiederholungHinweis art="Abstimmung" wiederholung={daten.wiederholung} />
      <Select
        allowDeselect={false}
        label="Person"
        placeholder="Person wählen"
        data-fokus="person"
        size="md"
        searchable
        clearable
        nothingFoundMessage="Niemand gefunden"
        data={personenOptionen(personen)}
        value={daten.sub}
        onChange={(sub) => aendern((d) => ({ ...d, sub }))}
        renderOption={({ option }) => {
          const s = status.get(option.value);
          return s ? (
            <StatusName status={s}>{option.label}</StatusName>
          ) : (
            <span>{option.label}</span>
          );
        }}
      />
      {daten.sub === null && (
        <LokalText
          label="Name (falls nicht in der App)"
          autoComplete="off"
          wert={daten.name}
          maxLength={200}
          onWert={(name) => aendern((d) => ({ ...d, name }))}
        />
      )}
      <Switch
        size="md"
        label="Abstimmung"
        checked={a !== null}
        onChange={(e) => {
          const an = e.currentTarget.checked;
          aendern((d) => ({ ...d, abstimmung: an ? (d.abstimmung ?? KEINE_ABSTIMMUNG) : null }));
        }}
      />
      {a && (
        <Select
          allowDeselect={false}
          label="Beantragt von"
          placeholder="Person wählen"
          size="md"
          searchable
          clearable
          nothingFoundMessage="Niemand gefunden"
          data={personenOptionen(personen)}
          value={daten.antragSub}
          onChange={(antragSub) => aendern((d) => ({ ...d, antragSub }))}
          renderOption={({ option }) => {
            const s = status.get(option.value);
            return s ? (
              <StatusName status={s}>{option.label}</StatusName>
            ) : (
              <span>{option.label}</span>
            );
          }}
        />
      )}
      {a && (
        <StimmenFelder
          daten={a}
          aendern={(f) =>
            aendern((d) => ({ ...d, abstimmung: d.abstimmung ? f(d.abstimmung) : d.abstimmung }))
          }
        />
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------------------------
// Aufnahme
// ---------------------------------------------------------------------------------------------

export function AufnahmeFormular({
  daten,
  aendern,
  editierbar,
}: Readonly<FormularProps<BausteinAufnahmeDaten>>) {
  const { teilnahme, ems } = useProtokollKontext();
  const personen = emKandidaten(teilnahme, ems);
  const person = personen.find((p) => p.sub === daten.sub);

  if (!editierbar) {
    return (
      <Stack gap={4}>
        <WiederholungHinweis art="Aufnahme-Abstimmung" wiederholung={daten.wiederholung} />
        <PersonOderName person={person} name={daten.name.trim()} />
        <StimmenAnzeige a={daten.abstimmung} />
      </Stack>
    );
  }
  const status = new Map(personen.map((p) => [p.sub, p.status]));
  return (
    <Stack gap="xs">
      <WiederholungHinweis art="Aufnahme-Abstimmung" wiederholung={daten.wiederholung} />
      <Select
        allowDeselect={false}
        label="Person"
        placeholder="Person wählen"
        data-fokus="person"
        size="md"
        searchable
        clearable
        nothingFoundMessage="Niemand gefunden"
        data={aufnahmeOptionen(personen)}
        value={daten.sub}
        onChange={(sub) => aendern((d) => ({ ...d, sub }))}
        renderOption={({ option }) => {
          const s = status.get(option.value);
          return s ? (
            <StatusName status={s}>{option.label}</StatusName>
          ) : (
            <span>{option.label}</span>
          );
        }}
      />
      {daten.sub === null && (
        <LokalText
          label="Name (falls nicht in der App)"
          autoComplete="off"
          wert={daten.name}
          maxLength={200}
          onWert={(name) => aendern((d) => ({ ...d, name }))}
        />
      )}
      <StimmenFelder
        daten={daten.abstimmung}
        aendern={(f) => aendern((d) => ({ ...d, abstimmung: f(d.abstimmung) }))}
      />
    </Stack>
  );
}

// ---------------------------------------------------------------------------------------------
// Meinungsbild
// ---------------------------------------------------------------------------------------------

export function MeinungsbildFormular({
  daten,
  aendern,
  editierbar,
}: Readonly<FormularProps<BausteinMeinungsbildDaten>>) {
  if (!editierbar) {
    const optionen = daten.optionen.filter((o) => o.text.trim() !== '');
    return (
      <Stack gap={4}>
        <Text fw={700} style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
          {daten.frage || 'Frage offen'}
        </Text>
        {optionen.length > 0 && (
          <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
            {optionen.map((o) => `${o.text} ${o.stimmen}`).join(' · ')}
          </Text>
        )}
      </Stack>
    );
  }
  return (
    <Stack gap="xs">
      <LokalText
        label="Frage"
        data-fokus="frage"
        autoComplete="off"
        wert={daten.frage}
        maxLength={500}
        onWert={(frage) => aendern((d) => ({ ...d, frage }))}
      />
      {daten.optionen.map((o, i) => (
        <Paper key={i} withBorder p="xs" radius="md">
          <Stack gap="xs">
            <Group gap="xs" wrap="nowrap" align="flex-end">
              <LokalText
                label={`Option ${i + 1}`}
                autoComplete="off"
                wert={o.text}
                maxLength={100}
                style={{ flex: 1, minWidth: 0 }}
                onWert={(text) => aendern((d) => optionSetzen(d, i, { text }))}
              />
              <ActionIcon
                variant="subtle"
                color="red"
                size={42}
                tabIndex={-1}
                aria-label={`Option ${i + 1} entfernen`}
                onClick={() => aendern((d) => optionEntfernen(d, i))}
              >
                <IconTrash size={20} />
              </ActionIcon>
            </Group>
            <LokalZahl
              label="Stimmen"
              wert={o.stimmen}
              onWert={(stimmen) => aendern((d) => optionSetzen(d, i, { stimmen }))}
            />
          </Stack>
        </Paper>
      ))}
      <Button
        variant="default"
        size="md"
        leftSection={<IconPlus size={18} />}
        disabled={daten.optionen.length >= MEINUNGSBILD_MAX_OPTIONEN}
        onClick={() => aendern((d) => optionHinzufuegen(d))}
      >
        Option hinzufügen
      </Button>
    </Stack>
  );
}

// ---------------------------------------------------------------------------------------------
// Wahl
// ---------------------------------------------------------------------------------------------

type WahlKandidatDaten = BausteinWahlDaten['kandidaten'][number];

/** A candidate: a person of the app (bold in the color of their status) or the free-text name. */
function KandidatName({
  k,
  personen,
}: Readonly<{ k: WahlKandidatDaten; personen: readonly ProtokollMitgliedDto[] }>) {
  const person = personen.find((p) => p.sub === k.sub);
  if (!person) return <>{k.name.trim() || 'Person offen'}</>;
  return (
    <StatusName status={person.status}>
      {person.username ?? (`${person.vorname} ${person.nachname}`.trim() || '–')}
    </StatusName>
  );
}

/** Read-only line of the persons proposed who do not run. */
function NichtAngetreten({
  daten,
  personen,
}: Readonly<{ daten: BausteinWahlDaten; personen: readonly ProtokollMitgliedDto[] }>) {
  if (daten.nichtAngetreten.length === 0) return null;
  return (
    <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
      Nicht angetreten:{' '}
      {daten.nichtAngetreten.map((sub, i) => {
        const p = personen.find((x) => x.sub === sub);
        return (
          <Fragment key={sub}>
            {i > 0 && ', '}
            {p ? (
              <StatusName status={p.status}>
                {p.username ?? (`${p.vorname} ${p.nachname}`.trim() || '–')}
              </StatusName>
            ) : (
              'Person offen'
            )}
          </Fragment>
        );
      })}
    </Text>
  );
}

/** Acceptance switches of the elected candidates of a Wahl (the Auswahl has none). */
interface AnnahmeSteuerung {
  /** Ids to show a switch for, in a stable order (the order of the candidates, not of the result). */
  ids: readonly string[];
  /** `true` accepts (stated in the document), `false` declines, `null` not recorded. */
  wert: (id: string) => boolean | null;
  setzen: (id: string, nimmtAn: boolean | null) => void;
  label: (id: string) => ReactNode;
}

/**
 * Result of a Wahl or Auswahl: who is elected, or which tie needs a Stichwahl (with the button to add
 * one). `name` renders an id, null for an unknown one. `aendern` is only given while editing.
 */
function WahlErgebnisBereich({
  ergebnis,
  ergebnisTitel,
  abgelehntTitel,
  name,
  stichwahlen,
  neueStichwahl,
  annahme,
}: Readonly<{
  ergebnis: WahlErgebnis;
  ergebnisTitel: string;
  abgelehntTitel?: string;
  name: (id: string) => ReactNode;
  stichwahlen: number;
  /** Adds the runoff round (editing only). */
  neueStichwahl?: () => void;
  annahme?: AnnahmeSteuerung;
}>) {
  const { gewaehlt, abgelehnt, offen } = ergebnis;
  const liste = (ids: readonly string[], getrennt: string) =>
    ids.flatMap((id, i) => {
      const n = name(id);
      return n === null
        ? []
        : [
            <Fragment key={id}>
              {i > 0 && getrennt}
              {n}
            </Fragment>,
          ];
    });
  return (
    <Stack gap="xs">
      {gewaehlt.length > 0 && (
        <Text fw={700} c="green" style={{ overflowWrap: 'anywhere' }}>
          {ergebnisTitel}: {liste(gewaehlt, ', ')}
        </Text>
      )}
      {abgelehnt.length > 0 && (
        <Text size="sm" c="red" style={{ overflowWrap: 'anywhere' }}>
          {abgelehntTitel}: {liste(abgelehnt, ', ')}
        </Text>
      )}
      {annahme?.ids.map((id) => (
        <Stack key={id} gap={4}>
          <Text size="sm" fw={500} style={{ overflowWrap: 'anywhere' }}>
            {annahme.label(id)}
          </Text>
          <SegmentedControl
            fullWidth
            size="md"
            value={annahme.wert(id) === null ? 'offen' : annahme.wert(id) ? 'ja' : 'nein'}
            onChange={(w) => annahme.setzen(id, w === 'offen' ? null : w === 'ja')}
            data={[
              { value: 'offen', label: 'Offen' },
              { value: 'ja', label: 'Nimmt an' },
              { value: 'nein', label: 'Nimmt nicht an' },
            ]}
          />
        </Stack>
      ))}
      {offen && (
        <Alert color="yellow" variant="light" py={6} px="xs" icon={<IconAlertTriangle size={18} />}>
          <Stack gap="xs" align="flex-start">
            <Text size="sm">
              Gleichstand zwischen {liste(offen.kandidaten, ' und ')} um{' '}
              {offen.plaetze === 1 ? '1 Platz' : `${offen.plaetze} Plätze`} –{' '}
              {offen.rundeVorhanden ? 'Stichwahl noch ohne Stimmen' : 'Stichwahl nötig'}
            </Text>
            {neueStichwahl && !offen.rundeVorhanden && (
              <Button
                variant="default"
                size="md"
                leftSection={<IconPlus size={18} />}
                disabled={stichwahlen >= WAHL_MAX_STICHWAHLEN}
                onClick={neueStichwahl}
              >
                Stichwahl hinzufügen
              </Button>
            )}
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}

/** The result area of a Wahl: acceptance switches only while editing. */
function WahlErgebnisAnzeige({
  daten,
  personen,
  aendern,
}: Readonly<{
  daten: BausteinWahlDaten;
  personen: readonly ProtokollMitgliedDto[];
  aendern?: (f: (alt: BausteinWahlDaten) => BausteinWahlDaten) => void;
}>) {
  const ergebnis = wahlErgebnis(daten);
  const nachId = new Map(daten.kandidaten.map((k) => [k.id, k]));
  const name = (id: string) => {
    const k = nachId.get(id);
    return k ? <KandidatName k={k} personen={personen} /> : null;
  };
  return (
    <WahlErgebnisBereich
      ergebnis={ergebnis}
      ergebnisTitel="Gewählt"
      abgelehntTitel="Nimmt die Wahl nicht an"
      name={name}
      stichwahlen={daten.stichwahlen.length}
      neueStichwahl={aendern && (() => aendern((d) => stichwahlHinzufuegen(d)))}
      annahme={
        aendern && {
          // Stable order: toggling must not move the focused switch in the DOM.
          ids: annahmeSchalterIds(daten),
          wert: (id) => daten.annahme[id] ?? null,
          setzen: (id, nimmtAn) => aendern((d) => annahmeSetzen(d, id, nimmtAn)),
          label: (id) => <>{name(id)} nimmt die Wahl an?</>,
        }
      }
    />
  );
}

/** Names of the Posten of the app that are not archived (options of the Wahl's Posten field). */
function usePostenOptionen(aktiv: boolean) {
  const api = useApi();
  const posten = useQuery({
    queryKey: postenKeys.liste(false),
    queryFn: async () => unwrap(await api.posten.$get({ query: {} })),
    enabled: aktiv,
  });
  return posten.data ?? [];
}

export function WahlFormular({
  daten,
  aendern,
  editierbar,
}: Readonly<FormularProps<BausteinWahlDaten>>) {
  const { teilnahme, ems } = useProtokollKontext();
  const personen = emKandidaten(teilnahme, ems);
  const postenListe = usePostenOptionen(editierbar);
  const runden = wahlRunden(daten);
  const nachId = new Map(daten.kandidaten.map((k) => [k.id, k]));
  const plaetze = daten.anzahl === 1 ? '' : ` (${daten.anzahl} Plätze)`;

  if (!editierbar) {
    const stimmen = (ks: readonly WahlKandidatDaten[], wert: (k: WahlKandidatDaten) => number) =>
      ks.map((k, i) => (
        <Fragment key={k.id}>
          {i > 0 && ' · '}
          <KandidatName k={k} personen={personen} /> {wert(k)}
        </Fragment>
      ));
    return (
      <Stack gap={4}>
        <WiederholungHinweis art="Wahl" wiederholung={daten.wiederholung} />
        <Text fw={700} style={{ overflowWrap: 'anywhere' }}>
          {daten.posten || 'Posten offen'}
          {plaetze}
        </Text>
        {daten.gueltigAb && <Text size="sm">Gilt ab {datumAnzeigen(daten.gueltigAb)}</Text>}
        {daten.kandidaten.length > 0 && (
          <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
            {stimmen(daten.kandidaten, (k) => k.stimmen)} · Enthaltung {daten.enthaltung}
          </Text>
        )}
        {runden.map((r, i) => (
          <Text key={i} size="sm" style={{ overflowWrap: 'anywhere' }}>
            Stichwahl:{' '}
            {stimmen(
              r.kandidaten.flatMap((id) => nachId.get(id) ?? []),
              (k) => daten.stichwahlen[i]!.stimmen[k.id] ?? 0,
            )}{' '}
            · Enthaltung {daten.stichwahlen[i]!.enthaltung}
          </Text>
        ))}
        <NichtAngetreten daten={daten} personen={personen} />
        <WahlErgebnisAnzeige daten={daten} personen={personen} />
      </Stack>
    );
  }

  const status = new Map(personen.map((p) => [p.sub, p.status]));
  const ueberzaehlig = daten.stichwahlen.length > runden.length;
  return (
    <Stack gap="xs">
      <WiederholungHinweis art="Wahl" wiederholung={daten.wiederholung} />
      <Autocomplete
        label="Posten"
        placeholder="Posten wählen oder eintippen"
        data-fokus="posten"
        size="md"
        autoComplete="off"
        maxLength={200}
        data={postenListe.map((p) => p.name)}
        value={daten.posten}
        onChange={(posten) =>
          aendern((d) => ({
            ...d,
            posten,
            postenId: postenListe.find((p) => p.name === posten)?.id ?? null,
          }))
        }
      />
      <DatumFeld
        tippbar
        label="Gilt ab"
        value={daten.gueltigAb ?? ''}
        onWert={(gueltigAb) => aendern((d) => ({ ...d, gueltigAb }))}
      />
      <LokalZahl
        label="Anzahl zu wählen"
        wert={daten.anzahl}
        min={1}
        max={WAHL_MAX_ANZAHL}
        onWert={(n) => aendern((d) => wahlAnzahlSetzen(d, n))}
      />
      <LokalZahl
        label="Stimmen pro Person"
        wert={wahlStimmenProPerson(daten)}
        min={1}
        max={WAHL_MAX_ANZAHL}
        onWert={(n) => aendern((d) => wahlStimmenProPersonSetzen(d, n))}
      />
      {daten.kandidaten.map((k, i) => (
        <Paper key={k.id} withBorder p="xs" radius="md">
          <Stack gap="xs">
            <Group gap="xs" wrap="nowrap" align="flex-end">
              <Group gap="xs" wrap="wrap" align="flex-end" style={{ flex: 1, minWidth: 0 }}>
                <Select
                  allowDeselect={false}
                  label={`Kandidat:in ${i + 1}`}
                  placeholder="Person wählen"
                  size="md"
                  searchable
                  nothingFoundMessage="Niemand gefunden"
                  style={{ flex: '1 1 10rem', minWidth: 0 }}
                  data={personenOptionen(personen)}
                  value={k.sub}
                  onChange={(sub) => aendern((d) => kandidatSetzen(d, k.id, { sub }))}
                  renderOption={({ option }) => {
                    const s = status.get(option.value);
                    return s ? (
                      <StatusName status={s}>{option.label}</StatusName>
                    ) : (
                      <span>{option.label}</span>
                    );
                  }}
                />
                <div style={{ flex: '0 0 auto', width: '10rem' }}>
                  <LokalZahl
                    label="Stimmen"
                    wert={k.stimmen}
                    onWert={(stimmen) => aendern((d) => kandidatSetzen(d, k.id, { stimmen }))}
                  />
                </div>
              </Group>
              <ActionIcon
                variant="subtle"
                color="red"
                size={42}
                tabIndex={-1}
                aria-label={`Kandidat:in ${i + 1} entfernen`}
                onClick={() => aendern((d) => kandidatEntfernen(d, k.id))}
              >
                <IconTrash size={20} />
              </ActionIcon>
            </Group>
            {k.sub === null && k.name.trim() && (
              <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                Bisher ohne App-Konto: {k.name.trim()}. Wähle eine Person, um sie zu ersetzen.
              </Text>
            )}
          </Stack>
        </Paper>
      ))}
      <Button
        variant="default"
        size="md"
        leftSection={<IconPlus size={18} />}
        disabled={daten.kandidaten.length >= WAHL_MAX_KANDIDATEN}
        onClick={() => aendern((d) => kandidatHinzufuegen(d))}
      >
        Kandidat:in hinzufügen
      </Button>
      <LokalZahl
        label="Enthaltung"
        wert={daten.enthaltung}
        onWert={(enthaltung) => aendern((d) => ({ ...d, enthaltung }))}
      />
      <MultiSelect
        label="Vorgeschlagen, tritt nicht an"
        placeholder={daten.nichtAngetreten.length === 0 ? 'Personen wählen' : undefined}
        size="md"
        searchable
        clearable
        nothingFoundMessage="Niemand gefunden"
        data={personenOptionen(personen).filter(
          (o) =>
            daten.nichtAngetreten.includes(o.value) ||
            !daten.kandidaten.some((k) => k.sub === o.value),
        )}
        value={daten.nichtAngetreten}
        onChange={(subs) => aendern((d) => nichtAngetretenSetzen(d, subs))}
        renderOption={({ option }) => {
          const s = status.get(option.value);
          return s ? (
            <StatusName status={s}>{option.label}</StatusName>
          ) : (
            <span>{option.label}</span>
          );
        }}
      />
      {runden.map((r, i) => (
        <Paper key={i} withBorder p="xs" radius="md">
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Text fw={600}>Stichwahl {i + 1}</Text>
              <ActionIcon
                variant="subtle"
                color="red"
                size={42}
                tabIndex={-1}
                aria-label={`Stichwahl ${i + 1} entfernen`}
                onClick={() => aendern((d) => stichwahlEntfernen(d, i))}
              >
                <IconTrash size={20} />
              </ActionIcon>
            </Group>
            {r.kandidaten.map((id) => {
              const k = nachId.get(id);
              if (!k) return null;
              return (
                <LokalZahl
                  key={id}
                  label={
                    <>
                      Stimmen für <KandidatName k={k} personen={personen} />
                    </>
                  }
                  wert={daten.stichwahlen[i]!.stimmen[id] ?? 0}
                  onWert={(n) => aendern((d) => stichwahlSetzen(d, i, id, n))}
                />
              );
            })}
            <LokalZahl
              label="Enthaltung"
              wert={daten.stichwahlen[i]!.enthaltung}
              onWert={(n) => aendern((d) => stichwahlSetzen(d, i, 'enthaltung', n))}
            />
          </Stack>
        </Paper>
      ))}
      {ueberzaehlig && (
        <Alert color="yellow" variant="light" py={6} px="xs" icon={<IconAlertTriangle size={18} />}>
          <Stack gap="xs" align="flex-start">
            <Text size="sm">Gespeicherte Stichwahlen passen nicht mehr zu den Stimmen.</Text>
            <Button
              variant="default"
              size="md"
              leftSection={<IconTrash size={18} />}
              onClick={() => aendern((d) => ueberzaehligeStichwahlenEntfernen(d))}
            >
              Stichwahlen entfernen
            </Button>
          </Stack>
        </Alert>
      )}
      <WahlErgebnisAnzeige daten={daten} personen={personen} aendern={aendern} />
    </Stack>
  );
}

// ---------------------------------------------------------------------------------------------
// Auswahl
// ---------------------------------------------------------------------------------------------

const optionText = (text: string): string => text.trim() || '–';

export function AuswahlFormular({
  daten,
  aendern,
  editierbar,
}: Readonly<FormularProps<BausteinAuswahlDaten>>) {
  const runden = auswahlRunden(daten);
  const nachId = new Map(daten.optionen.map((o) => [o.id, o]));
  const plaetze = daten.anzahl === 1 ? '' : ` (${daten.anzahl} zu wählen)`;
  const ergebnis = auswahlErgebnis(daten);
  const name = (id: string) => {
    const o = nachId.get(id);
    return o ? optionText(o.text) : null;
  };
  const ergebnisBereich = (bearbeiten: boolean) => (
    <WahlErgebnisBereich
      ergebnis={ergebnis}
      ergebnisTitel="Ergebnis"
      name={name}
      stichwahlen={daten.stichwahlen.length}
      neueStichwahl={bearbeiten ? () => aendern((d) => stichwahlHinzufuegen(d)) : undefined}
    />
  );

  if (!editierbar) {
    const stimmen = (
      os: readonly BausteinAuswahlDaten['optionen'][number][],
      wert: (id: string) => number,
    ) =>
      os.map((o, i) => (
        <Fragment key={o.id}>
          {i > 0 && ' · '}
          {optionText(o.text)} {wert(o.id)}
        </Fragment>
      ));
    return (
      <Stack gap={4}>
        <WiederholungHinweis art="Abstimmung" wiederholung={daten.wiederholung} />
        <Text fw={700} style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
          {daten.frage || 'Frage offen'}
          {plaetze}
        </Text>
        {daten.optionen.length > 0 && (
          <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
            {stimmen(daten.optionen, (id) => nachId.get(id)!.stimmen)} · Enthaltung{' '}
            {daten.enthaltung}
          </Text>
        )}
        {runden.map((r, i) => (
          <Text key={i} size="sm" style={{ overflowWrap: 'anywhere' }}>
            Stichwahl:{' '}
            {stimmen(
              r.kandidaten.flatMap((id) => nachId.get(id) ?? []),
              (id) => daten.stichwahlen[i]!.stimmen[id] ?? 0,
            )}{' '}
            · Enthaltung {daten.stichwahlen[i]!.enthaltung}
          </Text>
        ))}
        {ergebnisBereich(false)}
      </Stack>
    );
  }

  const ueberzaehlig = daten.stichwahlen.length > runden.length;
  return (
    <Stack gap="xs">
      <WiederholungHinweis art="Abstimmung" wiederholung={daten.wiederholung} />
      <LokalTextbereich
        label="Frage"
        data-fokus="frage"
        autosize
        minRows={2}
        maxLength={2000}
        wert={daten.frage}
        onWert={(frage) => aendern((d) => ({ ...d, frage }))}
      />
      <LokalZahl
        label="Anzahl zu wählen"
        wert={daten.anzahl}
        min={1}
        max={WAHL_MAX_ANZAHL}
        onWert={(n) => aendern((d) => wahlAnzahlSetzen(d, n))}
      />
      <LokalZahl
        label="Stimmen pro Person"
        wert={wahlStimmenProPerson(daten)}
        min={1}
        max={WAHL_MAX_ANZAHL}
        onWert={(n) => aendern((d) => wahlStimmenProPersonSetzen(d, n))}
      />
      {daten.optionen.map((o, i) => (
        <Paper key={o.id} withBorder p="xs" radius="md">
          <Stack gap="xs">
            <Group gap="xs" wrap="nowrap" align="flex-end">
              <Group gap="xs" wrap="wrap" align="flex-end" style={{ flex: 1, minWidth: 0 }}>
                <LokalText
                  label={`Möglichkeit ${i + 1}`}
                  autoComplete="off"
                  wert={o.text}
                  maxLength={200}
                  style={{ flex: '1 1 10rem', minWidth: 0 }}
                  onWert={(text) => aendern((d) => auswahlOptionSetzen(d, o.id, { text }))}
                />
                <div style={{ flex: '0 0 auto', width: '10rem' }}>
                  <LokalZahl
                    label="Stimmen"
                    wert={o.stimmen}
                    onWert={(stimmen) => aendern((d) => auswahlOptionSetzen(d, o.id, { stimmen }))}
                  />
                </div>
              </Group>
              <ActionIcon
                variant="subtle"
                color="red"
                size={42}
                tabIndex={-1}
                aria-label={`Möglichkeit ${i + 1} entfernen`}
                onClick={() => aendern((d) => auswahlOptionEntfernen(d, o.id))}
              >
                <IconTrash size={20} />
              </ActionIcon>
            </Group>
          </Stack>
        </Paper>
      ))}
      <Button
        variant="default"
        size="md"
        leftSection={<IconPlus size={18} />}
        disabled={daten.optionen.length >= AUSWAHL_MAX_OPTIONEN}
        onClick={() => aendern((d) => auswahlOptionHinzufuegen(d))}
      >
        Möglichkeit hinzufügen
      </Button>
      <LokalZahl
        label="Enthaltung"
        wert={daten.enthaltung}
        onWert={(enthaltung) => aendern((d) => ({ ...d, enthaltung }))}
      />
      {runden.map((r, i) => (
        <Paper key={i} withBorder p="xs" radius="md">
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Text fw={600}>Stichwahl {i + 1}</Text>
              <ActionIcon
                variant="subtle"
                color="red"
                size={42}
                tabIndex={-1}
                aria-label={`Stichwahl ${i + 1} entfernen`}
                onClick={() => aendern((d) => stichwahlEntfernen(d, i))}
              >
                <IconTrash size={20} />
              </ActionIcon>
            </Group>
            {r.kandidaten.map((id) => {
              const o = nachId.get(id);
              if (!o) return null;
              return (
                <LokalZahl
                  key={id}
                  label={`Stimmen für ${optionText(o.text)}`}
                  wert={daten.stichwahlen[i]!.stimmen[id] ?? 0}
                  onWert={(n) => aendern((d) => stichwahlSetzen(d, i, id, n))}
                />
              );
            })}
            <LokalZahl
              label="Enthaltung"
              wert={daten.stichwahlen[i]!.enthaltung}
              onWert={(n) => aendern((d) => stichwahlSetzen(d, i, 'enthaltung', n))}
            />
          </Stack>
        </Paper>
      ))}
      {ueberzaehlig && (
        <Alert color="yellow" variant="light" py={6} px="xs" icon={<IconAlertTriangle size={18} />}>
          <Stack gap="xs" align="flex-start">
            <Text size="sm">Gespeicherte Stichwahlen passen nicht mehr zu den Stimmen.</Text>
            <Button
              variant="default"
              size="md"
              leftSection={<IconTrash size={18} />}
              onClick={() => aendern((d) => ueberzaehligeStichwahlenEntfernen(d))}
            >
              Stichwahlen entfernen
            </Button>
          </Stack>
        </Alert>
      )}
      {ergebnisBereich(true)}
    </Stack>
  );
}
