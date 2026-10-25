import { Alert, Button, Loader, SimpleGrid, Switch, Text, TextInput } from '@mantine/core';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './auth';
import { AusleiheKarte } from './AusleiheKarte';
import { ausleihenSortiert } from './inventarAnzeige';
import { useAusleihen, type useInventar } from './inventarDaten';

/** The "Verliehen" view of the Inventar page: open Ausleihen (verliehen first, then vorgemerkt) as cards, optionally the finished ones too. */
export function VerlieheneAnsicht({ inv }: Readonly<{ inv: ReturnType<typeof useInventar> }>) {
  const darfUmraeumen = useAuth().can('inventar:umraeumen');
  const [auchErledigte, setAuchErledigte] = useState(false);
  const [suche, setSuche] = useState('');
  const { ausleihen, laedt, fehler } = useAusleihen(!auchErledigte);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const sortiert = ausleihenSortiert(ausleihen);
    if (!q) return sortiert;
    const name = (id: string) => inv.gegenstaende.find((g) => g.id === id)?.name ?? '';
    return sortiert.filter(
      (a) =>
        a.an.toLowerCase().includes(q) ||
        a.kommentar?.toLowerCase().includes(q) ||
        a.positionen.some((p) => name(p.gegenstandId).toLowerCase().includes(q)),
    );
  }, [ausleihen, inv.gegenstaende, suche]);

  const wartet = laedt || inv.laedt;
  return (
    <>
      {darfUmraeumen && (
        <Button
          component={Link}
          to="/inventar/ausleihen/neu"
          leftSection={<IconPlus size={18} />}
          w={{ base: '100%', sm: 'fit-content' }}
        >
          Verleihen
        </Button>
      )}
      <TextInput
        placeholder="An wen oder was suchen"
        aria-label="Suche"
        leftSection={<IconSearch size={18} />}
        value={suche}
        onChange={(e) => setSuche(e.currentTarget.value)}
      />
      <Switch
        label="Auch erledigte anzeigen"
        checked={auchErledigte}
        onChange={(e) => setAuchErledigte(e.currentTarget.checked)}
      />
      {wartet && <Loader m="md" aria-label="Ausleihen werden geladen" />}
      {(fehler || inv.fehler) && (
        <Alert color="red">Die Ausleihen konnten nicht geladen werden.</Alert>
      )}
      {!wartet && !fehler && !inv.fehler && gefiltert.length === 0 && (
        <Text c="dimmed">
          {auchErledigte
            ? 'Keine Ausleihen gefunden.'
            : 'Zurzeit ist nichts verliehen oder vorgemerkt.'}
        </Text>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {!wartet && gefiltert.map((a) => <AusleiheKarte key={a.id} a={a} inv={inv} />)}
      </SimpleGrid>
    </>
  );
}
