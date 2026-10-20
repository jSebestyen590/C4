import { Anchor, Group, Stack, Tabs, Title } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { KategorienTab } from '../KategorienTab';

/** Master data of the Inventar: Kategorien (tree). */
export function InventarStammdatenPage() {
  return (
    <Stack maw={900}>
      <Anchor component={Link} to="/inventar" size="sm">
        <Group gap={4} wrap="nowrap">
          <IconChevronLeft size={16} />
          Zurück zum Inventar
        </Group>
      </Anchor>
      <Title order={2}>Stammdaten</Title>
      <Tabs value="kategorien" keepMounted={false}>
        <Tabs.List grow>
          <Tabs.Tab value="kategorien" py="sm">
            Kategorien
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="kategorien" pt="md">
          <KategorienTab />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
