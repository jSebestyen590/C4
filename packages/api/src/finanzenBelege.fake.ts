import { randomUUID } from 'node:crypto';
import {
  belegBerechnen,
  belegBuchungstext,
  belegEntwurfDatenSchema,
  belegNummer,
  offeneAuslagen,
  saldoWarnungen,
  type AuslageBelegEintrag,
  type BelegDetailEintrag,
  type BelegEntwurfDaten,
  type BelegEntwurfEintrag,
  type BelegKorrektur,
  type BelegListeEintrag,
  type BelegPostenDto,
  type BelegStatus,
  type BestandKonto,
  type KettenBuchung,
  type KontoDto,
  type Zahlweg,
} from '@c4/shared';
import {
  BelegWarnungenOffen,
  belegWarnungenBilden,
  datumBerlin,
  planeBeleg,
  planeErstattung,
  type BelegeStore,
  type BelegKonto,
} from './finanzenBelege';
import { BuchungUngueltig, type BuchungsEntwurf } from './finanzen';

/** What the Belege fake needs from the journal fake. */
export interface BelegeFakeKern {
  konten: Map<string, Omit<KontoDto, 'saldoCent' | 'saldoGesamtCent'>>;
  buchungen: KettenBuchung[];
  pruefKonten(): BelegKonto[];
  alleBestand(): BestandKonto[];
  anhaengen(entwurf: BuchungsEntwurf): Promise<{ id: string; seq: number }>;
}

interface FakeBeleg {
  id: string;
  nummer: string;
  rechnungsstellerId: string;
  belegdatum: string;
  modus: 'brutto' | 'netto';
  zahlweg: Zahlweg;
  bezahldatum: string | null;
  mitgliedId: string | null;
  eigenbelegBegruendung: string | null;
  datei: BelegEntwurfDaten['datei'];
  posten: BelegPostenDto[];
  korrekturen: BelegKorrektur[];
  summeCent: number;
  buchungId: string;
  buchungSeq: number;
  schluessel: string;
  erstelltVon: string;
  erstelltAm: string;
}

interface FakeErstattung {
  id: string;
  mitgliedId: string;
  datum: string;
  buchungId: string;
  buchungSeq: number;
  summeCent: number;
  schluessel: string;
  belegIds: string[];
}

