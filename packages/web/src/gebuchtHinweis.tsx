import { Anchor, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { NavigateFunction } from 'react-router-dom';
import { detailPfad } from './finanzenDaten';

/** Success messages of Finanzen close by themselves after this many ms. */
export const HINWEIS_DAUER_MS = 5000;

/** Shows "Buchung Nr. X gebucht – ansehen"; closes after 5 s or when the link is clicked. */
export function zeigeGebucht(
  navigate: NavigateFunction,
  { id, seq, wiederholt }: Readonly<{ id: string; seq: number; wiederholt?: boolean }>,
) {
  const meldung = `gebucht-${id}`;
  notifications.show({
    id: meldung,
    color: 'green',
    autoClose: HINWEIS_DAUER_MS,
    message: (
      <Text size="sm">
        {wiederholt ? `Buchung Nr. ${seq} war schon gebucht – ` : `Buchung Nr. ${seq} gebucht – `}
        <Anchor
          href={`/app${detailPfad(id)}`}
          onClick={(e) => {
            e.preventDefault();
            notifications.hide(meldung);
            void navigate(detailPfad(id));
          }}
        >
          ansehen
        </Anchor>
      </Text>
    ),
  });
}
