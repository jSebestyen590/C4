import { Alert, Box, Button, Select } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { pfad, umlagerungenSchema } from '@c4/shared';
import { useApi } from '../api';
import { AusgangAbschnitt } from '../AusgangAbschnitt';
import { BuchungsBestaetigung, type BestaetigungsGruppe } from '../BuchungsBestaetigung';
import { BuchungsFuss, zeitpunktIso } from '../BuchungsFuss';
import { BuchungsSeite } from '../BuchungsSeite';
import { InventurLeiste } from '../InventurLeiste';
import { jetztLokal } from '../inventurDaten';
import {
  ausgangAbschnitte,
  ausgangPositionen,
  bestandKarte,
  positionenText,
  type Eingaben,
} from '../lagerBestand';
import { useBuchungAbschluss } from '../useBuchungAbschluss';
import { useEnterWeiter } from '../useEnterWeiter';
import { useOrteMitIfcos } from '../inventarDaten';
import { useLagerBestand } from '../useLagerBestand';
import { fehlerAnzeigen, pruefen } from '../warenApi';

/** Move wares from a node and its sub-nodes to other nodes in one booking; one target per section. */
export function UmlagerungPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const abschluss = useBuchungAbschluss();
  const daten = useLagerBestand();
  const mitIfcos = useOrteMitIfcos().orte;
  const enterWeiter = useEnterWeiter('buchen-weiter');
  const [eingaben, setEingaben] = useState<Eingaben>({});
  const [ziele, setZiele] = useState<Record<string, string | null>>({});
  const [zeitpunkt, setZeitpunkt] = useState(jetztLokal);
  const [kommentar, setKommentar] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [bestaetigen, setBestaetigen] = useState(false);
  const [zielFehlt, setZielFehlt] = useState(false);

  const abschnitte = useMemo(
    () =>
      ausgangAbschnitte(
        id,
        daten.lagerorte,
        daten.bestand,
        daten.warenlisten,
        daten.waren,
        daten.gebinde,
      ),
    [id, daten.lagerorte, daten.bestand, daten.warenlisten, daten.waren, daten.gebinde],
  );
  const karte = useMemo(() => bestandKarte(daten.bestand), [daten.bestand]);
  const zielDaten = useMemo(
    () =>
      daten.lagerorte
        .filter((l) => !l.archiviert && !mitIfcos.has(l.id))
        .map((l) => ({ value: l.id, label: pfad(daten.lagerorte, l.id) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [daten.lagerorte, mitIfcos],
  );

  const positionen = ausgangPositionen(abschnitte, eingaben);
  const mitPosition = new Set(positionen.map((p) => p.lagerortId));
  const aktiv = abschnitte.filter((a) => mitPosition.has(a.lagerortId));

  const json = () =>
    umlagerungenSchema.safeParse({
      zeitpunkt: zeitpunktIso(zeitpunkt),
      kommentar,
      positionen: positionen.map((p) => ({
        wareId: p.wareId,
        gebindeId: p.gebindeId,
        anzahl: p.anzahl,
        vonId: p.lagerortId,
        nachId: ziele[p.lagerortId] ?? '',
      })),
    });

  const buchen = useMutation({
    mutationFn: async (daten: ReturnType<typeof umlagerungenSchema.parse>) =>
      pruefen(await api.bestand.umlagerungen.$post({ json: daten })),
    onSuccess: () => abschluss('Die Umlagerung wurde gebucht.'),
    onError: (e) => {
      setBestaetigen(false);
      fehlerAnzeigen(e, 'Buchen fehlgeschlagen.');
    },
  });

  const weiter = () => {
    setZielFehlt(false);
    if (!zeitpunktIso(zeitpunkt)) return setFehler('Ungültiger Zeitpunkt.');
    if (positionen.length === 0) return setFehler('Bitte gib mindestens eine Menge ein.');
    if (aktiv.some((a) => !ziele[a.lagerortId])) {
      setZielFehlt(true);
      return setFehler('Bitte wähle für jeden Platz mit Menge ein Ziel.');
    }
    const geprueft = json();
    if (!geprueft.success)
      return setFehler(geprueft.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    setBestaetigen(true);
  };

  const gruppen = (): BestaetigungsGruppe[] =>
    aktiv.map((a) => ({
      titel: a.pfad,
      zeilen: positionenText(positionen, a.lagerortId, daten.waren, daten.gebinde),
      hinweis: `Nach ${pfad(daten.lagerorte, ziele[a.lagerortId] ?? '')}`,
    }));

  return (
    <BuchungsSeite
      titel={`Umlagern: ${pfad(daten.lagerorte, id)}`}
      hinweis="Trag ein, was du umlagerst, und wähle je Platz das Ziel. Grau steht der aktuelle Bestand."
      laedt={daten.laedt}
      fehler={daten.fehler}
      leer={abschnitte.length === 0 ? 'Hier ist kein Bestand vorhanden.' : undefined}
    >
      <Box
        style={{ border: '1px solid var(--mantine-color-default-border)' }}
        onKeyDown={enterWeiter}
      >
        {abschnitte.map((a) => (
          <AusgangAbschnitt
            key={a.lagerortId}
            abschnitt={a}
            karte={karte}
            eingaben={eingaben}
            alleGebinde={daten.gebinde}
            onAnzahl={(key, gebindeId, wert) =>
              setEingaben((alt) => ({ ...alt, [key]: { ...alt[key], [gebindeId]: wert } }))
            }
          >
            <Box py="xs">
              <Select
                label="Nach"
                placeholder="Zielplatz wählen"
                searchable
                inputMode="text"
                nothingFoundMessage="Kein Platz gefunden"
                data={zielDaten.filter((z) => z.value !== a.lagerortId)}
                value={ziele[a.lagerortId] ?? null}
                error={zielFehlt && mitPosition.has(a.lagerortId) && !ziele[a.lagerortId]}
                onChange={(wert) => setZiele((alt) => ({ ...alt, [a.lagerortId]: wert }))}
                styles={{ input: { fontSize: 16 } }}
              />
            </Box>
          </AusgangAbschnitt>
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
        <Button id="buchen-weiter" size="md" mih={48} onClick={weiter}>
          Umlagern
        </Button>
      </InventurLeiste>
      {bestaetigen && (
        <BuchungsBestaetigung
          titel="Umlagerung buchen?"
          gruppen={gruppen()}
          buchenText="Umlagern"
          laedt={buchen.isPending}
          onClose={() => setBestaetigen(false)}
          onBuchen={() => {
            const geprueft = json();
            if (geprueft.success) buchen.mutate(geprueft.data);
          }}
        />
      )}
    </BuchungsSeite>
  );
}
