import { SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { bodenNamen, bodenNamenFehler, MAX_BOEDEN } from '@c4/shared';
import { ZahlFeld } from './ZahlFeld';

/** Input of the Regalböden fields; the number fields hold '' while empty. */
export interface BoedenWert {
  reihen: number | string;
  plaetze: number | string;
  muster: string;
  /** Whether the user edited the pattern (otherwise it follows the number of Reihen). */
  musterGeaendert: boolean;
  start: number | string;
  /** The generated names; every single one can be overwritten by hand. */
  namen: string[];
}

const standardMuster = (reihen: number | string) =>
  reihen === 1 ? 'Boden {n}' : 'Reihe {r} Platz {p}';

const ganzzahl = (v: number | string): v is number => typeof v === 'number' && Number.isInteger(v);

/** German error of the count/pattern fields, or null when they describe 1–50 Regalböden. */
export function boedenFehler(w: Omit<BoedenWert, 'namen'>): string | null {
  if (!ganzzahl(w.reihen) || w.reihen < 1) return 'Die Zahl der Reihen muss mindestens 1 sein.';
  if (!ganzzahl(w.plaetze) || w.plaetze < 1) return 'Die Plätze je Reihe müssen mindestens 1 sein.';
  if (w.reihen * w.plaetze > MAX_BOEDEN) {
    return `Es sind höchstens ${MAX_BOEDEN} Böden insgesamt möglich.`;
  }
  if (!ganzzahl(w.start) || w.start < 0) return 'Die Startnummer muss eine ganze Zahl ab 0 sein.';
  if (w.muster.trim() === '') return 'Bitte gib ein Namensmuster ein.';
  return null;
}

/** Regenerates the names from the fields (kept unchanged while the fields are invalid). */
function mitNamen(w: BoedenWert): BoedenWert {
  if (boedenFehler(w) !== null) return w;
  return {
    ...w,
    namen: bodenNamen(w.muster, w.reihen as number, w.plaetze as number, w.start as number),
  };
}

/** Initial fields; `start` is the first running number (existing Böden + 1 when appending). */
export const boedenStandard = (start = 1): BoedenWert =>
  mitNamen({
    reihen: 1,
    plaetze: 5,
    muster: standardMuster(1),
    musterGeaendert: false,
    start,
    namen: [],
  });

/** First error over all fields and names (names are checked against `vorhanden`), or null. */
export function boedenGesamtFehler(w: BoedenWert, vorhanden: string[]): string | null {
  return boedenFehler(w) ?? bodenNamenFehler(w.namen, vorhanden).find((f) => f !== null) ?? null;
}

/** Reihen, Plätze je Reihe, Namensmuster, Startnummer and the editable list of resulting names. */
export function BoedenFelder({
  wert,
  vorhanden = [],
  onChange,
}: Readonly<{
  wert: BoedenWert;
  /** Names of the Böden the Regal already has. */
  vorhanden?: string[];
  onChange: (w: BoedenWert) => void;
}>) {
  const aendern = (teil: Partial<BoedenWert>) => {
    const neu = { ...wert, ...teil };
    if (!neu.musterGeaendert) neu.muster = standardMuster(neu.reihen);
    onChange(mitNamen(neu));
  };
  const fehler = boedenFehler(wert);
  const namenFehler = bodenNamenFehler(wert.namen, vorhanden);
  return (
    <Stack gap="sm">
      <SimpleGrid cols={2} spacing="sm">
        <ZahlFeld
          label="Reihen"
          value={wert.reihen}
          onChange={(reihen) => aendern({ reihen })}
          min={1}
          max={MAX_BOEDEN}
          allowDecimal={false}
          allowNegative={false}
          inputMode="numeric"
        />
        <ZahlFeld
          label="Plätze je Reihe"
          value={wert.plaetze}
          onChange={(plaetze) => aendern({ plaetze })}
          min={1}
          max={MAX_BOEDEN}
          allowDecimal={false}
          allowNegative={false}
          inputMode="numeric"
        />
      </SimpleGrid>
      <TextInput
        label="Namensmuster"
        description="{r} = Reihe, {p} = Platz in der Reihe, {n} = laufende Nummer, z. B. HR{r}{p} ergibt HR11, HR12, …"
        value={wert.muster}
        onChange={(e) => aendern({ muster: e.currentTarget.value, musterGeaendert: true })}
      />
      <ZahlFeld
        label="Startnummer"
        description="Für {n}."
        value={wert.start}
        onChange={(start) => aendern({ start })}
        min={0}
        allowDecimal={false}
        allowNegative={false}
        inputMode="numeric"
      />
      {fehler && (
        <Text size="sm" c="red">
          {fehler}
        </Text>
      )}
      {wert.namen.length > 0 && (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Namen ({wert.namen.length}), einzeln änderbar
          </Text>
          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
            {wert.namen.map((n, i) => (
              <TextInput
                key={i}
                aria-label={`Name von Boden ${i + 1}`}
                value={n}
                error={namenFehler[i]}
                onChange={(e) => {
                  const namen = [...wert.namen];
                  namen[i] = e.currentTarget.value;
                  onChange({ ...wert, namen });
                }}
              />
            ))}
          </SimpleGrid>
        </Stack>
      )}
    </Stack>
  );
}
