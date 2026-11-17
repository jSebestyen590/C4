import { Alert, Badge, Button, Group, Loader, Paper, Stack, Switch, Text } from '@mantine/core';
import { IconArchive, IconArchiveOff, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { IFCO_MASSE, zahlText } from '@c4/shared';
import { AktionsMenue } from './AktionsMenue';
import { useApi } from './api';
import { useAuth } from './auth';
import { IfcoTypFormular } from './IfcoTypFormular';
import { inventarKeys, useIfcoTypen, type IfcoTypEintrag } from './inventarDaten';
import { LoeschenDialog } from './LoeschenDialog';
import { fehlerAnzeigen, pruefen } from './warenApi';

/** Master data of the IFCO types: cards with name, footprint and height. */
export function IfcoTypenTab() {
  const api = useApi();
  const qc = useQueryClient();
  const darfVerwalten = useAuth().can('inventar:verwalten');
  const { typen, laedt, fehler } = useIfcoTypen();
  const [archiv, setArchiv] = useState(false);
  const [formular, setFormular] = useState<{ typ?: IfcoTypEintrag } | null>(null);
  const [loeschZiel, setLoeschZiel] = useState<IfcoTypEintrag | null>(null);

  const sichtbar = useMemo(
    () =>
      typen
        .filter((t) => archiv || !t.archiviert)
        .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true })),
    [typen, archiv],
  );

  const archivieren = async (t: IfcoTypEintrag, archiviert: boolean) => {
    await pruefen(
      await api.inventar['ifco-typen'][':id'].archiv.$put({
        param: { id: t.id },
        json: { archiviert },
      }),
    );
    await qc.invalidateQueries({ queryKey: inventarKeys.alle });
  };
  const archivMutation = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: (t: IfcoTypEintrag) => archivieren(t, !t.archiviert),
    onError: (e) => fehlerAnzeigen(e),
  });

  return (
    <Stack>
      <Group justify="space-between" wrap="wrap">
        <Switch
          label="Archivierte anzeigen"
          checked={archiv}
          onChange={(e) => setArchiv(e.currentTarget.checked)}
        />
        {darfVerwalten && (
          <Button leftSection={<IconPlus size={18} />} onClick={() => setFormular({})}>
            IFCO-Typ anlegen
          </Button>
        )}
      </Group>
      {laedt && <Loader m="md" aria-label="IFCO-Typen werden geladen" />}
      {fehler && <Alert color="red">Die IFCO-Typen konnten nicht geladen werden.</Alert>}
      {!laedt && !fehler && sichtbar.length === 0 && (
        <Text c="dimmed">Keine IFCO-Typen vorhanden.</Text>
      )}
      <Stack gap="xs">
        {sichtbar.map((t) => (
          <Paper key={t.id} withBorder p={4} pl="sm" opacity={t.archiviert ? 0.6 : 1}>
            <Group gap={4} wrap="nowrap" mih={42}>
              <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs">
                  <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                    {t.name}
                  </Text>
                  {t.archiviert && (
                    <Badge color="gray" variant="light">
                      Archiviert
                    </Badge>
                  )}
                </Group>
                <Text size="sm" c="dimmed">
                  {IFCO_MASSE[t.grundflaeche]} · {zahlText(t.hoeheCm)} cm
                </Text>
              </Stack>
              <AktionsMenue
                label={`Aktionen für ${t.name}`}
                aktionen={[
                  {
                    text: 'Bearbeiten',
                    icon: <IconEdit size={18} />,
                    onClick: () => setFormular({ typ: t }),
                    sichtbar: darfVerwalten,
                  },
                  {
                    text: t.archiviert ? 'Wiederherstellen' : 'Archivieren',
                    icon: t.archiviert ? <IconArchiveOff size={18} /> : <IconArchive size={18} />,
                    onClick: () => archivMutation.mutate(t),
                    sichtbar: darfVerwalten,
                    trenner: true,
                  },
                  {
                    text: 'Löschen',
                    icon: <IconTrash size={18} />,
                    color: 'red',
                    onClick: () => setLoeschZiel(t),
                    sichtbar: darfVerwalten,
                  },
                ]}
              />
            </Group>
          </Paper>
        ))}
      </Stack>
      {formular && <IfcoTypFormular typ={formular.typ} onClose={() => setFormular(null)} />}
      {loeschZiel && (
        <LoeschenDialog
          titel="IFCO-Typ löschen"
          name={loeschZiel.name}
          onClose={() => setLoeschZiel(null)}
          loeschen={async () => {
            await pruefen(
              await api.inventar['ifco-typen'][':id'].$delete({ param: { id: loeschZiel.id } }),
            );
            await qc.invalidateQueries({ queryKey: inventarKeys.alle });
          }}
          archivieren={() => archivieren(loeschZiel, true)}
        />
      )}
    </Stack>
  );
}
