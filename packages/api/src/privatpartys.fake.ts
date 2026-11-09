import { randomUUID } from 'node:crypto';
import {
  TerminInBenutzung,
  type AbrufStand,
  type NachrichtEintrag,
  type PrivatpartyAnlegen,
  type PrivatpartyEintrag,
  type PrivatpartyPersonDaten,
  type PrivatpartysStore,
} from './privatpartys';

/** Map-backed store for tests, with the same rules as the real one. */
export function createFakePrivatpartysStore() {
  const personen = new Map<string, PrivatpartyPersonDaten>();
  const liste = new Map<string, PrivatpartyEintrag>();
  const nachrichtenListe: NachrichtEintrag[] = [];
  let stand: AbrufStand = { uidValidity: null, letzteUid: 0, letzterAbruf: null, fehler: null };
  const nachrichtenVon = (id: string) =>
    nachrichtenListe
      .filter((n) => n.privatpartyId === id)
      .sort((a, b) => a.zeitpunkt.getTime() - b.zeitpunkt.getTime());
  const neuberechnen = (id: string) => {
    const e = liste.get(id);
    if (!e) return;
    const n = nachrichtenVon(id);
    const letzteEin = [...n].reverse().find((x) => x.richtung === 'ein');
    liste.set(id, {
      ...e,
      letzteNachrichtAm: n.at(-1)?.zeitpunkt ?? null,
      mailAdresse: letzteEin?.vonAdresse ?? null,
    });
  };
  const namen = (e: PrivatpartyEintrag): PrivatpartyEintrag => ({
    ...e,
    personName: e.personId ? (personen.get(e.personId)?.name ?? null) : null,
    unbeantwortet: nachrichtenVon(e.id).at(-1)?.richtung === 'ein',
    termine: e.termine.map((t) => ({ ...t })),
  });
  const sortiert = (l: PrivatpartyEintrag[]) =>
    l
      .map(namen)
      .sort(
        (a, b) =>
          (b.letzteNachrichtAm ?? b.angelegtAm).getTime() -
          (a.letzteNachrichtAm ?? a.angelegtAm).getTime(),
      );
  const termineAus = (id: string, termine: PrivatpartyAnlegen['termine'], bekannt: Set<string>) =>
    termine.map((t) => ({
      id: t.id && bekannt.has(t.id) ? t.id : randomUUID(),
      datum: t.datum,
      beginn: t.beginn,
      ende: t.ende,
      stufe: t.stufe,
    }));
  const store: PrivatpartysStore = {
    async personen() {
      return [...personen.values()]
        .map((p) => ({
          ...p,
          anzahl: [...liste.values()].filter((e) => e.personId === p.id).length,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    },
    async person(id) {
      return personen.get(id);
    },
    async personAnlegen(daten, von) {
      const id = randomUUID();
      const jetzt = new Date();
      personen.set(id, {
        id,
        name: daten.name,
        email: daten.email ?? null,
        kontakt: daten.kontakt ?? null,
        notizen: daten.notizen ?? null,
        angelegtVon: von,
        angelegtAm: jetzt,
        aktualisiertAm: jetzt,
      });
      return id;
    },
    async personAktualisieren(id, daten) {
      const p = personen.get(id);
      if (!p) return false;
      personen.set(id, {
        ...p,
        name: daten.name,
        email: daten.email ?? null,
        kontakt: daten.kontakt ?? null,
        notizen: daten.notizen ?? null,
        aktualisiertAm: new Date(),
      });
      return true;
    },
    async personLoeschen(id) {
      if (!personen.has(id)) return 'nicht_gefunden';
      if ([...liste.values()].some((e) => e.personId === id)) return 'in_benutzung';
      personen.delete(id);
      return 'ok';
    },
    async alle(status) {
      return sortiert([...liste.values()].filter((e) => !status || e.status === status));
    },
    async holen(id) {
      const e = liste.get(id);
      return e && namen(e);
    },
    async nachPerson(personId) {
      return sortiert([...liste.values()].filter((e) => e.personId === personId));
    },
    async nachUmfrage(umfrageId) {
      const e = [...liste.values()].find((x) => x.umfrageId === umfrageId);
      return e && namen(e);
    },
    async nachEvent(eventId) {
      const e = [...liste.values()].find((x) => x.eventId === eventId);
      return e && namen(e);
    },
    async anlegen(daten) {
      const id = randomUUID();
      const jetzt = new Date();
      liste.set(id, {
        id,
        personId: daten.personId,
        personName: null,
        anlass: daten.anlass,
        notizen: daten.notizen,
        status: 'offen',
        terminId: null,
        umfrageId: null,
        eventId: null,
        mailAdresse: daten.mailAdresse ?? null,
        letzteNachrichtAm: daten.letzteNachrichtAm ?? null,
        unbeantwortet: false,
        termine: termineAus(id, daten.termine, new Set()),
        angelegtAm: jetzt,
        aktualisiertAm: jetzt,
      });
      return id;
    },
    async aktualisieren(id, daten) {
      const e = liste.get(id);
      if (!e) return false;
      const bekannt = new Set(e.termine.map((t) => t.id));
      const termine = termineAus(id, daten.termine, bekannt);
      if (e.status === 'zugesagt' && e.terminId && !termine.some((t) => t.id === e.terminId)) {
        throw new TerminInBenutzung();
      }
      liste.set(id, {
        ...e,
        personId: daten.personId,
        anlass: daten.anlass,
        notizen: daten.notizen,
        termine,
        aktualisiertAm: new Date(),
      });
      return true;
    },
    async umfrageSetzen(id, umfrageId) {
      const e = liste.get(id);
      if (!e) return false;
      liste.set(id, { ...e, umfrageId });
      return true;
    },
    async zusagen(id, terminId, eventId) {
      const e = liste.get(id);
      if (!e) return false;
      liste.set(id, { ...e, status: 'zugesagt', terminId, eventId });
      return true;
    },
    async statusSetzen(id, status) {
      const e = liste.get(id);
      if (!e) return false;
      liste.set(id, { ...e, status, terminId: null, eventId: null });
      return true;
    },
    async loeschen(id) {
      const e = liste.get(id);
      if (!e) return 'nicht_gefunden';
      if (e.eventId || nachrichtenVon(id).length > 0) return 'in_benutzung';
      liste.delete(id);
      return 'ok';
    },
    async nachrichten(id) {
      return nachrichtenVon(id).map((n) => ({ ...n }));
    },
    async nachricht(id) {
      return nachrichtenListe.find((n) => n.id === id);
    },
    async nachrichtNachMessageId(messageId) {
      return nachrichtenListe.find((n) => n.messageId === messageId);
    },
    async privatpartyZuMessageIds(ids) {
      for (const id of ids) {
        const n = nachrichtenListe.find((x) => x.messageId === id);
        if (n) return n.privatpartyId;
      }
      return undefined;
    },
    async nachrichtAnlegen(n) {
      const id = randomUUID();
      nachrichtenListe.push({ ...n, id });
      neuberechnen(n.privatpartyId);
      return id;
    },
    async nachrichtVerschieben(id, zielId) {
      const n = nachrichtenListe.find((x) => x.id === id);
      if (!n) return false;
      const quelle = n.privatpartyId;
      n.privatpartyId = zielId;
      neuberechnen(quelle);
      neuberechnen(zielId);
      return true;
    },
    async leerenEintragLoeschen(id) {
      const e = liste.get(id);
      if (!e || e.personId || e.umfrageId || e.eventId) return false;
      if (e.termine.length > 0 || nachrichtenVon(id).length > 0) return false;
      liste.delete(id);
      return true;
    },
    async abrufStand() {
      return { ...stand };
    },
    async abrufStandSetzen(neu) {
      stand = { ...stand, ...neu };
    },
  };
  return { store, personen, liste, nachrichtenListe };
}
