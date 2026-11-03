import {
  Anchor,
  Badge,
  Group,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { Link } from 'react-router-dom';
import {
  datumAnzeigen,
  datumBerlin,
  type BausteinAnwaerterDaten,
  type BausteinBeschlussDaten,
  type BausteinEventDaten,
  type BausteinVergangenesEventDaten,
  type EventDauer,
} from '@c4/shared';
import { DatumFeld } from '../DatumFeld';
import { useDienstformen, useEventKategorien, useVorlagen } from '../kalenderDaten';
import { mitgliedLink, mitgliedName } from '../mitglied';
import { mitgliedOptionen, useMitgliederListe } from '../organisator';
import { StatusName } from '../StatusAnzeige';
import { eventBisSetzen, eventDatumSetzen, stimmeSetzen, zeitWert } from './bausteinLogik';
import { eventDatumText, useProtokollEvents } from './daten';
import { LokalText, LokalTextbereich, LokalZahl } from './LokalFelder';
import { SchichtEditor, SchichtListe } from './SchichtEditor';

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

function KalenderLink({ eventId }: Readonly<{ eventId: string }>) {
  return (
    <Anchor component={Link} to={`/kalender/events/${encodeURIComponent(eventId)}`} size="sm">
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
  const kategorie = kategorien.liste.find((k) => k.id === vorlage?.kategorieId);
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
    label: `${eventDatumText(e)} ${e.anzeigeTitel}`,
  }));
  if (daten.eventId && !kalenderOptionen.some((o) => o.value === daten.eventId)) {
    const e = events.alle.find((x) => x.id === daten.eventId);
    kalenderOptionen.unshift({
      value: daten.eventId,
      label: e ? `${eventDatumText(e)} ${e.anzeigeTitel}` : 'Verknüpftes Event',
    });
  }
  const mehrtaegig = dauer !== 'eintaegig';
  const tage = vorlage?.tage ?? 1;

  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed">
        {vorlageText}
      </Text>
      <LokalText
        label="Name"
        data-fokus="name"
        wert={daten.name}
        maxLength={200}
        onWert={(name) => aendern((d) => ({ ...d, name }))}
      />
      <Group grow {...zweiSpalten}>
        <DatumFeld
          label={mehrtaegig || !daten.vorlageId ? 'Von' : 'Datum'}
          data-fokus="datum"
          loeschbar={false}
          value={daten.datum ?? ''}
          onWert={(datum) => aendern((d) => eventDatumSetzen(d, datum || null, dauer, tage))}
          style={{ minWidth: 0 }}
        />
        {(mehrtaegig || !daten.vorlageId || daten.bisDatum) && (
          <DatumFeld
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
          <LokalText
            label="Beginn"
            type="time"
            wert={daten.beginnZeit ?? ''}
            onWert={(w) => {
              const zeit = zeitWert(w);
              if (zeit !== undefined) aendern((d) => ({ ...d, beginnZeit: zeit }));
            }}
            style={{ minWidth: 0 }}
          />
          <LokalText
            label="Ende"
            type="time"
            wert={daten.endeZeit ?? ''}
            onWert={(w) => {
              const zeit = zeitWert(w);
              if (zeit !== undefined) aendern((d) => ({ ...d, endeZeit: zeit }));
            }}
            style={{ minWidth: 0 }}
          />
        </Group>
      )}
      {daten.schichten.length > 0 && (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Dienste
          </Text>
          <SchichtEditor
            schichten={daten.schichten}
            dienstformName={dienstformName}
            onChange={(schichten) => aendern((d) => ({ ...d, schichten }))}
          />
        </Stack>
      )}
      <Select
        label="Verantwortliche:r"
        placeholder="Niemand"
        searchable
        clearable
        data={mitgliedOptionen(mitglieder.data ?? [])}
        value={daten.verantwortlichSub}
        onChange={(verantwortlichSub) => aendern((d) => ({ ...d, verantwortlichSub }))}
        nothingFoundMessage="Niemand gefunden"
      />
      <Select
        label="Im Kalender"
        description="Verknüpft den Baustein mit einem bestehenden Event."
        placeholder="Noch nicht im Kalender"
        searchable
        clearable
        data={kalenderOptionen}
        value={daten.eventId}
        onChange={(eventId) => aendern((d) => ({ ...d, eventId }))}
        nothingFoundMessage="Kein Event gefunden"
      />
      {daten.eventId && <KalenderLink eventId={daten.eventId} />}
    </Stack>
  );
}

// ---------------------------------------------------------------------------------------------
// Vergangenes Event
// ---------------------------------------------------------------------------------------------

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
      <LokalText
        label="E-Mail (optional)"
        type="email"
        inputMode="email"
        autoComplete="off"
        wert={daten.email ?? ''}
        maxLength={200}
        onWert={(email) => aendern((d) => ({ ...d, email: email === '' ? null : email }))}
      />
    </Stack>
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
        <Text style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
          {daten.antrag || 'Antrag offen'}
        </Text>
        <Group gap="xs">
          {daten.ergebnis && (
            <Badge color={daten.ergebnis === 'angenommen' ? 'green' : 'red'} size="lg">
              {daten.ergebnis === 'angenommen' ? 'Angenommen' : 'Abgelehnt'}
            </Badge>
          )}
          <Text size="sm">
            Ja {daten.ja} · Nein {daten.nein} · Enthaltung {daten.enthaltung}
          </Text>
        </Group>
      </Stack>
    );
  }
  return (
    <Stack gap="xs">
      <LokalTextbereich
        label="Antrag"
        data-fokus="antrag"
        autosize
        minRows={2}
        maxLength={2000}
        wert={daten.antrag}
        onWert={(antrag) => aendern((d) => ({ ...d, antrag }))}
      />
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
    </Stack>
  );
}
