import { randomUUID } from 'node:crypto';
import {
  gebindeBezeichnung,
  rechnungBerechnen,
  rechnungBuchungstext,
  rechnungEntwurfDatenSchema,
  rechnungNummer,
  rechnungStornoText,
  rechnungWarnungen,
  rechnungZahlungsKontoId,
  STEUERSATZ_ZEITRAEUME_SEED,
  type BelegModus,
  type DatenexportDaten,
  type Gebinde,
  type RechnungEntwurfDaten,
  type RechnungGestelltDto,
  type RechnungPostenDto,
  type RechnungVerein,
  type RechnungsempfaengerDto,
} from '@c4/shared';
import { BuchungUngueltig, type GebuchtErgebnis } from './finanzen';
import { datumBerlin, BelegWarnungenOffen, type BelegKonto } from './finanzenBelege';
import type { BelegeFakeKern } from './finanzenBelege.fake';
import {
  RechnungKonflikt,
  empfaengerDto,
  entwurfAusRechnung,
  listePasst,
  planeRechnung,
  planeRechnungZahlung,
  zahlungKontoIds,
  zustandBilden,
  type RechnungDetailEintrag,
  type RechnungEinstellungenEintrag,
  type RechnungEmpfaengerErgebnis,
  type RechnungEntwurfEintrag,
  type RechnungListeEintrag,
  type RechnungPostenZeile,
  type RechnungenStore,
} from './finanzenRechnungen';

/** What the Rechnungen fake needs from the journal fake. */
export interface RechnungenFakeKern extends BelegeFakeKern {
  /** Reverses a booking (journal Storno) with a fixed text; throws StornoKonflikt. */
  stornoAnhaengen(
    buchungId: string,
    e: {
      datum: string;
      text: (original: { seq: number }) => string;
      sub: string;
      rechnungErlaubt?: boolean;
    },
  ): Promise<GebuchtErgebnis>;
}

interface FakeRechnung {
  id: string;
  nummer: string;
  jahr: number;
  lfd: number;
  rechnungsdatum: string;
  leistungVon: string;
  leistungBis: string | null;
  faelligAm: string;
  mitgliedSub: string | null;
  empfaengerId: string | null;
  empfaengerName: string;
  empfaengerAnschrift: string;
  empfaengerUstId: string | null;
  verein: RechnungVerein;
  modus: BelegModus;
  betreff: string;
  einleitung: string | null;
  hinweis: string | null;
  bruttoCent: number;
  stornoVon: string | null;
  stornoBegruendung: string | null;
  buchungId: string;
  buchungSeq: number;
  schluessel: string;
  posten: RechnungPostenZeile[];
  erstelltVon: string;
  erstelltAm: string;
}

interface FakeZahlung {
  id: string;
  rechnungId: string;
  zahlweg: 'bank' | 'bar' | 'sumup';
  datum: string;
  kontoId: string;
  buchungId: string;
  buchungSeq: number;
  schluessel: string;
  erstelltVon: string;
  erstelltAm: string;
}

