import {
  Box,
  Button,
  Collapse,
  Flex,
  Group,
  MultiSelect,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  Title,
  UnstyledButton,
  useMantineTheme,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconChevronDown } from '@tabler/icons-react';
import { useState } from 'react';
import {
  PROTOKOLL_TEILNAHME,
  type ProtokollDto,
  type ProtokollKopf as KopfDaten,
  type ProtokollMitgliedDto,
  type ProtokollTeilnahmeWert,
} from '@c4/shared';
import { PROTOKOLL_TEILNAHME_KURZ, PROTOKOLL_TEILNAHME_LABELS } from './i18n';
import { mitgliedName } from './mitglied';
import { StatusName } from './StatusAnzeige';

/** Print rules of the Protokoll pages; render once per page. */
export const PROTOKOLL_DRUCK_CSS = `
.pk-nur-druck { display: none; }
@page { margin: 12mm; }
@media print {
  .mantine-AppShell-header, .mantine-AppShell-navbar, [data-druck="aus"],
  .mantine-RichTextEditor-toolbar { display: none !important; }
  .mantine-AppShell-main { padding: 0 !important; }
  .pk-nur-druck { display: block; }
  .mantine-RichTextEditor-root { border: none !important; }
  * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
`;

const SPALTEN = PROTOKOLL_TEILNAHME;

function Person({ m }: Readonly<{ m: ProtokollMitgliedDto }>) {
  return <StatusName status={m.status}>{mitgliedName(m)}</StatusName>;
}

/** The effective attendance: a draft follows the Sitzung unless overridden; a closed protocol is frozen. */
function wertVon(
  t: ProtokollDto['teilnahme'][number],
  kopf: KopfDaten,
  entwurf: boolean,
): ProtokollTeilnahmeWert {
  return entwurf ? (kopf.teilnahme[t.sub] ?? t.abgeleitet) : t.wert;
}

/** The chosen EMs: the Kopf's choice, else (draft) the EMs who said yes; frozen once closed. */
function gewaehlteEms(dto: ProtokollDto, kopf: KopfDaten, entwurf: boolean): string[] {
  if (!entwurf) return dto.ems.filter((e) => e.ausgewaehlt).map((e) => e.sub);
  return kopf.ems ?? dto.ems.filter((e) => e.abgeleitet).map((e) => e.sub);
}

function zaehlung(werte: ProtokollTeilnahmeWert[]): string {
  return SPALTEN.map((w) => [werte.filter((x) => x === w).length, w] as const)
    .filter(([n]) => n > 0)
    .map(([n, w]) => `${n} ${PROTOKOLL_TEILNAHME_LABELS[w]}`)
    .join(' · ');
}

/** Read-only Kopf: names grouped by attendance, then EMs and guests. Also what gets printed. */
function KopfLesen({
  dto,
  kopf,
  entwurf,
}: Readonly<{ dto: ProtokollDto; kopf: KopfDaten; entwurf: boolean }>) {
  const ems = gewaehlteEms(dto, kopf, entwurf);
  const emListe = dto.ems.filter((e) => ems.includes(e.sub));
  return (
    <Stack gap="sm">
      <Title order={4}>Teilnahme</Title>
      {SPALTEN.map((w) => {
        const personen = dto.teilnahme.filter((t) => wertVon(t, kopf, entwurf) === w);
        if (personen.length === 0) return null;
        return (
          <Text key={w} size="sm">
            <Text span fw={600}>
              {PROTOKOLL_TEILNAHME_LABELS[w].charAt(0).toUpperCase() +
                PROTOKOLL_TEILNAHME_LABELS[w].slice(1)}{' '}
              ({personen.length}):
            </Text>{' '}
            {personen.map((p, i) => (
              <span key={p.sub}>
                {i > 0 && ', '}
                <Person m={p} />
              </span>
            ))}
          </Text>
        );
      })}
      {(emListe.length > 0 || kopf.emsFreitext.trim()) && (
        <Text size="sm">
          <Text span fw={600}>
            EMs:
          </Text>{' '}
          {emListe.map((p, i) => (
            <span key={p.sub}>
              {i > 0 && ', '}
              <Person m={p} />
            </span>
          ))}
          {kopf.emsFreitext.trim() && (
            <>
              {emListe.length > 0 && ', '}
              {kopf.emsFreitext.trim()}
            </>
          )}
        </Text>
      )}
      {kopf.gaeste.trim() && (
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          <Text span fw={600}>
            Gäste:
          </Text>{' '}
          {kopf.gaeste.trim()}
        </Text>
      )}
    </Stack>
  );
}

/** One person with the attendance buttons: stacked on phones, side by side from `sm`. */
function TeilnahmeZeile({
  t,
  wert,
  onWahl,
}: Readonly<{
  t: ProtokollDto['teilnahme'][number];
  wert: ProtokollTeilnahmeWert;
  onWahl: (w: ProtokollTeilnahmeWert) => void;
}>) {
  const ueberschrieben = wert !== t.abgeleitet;
  return (
    <Flex
      direction={{ base: 'column', sm: 'row' }}
      align={{ base: 'stretch', sm: 'center' }}
      justify="space-between"
      gap={{ base: 4, sm: 'md' }}
      py={6}
      style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
    >
      <Group gap="xs" wrap="nowrap" justify="space-between" style={{ minWidth: 0, flex: 1 }}>
        <Box style={{ minWidth: 0 }}>
          <Person m={t} />
        </Box>
        {ueberschrieben && (
          <Text size="xs" c="orange" style={{ flexShrink: 0 }} title="Weicht von der Sitzung ab">
            ● überschrieben
          </Text>
        )}
      </Group>
      <SegmentedControl
        size="md"
        fullWidth
        w={{ base: '100%', sm: 320 }}
        aria-label={`Teilnahme von ${mitgliedName(t)}`}
        value={wert}
        onChange={(v) => onWahl(v as ProtokollTeilnahmeWert)}
        data={SPALTEN.map((w) => ({ value: w, label: PROTOKOLL_TEILNAHME_KURZ[w] }))}
      />
    </Flex>
  );
}

