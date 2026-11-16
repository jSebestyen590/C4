import {
  STIMMZETTEL_VERALTET,
  stimmzettelVeraltet,
  UmfrageKonflikt,
  type UmfrageDetails,
  type UmfragenCursor,
  type UmfragenStore,
} from './umfragen';

const beendet = (u: UmfrageDetails, heute: string) => u.beendetAm !== null || u.endetAm < heute;
/** Newest first; positive when `a` comes after `b`. */
const vergleich = (a: UmfragenCursor, b: UmfragenCursor) =>
  b.erstelltAm.getTime() - a.erstelltAm.getTime() || b.id.localeCompare(a.id);
const neuesteZuerst = (l: UmfrageDetails[]) => l.sort(vergleich);

/** Map-backed poll store for tests, with the same vote rules as the real one. */
export function createFakeUmfragenStore() {
  const liste = new Map<string, UmfrageDetails>();
  let naechste = 1;
  const store: UmfragenStore = {
    async laufende(heute) {
      return neuesteZuerst([...liste.values()].filter((u) => !beendet(u, heute)));
    },
    async beendete(heute, limit, nach) {
      return neuesteZuerst([...liste.values()].filter((u) => beendet(u, heute)))
        .filter((u) => !nach || vergleich(u, nach) > 0)
        .slice(0, limit);
    },
    async holen(id) {
      const u = liste.get(id);
      return u && structuredClone(u);
    },
    async anlegen(daten, ersteller) {
      const id = `u${naechste++}`;
      liste.set(id, {
        ...structuredClone(daten),
        id,
        erstellerSub: ersteller,
        erstelltAm: new Date(),
        beendetAm: null,
        eventId: null,
        eventOptionId: null,
        abgaben: [],
        stimmen: [],
      });
      return id;
    },
    async aktualisieren(id, daten, aenderung) {
      const u = liste.get(id);
      if (!u) return false;
      Object.assign(u, structuredClone(daten));
      u.stimmen = u.stimmen.filter((s) => !aenderung.loeschen.includes(s.id));
      for (const a of u.abgaben) if (aenderung.erneut.includes(a.sub)) a.erneutNoetig = true;
      return true;
    },
    async beenden(id, zeitpunkt) {
      const u = liste.get(id);
      if (u) u.beendetAm = zeitpunkt;
      return !!u;
    },
    async loeschen(id) {
      return liste.delete(id);
    },
    async eventSetzen(id, eventId, optionId) {
      const u = liste.get(id);
      if (!u?.termin) return false;
      u.eventId = eventId;
      u.eventOptionId = optionId;
      return true;
    },
    async abstimmen(id, sub, antworten) {
      const u = liste.get(id)!;
      const optionen = u.fragen.flatMap((f) =>
        f.optionen.map((o) => ({ id: o.id, frageId: f.id })),
      );
      if (stimmzettelVeraltet(antworten, u.fragen, optionen)) {
        throw new UmfrageKonflikt(STIMMZETTEL_VERALTET);
      }
      u.stimmen = [
        ...u.stimmen.filter((s) => s.sub !== sub),
        ...antworten.map((a) => ({ ...a, id: `s${naechste++}`, sub })),
      ];
      u.abgaben = [
        ...u.abgaben.filter((a) => a.sub !== sub),
        { sub, abgegebenAm: new Date(), erneutNoetig: false },
      ];
    },
  };
  return { store, liste };
}
