import { Alert, Box, Button } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { einlagerungenSchema, IFCO_PLATZ_KEINE_WARE, pfad, tiefensuche } from '@c4/shared';
import { useApi } from '../api';
import { BestandAbschnitt } from '../BestandAbschnitt';
import { BuchungsFuss, zeitpunktIso } from '../BuchungsFuss';
import { BuchungsSeite } from '../BuchungsSeite';
import { InventurLeiste } from '../InventurLeiste';
import {
  jetztLokal,
  mhdAusEingabe,
  neueZeile,
  type KnotenZustand,
  type WareInfo,
  type Zeile,
} from '../inventurDaten';
import { useBuchungAbschluss } from '../useBuchungAbschluss';
import { useEnterWeiter } from '../useEnterWeiter';
import { useLagerBestand } from '../useLagerBestand';
import { fehlerAnzeigen, pruefen } from '../warenApi';

const hatMenge = (z: Zeile) => Object.values(z.anzahl).some((a) => Number(a) > 0);

/** Store several wares on a node and its sub-nodes in one booking (table like the Inventur). */
export function EinlagerungPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const abschluss = useBuchungAbschluss();
  const daten = useLagerBestand();
  const enterWeiter = useEnterWeiter('buchen-weiter');
  const [zustaende, setZustaende] = useState<Record<string, KnotenZustand> | null>(null);
  const [zeitpunkt, setZeitpunkt] = useState(jetztLokal);
  const [kommentar, setKommentar] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [versucht, setVersucht] = useState(false);

  const knoten = useMemo(
    // Ifco-Lagerplätze hold no Waren.
    () => tiefensuche(daten.lagerorte, id).filter((k) => !k.archiviert && k.ifcoHoeheCm === null),
    [daten.lagerorte, id],
  );
  // The rows come once from the Warenlisten; after that the local state is the source of truth.
  if (zustaende === null && !daten.laedt && !daten.fehler) {
    setZustaende(
      Object.fromEntries(
        knoten.map((k) => [
          k.id,
          {
            zeilen: (daten.warenlisten.get(k.id) ?? [])
              .filter((wareId) => daten.waren.has(wareId) && !daten.waren.get(wareId)?.archiviert)
              .map((wareId) => neueZeile(wareId)),
            extra: [],
            inListe: [],
          } satisfies KnotenZustand,
        ]),
      ),
    );
  }
  const zustandVon = (lid: string): KnotenZustand =>
    zustaende?.[lid] ?? { zeilen: [], extra: [], inListe: [] };

  const mhdFehlt = (z: Zeile, ware: WareInfo | undefined) =>
    !!ware && ware.mhdArt !== 'keins' && hatMenge(z) && !z.mhd;

  const positionen = () =>
    knoten.flatMap((k) =>
      zustandVon(k.id).zeilen.flatMap((z) => {
        const ware = daten.waren.get(z.wareId);
        return Object.entries(z.anzahl)
          .filter(([, a]) => Number(a) > 0)
          .map(([gebindeId, a]) => ({
            wareId: z.wareId,
            lagerortId: k.id,
            gebindeId,
            mhd: ware ? mhdAusEingabe(z.mhd, ware.mhdArt) : null,
            anzahl: Number(a),
          }));
      }),
    );

  const buchen = useMutation({
    mutationFn: async (json: ReturnType<typeof einlagerungenSchema.parse>) =>
      pruefen(await api.bestand.einlagerungen.$post({ json })),
    onSuccess: () => abschluss('Die Einlagerung wurde gebucht.'),
    onError: (e) => fehlerAnzeigen(e, 'Buchen fehlgeschlagen.'),
  });

  const absenden = () => {
    setVersucht(true);
    const iso = zeitpunktIso(zeitpunkt);
    if (!iso) return setFehler('Ungültiger Zeitpunkt.');
    const liste = positionen();
    if (liste.length === 0) return setFehler('Bitte gib mindestens eine Menge ein.');
    const ohneMhd = knoten.some((k) =>
      zustandVon(k.id).zeilen.some((z) => mhdFehlt(z, daten.waren.get(z.wareId))),
    );
    if (ohneMhd) return setFehler('Bitte gib bei allen Waren mit Menge ein MHD an.');
    const geprueft = einlagerungenSchema.safeParse({
      zeitpunkt: iso,
      kommentar,
      positionen: liste,
    });
    if (!geprueft.success)
      return setFehler(geprueft.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    buchen.mutate(geprueft.data);
  };

  return (
    <BuchungsSeite
      titel={`Einlagern: ${pfad(daten.lagerorte, id)}`}
      hinweis="Trag ein, was du einlagerst. Bei Waren mit MHD ist das Datum Pflicht."
      laedt={daten.laedt || zustaende === null}
      fehler={daten.fehler}
      leer={
        knoten.length === 0
          ? daten.lagerorte.some((l) => l.id === id && l.ifcoHoeheCm !== null)
            ? IFCO_PLATZ_KEINE_WARE
            : 'Dieser Lagerort ist archiviert.'
          : undefined
      }
    >
      <Box
        style={{ border: '1px solid var(--mantine-color-default-border)' }}
        onKeyDown={enterWeiter}
      >
        {knoten.map((k) => (
          <BestandAbschnitt
            key={k.id}
            pfad={pfad(daten.lagerorte, k.id)}
            zustand={zustandVon(k.id)}
            waren={daten.waren}
            katalog={daten.katalog}
            gebinde={daten.gebinde}
            dauerhaft={false}
            mhdFehler={(z) => versucht && mhdFehlt(z, daten.waren.get(z.wareId))}
            onChange={(f) =>
              setZustaende((alt) =>
                alt ? { ...alt, [k.id]: f(alt[k.id] ?? zustandVon(k.id)) } : alt,
              )
            }
          />
        ))}
      </Box>
      <BuchungsFuss
        zeitpunkt={zeitpunkt}
        kommentar={kommentar}
        onZeitpunkt={setZeitpunkt}
        onKommentar={setKommentar}
      />
      {fehler && (
        <Alert color="red" mb="sm" role="alert">
          {fehler}
        </Alert>
      )}
      <InventurLeiste>
        <Button id="buchen-weiter" size="md" mih={48} loading={buchen.isPending} onClick={absenden}>
          Einlagern
        </Button>
      </InventurLeiste>
    </BuchungsSeite>
  );
}
