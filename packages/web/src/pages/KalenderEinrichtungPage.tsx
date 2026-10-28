import { Anchor, Group, Stack, Tabs, Title } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DienstformenTab, EventKategorienTab, ExterneTab } from '../KalenderStammdatenTabs';
import { ErinnerungenTab } from '../ErinnerungenTab';
import { VorlagenTab } from '../VorlagenTab';

/** Master data of the calendar: Dienstformen, Kategorien, Vorlagen and Externe. */
export function KalenderEinrichtungPage() {
  const [tab, setTab] = useState<string | null>('dienstformen');
  return (
    <Stack maw={900}>
      <Anchor component={Link} to="/kalender" size="sm">
        <Group gap={4} wrap="nowrap">
          <IconChevronLeft size={16} />
          Zurück zum Kalender
        </Group>
      </Anchor>
      <Title order={2}>Kalender einrichten</Title>
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List grow>
          <Tabs.Tab value="dienstformen" py="sm" px="xs">
            Dienstformen
          </Tabs.Tab>
          <Tabs.Tab value="kategorien" py="sm" px="xs">
            Kategorien
          </Tabs.Tab>
          <Tabs.Tab value="vorlagen" py="sm" px="xs">
            Vorlagen
          </Tabs.Tab>
          <Tabs.Tab value="externe" py="sm" px="xs">
            Externe
          </Tabs.Tab>
          <Tabs.Tab value="erinnerungen" py="sm" px="xs">
            Erinnerungen
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="dienstformen" pt="md">
          <DienstformenTab />
        </Tabs.Panel>
        <Tabs.Panel value="kategorien" pt="md">
          <EventKategorienTab />
        </Tabs.Panel>
        <Tabs.Panel value="vorlagen" pt="md">
          <VorlagenTab />
        </Tabs.Panel>
        <Tabs.Panel value="externe" pt="md">
          <ExterneTab />
        </Tabs.Panel>
        <Tabs.Panel value="erinnerungen" pt="md">
          <ErinnerungenTab />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
