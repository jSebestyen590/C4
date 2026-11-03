import { Stack, Tabs, Title } from '@mantine/core';
import { useState } from 'react';
import { GebindeTab } from '../GebindeTab';
import { WarengruppenTab } from '../WarengruppenTab';
import { ZurueckLink } from '../ZurueckLink';

/** Master data of the Lager: Warengruppen (tree) and Gebinde. */
export function StammdatenPage() {
  const [tab, setTab] = useState<string | null>('warengruppen');
  return (
    <Stack maw={900}>
      <ZurueckLink to="/lager">Zurück zum Lager</ZurueckLink>
      <Title order={2}>Stammdaten</Title>
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List grow>
          <Tabs.Tab value="warengruppen" py="sm">
            Warengruppen
          </Tabs.Tab>
          <Tabs.Tab value="gebinde" py="sm">
            Gebinde
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="warengruppen" pt="md">
          <WarengruppenTab />
        </Tabs.Panel>
        <Tabs.Panel value="gebinde" pt="md">
          <GebindeTab />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