/** Map-backed Belege store for tests; mirrors `createBelegeStore`. */
export function createFakeBelegeStore(k: BelegeFakeKern): BelegeStore {
  const steller = new Map<string, { id: string; name: string; archiviert: boolean }>();
  const entwuerfe = new Map<string, BelegEntwurfEintrag>();
  const belege: FakeBeleg[] = [];
  const erstattungen: FakeErstattung[] = [];
  const zaehler = new Map<number, number>();

  const storniert = () => new Set(k.buchungen.flatMap((b) => (b.stornoVon ? [b.stornoVon] : [])));
  const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const kontext = (daten: BelegEntwurfDaten) => ({
    konten: k.pruefKonten(),
    bestand: k.alleBestand(),
    rechnungssteller: daten.rechnungsstellerId ? steller.get(daten.rechnungsstellerId) : undefined,
  });
  const warnungen = (daten: BelegEntwurfDaten) => {
    const summe = daten.posten.length > 0 ? belegBerechnen(daten).summe : null;
    const plan = planeBeleg(daten, kontext(daten));
    const salden = new Map<string, number>();
    for (const b of k.buchungen)
      for (const z of b.zeilen) salden.set(z.kontoId, (salden.get(z.kontoId) ?? 0) + z.betragCent);
    const storno = storniert();
    const aktiv = belege.filter((b) => !storno.has(b.buchungId));
    return belegWarnungenBilden({
      daten,
      summeCent: summe,
      heute: datumBerlin(new Date()),
      dateiDoppelt: !!daten.datei && aktiv.some((b) => b.datei?.sha256 === daten.datei!.sha256),
      belegDoppelt:
        !!daten.rechnungsstellerId &&
        aktiv.some(
          (b) =>
            b.rechnungsstellerId === daten.rechnungsstellerId &&
            b.belegdatum === daten.belegdatum &&
            b.summeCent === summe,
        ),
      saldo: plan.buchung
        ? saldoWarnungen(
            plan.buchung.zeilen,
            [...new Set(plan.buchung.zeilen.map((z) => z.kontoId))].flatMap((id) => {
              const c = k.konten.get(id);
              return c ? [{ id, name: c.name, art: c.art, saldoCent: salden.get(id) ?? 0 }] : [];
            }),
          )
        : [],
    });
  };
  const offen = (mitgliedId?: string) => {
    const eintraege: AuslageBelegEintrag[] = belege
      .filter((b) => b.zahlweg === 'auslage' && (!mitgliedId || b.mitgliedId === mitgliedId))
      .map((b) => ({
        id: b.id,
        mitgliedId: b.mitgliedId,
        zahlweg: b.zahlweg,
        summeCent: b.summeCent,
        buchungId: b.buchungId,
        nummer: b.nummer,
        rechnungssteller: steller.get(b.rechnungsstellerId)?.name ?? '',
        belegdatum: b.belegdatum,
      }));
    return offeneAuslagen(eintraege, erstattungen, storniert());
  };

  const store: BelegeStore = {
    async rechnungssteller(mitArchiv) {
      return [...steller.values()]
        .filter((r) => mitArchiv || !r.archiviert)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((r) => ({
          ...r,
          zuletztAm:
            belege
              .filter((b) => b.rechnungsstellerId === r.id)
              .map((b) => b.erstelltAm)
              .sort()
              .at(-1) ?? null,
        }));
    },
    async rechnungsstellerAnlegen(name) {
      if ([...steller.values()].some((r) => gleich(r.name, name)))
        throw new BuchungUngueltig(['Diesen Rechnungssteller gibt es schon.']);
      const id = randomUUID();
      steller.set(id, { id, name: name.trim(), archiviert: false });
      return id;
    },
    async rechnungsstellerAendern(id, daten) {
      const r = steller.get(id);
      if (!r) return false;
      if (
        daten.name !== undefined &&
        [...steller.values()].some((x) => x.id !== id && gleich(x.name, daten.name!))
      )
        throw new BuchungUngueltig(['Diesen Rechnungssteller gibt es schon.']);
      if (daten.name !== undefined) r.name = daten.name.trim();
      if (daten.archiviert !== undefined) r.archiviert = daten.archiviert;
      return true;
    },
    async belege(abfrage) {
      const passt = (
        s: Pick<BelegListeEintrag, 'rechnungsstellerId' | 'belegdatum' | 'zahlweg' | 'mitgliedId'>,
      ) =>
        (!abfrage.rechnungsstellerId || s.rechnungsstellerId === abfrage.rechnungsstellerId) &&
        (!abfrage.zahlweg || s.zahlweg === abfrage.zahlweg) &&
        (!abfrage.mitgliedId || s.mitgliedId === abfrage.mitgliedId) &&
        (!abfrage.von || (s.belegdatum !== null && s.belegdatum >= abfrage.von)) &&
        (!abfrage.bis || (s.belegdatum !== null && s.belegdatum <= abfrage.bis));
      const liste: BelegListeEintrag[] = [];
      if (!abfrage.status || abfrage.status === 'entwurf') {
        for (const e of [...entwuerfe.values()].sort((a, b) =>
          b.geaendertAm.localeCompare(a.geaendertAm),
        )) {
          const d = e.daten;
          const eintrag: BelegListeEintrag = {
            id: e.id,
            status: 'entwurf',
            nummer: null,
            rechnungsstellerId: d.rechnungsstellerId,
            rechnungssteller: d.rechnungsstellerId
              ? (steller.get(d.rechnungsstellerId)?.name ?? null)
              : null,
            belegdatum: d.belegdatum,
            summeCent: d.posten.length > 0 ? belegBerechnen(d).summe : null,
            zahlweg: d.zahlweg,
            mitgliedId: d.mitgliedId,
            hatDatei: d.datei !== null,
            erstelltAm: e.erstelltAm,
          };
          if (passt(eintrag)) liste.push(eintrag);
        }
      }
      if (abfrage.status !== 'entwurf') {
        const storno = storniert();
        const gebucht = [...belege]
          .sort(
            (a, b) => b.belegdatum.localeCompare(a.belegdatum) || b.nummer.localeCompare(a.nummer),
          )
          .flatMap((b): BelegListeEintrag[] => {
            const status: BelegStatus = storno.has(b.buchungId) ? 'storniert' : 'gebucht';
            const eintrag: BelegListeEintrag = {
              id: b.id,
              status,
              nummer: b.nummer,
              rechnungsstellerId: b.rechnungsstellerId,
              rechnungssteller: steller.get(b.rechnungsstellerId)?.name ?? null,
              belegdatum: b.belegdatum,
              summeCent: b.summeCent,
              zahlweg: b.zahlweg,
              mitgliedId: b.mitgliedId,
              hatDatei: b.datei !== null,
              erstelltAm: b.erstelltAm,
            };
            return passt(eintrag) && (!abfrage.status || abfrage.status === status)
              ? [eintrag]
              : [];
          });
        liste.push(...gebucht.slice(0, abfrage.limit));
      }
      return liste;
    },
    async beleg(id) {
      const b = belege.find((x) => x.id === id);
      if (!b) return undefined;
      const storno = storniert();
      const e = erstattungen.find((x) => x.belegIds.includes(id) && !storno.has(x.buchungId));
      const rechnung = belegBerechnen({
        modus: b.modus,
        posten: b.posten,
        korrekturen: b.korrekturen,
      });
      return {
        id: b.id,
        nummer: b.nummer,
        rechnungsstellerId: b.rechnungsstellerId,
        rechnungssteller: steller.get(b.rechnungsstellerId)?.name ?? '',
        belegdatum: b.belegdatum,
        modus: b.modus,
        zahlweg: b.zahlweg,
        bezahldatum: b.zahlweg === 'auslage' ? (e?.datum ?? null) : b.bezahldatum,
        mitgliedId: b.mitgliedId,
        eigenbelegBegruendung: b.eigenbelegBegruendung,
        datei: b.datei,
        posten: b.posten,
        korrekturen: b.korrekturen,
        jeSteuersatz: rechnung.jeSteuersatz,
        summeCent: b.summeCent,
        buchung: { id: b.buchungId, seq: b.buchungSeq },
        storniert: storno.has(b.buchungId),
        erstattung: e
          ? { id: e.id, datum: e.datum, buchung: { id: e.buchungId, seq: e.buchungSeq } }
          : null,
        erstelltVon: b.erstelltVon,
        erstelltAm: b.erstelltAm,
      } satisfies BelegDetailEintrag;
    },
    async entwurfAnlegen(daten, sub) {
      const id = randomUUID();
      const jetzt = new Date().toISOString();
      entwuerfe.set(id, { id, daten, erstelltVon: sub, erstelltAm: jetzt, geaendertAm: jetzt });
      return id;
    },
    async entwurf(id) {
      const e = entwuerfe.get(id);
      return e && structuredClone(e);
    },
    async entwurfSpeichern(id, daten) {
      const e = entwuerfe.get(id);
      if (!e) return false;
      entwuerfe.set(id, { ...e, daten, geaendertAm: new Date().toISOString() });
      return true;
    },
    async entwurfLoeschen(id) {
      return entwuerfe.delete(id);
    },
    async belegWarnungen(id) {
      const e = entwuerfe.get(id);
      return e && warnungen(e.daten);
    },
    async entwurfBuchen(id, eingabe, sub) {
      const schon = belege.find((b) => b.schluessel === eingabe.idempotenzSchluessel);
      if (schon)
        return {
          id: schon.id,
          nummer: schon.nummer,
          buchungId: schon.buchungId,
          buchungSeq: schon.buchungSeq,
          wiederholt: true,
        };
      const e = entwuerfe.get(id);
      if (!e) return undefined;
      const daten = belegEntwurfDatenSchema.parse(e.daten);
      const plan = planeBeleg(daten, kontext(daten));
      if (!plan.buchung) throw new BuchungUngueltig(plan.fehler);
      const offeneWarnungen = warnungen(daten).filter((w) => !eingabe.bestaetigt.includes(w.code));
      if (offeneWarnungen.length > 0) throw new BelegWarnungenOffen(offeneWarnungen);
      const jahr = Number(datumBerlin(new Date()).slice(0, 4));
      const n = (zaehler.get(jahr) ?? 0) + 1;
      zaehler.set(jahr, n);
      const nummer = belegNummer(jahr, n);
      const belegId = randomUUID();
      const gebucht = await k.anhaengen({
        datum: plan.buchung.datum,
        text: belegBuchungstext(nummer, plan.buchung.rechnungssteller),
        quelleTyp: 'beleg',
        quelleId: belegId,
        eventId: null,
        stornoVon: null,
        erstelltVon: sub,
        zeilen: plan.buchung.zeilen,
        belege: daten.datei ? [{ sha256: daten.datei.sha256 }] : [],
      });
      const rechnung = belegBerechnen(daten);
      belege.push({
        id: belegId,
        nummer,
        rechnungsstellerId: daten.rechnungsstellerId!,
        belegdatum: daten.belegdatum!,
        modus: daten.modus,
        zahlweg: daten.zahlweg!,
        bezahldatum: daten.zahlweg === 'auslage' ? null : daten.bezahldatum,
        mitgliedId: daten.zahlweg === 'auslage' ? daten.mitgliedId : null,
        eigenbelegBegruendung: daten.datei ? null : daten.eigenbelegBegruendung,
        datei: daten.datei,
        posten: daten.posten.map((p, i) => ({
          pos: i + 1,
          kategorieId: p.kategorieId!,
          kategorieName: k.konten.get(p.kategorieId!)?.name ?? '',
          text: p.text,
          anzahlMilli: p.anzahlMilli,
          einzelpreisCent: p.einzelpreisCent,
          steuersatz: p.steuersatz,
          betragCent: rechnung.postenBetraege[i]!,
        })),
        korrekturen: daten.korrekturen.filter((c) => c.nettoCent !== 0 || c.steuerCent !== 0),
        summeCent: plan.buchung.summeCent,
        buchungId: gebucht.id,
        buchungSeq: gebucht.seq,
        schluessel: eingabe.idempotenzSchluessel,
        erstelltVon: sub,
        erstelltAm: new Date().toISOString(),
      });
      entwuerfe.delete(id);
      return { id: belegId, nummer, buchungId: gebucht.id, buchungSeq: gebucht.seq };
    },
    async entwurfKopieren(belegId, sub) {
      const d = await store.beleg(belegId);
      if (!d) return undefined;
      return store.entwurfAnlegen(
        belegEntwurfDatenSchema.parse({
          rechnungsstellerId: d.rechnungsstellerId,
          belegdatum: d.belegdatum,
          modus: d.modus,
          posten: d.posten,
          korrekturen: d.korrekturen,
          zahlweg: d.zahlweg,
          bezahldatum: d.zahlweg === 'auslage' ? null : d.bezahldatum,
          mitgliedId: d.mitgliedId,
          eigenbelegBegruendung: d.eigenbelegBegruendung,
          datei: d.datei,
        }),
        sub,
      );
    },
    async dateiGebucht(sha256) {
      const storno = storniert();
      const b = belege.find((x) => x.datei?.sha256 === sha256 && !storno.has(x.buchungId));
      return b ? { id: b.id, nummer: b.nummer } : null;
    },
    async auslagen() {
      return offen();
    },
    async erstatten(eingabe, sub, mitgliedName) {
      const schon = erstattungen.find((e) => e.schluessel === eingabe.idempotenzSchluessel);
      if (schon)
        return {
          id: schon.id,
          buchungId: schon.buchungId,
          buchungSeq: schon.buchungSeq,
          summeCent: schon.summeCent,
          wiederholt: true,
        };
      const plan = planeErstattung(eingabe, {
        konten: k.pruefKonten(),
        bestand: k.alleBestand(),
        offen: offen(eingabe.mitgliedId).flatMap((m) => m.belege),
        mitgliedName,
      });
      if (plan.fehler.length > 0) throw new BuchungUngueltig(plan.fehler);
      const id = randomUUID();
      const gebucht = await k.anhaengen({
        datum: eingabe.datum,
        text: plan.text,
        quelleTyp: 'erstattung',
        quelleId: id,
        eventId: null,
        stornoVon: null,
        erstelltVon: sub,
        zeilen: plan.zeilen,
      });
      erstattungen.push({
        id,
        mitgliedId: eingabe.mitgliedId,
        datum: eingabe.datum,
        buchungId: gebucht.id,
        buchungSeq: gebucht.seq,
        summeCent: plan.summeCent,
        schluessel: eingabe.idempotenzSchluessel,
        belegIds: [...new Set(eingabe.belegIds)],
      });
      return { id, buchungId: gebucht.id, buchungSeq: gebucht.seq, summeCent: plan.summeCent };
    },
  };
  return store;
}
