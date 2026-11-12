import {
  ActionIcon,
  Box,
  Button,
  Group,
  NativeSelect,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Tooltip,
  useMantineTheme,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconInfoCircle, IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { centAnzeigen, ZEILEN_MAX, type PruefKonto } from '@c4/shared';
import { BetragFeld } from './BetragFeld';
import {
  differenzText,
  RICHTUNG_LABELS,
  summen,
  zeilenFehler,
  type FreieZeile,
  type Richtung,
} from './buchungFormular';
import { BETRAG_STIL } from './finanzenDaten';

const RICHTUNG_DATEN = (Object.keys(RICHTUNG_LABELS) as Richtung[]).map((value) => ({
  value,
  label: RICHTUNG_LABELS[value],
}));

const HILFE =
  'Zugang erhöht den Kontostand, Abgang verringert ihn. Die Buchung geht auf, wenn alle Zugänge zusammen so hoch sind wie alle Abgänge.';

const FUSS_STIL = {
  position: 'sticky',
  bottom: 0,
  zIndex: 2,
  background: 'var(--mantine-color-body)',
} as const;

/**
 * Lines of a free booking (Konto, Zugang/Abgang, Betrag) as a dense table with sticky header and
 * footer (sum and difference); below `sm` the same rows are stacked as cards. Keyboard handling
 * (Enter moves on) lives in the form that contains it, which looks for `data-nav` fields.
 * `fokusKey` focuses the account field of that row (after a row was added).
 */
export function BuchungszeilenTabelle({
  zeilen,
  onZeilen,
  konten,
  optionen,
  zeigeFehler,
  fokusKey,
  onFokusErledigt,
  onNeueZeile,
}: Readonly<{
  zeilen: FreieZeile[];
  onZeilen: (zeilen: FreieZeile[]) => void;
  konten: readonly PruefKonto[];
  optionen: readonly { value: string; label: string }[];
  /** Show all errors (after the first attempt to book); otherwise only touched fields. */
  zeigeFehler: boolean;
  fokusKey: number | null;
  onFokusErledigt: () => void;
  onNeueZeile: () => void;
}>) {
  const theme = useMantineTheme();
  const breit = useMediaQuery(`(min-width: ${theme.breakpoints.sm})`, true, {
    getInitialValueInEffect: false,
  });
  const wurzel = useRef<HTMLDivElement>(null);
  const [beruehrt, setBeruehrt] = useState<ReadonlySet<string>>(new Set());
  const anfassen = (key: number, feld: 'konto' | 'betrag') =>
    setBeruehrt((alt) => new Set(alt).add(`${key}:${feld}`));

  useEffect(() => {
    if (fokusKey === null) return;
    wurzel.current?.querySelector<HTMLElement>(`[data-konto-zeile="${fokusKey}"]`)?.focus();
    onFokusErledigt();
  }, [fokusKey, onFokusErledigt]);

  const aendere = (key: number, teil: Partial<FreieZeile>) =>
    onZeilen(zeilen.map((z) => (z.key === key ? { ...z, ...teil } : z)));
  const entferne = (key: number) => onZeilen(zeilen.filter((z) => z.key !== key));

  const s = summen(zeilen);
  const hatBetraege = s.zugang + s.abgang > 0;
  const ausgeglichen = s.differenz === 0 && hatBetraege;
  const zeigt = (z: FreieZeile, feld: 'konto' | 'betrag') =>
    zeigeFehler || beruehrt.has(`${z.key}:${feld}`);

  const kontoFeld = (z: FreieZeile, i: number) => {
    const f = zeilenFehler(z, konten);
    return (
      <Select
        selectFirstOptionOnChange
        aria-label={`Konto der Zeile ${i + 1}`}
        placeholder="Konto suchen"
        searchable
        inputMode="text"
        data={optionen as { value: string; label: string }[]}
        value={z.kontoId}
        onChange={(v) => {
          aendere(z.key, { kontoId: v });
          // After picking an account the next field is the direction.
          if (v) {
            // Wait until the dropdown has closed and Mantine has returned focus to the input,
            // then move on, unless the user already went somewhere else.
            const ziel = wurzel.current?.querySelector<HTMLElement>(
              `[data-konto-zeile="${z.key}"]`,
            );
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                const aktiv = document.activeElement;
                if (aktiv && aktiv !== ziel && aktiv !== document.body) return;
                wurzel.current
                  ?.querySelector<HTMLElement>(`[data-richtung-zeile="${z.key}"]`)
                  ?.focus();
              }),
            );
          }
        }}
        onBlur={() => anfassen(z.key, 'konto')}
        nothingFoundMessage="Kein Konto gefunden"
        error={zeigt(z, 'konto') ? f.konto : undefined}
        data-nav=""
        data-konto-zeile={z.key}
      />
    );
  };
  const richtungFeld = (z: FreieZeile, i: number) => (
    <NativeSelect
      aria-label={`Zugang oder Abgang der Zeile ${i + 1}`}
      data={RICHTUNG_DATEN}
      value={z.richtung}
      onChange={(e) => aendere(z.key, { richtung: e.currentTarget.value as Richtung })}
      data-nav=""
      data-richtung-zeile={z.key}
    />
  );
  const betragFeld = (z: FreieZeile, i: number) => {
    const f = zeilenFehler(z, konten);
    return (
      <BetragFeld
        aria-label={`Betrag der Zeile ${i + 1}`}
        value={z.betrag}
        onWert={(betrag) => aendere(z.key, { betrag })}
        onBlur={() => anfassen(z.key, 'betrag')}
        error={zeigt(z, 'betrag') ? f.betrag : undefined}
        data-nav=""
      />
    );
  };
  const entfernenKnopf = (z: FreieZeile, i: number) => (
    <ActionIcon
      variant="subtle"
      color="red"
      size={42}
      aria-label={`Zeile ${i + 1} entfernen`}
      disabled={zeilen.length <= 2}
      onClick={() => entferne(z.key)}
    >
      <IconTrash size={20} />
    </ActionIcon>
  );

  const differenz = (
    <Text
      fw={700}
      c={ausgeglichen ? 'teal' : hatBetraege ? 'orange' : 'dimmed'}
      aria-live="polite"
      role="status"
    >
      {differenzText(s.differenz, hatBetraege)}
    </Text>
  );

  const neueZeile = (
    <Group justify="space-between" align="center">
      <Button
        variant="default"
        leftSection={<IconPlus size={18} />}
        disabled={zeilen.length >= ZEILEN_MAX}
        onClick={onNeueZeile}
      >
        Zeile hinzufügen
      </Button>
      <Text size="sm" c="dimmed">
        Enter im Betrag der letzten Zeile legt die nächste Zeile an.
      </Text>
    </Group>
  );

  if (!breit) {
    return (
      <Stack ref={wurzel} gap="sm">
        <Text size="sm" c="dimmed">
          {HILFE}
        </Text>
        {zeilen.map((z, i) => (
          <Paper key={z.key} withBorder p="sm">
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap">
                <Text fw={600}>Zeile {i + 1}</Text>
                {entfernenKnopf(z, i)}
              </Group>
              {kontoFeld(z, i)}
              {richtungFeld(z, i)}
              {betragFeld(z, i)}
            </Stack>
          </Paper>
        ))}
        {neueZeile}
        <Paper withBorder p="sm">
          <Stack gap={2}>
            <Group justify="space-between">
              <Text size="sm">Summe Zugang</Text>
              <Text size="sm" style={BETRAG_STIL}>
                {centAnzeigen(s.zugang)}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm">Summe Abgang</Text>
              <Text size="sm" style={BETRAG_STIL}>
                {centAnzeigen(s.abgang)}
              </Text>
            </Group>
            {differenz}
          </Stack>
        </Paper>
      </Stack>
    );
  }

  return (
    <Stack ref={wurzel} gap="xs">
      <Table.ScrollContainer
        minWidth={560}
        maxHeight="max(320px, calc(100dvh - 460px))"
        type="native"
      >
        <Table stickyHeader verticalSpacing={6} tabularNums>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={40}>#</Table.Th>
              <Table.Th>Konto</Table.Th>
              <Table.Th w={180}>
                <Group gap={4} wrap="nowrap">
                  Zugang/Abgang
                  <Tooltip
                    label={HILFE}
                    multiline
                    w={280}
                    events={{ hover: true, focus: true, touch: true }}
                  >
                    <Box component="span" lh={0}>
                      <IconInfoCircle size={16} />
                    </Box>
                  </Tooltip>
                </Group>
              </Table.Th>
              <Table.Th w={190} style={BETRAG_STIL}>
                Betrag
              </Table.Th>
              <Table.Th w={56} aria-label="Zeile entfernen" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {zeilen.map((z, i) => (
              <Table.Tr key={z.key} style={{ verticalAlign: 'top' }}>
                <Table.Td pt="md">{i + 1}</Table.Td>
                <Table.Td>{kontoFeld(z, i)}</Table.Td>
                <Table.Td>{richtungFeld(z, i)}</Table.Td>
                <Table.Td>{betragFeld(z, i)}</Table.Td>
                <Table.Td>{entfernenKnopf(z, i)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot style={FUSS_STIL}>
            <Table.Tr style={{ background: 'var(--mantine-color-body)' }}>
              <Table.Td colSpan={3}>
                <Text size="sm">Summe Zugang</Text>
              </Table.Td>
              <Table.Td style={BETRAG_STIL}>{centAnzeigen(s.zugang)}</Table.Td>
              <Table.Td />
            </Table.Tr>
            <Table.Tr style={{ background: 'var(--mantine-color-body)' }}>
              <Table.Td colSpan={3}>
                <Text size="sm">Summe Abgang</Text>
              </Table.Td>
              <Table.Td style={BETRAG_STIL}>{centAnzeigen(s.abgang)}</Table.Td>
              <Table.Td />
            </Table.Tr>
            <Table.Tr style={{ background: 'var(--mantine-color-body)' }}>
              <Table.Td colSpan={5}>{differenz}</Table.Td>
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Table.ScrollContainer>
      {neueZeile}
    </Stack>
  );
}
