import { Anchor, Group, Select, Stack, Tabs, Title } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DienstformenTab, EventKategorienTab, ExterneTab } from '../KalenderStammdatenTabs';
import { ErinnerungenTab } from '../ErinnerungenTab';
import { SerienTab } from '../SerienTab';
import { VorlagenTab } from '../VorlagenTab';

const TABS = [
  { value: 'dienstformen', label: 'Dienstformen' },
  { value: 'kategorien', label: 'Kategorien' },
  { value: 'vorlagen', label: 'Vorlagen' },
  { value: 'serien', label: 'Serien' },
  { value: 'externe', label: 'Externe' },
  { value: 'erinnerungen', label: 'Erinnerungen' },
];

/** Master data of the calendar: Dienstformen, Kategorien, Vorlagen, Serien, Externe and Erinnerungen. */
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
        <Select
          hiddenFrom="sm"
          aria-label="Bereich"
          allowDeselect={false}
          data={TABS}
          value={tab}
          onChange={setTab}
        />
        <Tabs.List grow visibleFrom="sm">
          {TABS.map((t) => (
            <Tabs.Tab key={t.value} value={t.value} py="sm" px="xs">
              {t.label}
            </Tabs.Tab>
          ))}
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
        <Tabs.Panel value="serien" pt="md">
          <SerienTab />
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
