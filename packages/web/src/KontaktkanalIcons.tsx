import { ActionIcon, Button, Group, Text, ThemeIcon, Tooltip } from '@mantine/core';
import {
  IconAddressBook,
  IconBrandDiscord,
  IconBrandSignal,
  IconBrandTelegram,
  IconBrandWhatsapp,
  IconMail,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import {
  KONTAKTKANAELE,
  kontaktLink,
  vcardErstellen,
  type Kontaktkanal,
  type Mitglied,
} from '@c4/shared';
import { anzeigename } from './mitglied';
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
}: Readonly<{
  gewaehlt: readonly Kontaktkanal[];
  angaben: Kontaktangaben;
  /** Edge length of one icon button; keep >= 44 wherever the icons are tappable. */
  groesse?: number;
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

/** Loads the picture as base64 (no prefix); null when it cannot be fetched. */
async function bildAlsBase64(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binaer = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      binaer += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binaer);
  } catch {
    return null;
  }
}

/** Offers the member as a contact card (vCard): share sheet where available, else a download. */
export function KontaktSpeichernButton({ mitglied }: Readonly<{ mitglied: Mitglied }>) {
  // Preloaded so the click handler can share without awaiting (iOS expires the user activation).
  const foto = useQuery({
    queryKey: ['profilbild-base64', mitglied.profilbildUrl],
    queryFn: () => bildAlsBase64(mitglied.profilbildUrl),
    enabled: !!mitglied.profilbildUrl,
    staleTime: Infinity,
    retry: false,
  });

  const herunterladen = (datei: File) => {
    const url = URL.createObjectURL(datei);
    const a = document.createElement('a');
    a.href = url;
    a.download = datei.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const speichern = () => {
    const vcf = vcardErstellen({ ...mitglied, fotoBase64: foto.data ?? null });
    const dateiname = `${(anzeigename(mitglied) || 'kontakt').replace(/[\\/:*?"<>|]/g, '_')}.vcf`;
    const datei = new File([vcf], dateiname, { type: 'text/vcard' });
    if (navigator.canShare?.({ files: [datei] })) {
      navigator.share({ files: [datei] }).catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) herunterladen(datei);
      });
      return;
    }
    herunterladen(datei);
  };

  return (
    <Button
      size="md"
      variant="light"
      mih={44}
      leftSection={<IconAddressBook size={20} />}
      w={{ base: '100%', sm: 'auto' }}
      onClick={speichern}
    >
      Als Kontakt speichern
    </Button>
  );
}
