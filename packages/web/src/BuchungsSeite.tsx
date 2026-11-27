import { Alert, Loader, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { ZurueckLink } from './ZurueckLink';

/** Frame of the booking pages: heading, hint, and the loading / error / empty states. */
export function BuchungsSeite({
  titel,
  hinweis,
  laedt,
  fehler,
  leer,
  children,
}: Readonly<{
  titel: string;
  hinweis: string;
  laedt: boolean;
  fehler: boolean;
  /** Message shown instead of the content (e.g. nothing in stock). */
  leer?: string;
  children: ReactNode;
}>) {
  if (fehler)
    return (
      <Alert m="md" color="red">
        Die Daten konnten nicht geladen werden.
      </Alert>
    );
  if (laedt) return <Loader m="md" aria-label="Lädt" />;
  return (
    <Stack gap={0} mih="calc(100dvh - 60px)">
      <Stack gap={2} pb="xs">
        <Text fw={700} size="lg" style={{ overflowWrap: 'anywhere' }}>
          {titel}
        </Text>
        <Text size="sm" c="dimmed">
          {hinweis}
        </Text>
      </Stack>
      {leer ? (
        <Stack align="flex-start">
          <Text c="dimmed">{leer}</Text>
          <ZurueckLink to="/lager">Zurück zu den Lagerorten</ZurueckLink>
        </Stack>
      ) : (
        children
      )}
    </Stack>
  );
}