/** Map-backed Rechnungen store for tests; mirrors `createRechnungenStore`. */
export function createFakeRechnungenStore(k: RechnungenFakeKern): RechnungenStore {
  const einstellungen: RechnungEinstellungenEintrag[] = [];
  const empfaenger = new Map<string, RechnungsempfaengerDto>();
  const entwuerfe = new Map<string, RechnungEntwurfEintrag>();
  const rechnungen: FakeRechnung[] = [];
  const zahlungen: FakeZahlung[] = [];
  const dateien = new Map<string, { sha256: string; groesse: number }>();
  const zaehler = new Map<number, number>();

  const storniert = () => new Set(k.buchungen.flatMap((b) => (b.stornoVon ? [b.stornoVon] : [])));
  const aktiveZahlung = (id: string) => {
    const storno = storniert();
    return [...zahlungen].reverse().find((z) => z.rechnungId === id && !storno.has(z.buchungId));
  };
  const zustand = (r: FakeRechnung, heute: string) =>
    zustandBilden(
      { faelligAm: r.faelligAm, istStorno: r.stornoVon !== null },
      rechnungen.some((x) => x.stornoVon === r.id),
      aktiveZahlung(r.id) !== undefined,
      heute,
    );

  const naechsteNummer = (jahr: number) => {
    const lfd = (zaehler.get(jahr) ?? 0) + 1;
    zaehler.set(jahr, lfd);
    return { nummer: rechnungNummer(jahr, lfd), lfd };
  };

  const waren = (daten: RechnungEntwurfDaten) => {
    const alle = [...k.lager.gebinde.values()];
    const ids = new Set(
      daten.posten.flatMap((p) => (p.art === 'ware' && p.wareId ? [p.wareId] : [])),
    );
    return [...k.lager.waren.values()]
      .filter((w) => ids.has(w.id))
      .map((w) => ({
        id: w.id,
        name: w.name,
        archiviert: w.archiviert,
        gebinde: w.gebindeIds.flatMap((gid) => {
          const g = k.lager.gebinde.get(gid);
          return g
            ? [
                {
                  id: g.id,
                  archiviert: g.archiviert,
                  bezeichnung: gebindeBezeichnung(g as Gebinde, alle as Gebinde[]),
                },
              ]
            : [];
        }),
      }));
  };

  const kontext = (daten: RechnungEntwurfDaten, mitglied: RechnungEmpfaengerErgebnis | null) => {
    let ergebnis: RechnungEmpfaengerErgebnis | null = null;
    if (daten.empfaenger?.typ === 'mitglied') ergebnis = mitglied;
    else if (daten.empfaenger?.typ === 'extern') {
      const e = empfaenger.get(daten.empfaenger.id);
      ergebnis = !e
        ? { fehler: 'Den Empfänger gibt es nicht.' }
        : e.archiviert
          ? { fehler: `Der Empfänger „${e.name}“ ist archiviert.` }
          : {
              mitgliedSub: null,
              empfaengerId: e.id,
              name: e.name,
              anschrift: e.anschrift,
              ustId: e.ustId,
            };
    }
    return {
      konten: k.pruefKonten(),
      waren: waren(daten),
      zeitraeume: STEUERSATZ_ZEITRAEUME_SEED,
      heute: datumBerlin(new Date()),
      einstellungen: einstellungen[einstellungen.length - 1] ?? null,
      empfaenger: ergebnis,
    };
  };

  const postenDtos = (r: FakeRechnung): RechnungPostenDto[] =>
    r.posten.map((p) => ({
      ...p,
      erloesKontoName: k.konten.get(p.erloesKontoId)?.name ?? '',
      betragCent: p.gesamtCent,
    }));

  const gestellt = (r: FakeRechnung, wiederholt?: boolean): RechnungGestelltDto => ({
    id: r.id,
    nummer: r.nummer,
    buchungId: r.buchungId,
    buchungSeq: r.buchungSeq,
    ...(wiederholt && { wiederholt }),
  });

  const store: RechnungenStore = {
    async datenexportRechnungen(von, bis) {
      const imZeitraum = new Set(
        k.buchungen.filter((b) => b.datum >= von && b.datum <= bis).map((b) => b.id),
      );
      const zahlungenImZeitraum = zahlungen.filter((z) => imZeitraum.has(z.buchungId));
      const ids = new Set([
        ...rechnungen.filter((r) => imZeitraum.has(r.buchungId)).map((r) => r.id),
        ...zahlungenImZeitraum.map((z) => z.rechnungId),
      ]);
      const gewaehlt = rechnungen
        .filter((r) => ids.has(r.id))
        .sort((a, b) => a.nummer.localeCompare(b.nummer));
      return {
        rechnungen: gewaehlt.map((r) => ({
          id: r.id,
          nummer: r.nummer,
          rechnungsdatum: r.rechnungsdatum,
          leistungVon: r.leistungVon,
          leistungBis: r.leistungBis,
          faelligAm: r.faelligAm,
          mitgliedSub: r.mitgliedSub,
          empfaengerId: r.empfaengerId,
          empfaengerName: r.empfaengerName,
          empfaengerAnschrift: r.empfaengerAnschrift,
          empfaengerUstId: r.empfaengerUstId,
          modus: r.modus,
          betreff: r.betreff,
          bruttoCent: r.bruttoCent,
          stornoVon: r.stornoVon,
          stornoBegruendung: r.stornoBegruendung,
          buchungId: r.buchungId,
          dateiSha256: dateien.get(r.id)?.sha256 ?? null,
          dateiSchluessel: dateien.has(r.id) ? `rechnungen/${dateien.get(r.id)!.sha256}.pdf` : null,
          erstelltVon: r.erstelltVon,
          erstelltAm: r.erstelltAm,
        })),
        rechnungsposten: gewaehlt.flatMap((r) =>
          r.posten.map((p) => ({
            rechnungId: r.id,
            pos: p.pos,
            art: p.art,
            text: p.text,
            einheit: p.einheit,
            anzahlMilli: p.anzahlMilli,
            einzelpreisCent: p.einzelpreisCent,
            pfandCent: p.pfandCent,
            pfandBetragCent: p.pfandBetragCent,
            steuersatz: p.steuersatz,
            erloesKontoId: p.erloesKontoId,
            gesamtCent: p.gesamtCent,
          })),
        ),
        rechnungszahlungen: zahlungenImZeitraum.map((z) => ({
          id: z.id,
          rechnungId: z.rechnungId,
          zahlweg: z.zahlweg,
          datum: z.datum,
          kontoId: z.kontoId,
          buchungId: z.buchungId,
          erstelltVon: z.erstelltVon,
          erstelltAm: z.erstelltAm,
        })),
      } satisfies Pick<DatenexportDaten, 'rechnungen' | 'rechnungsposten' | 'rechnungszahlungen'>;
    },

    async rechnungEinstellungen() {
      return einstellungen[einstellungen.length - 1];
    },
    async rechnungEinstellungenSpeichern(eingabe, sub) {
      const id = randomUUID();
      einstellungen.push({
        ...eingabe,
        id,
        erstelltVon: sub,
        erstelltAm: new Date().toISOString(),
      });
      return id;
    },

    async rechnungsempfaenger(mitArchiv) {
      return [...empfaenger.values()]
        .filter((e) => mitArchiv || !e.archiviert)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => ({ ...e }));
    },
    async rechnungsempfaengerAnlegen(eingabe) {
      const gleich = (a: string) => a.trim().toLowerCase() === eingabe.name.trim().toLowerCase();
      if ([...empfaenger.values()].some((e) => gleich(e.name)))
        throw new BuchungUngueltig(['Diesen Empfänger gibt es schon.']);
      const id = randomUUID();
      empfaenger.set(
        id,
        empfaengerDto({
          id,
          name: eingabe.name.trim(),
          anschrift: eingabe.anschrift,
          email: eingabe.email,
          ustId: eingabe.ustId,
          archiviert: false,
        }),
      );
      return id;
    },
    async rechnungsempfaengerAendern(id, daten) {
      const e = empfaenger.get(id);
      if (!e) return false;
      if (
        daten.name !== undefined &&
        [...empfaenger.values()].some(
          (x) => x.id !== id && x.name.trim().toLowerCase() === daten.name!.trim().toLowerCase(),
        )
      )
        throw new BuchungUngueltig(['Diesen Empfänger gibt es schon.']);
      empfaenger.set(id, {
        ...e,
        ...(daten.name !== undefined && { name: daten.name.trim() }),
        ...(daten.anschrift !== undefined && { anschrift: daten.anschrift }),
        ...(daten.email !== undefined && { email: daten.email }),
        ...(daten.ustId !== undefined && { ustId: daten.ustId }),
        ...(daten.archiviert !== undefined && { archiviert: daten.archiviert }),
      });
      return true;
    },

    async rechnungEntwurfAnlegen(daten, sub) {
      const id = randomUUID();
      const jetzt = new Date().toISOString();
      entwuerfe.set(id, {
        id,
        daten: structuredClone(daten),
        erstelltVon: sub,
        erstelltAm: jetzt,
        geaendertAm: jetzt,
      });
      return id;
    },
    async rechnungEntwurf(id) {
      const e = entwuerfe.get(id);
      return e && structuredClone(e);
    },
    async rechnungEntwurfSpeichern(id, daten) {
      const e = entwuerfe.get(id);
      if (!e) return false;
      entwuerfe.set(id, {
        ...e,
        daten: structuredClone(daten),
        geaendertAm: new Date().toISOString(),
      });
      return true;
    },
    async rechnungEntwurfLoeschen(id) {
      return entwuerfe.delete(id);
    },
    async rechnungEntwurfWarnungen(id) {
      const e = entwuerfe.get(id);
      return e && rechnungWarnungen({ daten: e.daten, heute: datumBerlin(new Date()) });
    },

    async rechnungStellen(id, eingabe, sub, mitglied) {
      const schon = rechnungen.find((r) => r.schluessel === eingabe.idempotenzSchluessel);
      if (schon) return gestellt(schon, true);
      const e = entwuerfe.get(id);
      if (!e) return undefined;
      const daten = rechnungEntwurfDatenSchema.parse(e.daten);
      const plan = planeRechnung(daten, kontext(daten, mitglied));
      if (!plan.buchung) throw new BuchungUngueltig(plan.fehler);
      const b = plan.buchung;
      const offen = rechnungWarnungen({ daten, heute: b.rechnungsdatum }).filter(
        (w) => !eingabe.bestaetigt.includes(w.code),
      );
      if (offen.length > 0) throw new BelegWarnungenOffen(offen);
      const jahr = Number(b.rechnungsdatum.slice(0, 4));
      const { nummer, lfd } = naechsteNummer(jahr);
      const rechnungId = randomUUID();
      const gebucht = await k.anhaengen({
        datum: b.rechnungsdatum,
        text: rechnungBuchungstext(nummer, b.empfaenger.name),
        quelleTyp: 'rechnung',
        datumVerschiebbar: true,
        quelleId: rechnungId,
        eventId: null,
        stornoVon: null,
        erstelltVon: sub,
        zeilen: b.zeilen,
      });
      const r: FakeRechnung = {
        id: rechnungId,
        nummer,
        jahr,
        lfd,
        rechnungsdatum: b.rechnungsdatum,
        leistungVon: daten.leistungVon!,
        leistungBis: daten.leistungBis,
        faelligAm: b.faelligAm,
        mitgliedSub: b.empfaenger.mitgliedSub,
        empfaengerId: b.empfaenger.empfaengerId,
        empfaengerName: b.empfaenger.name,
        empfaengerAnschrift: b.empfaenger.anschrift,
        empfaengerUstId: b.empfaenger.ustId,
        verein: b.verein,
        modus: daten.modus,
        betreff: daten.betreff.trim(),
        einleitung: daten.einleitung,
        hinweis: daten.hinweis,
        bruttoCent: b.summeCent,
        stornoVon: null,
        stornoBegruendung: null,
        buchungId: gebucht.id,
        buchungSeq: gebucht.seq,
        schluessel: eingabe.idempotenzSchluessel,
        posten: b.posten,
        erstelltVon: sub,
        erstelltAm: new Date().toISOString(),
      };
      rechnungen.push(r);
      entwuerfe.delete(id);
      return gestellt(r);
    },

    async rechnungen(abfrage) {
      const heute = datumBerlin(new Date());
      const alle = rechnungen.map((r) => ({ r, z: zustand(r, heute) }));
      const offen = alle.filter((x) => x.z.status === 'gestellt');
      const entwurfListe: RechnungListeEintrag[] = [...entwuerfe.values()]
        .sort((a, b) => b.geaendertAm.localeCompare(a.geaendertAm))
        .map((e) => ({
          id: e.id,
          status: 'entwurf',
          ueberfaellig: false,
          nummer: null,
          istStorno: false,
          rechnungsdatum: null,
          faelligAm: null,
          empfaengerName:
            e.daten.empfaenger?.typ === 'extern'
              ? (empfaenger.get(e.daten.empfaenger.id)?.name ?? null)
              : null,
          mitgliedSub: e.daten.empfaenger?.typ === 'mitglied' ? e.daten.empfaenger.sub : null,
          bruttoCent: e.daten.posten.length > 0 ? rechnungBerechnen(e.daten).summe : null,
          betreff: e.daten.betreff,
        }));
      const passend = [...alle]
        .reverse()
        .filter((x) => abfrage.jahr === undefined || x.r.jahr === abfrage.jahr)
        .map(({ r, z }): RechnungListeEintrag => ({
          id: r.id,
          status: z.status,
          ueberfaellig: z.ueberfaellig,
          nummer: r.nummer,
          istStorno: r.stornoVon !== null,
          rechnungsdatum: r.rechnungsdatum,
          faelligAm: r.faelligAm,
          empfaengerName: r.empfaengerName,
          mitgliedSub: r.mitgliedSub,
          bruttoCent: r.bruttoCent,
          betreff: r.betreff,
        }))
        .filter((e) => listePasst(e, abfrage));
      return {
        eintraege: [
          ...entwurfListe.filter((e) => listePasst(e, abfrage)),
          ...passend.slice(0, abfrage.limit),
        ],
        gekappt: passend.length > abfrage.limit,
        offeneSummeCent: offen.reduce((s, x) => s + x.r.bruttoCent, 0),
        ueberfaelligAnzahl: offen.filter((x) => x.z.ueberfaellig).length,
      };
    },

    async rechnung(id) {
      const r = rechnungen.find((x) => x.id === id);
      if (!r) return undefined;
      const z = zustand(r, datumBerlin(new Date()));
      const zahlung = aktiveZahlung(id);
      const stornorechnung = rechnungen.find((x) => x.stornoVon === id);
      const original = r.stornoVon ? rechnungen.find((x) => x.id === r.stornoVon) : undefined;
      const bezug = (x: FakeRechnung) => ({
        id: x.id,
        nummer: x.nummer,
        rechnungsdatum: x.rechnungsdatum,
      });
      const posten = postenDtos(r);
      const eintrag: RechnungDetailEintrag = {
        id: r.id,
        nummer: r.nummer,
        jahr: r.jahr,
        istStorno: r.stornoVon !== null,
        status: z.status,
        ueberfaellig: z.ueberfaellig,
        rechnungsdatum: r.rechnungsdatum,
        leistungVon: r.leistungVon,
        leistungBis: r.leistungBis,
        faelligAm: r.faelligAm,
        mitgliedSub: r.mitgliedSub,
        empfaengerId: r.empfaengerId,
        empfaengerName: r.empfaengerName,
        empfaengerAnschrift: r.empfaengerAnschrift,
        empfaengerUstId: r.empfaengerUstId,
        verein: r.verein,
        modus: r.modus,
        betreff: r.betreff,
        einleitung: r.einleitung,
        hinweis: r.hinweis,
        bruttoCent: r.bruttoCent,
        posten,
        summen: rechnungBerechnen({ modus: r.modus, posten }).jeSteuersatz,
        stornoVon: original ? bezug(original) : null,
        stornoBegruendung: r.stornoBegruendung,
        stornorechnung: stornorechnung ? bezug(stornorechnung) : null,
        buchungId: r.buchungId,
        buchungSeq: r.buchungSeq,
        zahlung: zahlung
          ? {
              id: zahlung.id,
              zahlweg: zahlung.zahlweg,
              datum: zahlung.datum,
              buchungId: zahlung.buchungId,
              buchungSeq: zahlung.buchungSeq,
            }
          : null,
        datei: dateien.get(id) ?? null,
        erstelltVon: r.erstelltVon,
        erstelltAm: r.erstelltAm,
      };
      return structuredClone(eintrag);
    },

    async rechnungZahlen(id, eingabe, sub) {
      const schon = zahlungen.find((z) => z.schluessel === eingabe.idempotenzSchluessel);
      if (schon)
        return {
          id: schon.id,
          buchungId: schon.buchungId,
          buchungSeq: schon.buchungSeq,
          wiederholt: true,
        };
      const r = rechnungen.find((x) => x.id === id);
      if (!r) return undefined;
      if (r.stornoVon) throw new RechnungKonflikt('Eine Stornorechnung wird nicht bezahlt.');
      if (rechnungen.some((x) => x.stornoVon === id))
        throw new RechnungKonflikt('Die Rechnung ist storniert.');
      if (aktiveZahlung(id)) throw new RechnungKonflikt('Die Rechnung ist schon bezahlt.');
      const rechnung = {
        nummer: r.nummer,
        empfaengerName: r.empfaengerName,
        modus: r.modus,
        bruttoCent: r.bruttoCent,
        rechnungsdatum: r.rechnungsdatum,
        posten: r.posten,
      };
      const ids = new Set(zahlungKontoIds(rechnung, eingabe));
      const plan = planeRechnungZahlung(eingabe, {
        rechnung,
        konten: k.pruefKonten().filter((x) => ids.has(x.id)) as BelegKonto[],
        bestand: k.alleBestand(),
        heute: datumBerlin(new Date()),
      });
      if (plan.fehler.length > 0) throw new BuchungUngueltig(plan.fehler);
      const offen = plan.warnungen.filter((w) => !eingabe.bestaetigt.includes(w.code));
      if (offen.length > 0) throw new BelegWarnungenOffen(offen);
      const gebucht = await k.anhaengen({
        datum: eingabe.datum,
        text: plan.text,
        quelleTyp: 'rechnungszahlung',
        datumVerschiebbar: true,
        quelleId: id,
        eventId: null,
        stornoVon: null,
        erstelltVon: sub,
        zeilen: plan.zeilen,
      });
      const zahlungId = randomUUID();
      zahlungen.push({
        id: zahlungId,
        rechnungId: id,
        zahlweg: eingabe.zahlweg,
        datum: eingabe.datum,
        kontoId: rechnungZahlungsKontoId(eingabe),
        buchungId: gebucht.id,
        buchungSeq: gebucht.seq,
        schluessel: eingabe.idempotenzSchluessel,
        erstelltVon: sub,
        erstelltAm: new Date().toISOString(),
      });
      return { id: zahlungId, buchungId: gebucht.id, buchungSeq: gebucht.seq };
    },

    async rechnungStornieren(id, eingabe, sub) {
      const schon = rechnungen.find((r) => r.schluessel === eingabe.idempotenzSchluessel);
      if (schon) return gestellt(schon, true);
      const r = rechnungen.find((x) => x.id === id);
      if (!r) return undefined;
      if (r.stornoVon)
        throw new RechnungKonflikt('Eine Stornorechnung kann nicht storniert werden.');
      if (rechnungen.some((x) => x.stornoVon === id))
        throw new RechnungKonflikt('Die Rechnung ist schon storniert.');
      if (aktiveZahlung(id))
        throw new RechnungKonflikt(
          'Die Rechnung ist bezahlt. Storniere zuerst die Zahlungsbuchung im Journal, dann die Rechnung.',
        );
      const heute = datumBerlin(new Date());
      const jahr = Number(heute.slice(0, 4));
      const { nummer, lfd } = naechsteNummer(jahr);
      const gebucht = await k.stornoAnhaengen(r.buchungId, {
        datum: heute,
        text: () => rechnungStornoText(nummer, r.nummer),
        sub,
        rechnungErlaubt: true,
      });
      const storno: FakeRechnung = {
        ...structuredClone(r),
        id: randomUUID(),
        nummer,
        jahr,
        lfd,
        rechnungsdatum: heute,
        faelligAm: heute,
        bruttoCent: -r.bruttoCent,
        stornoVon: id,
        stornoBegruendung: eingabe.begruendung,
        buchungId: gebucht.id,
        buchungSeq: gebucht.seq,
        schluessel: eingabe.idempotenzSchluessel,
        posten: r.posten.map((p) => ({
          ...p,
          anzahlMilli: -p.anzahlMilli,
          gesamtCent: -p.gesamtCent,
          pfandBetragCent: p.pfandBetragCent === null ? null : -p.pfandBetragCent,
        })),
        erstelltVon: sub,
        erstelltAm: new Date().toISOString(),
      };
      rechnungen.push(storno);
      return gestellt(storno);
    },

    async rechnungKopieren(id, sub) {
      const r = rechnungen.find((x) => x.id === id);
      if (!r) return undefined;
      if (r.stornoVon) throw new RechnungKonflikt('Eine Stornorechnung lässt sich nicht kopieren.');
      return store.rechnungEntwurfAnlegen(entwurfAusRechnung(r), sub);
    },

    async rechnungDateiRegistrieren(id, datei) {
      if (!rechnungen.some((r) => r.id === id)) return 'fehlt';
      if (dateien.has(id)) return 'vorhanden';
      dateien.set(id, { sha256: datei.sha256, groesse: datei.groesse });
      return 'ok';
    },
  };
  return store;
}
