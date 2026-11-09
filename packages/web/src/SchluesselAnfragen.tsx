import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  anfrageAnlegenSchema,
  zeitfensterAnzeigen,
  type AnfrageDto,
  type AntwortDto,
  type SchluesselDto,
} from '@c4/shared';
import { useApi } from './api';
import { anfrageLink, HalterName, schluesselInvalidieren } from './schluesselDaten';
import {
  leeresZeitfenster,
  zeitfensterBody,
  ZeitfensterFelder,
  type ZeitfensterWerte,
} from './ZeitfensterFelder';
import { fehlerAnzeigen, fehlerText, pruefen } from './warenApi';

/** Value of the "irgendeiner" option of a Bedarf (a Select cannot hold an empty value). */
const IRGENDEINER = '__irgendeiner__';

const schluesselOptionen = (liste: SchluesselDto[]) =>
  liste.map((s) => ({ value: s.id, label: s.name }));

/** Dialog to ask for a key (Bedarf) or to offer one for takeover (Abgabe). */
export function AnfrageFormular({
  art,
  schluessel,
  onClose,
}: Readonly<{
  art: 'bedarf' | 'abgabe';
  /** Bedarf: all keys; Abgabe: the keys the member holds or is designated for. */
  schluessel: SchluesselDto[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [schluesselId, setSchluesselId] = useState<string>(
    art === 'abgabe' ? (schluessel[0]?.id ?? '') : IRGENDEINER,
  );
  const [zeit, setZeit] = useState<ZeitfensterWerte>(leeresZeitfenster);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const onSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = {
      art,
      schluesselId: schluesselId === IRGENDEINER ? null : schluesselId,
      ...zeitfensterBody(zeit),
    };
    const parsed = anfrageAnlegenSchema.safeParse(body);
    if (!parsed.success) {
      return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    }
    setFehler(null);
    setLaeuft(true);
    try {
      await pruefen(await api.schluessel.anfragen.$post({ json: body }));
      await schluesselInvalidieren(qc);
      onClose();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={art === 'bedarf' ? 'Brauche einen Schlüssel' : 'Schlüssel abgeben'}
    >
      <form onSubmit={(e) => void onSubmit(e)}>
        <Stack>
          <Select
            size="md"
            label={art === 'bedarf' ? 'Welcher Schlüssel?' : 'Welchen Schlüssel gibst du ab?'}
            allowDeselect={false}
            data={[
              ...(art === 'bedarf' ? [{ value: IRGENDEINER, label: 'Irgendeiner' }] : []),
              ...schluesselOptionen(schluessel),
            ]}
            value={schluesselId}
            onChange={(v) => setSchluesselId(v ?? '')}
          />
          <Text size="sm" c="dimmed">
            {art === 'bedarf'
              ? 'Wann brauchst du ihn? Wer den Schlüssel hat oder bekommen soll, wird gefragt.'
              : 'Bis wann soll er weg sein? Alle aus dem Wohnheim werden gefragt.'}
          </Text>
          <ZeitfensterFelder werte={zeit} onChange={setZeit} />
          {fehler && <Alert color="red">{fehler}</Alert>}
          <Group grow preventGrowOverflow={false}>
            <Button variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" loading={laeuft}>
              Anfragen
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

/** Sends an answer and refreshes all key queries (also after a conflict, e.g. already assigned). */
export function useAntworten(anfrageId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return async (json: {
    art: 'zusage' | 'ablehnung' | 'gegenvorschlag';
    schluesselId?: string | null;
    datum?: string | null;
    ab?: string | null;
    bis?: string | null;
    notiz?: string | null;
  }) => {
    try {
      await pruefen(
        await api.schluessel.anfragen[':id'].antwort.$put({ param: { id: anfrageId }, json }),
      );
    } finally {
      await schluesselInvalidieren(qc);
    }
  };
}

/** Dialog for a Gegenvorschlag, or for a Zusage that has to name the key. */
function AntwortModal({
  anfrage,
  modus,
  meineSchluessel,
  onClose,
}: Readonly<{
  anfrage: AnfrageDto;
  modus: 'zusage' | 'gegenvorschlag';
  meineSchluessel: SchluesselDto[];
  onClose: () => void;
}>) {
  const antworten = useAntworten(anfrage.id);
  const braucheSchluessel = anfrage.art === 'bedarf' && !anfrage.schluessel;
  const [schluesselId, setSchluesselId] = useState<string | null>(meineSchluessel[0]?.id ?? null);
  const [zeit, setZeit] = useState<ZeitfensterWerte>(() => ({
    ...leeresZeitfenster(),
    datum: anfrage.zeitfenster.datum,
  }));
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const onSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (braucheSchluessel && !schluesselId) {
      return setFehler('Bitte wähle den Schlüssel, den du gibst.');
    }
    setFehler(null);
    setLaeuft(true);
    try {
      await antworten(
        modus === 'zusage'
          ? { art: 'zusage', schluesselId }
          : { art: 'gegenvorschlag', schluesselId, ...zeitfensterBody(zeit) },
      );
      onClose();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={modus === 'zusage' ? 'Zusagen' : 'Anderen Zeitpunkt vorschlagen'}
    >
      <form onSubmit={(e) => void onSubmit(e)}>
        <Stack>
          {braucheSchluessel && (
            <Select
              size="md"
              label="Welchen Schlüssel gibst du?"
              allowDeselect={false}
              data={schluesselOptionen(meineSchluessel)}
              value={schluesselId}
              onChange={setSchluesselId}
            />
          )}
          {modus === 'gegenvorschlag' && (
            <ZeitfensterFelder werte={zeit} onChange={setZeit} notizLabel="Nachricht (optional)" />
          )}
          {fehler && <Alert color="red">{fehler}</Alert>}
          <Group grow preventGrowOverflow={false}>
            <Button variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" loading={laeuft}>
              {modus === 'zusage' ? 'Zusagen' : 'Vorschlagen'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

const STATUS_BADGE: Record<
  Exclude<AnfrageDto['status'], 'offen'>,
  { label: string; color: string }
> = {
  vergeben: { label: 'Vergeben', color: 'green' },
  zurueckgezogen: { label: 'Zurückgezogen', color: 'gray' },
  abgelaufen: { label: 'Abgelaufen', color: 'gray' },
};

/** "braucht den Schlüssel „X“" / "gibt „X“ ab" as the part after the requester's name. */
export const anfrageSatz = (a: Pick<AnfrageDto, 'art' | 'schluessel'>) =>
  a.art === 'bedarf'
    ? a.schluessel
      ? `braucht den Schlüssel „${a.schluessel.name}“`
      : 'braucht einen Schlüssel'
    : `möchte „${a.schluessel?.name ?? 'einen Schlüssel'}“ abgeben`;

export function AntwortZeile({ antwort }: Readonly<{ antwort: AntwortDto }>) {
  const text =
    antwort.art === 'zusage'
      ? 'hat zugesagt'
      : antwort.art === 'ablehnung'
        ? 'kann nicht'
        : `schlägt ${antwort.zeitfenster ? zeitfensterAnzeigen(antwort.zeitfenster) : 'einen anderen Zeitpunkt'} vor`;
  return (
    <Text size="sm">
      <HalterName halter={antwort.mitglied} /> {text}
      {antwort.schluessel && ` (Schlüssel „${antwort.schluessel.name}“)`}
      {antwort.notiz && <Text span c="dimmed">{` · ${antwort.notiz}`}</Text>}
    </Text>
  );
}

/** One request as a card: who needs / offers what and when, with the answer buttons for those asked. */
export function AnfrageKarte({
  anfrage,
  eigeneSub,
  meineSchluessel,
  mitLink = true,
}: Readonly<{
  anfrage: AnfrageDto;
  eigeneSub: string | undefined;
  /** Keys the viewer holds or is designated for (offered for a Bedarf of "irgendeiner"). */
  meineSchluessel: SchluesselDto[];
  mitLink?: boolean;
}>) {
  const antworten = useAntworten(anfrage.id);
  const [dialog, setDialog] = useState<'zusage' | 'gegenvorschlag' | null>(null);
  const meine = anfrage.antworten.find(
    (a) => a.mitglied.art === 'mitglied' && a.mitglied.sub === eigeneSub,
  );
  const badge = anfrage.status === 'offen' ? null : STATUS_BADGE[anfrage.status];
  const braucheSchluessel = anfrage.art === 'bedarf' && !anfrage.schluessel;

  const direkt = async (art: 'zusage' | 'ablehnung') => {
    try {
      await antworten({ art });
    } catch (err) {
      fehlerAnzeigen(err);
    }
  };

  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <Group gap="xs" justify="space-between" wrap="nowrap" align="flex-start">
          <Text style={{ overflowWrap: 'anywhere' }}>
            <HalterName halter={anfrage.ersteller} /> {anfrageSatz(anfrage)}
          </Text>
          {badge && (
            <Badge color={badge.color} variant="light">
              {badge.label}
            </Badge>
          )}
        </Group>
        <Text fw={600}>{zeitfensterAnzeigen(anfrage.zeitfenster)}</Text>
        {anfrage.zeitfenster.notiz && (
          <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {anfrage.zeitfenster.notiz}
          </Text>
        )}
        {meine && anfrage.status === 'offen' && (
          <Text size="sm" c="dimmed">
            Deine Antwort:{' '}
            {meine.art === 'ablehnung' ? 'kann nicht' : 'anderer Zeitpunkt vorgeschlagen'}
          </Text>
        )}
        {anfrage.darfAntworten && (
          <Group grow preventGrowOverflow={false} gap="xs">
            <Button
              onClick={() => (braucheSchluessel ? setDialog('zusage') : void direkt('zusage'))}
            >
              Zusagen
            </Button>
            <Button variant="default" onClick={() => setDialog('gegenvorschlag')}>
              Anderer Zeitpunkt
            </Button>
            <Button variant="default" color="red" onClick={() => void direkt('ablehnung')}>
              Ablehnen
            </Button>
          </Group>
        )}
        {mitLink && (
          <Anchor component={Link} to={anfrageLink(anfrage.id)} size="sm">
            Details und Antworten
          </Anchor>
        )}
      </Stack>
      {dialog && (
        <AntwortModal
          anfrage={anfrage}
          modus={dialog}
          meineSchluessel={meineSchluessel}
          onClose={() => setDialog(null)}
        />
      )}
    </Paper>
  );
}
