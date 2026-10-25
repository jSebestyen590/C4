import { Anchor, Group, Stack, Tabs, Title } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IfcoTypenTab } from '../IfcoTypenTab';
import { KategorienTab } from '../KategorienTab';

/** Master data of the Inventar: Kategorien (tree) and IFCO types. */
export function InventarStammdatenPage() {
  const [tab, setTab] = useState<string | null>('kategorien');
  return (
    <Stack maw={900}>
      <Anchor component={Link} to="/inventar" size="sm">
        <Group gap={4} wrap="nowrap">
          <IconChevronLeft size={16} />
          Zurück zum Inventar
        </Group>
      </Anchor>
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
