import { Alert, Button, Group, Modal, Stack } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { IfcoInhaltPosition } from '@c4/shared';
import { useApi } from './api';
import {
  herkunftVorschlag,
  IfcoInhaltFelder,
  inhaltPruefen,
  inhaltZeilenAus,
  mitHerkunft,
  UeberfuehrungFelder,
  ueberfuehrungenFinden,
  type InhaltZeile,
  type Ueberfuehrung,
} from './IfcoInhaltFelder';
import {
  INVENTAR_KEY,
  type GegenstandEintrag,
  type IfcoEintrag,
  type KategorieEintrag,
} from './inventarDaten';
import type { LagerKnoten } from './LagerBaum';
import { fehlerText, pruefen } from './warenApi';

/**
 * Content and Überführung steps shared by "Inhalt bearbeiten" and "IFCO anlegen": `weiter` checks
 * the rows and either saves right away or first asks where the pieces of Gegenstände that already
 * lie elsewhere come from.
 */
export function useIfcoInhaltSchritte(
  ifco: IfcoEintrag | undefined,
  gegenstaende: GegenstandEintrag[],
  lagerorte: LagerKnoten[],
  ifcos: IfcoEintrag[],
) {
  const [zeilen, setZeilen] = useState<InhaltZeile[]>(() => inhaltZeilenAus(ifco));
  const [fehler, setFehler] = useState<string | null>(null);
  const [offen, setOffen] = useState<{
    positionen: IfcoInhaltPosition[];
    liste: Ueberfuehrung[];
  } | null>(null);
  const [herkunft, setHerkunft] = useState<Record<string, string | null>>({});

  /** Calls `speichern` with the final positions, possibly after the Überführung step. */
  const weiter = (speichern: (positionen: IfcoInhaltPosition[]) => void) => {
    if (offen) {
      const r = mitHerkunft(offen.positionen, herkunft, gegenstaende, ifco?.id);
      if ('fehler' in r) return setFehler(r.fehler);
      setFehler(null);
      return speichern(r.positionen);
    }
    const r = inhaltPruefen(zeilen, gegenstaende);
    if ('fehler' in r) return setFehler(r.fehler);
    const liste = ueberfuehrungenFinden(r.positionen, gegenstaende, ifco?.id, lagerorte, ifcos);
    if (liste.length > 0) {
      setFehler(null);
      setHerkunft(herkunftVorschlag(liste));
      return setOffen({ positionen: r.positionen, liste });
    }
    const ohne = mitHerkunft(r.positionen, {}, gegenstaende, ifco?.id);
    if ('fehler' in ohne) return setFehler(ohne.fehler);
    setFehler(null);
    speichern(ohne.positionen);
  };

  return {
    zeilen,
    setZeilen,
    fehler,
    weiter,
    /** True while the Überführung step is shown. */
    ueberfuehren: offen !== null,
    zurueck: () => {
      setOffen(null);
      setFehler(null);
    },
    ueberfuehrungFelder: offen && (
      <UeberfuehrungFelder
        liste={offen.liste}
        herkunft={herkunft}
        onHerkunft={(id, key) => setHerkunft((h) => ({ ...h, [id]: key }))}
        gegenstaende={gegenstaende}
        ifcoId={ifco?.id}
      />
    ),
  };
}

/** Edits the whole content of an IFCO: Gegenstand and amount per row. Mount it only while it should be open. */
export function IfcoInhaltModal({
  ifco,
  gegenstaende,
  kategorien,
  lagerorte,
  ifcos,
  onClose,
}: Readonly<{
  ifco: IfcoEintrag;
  gegenstaende: GegenstandEintrag[];
  kategorien: KategorieEintrag[];
  lagerorte: LagerKnoten[];
  ifcos: IfcoEintrag[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const schritte = useIfcoInhaltSchritte(ifco, gegenstaende, lagerorte, ifcos);

  const speichern = useMutation({
    mutationFn: async (positionen: IfcoInhaltPosition[]) =>
      pruefen(
        await api.inventar.ifcos[':id'].inhalt.$put({
          param: { id: ifco.id },
          json: { positionen },
        }),
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
      onClose();
    },
  });

  return (
    <Modal opened onClose={onClose} title={`Inhalt von ${ifco.name}`}>
      <Stack>
        {schritte.ueberfuehren ? (
          schritte.ueberfuehrungFelder
        ) : (
          <IfcoInhaltFelder
            zeilen={schritte.zeilen}
            setZeilen={schritte.setZeilen}
            ifco={ifco}
            gegenstaende={gegenstaende}
            kategorien={kategorien}
            lagerorte={lagerorte}
            ifcos={ifcos}
          />
        )}
        {schritte.fehler && <Alert color="red">{schritte.fehler}</Alert>}
        {speichern.isError && (
          <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
        )}
        <Group grow>
          {schritte.ueberfuehren && (
            <Button variant="default" onClick={schritte.zurueck}>
              Zurück
            </Button>
          )}
          <Button
            loading={speichern.isPending}
            onClick={() => schritte.weiter((p) => speichern.mutate(p))}
          >
            Speichern
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
