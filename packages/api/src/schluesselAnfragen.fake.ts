import {
  AnfrageKonflikt,
  planungSortieren,
  type AnfrageMitAntworten,
  type PlanungDaten,
  type SchluesselAnfragenStore,
} from './schluesselAnfragen';

/** Map-backed store for tests, with the same rules as the real one. */
export function createFakeSchluesselAnfragenStore() {
  const anfragen = new Map<string, AnfrageMitAntworten>();
  const planungen = new Map<string, PlanungDaten>();
  let naechste = 1;
  const kopie = <T>(x: T): T => structuredClone(x);

  const planungEinfuegen = (p: Omit<PlanungDaten, 'id' | 'erstellt'>): string => {
    const id = `p${naechste++}`;
    planungen.set(id, { id, ...p, erstellt: new Date() });
    return id;
  };

  const store: SchluesselAnfragenStore = {
    async anfragen() {
      return [...anfragen.values()].map(kopie);
    },
    async anfrage(id) {
      const a = anfragen.get(id);
      return a && kopie(a);
    },
    async anlegen(daten) {
      const id = `a${naechste++}`;
      const jetzt = new Date();
      anfragen.set(id, {
        id,
        ...daten,
        status: 'offen',
        erstellt: jetzt,
        erinnert: jetzt,
        antworten: [],
      });
      return id;
    },
    async zurueckziehen(id) {
      const a = anfragen.get(id);
      if (!a || a.status !== 'offen') return false;
      a.status = 'zurueckgezogen';
      return true;
    },
    async erinnertSetzen(ids, wann) {
      for (const id of ids) {
        const a = anfragen.get(id);
        if (a) a.erinnert = wann;
      }
    },
    async antwortSpeichern(anfrageId, antwort, planung) {
      const a = anfragen.get(anfrageId);
      if (!a) return undefined;
      if (a.status !== 'offen') throw new AnfrageKonflikt();
      a.antworten = a.antworten.filter((x) => x.sub !== antwort.sub);
      a.antworten.push({ id: `w${naechste++}`, anfrageId, ...antwort, erstellt: new Date() });
      if (!planung) return { planungId: null };
      const planungId = planungEinfuegen(planung);
      a.status = 'vergeben';
      return { planungId };
    },
    async gegenvorschlagAnnehmen(anfrageId, planung) {
      const a = anfragen.get(anfrageId);
      if (!a) return undefined;
      if (a.status !== 'offen') throw new AnfrageKonflikt();
      const planungId = planungEinfuegen(planung);
      a.status = 'vergeben';
      return { planungId };
    },
    async planungen(schluesselId) {
      return planungSortieren(
        [...planungen.values()].filter((p) => !schluesselId || p.schluesselId === schluesselId),
      ).map(kopie);
    },
    async planung(id) {
      const p = planungen.get(id);
      return p && kopie(p);
    },
    async planungAnlegen(daten) {
      return planungEinfuegen(daten);
    },
    async planungAendern(id, daten) {
      const p = planungen.get(id);
      if (!p) return false;
      Object.assign(p, daten);
      return true;
    },
    async planungLoeschen(id) {
      return planungen.delete(id);
    },
  };

  /** Mirrors the real `SchluesselStore.uebergeben`: the earliest plan of `anSub` for the key is used up. */
  const planungVerbrauchen = (schluesselId: string, anSub: string) => {
    const erste = planungSortieren(
      [...planungen.values()].filter((p) => p.schluesselId === schluesselId && p.anSub === anSub),
    )[0];
    if (erste) planungen.delete(erste.id);
  };

  return { store, anfragen, planungen, planungVerbrauchen };
}
