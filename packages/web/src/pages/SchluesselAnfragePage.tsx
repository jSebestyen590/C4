import { Alert, Anchor, Button, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { zeitfensterAnzeigen, type AnfrageDto, type AntwortDto } from '@c4/shared';
import { useApi } from '../api';
import { AnfrageKarte, AntwortZeile } from '../SchluesselAnfragen';
import { useEigeneSub } from '../organisator';
import { schluesselInvalidieren, useAnfrage, useSchluesselListe } from '../schluesselDaten';
import { fehlerAnzeigen, pruefen } from '../warenApi';

function VorschlagZeile({
  anfrage,
  antwort,
  darfAnnehmen,
}: Readonly<{ anfrage: AnfrageDto; antwort: AntwortDto; darfAnnehmen: boolean }>) {
  const api = useApi();
  const qc = useQueryClient();
  const annehmen = async () => {
    try {
      await pruefen(
        await api.schluessel.anfragen[':id'].antworten[':antwortId'].annehmen.$post({
          param: { id: anfrage.id, antwortId: antwort.id },
        }),
      );
    } catch (err) {
      fehlerAnzeigen(err);
    } finally {
      await schluesselInvalidieren(qc);
    }
  };
  return (
    <Paper withBorder p="sm">
      <Stack gap="xs">
        <AntwortZeile antwort={antwort} />
        {darfAnnehmen && (
          <Button onClick={() => void annehmen()}>
            {antwort.zeitfenster
              ? `Annehmen: ${zeitfensterAnzeigen(antwort.zeitfenster)}`
              : 'Annehmen'}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

/** One request with all answers; the requester can accept a proposal or withdraw the request. */
export function SchluesselAnfragePage() {
  const { id } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const eigeneSub = useEigeneSub();
  const anfrage = useAnfrage(id);
  const schluessel = useSchluesselListe();

  const zurueck = (
    <Anchor component={Link} to="/schluessel" size="sm">
      ← Zurück zu den Schlüsseln
    </Anchor>
  );
  if (anfrage.isPending) return <Loader m="md" aria-label="Anfrage wird geladen" />;
  if (anfrage.isError) {
    return (
      <Stack maw={720}>
        {zurueck}
        <Alert color="red">Die Anfrage konnte nicht geladen werden.</Alert>
      </Stack>
    );
  }
  const a = anfrage.data;
  const meine = (schluessel.data ?? []).filter(
    (s) =>
      (s.halter?.art === 'mitglied' && s.halter.sub === eigeneSub) ||
      s.planungen.some((p) => p.an.sub === eigeneSub),
  );
  const istErsteller = a.ersteller.sub === eigeneSub;
  const rueckzug = async () => {
    try {
      await pruefen(await api.schluessel.anfragen[':id'].rueckzug.$put({ param: { id: a.id } }));
    } catch (err) {
      fehlerAnzeigen(err);
    } finally {
      await schluesselInvalidieren(qc);
    }
  };

  return (
    <Stack maw={720}>
      {zurueck}
      <Title order={2}>
        {a.art === 'bedarf' ? 'Schlüssel gesucht' : 'Schlüssel wird abgegeben'}
      </Title>
      <AnfrageKarte anfrage={a} eigeneSub={eigeneSub} meineSchluessel={meine} mitLink={false} />
      {istErsteller && a.status === 'offen' && (
        <Button variant="default" color="red" onClick={() => void rueckzug()}>
          Anfrage zurückziehen
        </Button>
      )}
      <Title order={3} mt="md">
        Antworten
      </Title>
      {a.antworten.length === 0 && <Text c="dimmed">Noch keine Antworten.</Text>}
      {a.antworten.map((w) =>
        w.art === 'gegenvorschlag' ? (
          <VorschlagZeile
            key={w.id}
            anfrage={a}
            antwort={w}
            darfAnnehmen={istErsteller && a.status === 'offen'}
          />
        ) : (
          <Paper key={w.id} withBorder p="sm">
            <AntwortZeile antwort={w} />
          </Paper>
        ),
      )}
      {a.status === 'vergeben' && (
        <Text size="sm" c="dimmed">
          Die Übergabe steht in der Planung des Schlüssels
          {a.schluessel ? ` „${a.schluessel.name}“` : ''}.
        </Text>
      )}
    </Stack>
  );
}
