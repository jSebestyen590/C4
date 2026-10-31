import type { UmfrageDetails, UmfragenStore } from './umfragen';

/** Map-backed poll store for tests, with the same vote rules as the real one. */
export function createFakeUmfragenStore() {
  const liste = new Map<string, UmfrageDetails>();
  let naechste = 1;
  const store: UmfragenStore = {
    async alle() {
      return [...liste.values()].sort((a, b) => b.erstelltAm.getTime() - a.erstelltAm.getTime());
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
