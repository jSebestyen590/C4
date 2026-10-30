import {
  Alert,
  Autocomplete,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { IconArrowsExchange, IconHandGrab, IconSend } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { uebergabeSchema, type Halter, type SchluesselDto } from '@c4/shared';
import { useApi } from './api';
import { useAuth } from './auth';
import { BestaetigenDialog } from './BestaetigenDialog';
import { mitgliedOptionen, useEigeneSub, useMitgliederListe } from './organisator';
import { alsHalter, HalterName, istHalter, schluesselInvalidieren } from './schluesselDaten';
import { fehlerText, pruefen } from './warenApi';

type Ziel = 'mitglied' | 'person' | 'niemand';

/** Records an Übergabe and refreshes every key query (also after a conflict, to show the new holder). */
function useUebergeben(schluessel: SchluesselDto) {
  const api = useApi();
  const qc = useQueryClient();
  return async (an: Halter) => {
    try {
      await pruefen(
        await api.schluessel[':id'].uebergaben.$post({
          param: { id: schluessel.id },
          json: { von: alsHalter(schluessel.halter), an },
        }),
      );
    } finally {
      await schluesselInvalidieren(qc);
    }
  };
}

/** Dialog to hand the key from its current holder to someone else. */
function UebergabeModal({
  schluessel,
  titel,
  personenVorschlaege,
  onClose,
}: Readonly<{
  schluessel: SchluesselDto;
  titel: string;
  personenVorschlaege: string[];
  onClose: () => void;
}>) {
  const darfVerwalten = useAuth().can('schluessel:verwalten');
  const mitglieder = useMitgliederListe();
  const uebergeben = useUebergeben(schluessel);
  const [ziel, setZiel] = useState<Ziel>('mitglied');
  const [sub, setSub] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const halterSub = schluessel.halter?.art === 'mitglied' ? schluessel.halter.sub : undefined;
  const optionen = mitgliedOptionen((mitglieder.data ?? []).filter((m) => m.sub !== halterSub));

  const onSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const an: Halter =
      ziel === 'niemand'
        ? null
        : ziel === 'mitglied'
          ? { art: 'mitglied', sub: sub ?? '' }
          : { art: 'person', name };
    const parsed = uebergabeSchema.safeParse({ von: alsHalter(schluessel.halter), an });
    if (!parsed.success) {
      return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    }
    setFehler(null);
    setLaeuft(true);
    try {
      await uebergeben(an);
      onClose();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={titel}>
      <form onSubmit={(e) => void onSubmit(e)}>
        <Stack>
          <Text>
            Von: <HalterName halter={schluessel.halter} />
          </Text>
          <SegmentedControl
            fullWidth
            size="md"
            value={ziel}
            onChange={(v) => setZiel(v as Ziel)}
            data={[
              { value: 'mitglied', label: 'Mitglied' },
              { value: 'person', label: 'Ohne App' },
              ...(darfVerwalten ? [{ value: 'niemand', label: 'Niemand' }] : []),
            ]}
          />
          {ziel === 'mitglied' && (
            <Select
              size="md"
              label="An"
              placeholder="Mitglied wählen"
              searchable
              data={optionen}
              value={sub}
              onChange={setSub}
              nothingFoundMessage="Kein Mitglied gefunden"
            />
          )}
          {ziel === 'person' && (
            <Autocomplete
              size="md"
              label="An"
              description="Für Personen, die die App nicht nutzen. Sie bekommen keine Nachricht."
              placeholder="Name"
              data={personenVorschlaege}
              value={name}
              onChange={setName}
            />
          )}
          {ziel === 'niemand' && (
            <Text size="sm" c="dimmed">
              Der Schlüssel ist danach bei niemandem, z. B. weil er hinterlegt ist.
            </Text>
          )}
          {fehler && <Alert color="red">{fehler}</Alert>}
          <Group grow preventGrowOverflow={false}>
            <Button variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" loading={laeuft}>
              Eintragen
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

/**
 * Buttons for one key: the holder hands it on, everyone else records receiving it or an Übergabe
 * between others.
 */
export function SchluesselAktionen({
  schluessel,
  personenVorschlaege = [],
}: Readonly<{ schluessel: SchluesselDto; personenVorschlaege?: string[] }>) {
  const eigeneSub = useEigeneSub();
  const uebergeben = useUebergeben(schluessel);
  const [dialog, setDialog] = useState<'weitergeben' | 'eintragen' | 'bekommen' | null>(null);
  if (schluessel.archiviert) return null;
  const meiner = istHalter(schluessel.halter, eigeneSub);

  return (
    <>
      <Group grow preventGrowOverflow={false} gap="xs">
        {meiner ? (
          <Button leftSection={<IconSend size={18} />} onClick={() => setDialog('weitergeben')}>
            Weitergeben
          </Button>
        ) : (
          <Button
            leftSection={<IconHandGrab size={18} />}
            onClick={() => setDialog('bekommen')}
            disabled={!eigeneSub}
          >
            Habe ich bekommen
          </Button>
        )}
        {!meiner && (
          <Button
            variant="default"
            leftSection={<IconArrowsExchange size={18} />}
            onClick={() => setDialog('eintragen')}
          >
            Übergabe eintragen
          </Button>
        )}
      </Group>
      {(dialog === 'weitergeben' || dialog === 'eintragen') && (
        <UebergabeModal
          schluessel={schluessel}
          titel={dialog === 'weitergeben' ? 'Schlüssel weitergeben' : 'Übergabe eintragen'}
          personenVorschlaege={personenVorschlaege}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'bekommen' && eigeneSub && (
        <BestaetigenDialog
          titel="Schlüssel bekommen"
          bestaetigenText="Habe ich bekommen"
          color="blue"
          onClose={() => setDialog(null)}
          onBestaetigt={() => uebergeben({ art: 'mitglied', sub: eigeneSub })}
        >
          {schluessel.halter ? (
            <Text>
              Du hast „{schluessel.name}“ von <HalterName halter={schluessel.halter} /> bekommen?
            </Text>
          ) : (
            <Text>Du hast „{schluessel.name}“ jetzt?</Text>
          )}
        </BestaetigenDialog>
      )}
    </>
  );
}
