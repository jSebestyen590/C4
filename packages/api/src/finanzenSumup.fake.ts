import {
  SUMUP_GUTHABEN_KONTO_ID,
  pruefeBuchung,
  sumupAuszahlungen,
  type KettenBuchung,
  type PruefKonto,
  type SumupAuszahlungZeile,
  type SumupTransaktion,
} from '@c4/shared';
import { BuchungUngueltig, type BuchungsEntwurf } from './finanzen';
import {
  SumupKonflikt,
  SumupUnbekannt,
  offeneTransaktionen,
  sumupAuszahlungDtos,
  sumupBuchungPlan,
  sumupEventDtos,
  sumupEventFenster,
  sumupEventPruefen,
  sumupGruppenDtos,
  type SumupStore,
} from './finanzenSumup';

/** What the SumUp fake needs from the journal fake. */
export interface SumupFakeKern {
  buchungen: KettenBuchung[];
  /** Events as the journal fake knows them (`ende` defaults to `beginn` + 4 h). */
  events: Map<string, { titel: string | null; beginn: string; ende?: string; abgesagt: boolean }>;
  pruefKonten(): PruefKonto[];
  anhaengen(entwurf: BuchungsEntwurf): Promise<{ id: string; seq: number; datum: string }>;
  vorhandene(schluessel: string): { id: string; seq: number } | undefined;
}

/** Map-backed SumUp store for tests. */
export function createFakeSumupStore(k: SumupFakeKern): SumupStore {
  const transaktionen = new Map<string, SumupTransaktion & { abgerufenAm: string }>();
  const auszahlungen = new Map<string, SumupAuszahlungZeile & { abgerufenAm: string }>();
  const zuordnungen: { transaktionId: string; buchungId: string }[] = [];

  const aktiveIds = () => {
    const storniert = new Set(k.buchungen.flatMap((b) => (b.stornoVon ? [b.stornoVon] : [])));
    return new Set(
      zuordnungen.filter((z) => !storniert.has(z.buchungId)).map((z) => z.transaktionId),
    );
  };
  const ohneStempel = <T extends { abgerufenAm: string }>(x: T): Omit<T, 'abgerufenAm'> => {
    const kopie = { ...x } as Partial<T>;
    delete kopie.abgerufenAm;
    return kopie as Omit<T, 'abgerufenAm'>;
  };
  const ohneRoh = <T extends { roh: string }>(x: T): Omit<T, 'roh'> => {
    const kopie = { ...x } as Partial<T>;
    delete kopie.roh;
    return kopie as Omit<T, 'roh'>;
  };
  const eventEnde = (e: { beginn: string; ende?: string }) =>
    e.ende ?? new Date(Date.parse(e.beginn) + 4 * 3600_000).toISOString();

  const stand = () => {
    const t = [...transaktionen.values()];
    const a = [...auszahlungen.values()];
    const abgerufen = [...t, ...a].map((x) => x.abgerufenAm).sort();
    return {
      zeitpunkt:
        t
          .map((x) => x.zeitpunkt)
          .sort()
          .at(-1) ?? null,
      datum:
        a
          .map((x) => x.datum)
          .sort()
          .at(-1) ?? null,
      abgerufenAm: abgerufen.at(-1) ?? null,
    };
  };

  return {
    async sumupSpeichern(neueT, neueA) {
      let transaktionenNeu = 0;
      let auszahlungenNeu = 0;
      const jetzt = new Date().toISOString();
      for (const t of neueT.map(ohneRoh))
        if (!transaktionen.has(t.id)) {
          transaktionen.set(t.id, { ...t, abgerufenAm: jetzt });
          transaktionenNeu += 1;
        }
      for (const a of neueA.map(ohneRoh))
        if (!auszahlungen.has(a.id)) {
          auszahlungen.set(a.id, { ...a, abgerufenAm: jetzt });
          auszahlungenNeu += 1;
        }
      return { transaktionenNeu, auszahlungenNeu };
    },
    async sumupStand() {
      return stand();
    },
    async sumupUebersicht() {
      const offen = offeneTransaktionen([...transaktionen.values()], aktiveIds())
        .map(ohneStempel)
        .sort((a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt));
      const fenster = sumupEventFenster(offen.map((t) => t.zeitpunkt));
      const eventListe = sumupEventDtos(
        fenster
          ? [...k.events.entries()]
              .map(([id, e]) => ({ id, ...e, ende: eventEnde(e) }))
              .filter(
                (e) =>
                  Date.parse(e.beginn) <= fenster.bis.getTime() &&
                  Date.parse(e.ende) >= fenster.von.getTime(),
              )
          : [],
      );
      const saldoCent = k.buchungen
        .flatMap((b) => b.zeilen)
        .filter((z) => z.kontoId === SUMUP_GUTHABEN_KONTO_ID)
        .reduce((s, z) => s + z.betragCent, 0);
      return {
        gruppen: sumupGruppenDtos(offen, eventListe),
        events: eventListe,
        auszahlungen: sumupAuszahlungDtos([...auszahlungen.values()].map(ohneStempel)),
        letzterAbrufAm: stand().abgerufenAm,
        saldoCent,
      };
    },
    async offeneSumupAuszahlungen() {
      return sumupAuszahlungen([...auszahlungen.values()].map(ohneStempel));
    },
    async sumupBuchen(auftrag) {
      const schon = k.vorhandene(auftrag.idempotenzSchluessel);
      if (schon) {
        const b = k.buchungen.find((x) => x.id === schon.id);
        return { id: schon.id, seq: schon.seq, datum: b?.datum ?? '', wiederholt: true };
      }
      const ids = [...new Set(auftrag.transaktionIds)].sort();
      const rows = ids.flatMap((id) => transaktionen.get(id) ?? []);
      if (rows.length !== ids.length)
        throw new SumupUnbekannt('Mindestens eine Zahlung gibt es nicht.');
      const aktiv = aktiveIds();
      if (ids.some((id) => aktiv.has(id)))
        throw new SumupKonflikt('Mindestens eine Zahlung ist schon gebucht.');
      const event = auftrag.eventId ? k.events.get(auftrag.eventId) : undefined;
      if (auftrag.eventId) {
        const eventFehler = sumupEventPruefen(event);
        if (eventFehler.length > 0) throw new BuchungUngueltig(eventFehler);
      }
      const plan = sumupBuchungPlan(rows.map(ohneStempel), auftrag.eventId, event);
      const fehler = pruefeBuchung({ zeilen: plan.zeilen }, k.pruefKonten());
      if (fehler.length > 0) throw new BuchungUngueltig(fehler);
      const gebucht = await k.anhaengen({
        datum: plan.datum,
        text: plan.text,
        quelleTyp: 'sumup',
        quelleId: ids[0]!,
        eventId: plan.eventId,
        stornoVon: null,
        erstelltVon: auftrag.erstelltVon,
        idempotenzSchluessel: auftrag.idempotenzSchluessel,
        datumVerschiebbar: true,
        zeilen: plan.zeilen,
      });
      for (const id of ids) zuordnungen.push({ transaktionId: id, buchungId: gebucht.id });
      return { id: gebucht.id, seq: gebucht.seq, datum: gebucht.datum };
    },
  };
}
