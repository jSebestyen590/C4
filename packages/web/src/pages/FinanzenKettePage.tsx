import { Group, Alert, Button, List, Loader, Stack, Text, Title } from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { KETTEN_FEHLER_LABELS, type KettenErgebnisDto } from '@c4/shared';
import { formatDatumZeit } from '../datum';
import { useApi } from '../api';
import { fehlerText, pruefen } from '../warenApi';
import { HashAnzeige } from '../HashAnzeige';
import { ZurueckLink } from '../ZurueckLink';
import { InfoHinweis } from '../InfoHinweis';
import { HILFE } from '../finanzenHilfe';

const zeitText = (iso: string) => formatDatumZeit(iso, 'mittelSekunden');

/** Verifies the whole hash chain of the journal and shows the result. */
export function FinanzenKettePage() {
  const api = useApi();
  const pruefung = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (): Promise<KettenErgebnisDto> => {
      const res = await api.finanzen.kette.$get();
      await pruefen(res);
      return (await res.json()) as KettenErgebnisDto;
    },
  });
  const e = pruefung.data;

  return (
    <Stack maw={900}>
      <ZurueckLink to="/finanzen">Finanzen</ZurueckLink>
      <Group gap={4}>
        <Title order={2}>Kette prüfen</Title>
        <InfoHinweis feld="Kette prüfen" text={HILFE.kette.ergebnis} />
      </Group>
      <Text c="dimmed">
        Prüft alle Buchungen: lückenlose Nummern, Verweise auf die vorige Buchung, Hashes, Summen
        und den Zähler.
      </Text>
      <Button
        leftSection={<IconShieldCheck size={18} />}
        loading={pruefung.isPending}
        onClick={() => pruefung.mutate()}
      >
        Kette prüfen
      </Button>
      {pruefung.isPending && <Loader m="md" aria-label="Kette wird geprüft" />}
      {pruefung.isError && (
        <Alert color="red">{fehlerText(pruefung.error, 'Die Prüfung ist fehlgeschlagen.')}</Alert>
      )}
      {e && (
        <Stack>
          {e.ok ? (
            <Alert color="green" title="Kette intakt">
              Alle {e.anzahl} Buchungen sind unverändert.
            </Alert>
          ) : (
            <Alert color="red" title="Kette fehlerhaft">
              {e.fehler.length > 0 && (
                <List size="sm" spacing={4}>
                  {e.fehler.map((f) => (
                    <List.Item key={`${f.seq}-${f.art}`}>
                      Nr. {f.seq}: {KETTEN_FEHLER_LABELS[f.art]}
                    </List.Item>
                  ))}
                </List>
              )}
              {!e.zaehlerPasst && (
                <Text size="sm">Der Zähler passt nicht zur letzten Buchung.</Text>
              )}
            </Alert>
          )}
          <Text>Anzahl Buchungen: {e.anzahl}</Text>
          <Text>Letzte Nr.: {e.letzteSeq}</Text>
          <Text>Zähler passt: {e.zaehlerPasst ? 'ja' : 'nein'}</Text>
          <HashAnzeige label="Kopf-Hash" wert={e.kopfHash} />
          <Text size="sm" c="dimmed">
            Geprüft am {zeitText(e.geprueftAm)}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
