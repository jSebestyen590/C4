import { ActionIcon, Button, Group, NumberInput, Paper, Select, Stack, Text } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import {
  ifcoInhaltAnwenden,
  ifcoInhaltSchema,
  pfad,
  platzText,
  ueberfuehrteMenge,
  zielKey,
  zuVielVerteiltFehler,
  type IfcoInhaltPosition,
  type PlatzMenge,
} from '@c4/shared';
import { mengeName } from './inventarAnzeige';
import type { GegenstandEintrag, IfcoEintrag, KategorieEintrag } from './inventarDaten';
import type { LagerKnoten } from './LagerBaum';

let keyZaehler = 0;
const neuerKey = () => keyZaehler++;

export interface InhaltZeile {
  key: number;
  gegenstandId: string | null;
  anzahl: number | string;
}

/** Rows for the current content of `ifco` (none for a new IFCO). */
export const inhaltZeilenAus = (ifco: IfcoEintrag | undefined): InhaltZeile[] =>
  (ifco?.inhalt ?? []).map((p) => ({
    key: neuerKey(),
    gegenstandId: p.gegenstandId,
    anzahl: p.anzahl,
  }));

/** Id used for a new IFCO: none of its Plätze exist yet. */
const NEU = '';

const mengenVon = (gegenstaende: GegenstandEintrag[]): PlatzMenge[] =>
  gegenstaende.flatMap((g) =>
    g.plaetze.map((p) => ({
      gegenstandId: g.id,
      lagerortId: p.lagerortId,
      ifcoId: p.ifcoId,
      anzahl: p.anzahl,
    })),
  );

/** Plätze of `g` outside the IFCO `ifcoId`. */
const anderePlaetze = (g: GegenstandEintrag, ifcoId: string) =>
  g.plaetze.filter((p) => p.ifcoId !== ifcoId || ifcoId === NEU);