/**
 * Header of a protocol, above the document: attendance (only overrides are stored), EMs and guests.
 * Not part of the TipTap document.
 */
export function ProtokollKopf({
  dto,
  kopf,
  editierbar,
  onChange,
}: Readonly<{
  dto: ProtokollDto;
  kopf: KopfDaten;
  editierbar: boolean;
  onChange: (kopf: KopfDaten) => void;
}>) {
  const entwurf = dto.status === 'entwurf';
  const theme = useMantineTheme();
  const telefon = useMediaQuery(`(max-width: calc(${theme.breakpoints.sm} - 0.0625em))`, false, {
    getInitialValueInEffect: false,
  });
  // Explicit toggle; without one the list is collapsed on phones and open from `sm`.
  const [umgeschaltet, setUmgeschaltet] = useState<boolean | null>(null);
  const offen = umgeschaltet ?? !telefon;

  const werte = dto.teilnahme.map((t) => wertVon(t, kopf, entwurf));
  const ueberschriebene = Object.keys(kopf.teilnahme).length;

  const waehlen = (sub: string, abgeleitet: ProtokollTeilnahmeWert, w: ProtokollTeilnahmeWert) => {
    const teilnahme = { ...kopf.teilnahme };
    if (w === abgeleitet) delete teilnahme[sub];
    else teilnahme[sub] = w;
    onChange({ ...kopf, teilnahme });
  };

  if (!editierbar) {
    return (
      <Paper withBorder p="md">
        <KopfLesen dto={dto} kopf={kopf} entwurf={entwurf} />
      </Paper>
    );
  }

  const emOptionen = dto.ems.map((e) => ({ value: e.sub, label: mitgliedName(e) }));
  const emStatus = new Map(dto.ems.map((e) => [e.sub, e.status]));

  return (
    <>
      <Paper withBorder p="md" data-druck="aus">
        <Stack gap="md">
          <Stack gap="xs">
            <UnstyledButton
              w="100%"
              mih={44}
              aria-expanded={offen}
              aria-controls="protokoll-teilnahme"
              onClick={() => setUmgeschaltet(!offen)}
            >
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Stack gap={0}>
                  <Title order={4}>Teilnahme</Title>
                  <Text size="sm" c="dimmed">
                    {zaehlung(werte) || 'Niemand'}
                  </Text>
                </Stack>
                <IconChevronDown
                  size={20}
                  style={{
                    flexShrink: 0,
                    transition: 'transform 200ms ease',
                    transform: offen ? 'rotate(180deg)' : 'none',
                  }}
                />
              </Group>
            </UnstyledButton>
            <Collapse expanded={offen} id="protokoll-teilnahme">
              <Stack gap="xs">
                <Text size="xs" c="dimmed">
                  da = anwesend · spät = verspätet · entsch. = entschuldigt · fehlt =
                  unentschuldigt. Vorbelegt aus den Zu- und Absagen zur Sitzung.
                </Text>
                <Stack gap={0}>
                  {dto.teilnahme.map((t) => (
                    <TeilnahmeZeile
                      key={t.sub}
                      t={t}
                      wert={wertVon(t, kopf, entwurf)}
                      onWahl={(w) => waehlen(t.sub, t.abgeleitet, w)}
                    />
                  ))}
                </Stack>
                <Button
                  variant="default"
                  disabled={ueberschriebene === 0}
                  onClick={() => onChange({ ...kopf, teilnahme: {} })}
                >
                  Aus der Sitzung übernehmen
                </Button>
              </Stack>
            </Collapse>
          </Stack>

          <Stack gap="xs">
            <Title order={4}>EMs</Title>
            <MultiSelect
              size="md"
              aria-label="EMs"
              placeholder="EMs auswählen"
              searchable
              hidePickedOptions
              nothingFoundMessage="Keine EMs gefunden"
              data={emOptionen}
              value={gewaehlteEms(dto, kopf, entwurf)}
              onChange={(ems) => onChange({ ...kopf, ems })}
              renderOption={({ option }) => {
                const status = emStatus.get(option.value);
                return status ? (
                  <StatusName status={status}>{option.label}</StatusName>
                ) : (
                  <span>{option.label}</span>
                );
              }}
            />
            <Textarea
              size="md"
              label="Weitere EMs (Freitext)"
              autosize
              minRows={1}
              maxLength={2000}
              value={kopf.emsFreitext}
              onChange={(e) => onChange({ ...kopf, emsFreitext: e.currentTarget.value })}
            />
          </Stack>

          <Textarea
            size="md"
            label="Gäste"
            autosize
            minRows={1}
            maxLength={2000}
            value={kopf.gaeste}
            onChange={(e) => onChange({ ...kopf, gaeste: e.currentTarget.value })}
          />
        </Stack>
      </Paper>
      <Box className="pk-nur-druck">
        <KopfLesen dto={dto} kopf={kopf} entwurf={entwurf} />
      </Box>
    </>
  );
}
