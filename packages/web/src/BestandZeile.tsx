import { Anchor, Box, Group, Text, TextInput } from '@mantine/core';
import {
  gebindeBezeichnung,
  gebindeKurz,
  gebindeKurzMehrzahl,
  mhdAnzeigen,
  type Gebinde,
} from '@c4/shared';
import { mhdAusEingabe, type WareInfo, type Zeile } from './inventurDaten';

/**
 * One compact table row: Ware (+ MHD) on the left, one small count input per Gebinde on the right.
 * Shared by Inventur, Einlagerung, Entnahme and Umlagerung.
 */
export function BestandZeile({
  ware,
  zeile,
  gebinde,
  alleGebinde,
  platzhalter,
  warnung,
  mhdFeld = true,
  mhdFehler = false,
  aktionen,
  onAnzahl,
  onMhd,
  onBlur,
}: Readonly<{
  ware: WareInfo;
  zeile: Zeile;
  /** Gebinde shown as input columns, Obergebinde first. */
  gebinde: Gebinde[];
  /** All Gebinde (for the full name when short names collide). */
  alleGebinde: Gebinde[];
  /** Grey placeholder of a Gebinde input (expected or current stock); empty when missing. */
  platzhalter?: (gebindeId: string, mhd: string | null) => string;
  /** Marks an input orange with "mehr als Bestand" for the entered text. */
  warnung?: (gebindeId: string, wert: string) => boolean;
  /** Show the MHD input of MHD wares (Entnahme and Umlagerung have none). */
  mhdFeld?: boolean;
  /** Marks the MHD input as missing. */
  mhdFehler?: boolean;
  /** Small links below the label ("+ MHD", "Entfernen"). */
  aktionen?: { text: string; onClick: () => void }[];
  onAnzahl: (gebindeId: string, wert: string) => void;
  onMhd?: (mhd: string) => void;
  onBlur?: () => void;
}>) {
  const mhd = mhdAusEingabe(zeile.mhd, ware.mhdArt);
  const bezeichnung = (g: Gebinde) => gebindeBezeichnung(g, alleGebinde);
  // The short name is enough unless two Gebinde of this Ware share it (e.g. two Kasten types).
  const beschriftung = (g: Gebinde) =>
    gebinde.filter((x) => gebindeKurz(x) === gebindeKurz(g)).length > 1
      ? bezeichnung(g)
      : gebindeKurzMehrzahl(g);
  const mitMhd = mhdFeld && ware.mhdArt !== 'keins';
  const fest = mitMhd && zeile.fest;
  const name = fest ? `${ware.name} · ${mhdAnzeigen(mhd, ware.mhdArt)}` : ware.name;

  return (
    <Group
      wrap="nowrap"
      gap={6}
      align="center"
      py={4}
      data-ware={ware.id}
      style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
    >
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" fw={500} lh={1.25} style={{ overflowWrap: 'anywhere' }}>
          {name}
        </Text>
        {mitMhd && !fest && (
          <TextInput
            size="md"
            mt={2}
            type={ware.mhdArt === 'monat' ? 'month' : 'date'}
            aria-label={`${ware.name}: MHD`}
            data-zeile="mhd"
            enterKeyHint="next"
            value={zeile.mhd}
            error={mhdFehler}
            styles={{ input: { fontSize: 16, minWidth: 0 } }}
            onChange={(e) => onMhd?.(e.currentTarget.value)}
            onBlur={onBlur}
          />
        )}
        {aktionen && aktionen.length > 0 && (
          <Group gap="md" wrap="nowrap">
            {aktionen.map((a) => (
              <Anchor
                key={a.text}
                component="button"
                type="button"
                size="xs"
                py={6}
                onClick={a.onClick}
              >
                {a.text}
              </Anchor>
            ))}
          </Group>
        )}
      </Box>
      {gebinde.map((g) => {
        const wert = zeile.anzahl[g.id] ?? '';
        const zuViel = warnung?.(g.id, wert) ?? false;
        return (
          <Box key={g.id} w={68} style={{ flex: 'none' }}>
            <Text size="10px" c="dimmed" ta="center" lh={1.2} truncate title={bezeichnung(g)}>
              {beschriftung(g)}
            </Text>
            <TextInput
              size="md"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="next"
              autoComplete="off"
              data-zeile="anzahl"
              aria-label={`${name}: ${bezeichnung(g)}`}
              placeholder={platzhalter?.(g.id, mhd) ?? ''}
              value={wert}
              styles={{
                input: {
                  textAlign: 'center',
                  height: 42,
                  fontSize: 16,
                  paddingInline: 4,
                  ...(zuViel ? { borderColor: 'var(--mantine-color-orange-6)' } : {}),
                },
              }}
              onChange={(e) => onAnzahl(g.id, e.currentTarget.value.replace(/\D/g, '').slice(0, 6))}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={onBlur}
            />
            {zuViel && (
              <Text size="10px" c="orange.8" ta="center" lh={1.1}>
                mehr als Bestand
              </Text>
            )}
          </Box>
        );
      })}
    </Group>
  );
}
