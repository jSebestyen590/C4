import { Stack, Tabs, Title } from '@mantine/core';
import { useState } from 'react';
import { IfcoTypenTab } from '../IfcoTypenTab';
import { KategorienTab } from '../KategorienTab';
import { ZurueckLink } from '../ZurueckLink';

/** Master data of the Inventar: Kategorien (tree) and IFCO types. */
export function InventarStammdatenPage() {
  const [tab, setTab] = useState<string | null>('kategorien');
  return (
    <Stack maw={900}>
      <ZurueckLink to="/inventar">Zurück zum Inventar</ZurueckLink>
      <Title order={2}>Stammdaten</Title>
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List grow>
          <Tabs.Tab value="kategorien" py="sm">
            Kategorien
          </Tabs.Tab>
          <Tabs.Tab value="ifco-typen" py="sm">
            IFCO-Typen
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="kategorien" pt="md">
          <KategorienTab />
        </Tabs.Panel>
        <Tabs.Panel value="ifco-typen" pt="md">
          <IfcoTypenTab />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
