import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconArrowRight, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import {
  planungSchema,
  zeitfensterAnzeigen,
  type PlanungDto,
  type SchluesselDetailDto,
} from '@c4/shared';
import { useApi } from './api';
import { BestaetigenDialog } from './BestaetigenDialog';
import { mitgliedOptionen, useMitgliederListe } from './organisator';
import { HalterName, schluesselInvalidieren } from './schluesselDaten';
import {
  leeresZeitfenster,
  zeitfensterBody,
  ZeitfensterFelder,
  zeitfensterWerte,
  type ZeitfensterWerte,
} from './ZeitfensterFelder';
import { fehlerText, pruefen } from './warenApi';

/** Dialog to plan (or change) a handover to a member. */
function PlanungModal({
  schluessel,
  planung,
  onClose,
}: Readonly<{ schluessel: SchluesselDetailDto; planung?: PlanungDto; onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const mitglieder = useMitgliederListe();
  const [anSub, setAnSub] = useState<string | null>(planung?.an.sub ?? null);
  const [zeit, setZeit] = useState<ZeitfensterWerte>(() =>
    planung ? zeitfensterWerte(planung.zeitfenster) : leeresZeitfenster(),
  );
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const halterSub = schluessel.halter?.art === 'mitglied' ? schluessel.halter.sub : undefined;
  const optionen = mitgliedOptionen((mitglieder.data ?? []).filter((m) => m.sub !== halterSub));

  const onSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const json = { anSub: anSub ?? '', ...zeitfensterBody(zeit) };
    const parsed = planungSchema.safeParse(json);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    setLaeuft(true);
    try {
      await pruefen(
        planung
          ? await api.schluessel.planungen[':id'].$put({ param: { id: planung.id }, json })
          : await api.schluessel[':id'].planungen.$post({ param: { id: schluessel.id }, json }),
      );
      await schluesselInvalidieren(qc);
      onClose();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={planung ? 'Übergabe ändern' : 'Übergabe planen'}>
      <form onSubmit={(e) => void onSubmit(e)}>
        <Stack>
          <Select
            size="md"
            label="An"
            placeholder="Mitglied wählen"
            searchable
            data={optionen}
            value={anSub}
            onChange={setAnSub}
            nothingFoundMessage="Kein Mitglied gefunden"
          />
          <ZeitfensterFelder werte={zeit} onChange={setZeit} />
          {fehler && <Alert color="red">{fehler}</Alert>}
          <Group grow preventGrowOverflow={false}>
            <Button variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" loading={laeuft}>
              Speichern
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

/** Planned handovers of a key as a chain: Jetzt: A → B (heute ab 18:00) → C (morgen). */
export function SchluesselPlanungen({ schluessel }: Readonly<{ schluessel: SchluesselDetailDto }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<'neu' | PlanungDto | null>(null);
  const [loeschen, setLoeschen] = useState<PlanungDto | null>(null);

  return (
    <Stack gap="xs">
      <Title order={3} mt="md">
        Geplante Übergaben
      </Title>
      <Paper withBorder p="sm">
        <Stack gap="xs">
          <Text size="sm">
            Jetzt: <HalterName halter={schluessel.halter} />
          </Text>
          {schluessel.planungen.map((p) => (
            <Group key={p.id} gap="xs" wrap="nowrap" align="flex-start">
              <IconArrowRight
                size={18}
                style={{ flexShrink: 0, marginTop: 4 }}
                aria-label="danach"
              />
              <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                <Text>
                  <HalterName halter={p.an} />
                </Text>
                <Text size="sm" c="dimmed">
                  {zeitfensterAnzeigen(p.zeitfenster)}
                  {p.zeitfenster.notiz && ` · ${p.zeitfenster.notiz}`}
                </Text>
              </Stack>
              <ActionIcon
                variant="subtle"
                color="gray"
                size={44}
                aria-label="Übergabe ändern"
                onClick={() => setDialog(p)}
              >
                <IconPencil size={18} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                size={44}
                aria-label="Übergabe löschen"
                onClick={() => setLoeschen(p)}
              >
                <IconTrash size={18} />
              </ActionIcon>
            </Group>
          ))}
          {schluessel.planungen.length === 0 && (
            <Text size="sm" c="dimmed">
              Noch nichts geplant.
            </Text>
          )}
        </Stack>
      </Paper>
      {!schluessel.archiviert && (
        <Button
          variant="default"
          leftSection={<IconPlus size={18} />}
          onClick={() => setDialog('neu')}
        >
          Übergabe planen
        </Button>
      )}
      {dialog && (
        <PlanungModal
          schluessel={schluessel}
          planung={dialog === 'neu' ? undefined : dialog}
          onClose={() => setDialog(null)}
        />
      )}
      {loeschen && (
        <BestaetigenDialog
          titel="Übergabe löschen"
          bestaetigenText="Löschen"
          onClose={() => setLoeschen(null)}
          onBestaetigt={async () => {
            await pruefen(
              await api.schluessel.planungen[':id'].$delete({ param: { id: loeschen.id } }),
            );
            await schluesselInvalidieren(qc);
          }}
        >
          <Text>
            Die geplante Übergabe an <HalterName halter={loeschen.an} /> (
            {zeitfensterAnzeigen(loeschen.zeitfenster)}) wird gelöscht. Wer davon betroffen ist,
            wird benachrichtigt.
          </Text>
        </BestaetigenDialog>
      )}
    </Stack>
  );
}
