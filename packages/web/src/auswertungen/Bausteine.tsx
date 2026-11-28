import { Alert, Button, Group, Input, Select, SegmentedControl, Table, Text } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import type { CSSProperties, ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AUSWERTUNG_INTERVALLE,
  AUSWERTUNG_INTERVALL_LABELS,
  auswertungJahrSchema,
  auswertungZeitraumSchema,
  centAnzeigen,
  heuteBerlin,
  type AuswertungIntervall,
} from '@c4/shared';
import { DatumFeld } from '../DatumFeld';
import { BETRAG_STIL, type AuswertungZeitraumFilter } from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { FeldLabel } from '../InfoHinweis';

/** Sticky sum row at the bottom of a table (the header sticks via Mantine's `stickyHeader`). */
export const SUMME_STIL: CSSProperties = {
  position: 'sticky',
  bottom: 0,
  background: 'var(--mantine-color-body)',
  fontWeight: 700,
  borderTop: '2px solid var(--mantine-color-default-border)',
};

/** First column stays visible while the period columns scroll sideways. */
export const ERSTE_SPALTE_STIL: CSSProperties = {
  position: 'sticky',
  left: 0,
  background: 'var(--mantine-color-body)',
  zIndex: 1,
};

/** An amount in Euro; negative values are red, optionally zero is shown as a dash. */
export function Betrag({
  cent,
  nullAlsStrich = false,
}: Readonly<{ cent: number; nullAlsStrich?: boolean }>) {
  if (nullAlsStrich && cent === 0)
    return (
      <Text component="span" inherit c="dimmed">
        –
      </Text>
    );
  return (
    <Text component="span" inherit c={cent < 0 ? 'red' : undefined}>
      {centAnzeigen(cent)}
    </Text>
  );
}

export const ZAHL_TH = { ...BETRAG_STIL } as const;

/**
 * Dense table in a container that scrolls sideways and vertically (so the page itself never scrolls
 * sideways); the header sticks at the top, a `Table.Tfoot` with `SUMME_STIL` cells at the bottom.
 */
export function AuswertungTabelle({
  minWidth,
  children,
}: Readonly<{ minWidth: number; children: ReactNode }>) {
  return (
    <Table.ScrollContainer
      minWidth={minWidth}
      maxHeight="max(360px, calc(100dvh - 280px))"
      type="native"
    >
      <Table verticalSpacing={4} tabularNums stickyHeader stickyHeaderOffset={0} fz="sm">
        {children}
      </Table>
    </Table.ScrollContainer>
  );
}

export const KOPF_STIL = { background: 'var(--mantine-color-body)' } as const;

function setzer(setParams: ReturnType<typeof useSearchParams>[1]) {
  return (patch: Record<string, string>) =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) n.set(k, v);
        return n;
      },
      { replace: true },
    );
}

/** Von/Bis/Intervall in the URL, validated like the API does. */
export function useZeitraumFilter(standard: AuswertungIntervall = 'monat') {
  const [params, setParams] = useSearchParams();
  const heute = heuteBerlin();
  const von = params.get('von') ?? `${heute.slice(0, 4)}-01-01`;
  const bis = params.get('bis') ?? heute;
  const roh = params.get('intervall');
  const intervall = (AUSWERTUNG_INTERVALLE as readonly string[]).includes(roh ?? '')
    ? (roh as AuswertungIntervall)
    : standard;
  const parsed = auswertungZeitraumSchema.safeParse({ von, bis, intervall });
  const filter: AuswertungZeitraumFilter | null = parsed.success ? parsed.data : null;
  return {
    von,
    bis,
    intervall,
    filter,
    fehler: parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Ungültiger Zeitraum.'),
    setze: setzer(setParams),
  };
}

/** The year in the URL (default: this year). */
export function useJahrFilter() {
  const [params, setParams] = useSearchParams();
  const jahr = params.get('jahr') ?? heuteBerlin().slice(0, 4);
  const parsed = auswertungJahrSchema.safeParse({ jahr });
  return {
    jahr,
    zahl: parsed.success ? parsed.data.jahr : null,
    fehler: parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Ungültiges Jahr.'),
    setze: setzer(setParams),
  };
}

type ZeitraumFilter = ReturnType<typeof useZeitraumFilter>;

/** Filter row of the period tabs: Von, Bis, Intervall, CSV; bottom aligned. */
export function ZeitraumLeiste({
  f,
  csv,
  kein,
}: Readonly<{ f: ZeitraumFilter; csv: (() => void) | null; kein?: boolean }>) {
  return (
    <>
      <Group align="flex-end" gap="sm">
        <DatumFeld
          label={<FeldLabel text="Von" hilfe={HILFE.auswertungen.zeitraum} />}
          value={f.von}
          onWert={(v) => f.setze({ von: v })}
          loeschbar={false}
          tippbar
          style={{ flex: '1 1 140px', maxWidth: 200 }}
        />
        <DatumFeld
          label="Bis"
          value={f.bis}
          onWert={(v) => f.setze({ bis: v })}
          loeschbar={false}
          tippbar
          style={{ flex: '1 1 140px', maxWidth: 200 }}
        />
        {!kein && (
          <Input.Wrapper label="Intervall">
            <SegmentedControl
              size="md"
              styles={{ label: { paddingBlock: 9 } }}
              value={f.intervall}
              onChange={(v) => f.setze({ intervall: v })}
              data={AUSWERTUNG_INTERVALLE.map((i) => ({
                value: i,
                label: AUSWERTUNG_INTERVALL_LABELS[i],
              }))}
            />
          </Input.Wrapper>
        )}
        <CsvKnopf csv={csv} />
      </Group>
      {f.fehler && <Alert color="red">{f.fehler}</Alert>}
    </>
  );
}

export function CsvKnopf({ csv }: Readonly<{ csv: (() => void) | null }>) {
  return (
    <Button
      variant="default"
      leftSection={<IconDownload size={18} />}
      disabled={csv === null}
      onClick={() => csv?.()}
    >
      CSV herunterladen
    </Button>
  );
}

/** Year picker (this year and the six before), bottom aligned with the other inputs of its row. */
export function JahrLeiste({
  f,
  csv,
  extra,
}: Readonly<{ f: ReturnType<typeof useJahrFilter>; csv: (() => void) | null; extra?: ReactNode }>) {
  const aktuell = Number(heuteBerlin().slice(0, 4));
  const jahre = Array.from({ length: 7 }, (_, i) => String(aktuell + 1 - i));
  if (!jahre.includes(f.jahr)) jahre.push(f.jahr);
  return (
    <>
      <Group align="flex-end" gap="sm">
        <Select
          label="Jahr"
          allowDeselect={false}
          data={jahre}
          value={f.jahr}
          onChange={(v) => v && f.setze({ jahr: v })}
          w={120}
        />
        {extra}
        <CsvKnopf csv={csv} />
      </Group>
      {f.fehler && <Alert color="red">{f.fehler}</Alert>}
    </>
  );
}
