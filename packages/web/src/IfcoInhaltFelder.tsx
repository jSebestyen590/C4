import { ActionIcon, Button, Group, NumberInput, Paper, Select, Stack, Text } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import {
  ifcoInhaltSchema,
  pfad,
  platzText,
  verteilbar,
  zielKey,
  zuVielVerteiltFehler,
  type IfcoInhaltPosition,
} from '@c4/shared';
import type { GegenstandEintrag, IfcoEintrag, KategorieEintrag } from './inventarDaten';
import type { LagerKnoten } from './LagerBaum';

let keyZaehler = 0;
const neuerKey = () => keyZaehler++;

export interface InhaltZeile {
  key: number;
  gegenstandId: string | null;
  anzahl: number | string;
  /** New amount per other Platz of the Gegenstand (by `zielKey`). */
  andere: Record<string, number | string>;
}

/** Plätze of `g` outside the IFCO `ifcoId` (all of them for a new IFCO). */
const anderePlaetze = (g: GegenstandEintrag, ifcoId: string | undefined) =>
  g.plaetze.filter((p) => p.ifcoId === null || p.ifcoId !== ifcoId);

const zahl = (v: number | string) => (typeof v === 'number' ? v : 0);
const summe = (l: { anzahl: number }[]) => l.reduce((s, p) => s + p.anzahl, 0);
const verbautSumme = (g: GegenstandEintrag) => summe(g.verbaut);

/** Rows for the current content of `ifco` (none for a new IFCO); other Plätze keep their amounts. */
export const inhaltZeilenAus = (
  ifco: IfcoEintrag | undefined,
  gegenstaende: GegenstandEintrag[],
): InhaltZeile[] =>
  (ifco?.inhalt ?? []).map((p) => {
    const g = gegenstaende.find((x) => x.id === p.gegenstandId);
    return {
      key: neuerKey(),
      gegenstandId: p.gegenstandId,
      anzahl: p.anzahl,
      andere: Object.fromEntries(
        (g ? anderePlaetze(g, ifco?.id) : []).map((x) => [zielKey(x), x.anzahl]),
      ),
    };
  });

/**
 * A newly chosen Gegenstand: by default all its pieces come into the IFCO, so its other Plätze
 * start at 0 (they can be raised again to keep pieces there).
 */
const zeileFuer = (
  key: number,
  g: GegenstandEintrag | undefined,
  ifcoId: string | undefined,
): InhaltZeile => ({
  key,
  gegenstandId: g?.id ?? null,
  anzahl: g ? Math.max(1, verteilbar(g)) : 1,
  andere: Object.fromEntries((g ? anderePlaetze(g, ifcoId) : []).map((x) => [zielKey(x), 0])),
});

const zielAusKey = (key: string) =>
  key.startsWith('l:')
    ? { lagerortId: key.slice(2), ifcoId: null }
    : { lagerortId: null, ifcoId: key.slice(2) };

/** Sums of a row: on the Plätze before and after, and the fixed pieces. */
function zeilenSummen(z: InhaltZeile, g: GegenstandEintrag, ifcoId: string | undefined) {
  const anderswo = anderePlaetze(g, ifcoId);
  const hier = ifcoId ? summe(g.plaetze.filter((p) => p.ifcoId === ifcoId)) : 0;
  const neu =
    (g.anzahl === 1 ? 1 : zahl(z.anzahl)) +
    anderswo.reduce((s, p) => s + zahl(z.andere[zielKey(p)] ?? p.anzahl), 0);
  return { bisher: summe(anderswo) + hier, neu, verbaut: verbautSumme(g) };
}

/**
 * The rows as validated positions with the changed amounts of the other Plätze, or the German
 * error (same rules as the API: no more pieces on Plätze than exist minus the fixed ones).
 */
