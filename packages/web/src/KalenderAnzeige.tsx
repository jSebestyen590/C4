import { Anchor, Badge, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import {
  schichtDetails,
  type DienstformDto,
  type DienstPerson,
  type EventBewertung,
  type EventDto,
  type EventKategorieDto,
  type SchichtDto,
} from '@c4/shared';
import { useAuth } from './auth';
import { AMPEL_LABELS, labelFuer, MITGLIED_STATUS_LABELS, SCHICHT_ART_LABELS } from './i18n';
import { mitgliedLink, mitgliedName } from './mitglied';
import { StatusName } from './StatusAnzeige';

export const AMPEL_FARBE: Record<EventBewertung, string> = {
  rot: 'red',
  gelb: 'yellow',
  gruen: 'green',
  abgesagt: 'gray',
};

export function AmpelBadge({
  bewertung,
  size,
}: Readonly<{ bewertung: EventBewertung; size?: 'sm' | 'md' }>) {
  return (
    <Badge color={AMPEL_FARBE[bewertung]} variant="light" size={size} style={{ flexShrink: 0 }}>
      {AMPEL_LABELS[bewertung]}
    </Badge>
  );
}

/** "Du nimmst teil" for a participation event the caller takes part in; nothing otherwise. */
export function TeilnahmeBadge({
  event,
}: Readonly<{ event: Pick<EventDto, 'art' | 'ichNehmeTeil'> }>) {
  if (event.art !== 'teilnahme' || !event.ichNehmeTeil) return null;
  return (
    <Badge color="green" variant="light" size="sm" tt="none">
      Du nimmst teil
    </Badge>
  );
}

/** Number of members taking part in a participation event. */
export const teilnehmerAnzahl = (e: Pick<EventDto, 'teilnahmen'>): number =>
  e.teilnahmen.filter((t) => t.zustand === 'teilnahme').length;

/**
 * Status badge of an event: the Ampel for events with Dienste, "x nehmen teil" for events with
 * participation (they have no Ampel); cancelled events are gray in both cases.
 */
export function EventStatusBadge({
  event,
  size,
}: Readonly<{
  event: Pick<EventDto, 'art' | 'bewertung' | 'abgesagt' | 'teilnahmen'>;
  size?: 'sm' | 'md';
}>) {
  if (event.art !== 'teilnahme' || event.abgesagt) {
    return <AmpelBadge bewertung={event.bewertung} size={size} />;
  }
  const n = teilnehmerAnzahl(event);
  return (
    <Badge color="gray" variant="light" size={size} tt="none" style={{ flexShrink: 0 }}>
      {n === 1 ? '1 nimmt teil' : `${n} nehmen teil`}
    </Badge>
  );
}

/** Neutral bar color of participation events in the month grid (they have no Ampel). */
export const TEILNAHME_BALKEN = 'var(--mantine-color-gray-4)';

/** Mantine CSS color of the Ampel bar of one event: the Ampel, or neutral for participation. */
export const balkenFarbe = (e: Pick<EventDto, 'art' | 'bewertung' | 'abgesagt'>): string =>
  e.art === 'teilnahme' && !e.abgesagt
    ? TEILNAHME_BALKEN
    : `var(--mantine-color-${AMPEL_FARBE[e.bewertung]}-filled)`;

/** Mantine color name of a Kategorie; events without one are gray. */
export const kategorieFarbe = (k: Pick<EventKategorieDto, 'farbe'> | null): string =>
  k?.farbe ?? 'gray';

/** Name of the Dienst in a Schicht: its Dienstform (Betrieb) or the Art (Aufbau/Putzen). */
export const dienstName = (
  schicht: Pick<SchichtDto, 'art'>,
  dienstformId: string | null,
  dienstformen: Map<string, DienstformDto>,
): string =>
  dienstformId === null
    ? SCHICHT_ART_LABELS[schicht.art]
    : (dienstformen.get(dienstformId)?.name ?? 'Dienst');

/** Display name of a person in a Dienst: username (or name) of a member, name of an Externe. */
export const personAnzeigename = (p: DienstPerson): string =>
  p.art === 'mitglied' ? mitgliedName(p) : p.name;

/**
 * A person in a Dienst. Members are bold in their status color and link to their page; Externe are
 * italic and show where they come from.
 */
export function PersonName({
  person,
  mitQuelle = true,
  verlinken = true,
}: Readonly<{ person: DienstPerson; mitQuelle?: boolean; verlinken?: boolean }>) {
  const { can } = useAuth();
  if (person.art === 'extern') {
    return (
      <Text component="span" fs="italic" style={{ overflowWrap: 'anywhere' }}>
        {person.name}
        {mitQuelle && person.quelle && (
          <Text component="span" c="dimmed">
            {' '}
            ({person.quelle})
          </Text>
        )}
      </Text>
    );
  }
  const name = <StatusName status={person.status}>{personAnzeigename(person)}</StatusName>;
  if (!verlinken || !can('mitglieder:lesen')) return name;
  return (
    <Anchor component={Link} to={mitgliedLink(person)} underline="hover">
      {name}
    </Anchor>
  );
}

/** "Anwärter:in braucht Begleitung" in the form matching the Anwärter:in in the Schicht. */
function begleitungText(schicht: SchichtDto): string {
  const anwaerter = schicht.dienste.flatMap((d) =>
    d.person.art === 'mitglied' && d.person.status === 'anwaerter' ? [d.person] : [],
  );
  const anrede = anwaerter.length === 1 ? anwaerter[0]!.anrede : 'neutral';
  return `${labelFuer(MITGLIED_STATUS_LABELS, 'anwaerter', anrede)} braucht Begleitung (Mitglied oder EM)`;
}

/** What is still missing in a Schicht, e.g. "1× Bar fehlt (Wunsch 2)"; nothing when complete. */
export function FehltInfo({
  schicht,
  dienstformen,
}: Readonly<{ schicht: SchichtDto; dienstformen: Map<string, DienstformDto> }>) {
  const details = schichtDetails(schicht);
  const zeilen: { text: string; farbe: string }[] = [];
  for (const d of details.dienstformen) {
    const name = dienstformen.get(d.dienstformId)?.name ?? 'Dienst';
    if (d.bisMinimum > 0) {
      zeilen.push({ text: `${d.bisMinimum}× ${name} fehlt (Wunsch ${d.wunsch})`, farbe: 'red' });
    } else if (d.bisWunsch > 0) {
      zeilen.push({
        text: `${d.bisWunsch}× ${name} noch gewünscht`,
        farbe: 'var(--mantine-color-yellow-light-color)',
      });
    }
  }
  if (details.anzahl) {
    const a = details.anzahl;
    const personen = (n: number) => (n === 1 ? 'Person' : 'Personen');
    if (a.bisMinimum > 0) {
      zeilen.push({
        text: `${a.bisMinimum} ${personen(a.bisMinimum)} ${a.bisMinimum === 1 ? 'fehlt' : 'fehlen'} (Wunsch ${a.wunsch})`,
        farbe: 'red',
      });
    } else if (a.bisWunsch > 0) {
      zeilen.push({
        text: `${a.bisWunsch} ${personen(a.bisWunsch)} noch gewünscht`,
        farbe: 'var(--mantine-color-yellow-light-color)',
      });
    }
  }
  if (details.begleitungFehlt) zeilen.push({ text: begleitungText(schicht), farbe: 'red' });
  if (zeilen.length === 0) return null;
  return (
    <Stack gap={2}>
      {zeilen.map((z) => (
        <Text key={z.text} size="sm" c={z.farbe}>
          {z.text}
        </Text>
      ))}
    </Stack>
  );
}
