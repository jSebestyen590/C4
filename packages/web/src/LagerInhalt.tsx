import { Anchor, Stack, Text } from '@mantine/core';
import { IconBox } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import type { BestandsAnzeige } from './lagerBestand';
import { ifcoPlatzText, type IfcoPlatzMasse } from '@c4/shared';
import type { IfcoEintrag, IfcoTypEintrag } from './inventarDaten';
import { ifcosAufPlatz, passtNochText } from './ifcoPlatz';
import { anzahlText, ifcoAusleiheZeile } from './inventarAnzeige';
import type { LagerInventar } from './lagerInventar';

const inventarZeile = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 44,
  overflowWrap: 'anywhere',
} as const;

/** IFCOs standing at a node and Gegenstände assigned directly to it, linked to their detail pages. */
export function InventarListe({ inventar }: Readonly<{ inventar: LagerInventar }>) {
  return (
    <Stack gap={0} mt={4}>
      {inventar.ifcos.map((i) => (
        <Anchor
          key={i.id}
          component={Link}
          to={`/inventar/ifcos/${encodeURIComponent(i.id)}`}
          size="sm"
          style={inventarZeile}
        >
          <IconBox size={16} style={{ flex: 'none' }} />
          <span>
            <Text span fw={600} inherit>
              {i.name}
            </Text>
            {i.typ && (
              <Text span c="dimmed" inherit>
                {' · '}
                {i.typ}
              </Text>
            )}
            {' · '}
            {i.stueck} {i.stueck === 1 ? 'Teil' : 'Teile'}
            {i.ausleihe && (
              <Text span c={i.ausleihe.status === 'geplant' ? 'cyan' : 'grape'} inherit>
                {' · '}
                {ifcoAusleiheZeile(i.ausleihe)}
              </Text>
            )}
          </span>
        </Anchor>
      ))}
      {inventar.gegenstaende.map((g) => (
        <Anchor
          key={g.id}
          component={Link}
          to={`/inventar/gegenstaende/${encodeURIComponent(g.id)}`}
          size="sm"
          style={inventarZeile}
        >
          <span>
            <Text span fw={600} inherit>
              {g.name}
            </Text>
            {g.anzahl !== 1 && ` ${anzahlText(g.anzahl)}`}
            {g.verliehen > 0 && (
              <Text span c="grape" inherit>
                {' '}
                · {g.verliehen} verliehen
              </Text>
            )}
            {g.vorgemerkt > 0 && (
              <Text span c="cyan" inherit>
                {' '}
                · {g.vorgemerkt} vorgemerkt
              </Text>
            )}
          </span>
        </Anchor>
      ))}
    </Stack>
  );
}

/** Stock lines of a node: `Krosti: 9 Kästen` plus the earliest MHD. */
export function BestandListe({ zeilen }: Readonly<{ zeilen: BestandsAnzeige[] }>) {
  return zeilen.map((b) => (
    <Text key={b.wareId} size="sm" lh={1.35} style={{ overflowWrap: 'anywhere' }}>
      <Text span fw={600} inherit>
        {b.name}
      </Text>
      : {b.text}
      {b.mhd && (
        <Text span size="xs" c="dimmed">
          {' '}
          · MHD {b.mhd}
        </Text>
      )}
    </Text>
  ));
}

/** Dimensions of an IFCO-Lagerplatz and what still fits there (`Passt noch: 1× 6410 oder 2× 4310` / `Voll`). */
export function IfcoPlatzInfo({
  lagerortId,
  masse,
  daten,
}: Readonly<{
  lagerortId: string;
  masse: IfcoPlatzMasse;
  /** IFCOs and types; null while not loaded. */
  daten: { ifcos: IfcoEintrag[]; typen: IfcoTypEintrag[] } | null;
}>) {
  return (
    <Stack gap={2}>
      <Text size="sm" fw={600}>
        {ifcoPlatzText(masse)}
      </Text>
      {daten && (
        <Text size="sm" c="dimmed">
          {passtNochText(masse, ifcosAufPlatz(daten.ifcos, lagerortId), daten.typen)}
        </Text>
      )}
    </Stack>
  );
}
