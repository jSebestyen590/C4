import { Anchor, Box, Group, Text, TextInput } from '@mantine/core';
import { mhdAnzeigen, type Gebinde } from '@c4/shared';
import { gebindeKurz, mhdAusEingabe, type WareInfo, type Zeile } from './inventurDaten';

/** One compact table row: Ware (+ MHD) on the left, one small count input per Gebinde on the right. */
export function InventurZeile({
  ware,
  zeile,
  gebinde,
  soll,
  aktionen,
  onAnzahl,
  onMhd,
  onBlur,
}: Readonly<{
  ware: WareInfo;
  zeile: Zeile;
  /** Gebinde of the Ware, Obergebinde first. */
  gebinde: Gebinde[];
  /** Expected amount for a Gebinde in this row (shown as placeholder). */
  soll: (gebindeId: string, mhd: string | null) => number;
  /** Small links below the label ("+ MHD", "Entfernen"). */
  aktionen?: { text: string; onClick: () => void }[];
  onAnzahl: (gebindeId: string, wert: string) => void;
  onMhd: (mhd: string) => void;
  onBlur: () => void;
}>) {
  const mhd = mhdAusEingabe(zeile.mhd, ware.mhdArt);
  const mitMhd = ware.mhdArt !== 'keins';
  const fest = mitMhd && zeile.fest;
  const name = fest ? `${ware.name} · ${mhdAnzeigen(mhd, ware.mhdArt)}` : ware.name;

  return (
    <Group
      wrap="nowrap"
      gap={6}
      align="center"
      py={4}
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
            data-inventur="mhd"
            enterKeyHint="next"
            value={zeile.mhd}
            styles={{ input: { fontSize: 16, minWidth: 0 } }}
            onChange={(e) => onMhd(e.currentTarget.value)}
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
      {gebinde.map((g) => (
        <Box key={g.id} w={68} style={{ flex: 'none' }}>
          <Text size="10px" c="dimmed" ta="center" lh={1.2} truncate title={g.name}>
            {gebindeKurz(g.name)}
          </Text>
          <TextInput
            size="md"
            inputMode="numeric"
            pattern="[0-9]*"
            enterKeyHint="next"
            autoComplete="off"
            data-inventur="anzahl"
            aria-label={`${name}: ${g.name}`}
            placeholder={String(soll(g.id, mhd))}
            value={zeile.anzahl[g.id] ?? ''}
            styles={{ input: { textAlign: 'center', height: 44, fontSize: 16, paddingInline: 4 } }}
            onChange={(e) => onAnzahl(g.id, e.currentTarget.value.replace(/\D/g, '').slice(0, 6))}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={onBlur}
          />
        </Box>
      ))}
    </Group>
  );
}
