import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import { IconArchive, IconArchiveOff, IconEdit, IconPlus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { kalenderInvalidieren } from './kalenderDaten';
import { fehlerAnzeigen, fehlerText } from './warenApi';

/**
 * A flat master data list with create, edit and archive (Dienstformen, Kategorien, Externe).
 * `W` is the form state of one entry.
 */
export function KalenderStammdatenTab<T extends { id: string; archiviert: boolean }, W>({
  anlegenText,
  bearbeitenTitel,
  items,
  laedt,
  fehler,
  zeile,
  leer,
  aus,
  felder,
  validieren,
  speichern,
  archivieren,
  extra,
}: Readonly<{
  anlegenText: string;
  bearbeitenTitel: string;
  items: T[] | undefined;
  laedt: boolean;
  fehler: boolean;
  zeile: (t: T) => ReactNode;
  leer: W;
  aus: (t: T) => W;
  felder: (w: W, setW: (w: W) => void, eintrag: T | null) => ReactNode;
  /** German error text, or null if the values are fine. */
  validieren: (w: W) => string | null;
  speichern: (id: string | null, w: W, t: T | null) => Promise<void>;
  archivieren: (t: T, archiviert: boolean) => Promise<void>;
  extra?: ReactNode;
}>) {
  const qc = useQueryClient();
  const [archivZeigen, setArchivZeigen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<{ eintrag: T | null; werte: W } | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const absenden = async () => {
    if (!bearbeiten) return;
    const problem = validieren(bearbeiten.werte);
    if (problem) return setMeldung(problem);
    setMeldung(null);
    setLaeuft(true);
    try {
      await speichern(bearbeiten.eintrag?.id ?? null, bearbeiten.werte, bearbeiten.eintrag);
      await kalenderInvalidieren(qc);
      setBearbeiten(null);
    } catch (e) {
      setMeldung(fehlerText(e, 'Das Speichern ist fehlgeschlagen.'));
    } finally {
      setLaeuft(false);
    }
  };

  const archivWechseln = async (t: T) => {
    try {
      await archivieren(t, !t.archiviert);
      await kalenderInvalidieren(qc);
    } catch (e) {
      fehlerAnzeigen(e);
    }
  };

  if (fehler) return <Alert color="red">Die Liste konnte nicht geladen werden.</Alert>;
  if (laedt) return <Loader m="md" />;
  const sichtbar = (items ?? []).filter((t) => archivZeigen || !t.archiviert);

  return (
    <Stack>
      <Group>
        <Button
          leftSection={<IconPlus size={18} />}
          onClick={() => {
            setMeldung(null);
            setBearbeiten({ eintrag: null, werte: leer });
          }}
        >
          {anlegenText}
        </Button>
        {extra}
      </Group>
      <Switch
        label="Archivierte anzeigen"
        checked={archivZeigen}
        onChange={(e) => setArchivZeigen(e.currentTarget.checked)}
      />
      {sichtbar.length === 0 && <Text c="dimmed">Noch keine Einträge.</Text>}
      {sichtbar.map((t) => (
        <Paper
          key={t.id}
          withBorder
          p="sm"
          radius="md"
          style={{ opacity: t.archiviert ? 0.65 : 1 }}
        >
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <div style={{ minWidth: 0 }}>{zeile(t)}</div>
            <Group gap={0} wrap="nowrap">
              <ActionIcon
                variant="subtle"
                color="gray"
                size={42}
                aria-label="Bearbeiten"
                onClick={() => {
                  setMeldung(null);
                  setBearbeiten({ eintrag: t, werte: aus(t) });
                }}
              >
                <IconEdit size={20} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="gray"
                size={42}
                aria-label={t.archiviert ? 'Wiederherstellen' : 'Archivieren'}
                onClick={() => void archivWechseln(t)}
              >
                {t.archiviert ? <IconArchiveOff size={20} /> : <IconArchive size={20} />}
              </ActionIcon>
            </Group>
          </Group>
        </Paper>
      ))}
      <Modal
        opened={bearbeiten !== null}
        onClose={() => setBearbeiten(null)}
        title={bearbeiten?.eintrag ? bearbeitenTitel : anlegenText}
      >
        {bearbeiten && (
          <Stack>
            {felder(
              bearbeiten.werte,
              (werte) => setBearbeiten({ ...bearbeiten, werte }),
              bearbeiten.eintrag,
            )}
            {meldung && <Alert color="red">{meldung}</Alert>}
            <Group grow preventGrowOverflow={false}>
              <Button variant="default" onClick={() => setBearbeiten(null)}>
                Abbrechen
              </Button>
              <Button loading={laeuft} onClick={() => void absenden()}>
                Speichern
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
