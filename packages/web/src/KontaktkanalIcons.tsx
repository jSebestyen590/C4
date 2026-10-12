import { ActionIcon, Group, Text, ThemeIcon, Tooltip } from '@mantine/core';
import {
  IconBrandDiscord,
  IconBrandSignal,
  IconBrandTelegram,
  IconBrandWhatsapp,
  IconMail,
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { KONTAKTKANAELE, type Kontaktkanal } from '@c4/shared';
import { KONTAKTKANAL_LABELS } from './i18n';

const ICONS: Record<Kontaktkanal, ComponentType<{ size?: number }>> = {
  whatsapp: IconBrandWhatsapp,
  telegram: IconBrandTelegram,
  signal: IconBrandSignal,
  discord: IconBrandDiscord,
  mail: IconMail,
};

/** All channels as icons; the ones the member did not choose are grayed out. */
export function KontaktkanalIcons({
  gewaehlt,
  size = 28,
}: Readonly<{ gewaehlt: readonly Kontaktkanal[]; size?: number }>) {
  return (
    <Group gap="xs" wrap="nowrap">
      {KONTAKTKANAELE.map((kanal) => {
        const aktiv = gewaehlt.includes(kanal);
        const Icon = ICONS[kanal];
        return (
          <ThemeIcon
            key={kanal}
            variant="transparent"
            color={aktiv ? 'blue' : 'gray'}
            size={size}
            style={{ opacity: aktiv ? 1 : 0.35 }}
            role="img"
            aria-label={`${KONTAKTKANAL_LABELS[kanal]}: ${aktiv ? 'bevorzugt' : 'nicht angegeben'}`}
            title={KONTAKTKANAL_LABELS[kanal]}
          >
            <Icon size={size} />
          </ThemeIcon>
        );
      })}
    </Group>
  );
}

/** Toggle buttons to choose the channels in the profile form. */
export function KontaktkanalAuswahl({
  gewaehlt,
  onChange,
}: Readonly<{ gewaehlt: readonly Kontaktkanal[]; onChange: (neu: Kontaktkanal[]) => void }>) {
  return (
    <div>
      <Text size="sm" fw={500} id="kontaktkanaele-label">
        Am besten erreichbar über
      </Text>
      <Text size="xs" c="dimmed" mb={6}>
        Tippe auf die Kanäle, über die du am liebsten kontaktiert wirst.
      </Text>
      <Group gap="xs" role="group" aria-labelledby="kontaktkanaele-label">
        {KONTAKTKANAELE.map((kanal) => {
          const aktiv = gewaehlt.includes(kanal);
          const Icon = ICONS[kanal];
          return (
            <Tooltip key={kanal} label={KONTAKTKANAL_LABELS[kanal]}>
              <ActionIcon
                size={48}
                radius="md"
                variant={aktiv ? 'light' : 'default'}
                color={aktiv ? 'blue' : 'gray'}
                aria-pressed={aktiv}
                aria-label={KONTAKTKANAL_LABELS[kanal]}
                style={{ opacity: aktiv ? 1 : 0.5 }}
                onClick={() =>
                  onChange(
                    KONTAKTKANAELE.filter((k) => (k === kanal ? !aktiv : gewaehlt.includes(k))),
                  )
                }
              >
                <Icon size={26} />
              </ActionIcon>
            </Tooltip>
          );
        })}
      </Group>
    </div>
  );
}
