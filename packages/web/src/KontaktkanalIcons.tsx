import { ActionIcon, Button, Group, Text, ThemeIcon, Tooltip } from '@mantine/core';
import {
  IconAddressBook,
  IconBrandDiscord,
  IconBrandSignal,
  IconBrandTelegram,
  IconBrandWhatsapp,
  IconMail,
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { KONTAKTKANAELE, kontaktLink, type Kontaktkanal } from '@c4/shared';
import { KONTAKTKANAL_LABELS } from './i18n';

const ICONS: Record<Kontaktkanal, ComponentType<{ size?: number }>> = {
  whatsapp: IconBrandWhatsapp,
  telegram: IconBrandTelegram,
  signal: IconBrandSignal,
  discord: IconBrandDiscord,
  mail: IconMail,
};

/** What is needed to build the links of the channels. */
export interface Kontaktangaben {
  telefon: string | null;
  email: string | null;
  discordName: string | null;
}

/**
 * All channels as icons; the ones the member did not choose are grayed out. Chosen channels with
 * enough details link to the app (WhatsApp, Signal and Telegram by phone number, mail by address).
 */
export function KontaktkanalIcons({
  gewaehlt,
  angaben,
  groesse = 44,
  vcardHref,
}: Readonly<{
  gewaehlt: readonly Kontaktkanal[];
  angaben: Kontaktangaben;
  /** Edge length of one icon button; keep >= 44 wherever the icons are tappable. */
  groesse?: number;
  /** Link to the contact card; adds an "Als Kontakt speichern" icon after the channels. */
  vcardHref?: string;
}>) {
  return (
    <Group gap={4} wrap="nowrap">
      {KONTAKTKANAELE.map((kanal) => {
        const aktiv = gewaehlt.includes(kanal);
        const Icon = ICONS[kanal];
        const name = KONTAKTKANAL_LABELS[kanal];
        const link = aktiv ? kontaktLink(kanal, angaben) : null;
        const zusatz =
          kanal === 'discord' && aktiv && angaben.discordName ? ` (${angaben.discordName})` : '';
        const icon = <Icon size={Math.round(groesse * 0.6)} />;
        if (link)
          return (
            <ActionIcon
              key={kanal}
              component="a"
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              variant="subtle"
              color="blue"
              size={groesse}
              aria-label={`${name} öffnen`}
              title={`${name} öffnen`}
            >
              {icon}
            </ActionIcon>
          );
        return (
          <ThemeIcon
            key={kanal}
            variant="transparent"
            color={aktiv ? 'blue' : 'gray'}
            size={groesse}
            style={{ opacity: aktiv ? 1 : 0.35 }}
            role="img"
            aria-label={`${name}${zusatz}: ${aktiv ? 'bevorzugt' : 'nicht angegeben'}`}
            title={`${name}${zusatz}`}
          >
            {icon}
          </ThemeIcon>
        );
      })}
      {vcardHref && (
        <ActionIcon
          component="a"
          href={vcardHref}
          variant="subtle"
          color="blue"
          size={groesse}
          aria-label="Als Kontakt speichern"
          title="Als Kontakt speichern"
        >
          <IconAddressBook size={Math.round(groesse * 0.6)} />
        </ActionIcon>
      )}
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

/** Opens the contact card of a member (vCard from the API) so the phone offers "new contact". */
export function KontaktSpeichernButton({ href }: Readonly<{ href: string | undefined }>) {
  return (
    <Button
      component="a"
      href={href}
      size="md"
      variant="light"
      mih={44}
      leftSection={<IconAddressBook size={20} />}
      w={{ base: '100%', sm: 'auto' }}
      disabled={!href}
    >
      Als Kontakt speichern
    </Button>
  );
}
