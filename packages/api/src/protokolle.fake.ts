import {
  ProtokollAbgeschlossen,
  ProtokollExistiert,
  ProtokollVeraltet,
  sperreGehoert,
  type ProtokollDaten,
  type ProtokollKurz,
  type ProtokollStore,
} from './protokolle';

const veraltet = (p: ProtokollDaten) =>
  new ProtokollVeraltet(
    p.version,
    p.geaendertVon,
    'Das Protokoll wurde inzwischen geändert. Bitte lade es neu.',
  );

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
        delete kurz.sperreSub;
        delete kurz.sperreTab;
        delete kurz.sperreBis;
        return kurz as ProtokollKurz;
      });
    },
    async holen(id) {
      const p = liste.get(id);
      return p && { ...p };
    },
    async nachEvent(eventId) {
      const p = [...liste.values()].find((x) => x.eventId === eventId && x.fassung === 'normal');
      return p && { ...p };
    },
    async anlegen(daten, von) {
      const offiziellVon = daten.offiziellVon ?? null;
      const fassung = offiziellVon ? 'offiziell' : 'normal';
      if ([...liste.values()].some((p) => p.eventId === daten.eventId && p.fassung === fassung))
        throw new ProtokollExistiert();
      const id = daten.id ?? `p${naechste++}`;
      const jetzt = new Date();
      liste.set(id, {
        id,
        eventId: daten.eventId,
        fassung,
        offiziellVon,
        inhalt: daten.inhalt,
        kopf: daten.kopf,
        status: 'entwurf',
        version: 1,
        erstelltVon: von,
        erstelltAm: jetzt,
        geaendertVon: von,
        geaendertAm: jetzt,
        sperreSub: null,
        sperreTab: null,
        sperreBis: null,
      });
      return id;
    },
    async speichern(id, daten, von) {
      const p = liste.get(id);
      if (!p) return undefined;
      if (p.status === 'abgeschlossen') throw new ProtokollAbgeschlossen();
      if (p.version !== daten.version) throw new ProtokollVeraltet(p.version, p.geaendertVon);
      Object.assign(p, {
        inhalt: daten.inhalt,
        kopf: daten.kopf,
        version: p.version + 1,
        geaendertVon: von,
        geaendertAm: new Date(),
      });
      return { version: p.version, geaendertAm: p.geaendertAm };
    },
    async statusSetzen(id, status, kopf, version, von, inhalt) {
      const p = liste.get(id);
      if (!p) return undefined;
      if (p.version !== version) throw new ProtokollVeraltet(p.version, p.geaendertVon);
      Object.assign(p, {
        status,
        kopf,
        sperreSub: null,
        sperreTab: null,
        sperreBis: null,
        ...(inhalt === undefined ? {} : { inhalt }),
        version: p.version + 1,
        geaendertVon: von,
        geaendertAm: new Date(),
      });
      return { version: p.version, geaendertAm: p.geaendertAm };
    },
    async statusBelegen(id, version, von, nach, kopf) {
      const p = liste.get(id);
      if (!p) return undefined;
      if (p.version !== version || p.status === nach) throw veraltet(p);
      Object.assign(p, {
        status: nach,
        kopf,
        sperreSub: null,
        sperreTab: null,
        sperreBis: null,
        version: p.version + 1,
        geaendertVon: von,
        geaendertAm: new Date(),
      });
      return { version: p.version, geaendertAm: p.geaendertAm };
    },
    async aktionenBelegen(id, version, von) {
      const p = liste.get(id);
      if (!p) return undefined;
      if (p.version !== version || p.status !== 'abgeschlossen') throw veraltet(p);
      Object.assign(p, { version: p.version + 1, geaendertVon: von, geaendertAm: new Date() });
      return { version: p.version, geaendertAm: p.geaendertAm };
    },
    async ergebnisSpeichern(id, daten, von) {
      const p = liste.get(id);
      if (!p) return undefined;
      if (p.version !== daten.version) throw new ProtokollVeraltet(p.version, p.geaendertVon);
      Object.assign(p, {
        inhalt: daten.inhalt,
        kopf: daten.kopf,
        version: p.version + 1,
        geaendertVon: von,
        geaendertAm: new Date(),
      });
      return { version: p.version, geaendertAm: p.geaendertAm };
    },
    async sperreNehmen(id, sub, tab, jetzt, bis) {
      const p = liste.get(id);
      if (!p) return undefined;
      if (p.status === 'abgeschlossen') throw new ProtokollAbgeschlossen();
      if (p.sperreBis === null || !(p.sperreBis > jetzt) || sperreGehoert(p, sub, tab, jetzt)) {
        Object.assign(p, { sperreSub: sub, sperreTab: tab, sperreBis: bis });
        return { erhalten: true, sub, tab, bis };
      }
      return { erhalten: false, sub: p.sperreSub, tab: p.sperreTab, bis: p.sperreBis };
    },
    async sperreLoesen(id, sub, tab) {
      const p = liste.get(id);
      if (p?.sperreSub === sub && p.sperreTab === tab) {
        Object.assign(p, { sperreSub: null, sperreTab: null, sperreBis: null });
      }
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
