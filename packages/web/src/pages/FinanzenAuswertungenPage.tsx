import { Button, Group, Stack, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import { EinkaufTab } from '../auswertungen/EinkaufTab';
import { EuerTab } from '../auswertungen/EuerTab';
import { EventsTab } from '../auswertungen/EventsTab';
import { GuvTab } from '../auswertungen/GuvTab';
import { UstTab } from '../auswertungen/UstTab';
import { ZurueckLink } from '../ZurueckLink';

const TABS = [
  { wert: 'events', label: 'Events', inhalt: <EventsTab /> },
  { wert: 'ust', label: 'Umsatzsteuer', inhalt: <UstTab /> },
  { wert: 'guv', label: 'G+V', inhalt: <GuvTab /> },
  { wert: 'euer', label: 'EÜR', inhalt: <EuerTab /> },
  { wert: 'einkauf', label: 'Einkauf', inhalt: <EinkaufTab /> },
] as const;

export type AuswertungTab = (typeof TABS)[number]['wert'];

/** Auswertungen of the Finanzen area; every tab is its own route and keeps its filters in the URL. */
export function FinanzenAuswertungenPage({ tab }: { tab: AuswertungTab }) {
  const aktiv = TABS.find((t) => t.wert === tab) ?? TABS[0];
  return (
    <Stack gap="md">
      <ZurueckLink to="/finanzen">Finanzen</ZurueckLink>
      <Title order={2}>Auswertungen</Title>
      <Group gap="xs" role="navigation" aria-label="Auswertungen">
        {TABS.map((t) => (
          <Button
            key={t.wert}
            component={Link}
            to={`/finanzen/auswertungen/${t.wert}`}
            variant={t.wert === aktiv.wert ? 'filled' : 'default'}
            aria-current={t.wert === aktiv.wert ? 'page' : undefined}
          >
            {t.label}
          </Button>
        ))}
      </Group>
      {aktiv.inhalt}
    </Stack>
  );
}