export function inhaltPruefen(
  zeilen: InhaltZeile[],
  gegenstaende: GegenstandEintrag[],
  ifcoId: string | undefined,
): { positionen: IfcoInhaltPosition[] } | { fehler: string } {
  if (zeilen.some((z) => !z.gegenstandId)) {
    return { fehler: 'Bitte wähle für jede Zeile einen Gegenstand.' };
  }
  const positionen = zeilen.map((z) => {
    const g = gegenstaende.find((x) => x.id === z.gegenstandId);
    const andere = (g ? anderePlaetze(g, ifcoId) : []).flatMap((p) => {
      const wert = z.andere[zielKey(p)];
      if (wert === undefined || wert === p.anzahl) return [];
      return [{ ...zielAusKey(zielKey(p)), anzahl: typeof wert === 'number' ? wert : Number.NaN }];
    });
    return {
      gegenstandId: z.gegenstandId!,
      anzahl: g?.anzahl === 1 ? 1 : typeof z.anzahl === 'number' ? z.anzahl : Number.NaN,
      andere,
    };
  });
  const parsed = ifcoInhaltSchema.safeParse({ positionen });
  if (!parsed.success) return { fehler: parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.' };
  for (const z of zeilen) {
    const g = gegenstaende.find((x) => x.id === z.gegenstandId);
    if (!g) continue;
    const s = zeilenSummen(z, g, ifcoId);
    const fehler = zuVielVerteiltFehler(g.name, g.anzahl, s.verbaut, s.bisher, s.neu);
    if (fehler) return { fehler };
  }
  return { positionen };
}

/**
 * Rows of the content: Gegenstand and amount (none for a single-piece Gegenstand) per row, and a
 * counter for every other Platz the Gegenstand lies at, so pieces move here without a second step.
 */
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
        const anderswo = g ? anderePlaetze(g, ifco?.id) : [];
        const s = g ? zeilenSummen(z, g, ifco?.id) : null;
        const frei = g ? verteilbar(g) : 0;
        const zuViel = s !== null && s.neu > frei && s.neu + s.verbaut > s.bisher + s.verbaut;
        const einzeln = g?.anzahl === 1;
        return (
          <Paper key={z.key} withBorder p="sm">
            <Stack gap="xs">
              <Group align="flex-end" wrap="nowrap" gap="xs">
                <Select
                  aria-label={`Gegenstand ${i + 1}`}
                  placeholder="Gegenstand wählen"
                  searchable
                  inputMode="text"
                  nothingFoundMessage="Kein Gegenstand gefunden"
                  style={{ flex: 1 }}
                  data={optionen(z.gegenstandId)}
                  value={z.gegenstandId}
                  onChange={(gegenstandId) =>
                    setZeilen((l) =>
                      l.map((x) =>
                        x.key === z.key ? zeileFuer(z.key, finde(gegenstandId), ifco?.id) : x,
                      ),
                    )
                  }
                />
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
              {g && !einzeln && (
                <NumberInput
                  label={anderswo.length > 0 ? 'Anzahl in dieser IFCO' : 'Anzahl'}
                  allowDecimal={false}
                  allowNegative={false}
                  min={1}
                  inputMode="numeric"
                  value={z.anzahl}
                  onChange={(anzahl) => aendern(z.key, { anzahl })}
                />
              )}
              {einzeln && anderswo.length > 0 && (
                <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                  Kommt von „{platzText(lagerorte, ifcos, anderswo[0]!)}“ hierher.
                </Text>
              )}
              {!einzeln && anderswo.length > 0 && (
                <Stack gap="xs">
                  <Text size="sm" fw={600}>
                    Bisher zugeordnet
                  </Text>
                  {anderswo.map((p) => {
                    const key = zielKey(p);
                    return (
                      <NumberInput
                        key={key}
                        label={platzText(lagerorte, ifcos, p)}
                        description={`Bisher ${p.anzahl}`}
                        inputWrapperOrder={['label', 'input', 'description', 'error']}
                        allowDecimal={false}
                        allowNegative={false}
                        min={0}
                        inputMode="numeric"
                        value={z.andere[key] ?? p.anzahl}
                        onChange={(wert) =>
                          aendern(z.key, { andere: { ...z.andere, [key]: wert } })
                        }
                      />
                    );
                  })}
                </Stack>
              )}
              {g && s && !einzeln && (
                <Text
                  size="sm"
                  c={zuViel ? 'red' : s.neu < frei ? 'orange' : 'dimmed'}
                  role="status"
                >
                  Verteilt {s.neu} von {frei}
                  {s.verbaut > 0 && ` (${s.verbaut} fest verbaut)`}
                  {s.neu > frei && ` · ${s.neu - frei} zu viel`}
                  {s.neu < frei && ` · ${frei - s.neu} ohne Platz`}
                </Text>
              )}
            </Stack>
          </Paper>
        );
      })}
      <Button
        variant="light"
        leftSection={<IconPlus size={18} />}
        onClick={() => setZeilen((l) => [...l, zeileFuer(neuerKey(), undefined, ifco?.id)])}
      >
        Gegenstand hinzufügen
      </Button>
    </Stack>
  );
}
