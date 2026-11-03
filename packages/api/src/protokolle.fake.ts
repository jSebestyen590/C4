import {
  ProtokollAbgeschlossen,
  ProtokollExistiert,
  ProtokollVeraltet,
  type ProtokollDaten,
  type ProtokollKurz,
  type ProtokollStore,
} from './protokolle';

/** Map-backed protocol store for tests, with the same conflict rules as the real one. */
export function createFakeProtokolleStore() {
  const liste = new Map<string, ProtokollDaten>();
  let naechste = 1;
  const store: ProtokollStore = {
    async alle() {
      return [...liste.values()].map((p) => {
        const kurz: Partial<ProtokollDaten> = { ...p };
        delete kurz.inhalt;
        delete kurz.kopf;
        return kurz as ProtokollKurz;
      });
    },
    async holen(id) {
      const p = liste.get(id);
      return p && { ...p };
    },
    async nachEvent(eventId) {
      const p = [...liste.values()].find((x) => x.eventId === eventId);
      return p && { ...p };
    },
    async anlegen(daten, von) {
      if ([...liste.values()].some((p) => p.eventId === daten.eventId))
        throw new ProtokollExistiert();
      const id = `p${naechste++}`;
      const jetzt = new Date();
      liste.set(id, {
        id,
        eventId: daten.eventId,
        inhalt: daten.inhalt,
        kopf: daten.kopf,
        status: 'entwurf',
        version: 1,
        erstelltVon: von,
        erstelltAm: jetzt,
        geaendertVon: von,
        geaendertAm: jetzt,
      });
      return id;
    },
    async speichern(id, daten, von) {
      const p = liste.get(id);
      if (!p) return undefined;
      if (p.status === 'abgeschlossen') throw new ProtokollAbgeschlossen();
      if (p.version !== daten.version) throw new ProtokollVeraltet(p.version);
      Object.assign(p, {
        inhalt: daten.inhalt,
        kopf: daten.kopf,
        version: p.version + 1,
        geaendertVon: von,
        geaendertAm: new Date(),
      });
      return { version: p.version, geaendertAm: p.geaendertAm };
    },
    async statusSetzen(id, status, kopf, version, von) {
      const p = liste.get(id);
      if (!p) return undefined;
      if (p.version !== version) throw new ProtokollVeraltet(p.version);
      Object.assign(p, {
        status,
        kopf,
        version: p.version + 1,
        geaendertVon: von,
        geaendertAm: new Date(),
      });
      return { version: p.version, geaendertAm: p.geaendertAm };
    },
    async loeschen(id) {
      const p = liste.get(id);
      if (!p) return false;
      if (p.status === 'abgeschlossen') throw new ProtokollAbgeschlossen();
      return liste.delete(id);
    },
  };
  return { store, liste };
}
