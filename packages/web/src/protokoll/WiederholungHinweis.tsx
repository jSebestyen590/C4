import { Alert } from '@mantine/core';
import { IconRepeat } from '@tabler/icons-react';
import type { Wiederholung } from '@c4/shared';
import { wiederholungText, type WiederholungArt } from './wiederholungText';

// Hint on a vote that repeats one of the previous Sitzung where it was not beschlussfähig
// (see docs/protokolle.md, "Vorbelegung eines neuen Protokolls").

export function WiederholungHinweis({
  art,
  wiederholung,
}: Readonly<{ art: WiederholungArt; wiederholung: Wiederholung | undefined }>) {
  if (!wiederholung) return null;
  return (
    <Alert
      color="orange"
      variant="light"
      p="xs"
      icon={<IconRepeat size={18} />}
      data-testid="wiederholung-hinweis"
    >
      {wiederholungText(art, wiederholung)}
    </Alert>
  );
}
