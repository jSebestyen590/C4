import { Alert, Badge, Button, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { IconArchive, IconArchiveOff, IconArrowRight, IconPencil } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { SCHLUESSEL_VERLAUF_MAX, zeitpunktAnzeigen, type UebergabeDto } from '@c4/shared';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { SchluesselAktionen } from '../SchluesselAktionen';
import { SchluesselFormular } from '../SchluesselFormular';
import { HalterName, schluesselInvalidieren, useSchluessel } from '../schluesselDaten';
import { pruefen } from '../warenApi';
import { HalterZeile, personenNamen } from './SchluesselPage';

const gleichePerson = (a: UebergabeDto['an'], b: UebergabeDto['eingetragenVon']) =>
  a?.art === 'mitglied' && b?.art === 'mitglied' && a.sub === b.sub;

function UebergabeZeile({ u }: Readonly<{ u: UebergabeDto }>) {
  // Only worth mentioning when somebody else than the two parties recorded it.
  const vonDritten =
    !gleichePerson(u.von, u.eingetragenVon) && !gleichePerson(u.an, u.eingetragenVon);
  return (
    <Paper withBorder p="sm">
      <Stack gap={2}>
        <Group gap={6} wrap="wrap">
          <HalterName halter={u.von} />
          <IconArrowRight size={16} aria-label="an" />
          <HalterName halter={u.an} />
        </Group>
        <Text size="sm" c="dimmed">
          {zeitpunktAnzeigen(u.zeitpunkt)}
          {vonDritten && (
            <>
              {' · eingetragen von '}
              <HalterName halter={u.eingetragenVon} />
            </>
          )}
        </Text>
      </Stack>
    </Paper>
  );
}

/** One key: its holder, the actions and the newest Übergaben. */
export function SchluesselDetailPage() {
  const { id } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const darfVerwalten = useAuth().can('schluessel:verwalten');
  const schluessel = useSchluessel(id);
  const [dialog, setDialog] = useState<'bearbeiten' | 'archiv' | null>(null);

  if (schluessel.isPending) return <Loader m="md" aria-label="Schlüssel wird geladen" />;
  if (schluessel.isError) {
    return <Alert color="red">Der Schlüssel konnte nicht geladen werden.</Alert>;
  }
  const s = schluessel.data;
  const vorschlaege = personenNamen([
    s,
    ...s.uebergaben.flatMap((u) => [u.von, u.an]).map((halter) => ({ ...s, halter })),
  ]);

  return (
    <Stack maw={720}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Title order={2} style={{ overflowWrap: 'anywhere' }}>
          {s.name}
        </Title>
        {s.archiviert && (
          <Badge color="gray" variant="light">
            Archiviert
          </Badge>
        )}
      </Group>
      {s.beschreibung && <Text style={{ whiteSpace: 'pre-wrap' }}>{s.beschreibung}</Text>}
      <HalterZeile schluessel={s} />
      <SchluesselAktionen schluessel={s} personenVorschlaege={vorschlaege} />
      {darfVerwalten && (
        <Group grow preventGrowOverflow={false} gap="xs">
          <Button
            variant="default"
            leftSection={<IconPencil size={18} />}
            onClick={() => setDialog('bearbeiten')}
          >
            Bearbeiten
          </Button>
          <Button
            variant="default"
            leftSection={s.archiviert ? <IconArchiveOff size={18} /> : <IconArchive size={18} />}
            onClick={() => setDialog('archiv')}
          >
            {s.archiviert ? 'Reaktivieren' : 'Archivieren'}
          </Button>
        </Group>
      )}

      <Title order={3} mt="md">
        Verlauf
      </Title>
      <Text size="sm" c="dimmed">
        Die letzten {SCHLUESSEL_VERLAUF_MAX} Übergaben.
      </Text>
      {s.uebergaben.length === 0 && <Text c="dimmed">Noch keine Übergaben eingetragen.</Text>}
      {s.uebergaben.map((u) => (
        <UebergabeZeile key={u.id} u={u} />
      ))}

      {dialog === 'bearbeiten' && (
        <SchluesselFormular schluessel={s} onClose={() => setDialog(null)} />
      )}
      {dialog === 'archiv' && (
        <BestaetigenDialog
          titel={s.archiviert ? 'Schlüssel reaktivieren' : 'Schlüssel archivieren'}
          bestaetigenText={s.archiviert ? 'Reaktivieren' : 'Archivieren'}
          color={s.archiviert ? 'blue' : 'red'}
          onClose={() => setDialog(null)}
          onBestaetigt={async () => {
            await pruefen(
              await api.schluessel[':id'].archiv.$put({
                param: { id: s.id },
                json: { archiviert: !s.archiviert },
              }),
            );
            await schluesselInvalidieren(qc);
          }}
        >
          <Text>
            {s.archiviert
              ? `„${s.name}“ wird wieder in der Liste angezeigt.`
              : `„${s.name}“ wird aus der Liste ausgeblendet, z. B. weil er verloren oder zurückgegeben ist. Übergaben sind dann nicht mehr möglich.`}
          </Text>
        </BestaetigenDialog>
      )}
    </Stack>
  );
}
