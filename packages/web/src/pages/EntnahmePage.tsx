import { Alert, Box, Button, Select, Switch } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { entnahmenSchema, pfad } from '@c4/shared';
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
import { useLagerBestand } from '../useLagerBestand';
import { fehlerAnzeigen, pruefen } from '../warenApi';

interface Nachfuellen {
  an: boolean;
  quelle: string | null;
}

/** Withdraw several wares from a node and its sub-nodes in one booking, optionally refilling from elsewhere. */
export function EntnahmePage() {
  const { id = '' } = useParams();
  const api = useApi();
  const abschluss = useBuchungAbschluss();
  const daten = useLagerBestand();
  const enterWeiter = useEnterWeiter('buchen-weiter');
  const [eingaben, setEingaben] = useState<Eingaben>({});
  const [nachfuellen, setNachfuellen] = useState<Record<string, Nachfuellen>>({});
  const [zeitpunkt, setZeitpunkt] = useState(jetztLokal);
  const [kommentar, setKommentar] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [bestaetigen, setBestaetigen] = useState(false);

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
  const quellen = useMemo(
    () =>
      daten.lagerorte
        .filter((l) => !l.archiviert)
        .map((l) => ({ value: l.id, label: pfad(daten.lagerorte, l.id) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [daten.lagerorte],
  );

  const positionen = ausgangPositionen(abschnitte, eingaben);
  const mitPosition = new Set(positionen.map((p) => p.lagerortId));
  const aktiv = abschnitte.filter((a) => mitPosition.has(a.lagerortId));
  const nachfuellenListe = aktiv
    .filter((a) => nachfuellen[a.lagerortId]?.an)
    .map((a) => ({ lagerortId: a.lagerortId, quelleId: nachfuellen[a.lagerortId]?.quelle ?? '' }));

  const buchen = useMutation({
    mutationFn: async (json: ReturnType<typeof entnahmenSchema.parse>) => {
      await pruefen(await api.bestand.entnahmen.$post({ json }));
    },
    onSuccess: () => abschluss('Die Entnahme wurde gebucht.'),
    onError: (e) => {
      setBestaetigen(false);
      fehlerAnzeigen(e, 'Buchen fehlgeschlagen.');
    },
  });

  const weiter = () => {
    const iso = zeitpunktIso(zeitpunkt);
    if (!iso) return setFehler('Ungültiger Zeitpunkt.');
    if (positionen.length === 0) return setFehler('Bitte gib mindestens eine Menge ein.');
    if (nachfuellenListe.some((n) => !n.quelleId))
      return setFehler('Bitte wähle, woraus nachgefüllt wird.');
    const geprueft = entnahmenSchema.safeParse({
      zeitpunkt: iso,
      kommentar,
      positionen,
      nachfuellen: nachfuellenListe,
    });
    if (!geprueft.success)
      return setFehler(geprueft.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    setBestaetigen(true);
  };

  const gruppen = (): BestaetigungsGruppe[] =>
    aktiv.map((a) => ({
      titel: a.pfad,
      zeilen: positionenText(positionen, a.lagerortId, daten.waren, daten.gebinde),
      hinweis: nachfuellen[a.lagerortId]?.an
        ? `Nachfüllen aus ${pfad(daten.lagerorte, nachfuellen[a.lagerortId]?.quelle ?? '')}`
        : undefined,
    }));

  const nachfuellenFuer = (lid: string): Nachfuellen =>
    nachfuellen[lid] ?? { an: false, quelle: null };
  const setzeNachfuellen = (lid: string, teil: Partial<Nachfuellen>) =>
    setNachfuellen((alt) => ({ ...alt, [lid]: { ...nachfuellenFuer(lid), ...alt[lid], ...teil } }));

  return (
    <BuchungsSeite
      titel={`Entnehmen: ${pfad(daten.lagerorte, id)}`}
      hinweis="Trag ein, was du entnimmst. Grau steht der aktuelle Bestand."
      laedt={daten.laedt}
      fehler={daten.fehler}
      leer={abschnitte.length === 0 ? 'Hier ist kein Bestand vorhanden.' : undefined}
    >
      <Box
        style={{ border: '1px solid var(--mantine-color-default-border)' }}
        onKeyDown={enterWeiter}
      >
        {abschnitte.map((a) => {
          const n = nachfuellenFuer(a.lagerortId);
          return (
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
                <Switch
                  label="Nachfüllen aus"
                  checked={n.an}
                  onChange={(e) => setzeNachfuellen(a.lagerortId, { an: e.currentTarget.checked })}
                />
                {n.an && (
                  <Select
                    mt="xs"
                    aria-label={`Nachfüllen für ${a.pfad} aus`}
                    placeholder="Platz wählen"
                    searchable
                    inputMode="text"
                    nothingFoundMessage="Kein Platz gefunden"
                    data={quellen.filter((q) => q.value !== a.lagerortId)}
                    value={n.quelle}
                    onChange={(quelle) => setzeNachfuellen(a.lagerortId, { quelle })}
                    styles={{ input: { fontSize: 16 } }}
                  />
                )}
              </Box>
            </AusgangAbschnitt>
          );
        })}
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
          Buchen
        </Button>
      </InventurLeiste>
      {bestaetigen && (
        <BuchungsBestaetigung
          titel="Entnahme buchen?"
          gruppen={gruppen()}
          buchenText="Buchen"
          laedt={buchen.isPending}
          onClose={() => setBestaetigen(false)}
          onBuchen={() => {
            const iso = zeitpunktIso(zeitpunkt);
            const geprueft = entnahmenSchema.safeParse({
              zeitpunkt: iso,
              kommentar,
              positionen,
              nachfuellen: nachfuellenListe,
            });
            if (geprueft.success) buchen.mutate(geprueft.data);
          }}
        />
      )}
    </BuchungsSeite>
  );
}
