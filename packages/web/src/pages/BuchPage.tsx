import { Alert, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { centAnzeigen } from '@c4/shared';
import { BuchInhaber, BuchSaldo, useBuchMeine } from '../buchDaten';
import { BuchRangliste } from '../BuchRangliste';
import { BuchVerlauf } from '../BuchVerlauf';
import { HILFE } from '../finanzenHilfe';
import { InfoHinweis } from '../InfoHinweis';

/** The caller's own Buch page with balance and Verlauf, plus the Rangliste. Mobile first. */
export function BuchPage() {
  const meine = useBuchMeine();
  return (
    <Stack maw={720}>
      <Title order={2}>Buch</Title>
      {meine.isPending && <Loader m="md" aria-label="Dein Buch wird geladen" />}
      {meine.isError && <Alert color="red">Dein Buch konnte nicht geladen werden.</Alert>}
      {meine.data && meine.data.seiten.length === 0 && (
        <Paper withBorder p="md">
          <Text>
            Du hast noch keine Buchseite. Wende dich an die Finanzen, wenn du eine haben möchtest.
          </Text>
        </Paper>
      )}
      {meine.data?.seiten.map((s) => (
        <Stack key={s.id} gap="md">
          <Paper withBorder p="md" radius="md">
            <Stack gap={4}>
              <Text c="dimmed">Seite {s.nummer}</Text>
              <Group gap={2} align="center">
                <Text size="sm" c="dimmed">
                  Dein Saldo
                </Text>
                <InfoHinweis feld="Saldo" text={HILFE.buch.saldo} />
              </Group>
              <Text fz={36} lh={1.1}>
                <BuchSaldo cent={s.saldoCent} maxUeberzugCent={s.tarif?.maxUeberzugCent} />
              </Text>
              <Text size="sm" c="dimmed">
                <BuchInhaber seite={s} verlinken={false} />
                {s.tarif
                  ? ` · Strich ${centAnzeigen(s.tarif.strichwertCent)} · Überzug bis ${centAnzeigen(s.tarif.maxUeberzugCent)}`
                  : ' · Noch kein Tarif hinterlegt'}
              </Text>
            </Stack>
          </Paper>
          <Title order={3}>Verlauf</Title>
          <BuchVerlauf eintraege={s.verlauf} />
        </Stack>
      ))}
      <BuchRangliste />
    </Stack>
  );
}