/** The rows as validated positions (without Herkunft yet), or the German error. */
export function inhaltPruefen(
  zeilen: InhaltZeile[],
  gegenstaende: GegenstandEintrag[],
): { positionen: IfcoInhaltPosition[] } | { fehler: string } {
  if (zeilen.some((z) => !z.gegenstandId)) {
    return { fehler: 'Bitte wähle für jede Zeile einen Gegenstand.' };
  }
  const einzeln = (id: string) => gegenstaende.find((g) => g.id === id)?.anzahl === 1;
  const positionen = zeilen.map((z) => ({
    gegenstandId: z.gegenstandId!,
    anzahl: einzeln(z.gegenstandId!) ? 1 : typeof z.anzahl === 'number' ? z.anzahl : Number.NaN,
    herkunft: null,
  }));
  const parsed = ifcoInhaltSchema.safeParse({ positionen });
  if (!parsed.success) return { fehler: parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.' };
  return { positionen };
}

/** A Gegenstand that gets more pieces in the IFCO while it already lies elsewhere. */
export interface Ueberfuehrung {
  gegenstandId: string;
  name: string;
  /** Pieces added to the IFCO. */
  zuwachs: number;
  /** Its other Plätze, as `zielKey` values with label. */
  quellen: { value: string; label: string; anzahl: number }[];
}

/** The positions that could be an Überführung, i.e. need the hint and a choice of Herkunft. */
export function ueberfuehrungenFinden(
  positionen: IfcoInhaltPosition[],
  gegenstaende: GegenstandEintrag[],
  ifcoId: string | undefined,
  lagerorte: LagerKnoten[],
  ifcos: IfcoEintrag[],
): Ueberfuehrung[] {
  const id = ifcoId ?? NEU;
  return positionen.flatMap((p) => {
    const g = gegenstaende.find((x) => x.id === p.gegenstandId);
    if (!g) return [];
    const hier = id === NEU ? 0 : (g.plaetze.find((x) => x.ifcoId === id)?.anzahl ?? 0);
    const quellen = anderePlaetze(g, id).map((x) => ({
      value: zielKey(x),
      label: platzText(lagerorte, ifcos, x),
      anzahl: x.anzahl,
    }));
    const zuwachs = p.anzahl - hier;
    return zuwachs > 0 && quellen.length > 0
      ? [{ gegenstandId: g.id, name: g.name, zuwachs, quellen }]
      : [];
  });
}

/** Default Herkunft per Überführung: the Platz holding the most pieces. */
export const herkunftVorschlag = (liste: Ueberfuehrung[]): Record<string, string | null> =>
  Object.fromEntries(
    liste.map((u) => [
      u.gegenstandId,
      [...u.quellen].sort((a, b) => b.anzahl - a.anzahl)[0]!.value,
    ]),
  );

const zielAusKey = (key: string) =>
  key.startsWith('l:')
    ? { lagerortId: key.slice(2), ifcoId: null }
    : { lagerortId: null, ifcoId: key.slice(2) };

/**
 * Positions with the chosen Herkunft, or the German error when the result would put more pieces
 * of a Gegenstand on its Plätze than exist (same rule as the API).
 */
export function mitHerkunft(
  positionen: IfcoInhaltPosition[],
  herkunft: Record<string, string | null>,
  gegenstaende: GegenstandEintrag[],
  ifcoId: string | undefined,
): { positionen: IfcoInhaltPosition[] } | { fehler: string } {
  const fertig = positionen.map((p) => {
    const key = herkunft[p.gegenstandId];
    return { ...p, herkunft: key ? zielAusKey(key) : null };
  });
  const alt = mengenVon(gegenstaende);
  const neu = ifcoInhaltAnwenden(alt, ifcoId ?? NEU, fertig).plaetze;
  for (const p of fertig) {
    const g = gegenstaende.find((x) => x.id === p.gegenstandId);
    if (!g) continue;
    const summe = (l: PlatzMenge[]) =>
      l.filter((x) => x.gegenstandId === g.id).reduce((s, x) => s + x.anzahl, 0);
    const fehler = zuVielVerteiltFehler(g.name, g.anzahl, summe(alt), summe(neu));
    if (fehler) return { fehler };
  }
  return { positionen: fertig };
}

/**
 * Second step before saving: for every Gegenstand that already lies elsewhere, where the added
 * pieces come from ("Nicht überführen" keeps the other Platz as it is).
 */
export function UeberfuehrungFelder({
  liste,
  herkunft,
  onHerkunft,
  gegenstaende,
  ifcoId,
}: Readonly<{
  liste: Ueberfuehrung[];
  herkunft: Record<string, string | null>;
  onHerkunft: (gegenstandId: string, key: string | null) => void;
  gegenstaende: GegenstandEintrag[];
  ifcoId: string | undefined;
}>) {
  const alt = mengenVon(gegenstaende);
  return (
    <Stack>
      <Text size="sm">
        {liste.length === 1 ? 'Dieser Gegenstand liegt' : 'Diese Gegenstände liegen'} schon an einem
        anderen Platz. Sollen die Stücke von dort in die IFCO überführt werden?
      </Text>
      {liste.map((u) => {
        const key = herkunft[u.gegenstandId] ?? null;
        const menge = key
          ? ueberfuehrteMenge(alt, ifcoId ?? NEU, {
              gegenstandId: u.gegenstandId,
              anzahl:
                u.zuwachs +
                (alt.find((x) => x.ifcoId === ifcoId && x.gegenstandId === u.gegenstandId)
                  ?.anzahl ?? 0),
              herkunft: zielAusKey(key),
            })
          : 0;
        const quelle = u.quellen.find((q) => q.value === key);
        return (
          <Paper key={u.gegenstandId} withBorder p="sm">
            <Stack gap="xs">
              <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                {mengeName(u.zuwachs, u.name)}
              </Text>
              <Select
                label="Überführen aus"
                allowDeselect={false}
                data={[
                  ...u.quellen.map((q) => ({
                    value: q.value,
                    label: `${q.label} (${q.anzahl})`,
                  })),
                  { value: '', label: 'Nicht überführen (zusätzlich)' },
                ]}
                value={key ?? ''}
                onChange={(v) => onHerkunft(u.gegenstandId, v || null)}
              />
              {quelle && (
                <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                  {menge} von {quelle.anzahl} aus „{quelle.label}“
                  {menge < u.zuwachs && `, ${u.zuwachs - menge} kommen neu dazu`}.
                </Text>
              )}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}

/** Rows of the content: Gegenstand and amount (none for a single-piece Gegenstand) per row. */
export function IfcoInhaltFelder({
  zeilen,
  setZeilen,
  ifco,
  gegenstaende,
  kategorien,
  lagerorte,
  ifcos,
}: Readonly<{
  zeilen: InhaltZeile[];
  setZeilen: (f: (l: InhaltZeile[]) => InhaltZeile[]) => void;
  /** The IFCO being edited; undefined for a new one. */
  ifco: IfcoEintrag | undefined;
  gegenstaende: GegenstandEintrag[];
  kategorien: KategorieEintrag[];
  lagerorte: LagerKnoten[];
  ifcos: IfcoEintrag[];
}>) {
  const id = ifco?.id ?? NEU;
  const bisher = new Set((ifco?.inhalt ?? []).map((p) => p.gegenstandId));
  const gewaehlt = zeilen.flatMap((z) => (z.gegenstandId ? [z.gegenstandId] : []));
  const optionen = (eigene: string | null) =>
    gegenstaende
      .filter((g) => !g.archiviert || bisher.has(g.id))
      .map((g) => ({
        value: g.id,
        label: `${g.name} (${pfad(kategorien, g.kategorieId)})`,
        disabled: g.id !== eigene && gewaehlt.includes(g.id),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'de'));
  const finde = (gid: string | null) => gegenstaende.find((g) => g.id === gid);
  const aendern = (key: number, teil: Partial<InhaltZeile>) =>
    setZeilen((l) => l.map((z) => (z.key === key ? { ...z, ...teil } : z)));

  return (
    <Stack>
      {zeilen.length === 0 && <Text c="dimmed">Die IFCO ist leer.</Text>}
      {zeilen.map((z, i) => {
        const g = finde(z.gegenstandId);
        const anderswo = g ? anderePlaetze(g, id) : [];
        return (
          <Paper key={z.key} withBorder p="sm">
            <Stack gap="xs">
              <Select
                label={`Gegenstand ${i + 1}`}
                placeholder="Gegenstand wählen"
                searchable
                inputMode="text"
                nothingFoundMessage="Kein Gegenstand gefunden"
                data={optionen(z.gegenstandId)}
                value={z.gegenstandId}
                onChange={(gegenstandId) => aendern(z.key, { gegenstandId })}
              />
              <Group align="flex-end" wrap="nowrap" gap="xs" justify="flex-end">
                {g?.anzahl !== 1 && (
                  <NumberInput
                    label="Anzahl"
                    description={g ? `Insgesamt ${g.anzahl}` : undefined}
                    inputWrapperOrder={['label', 'input', 'description', 'error']}
                    style={{ flex: 1 }}
                    allowDecimal={false}
                    allowNegative={false}
                    min={1}
                    inputMode="numeric"
                    value={z.anzahl}
                    onChange={(anzahl) => aendern(z.key, { anzahl })}
                  />
                )}
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size={44}
                  aria-label={`Gegenstand ${i + 1} entfernen`}
                  onClick={() => setZeilen((l) => l.filter((x) => x.key !== z.key))}
                >
                  <IconTrash size={20} />
                </ActionIcon>
              </Group>
              {anderswo.length > 0 && (
                <Text size="sm" c="orange" style={{ overflowWrap: 'anywhere' }}>
                  Liegt schon an:{' '}
                  {anderswo
                    .map((p) => `${platzText(lagerorte, ifcos, p)} (${p.anzahl})`)
                    .join(', ')}
                </Text>
              )}
            </Stack>
          </Paper>
        );
      })}
      <Button
        variant="light"
        leftSection={<IconPlus size={18} />}
        onClick={() => setZeilen((l) => [...l, { key: neuerKey(), gegenstandId: null, anzahl: 1 }])}
      >
        Gegenstand hinzufügen
      </Button>
    </Stack>
  );
}
