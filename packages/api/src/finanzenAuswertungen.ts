import {
  PFAND_KONTO_ID,
  SUMUP_ERLOES_KONTO_ID,
  type AuswertungKonto,
  type AuswertungZeile,
  type EinkaufPostenRoh,
  type EventEinnahmeRoh,
  type Gebinde,
  type PfandZeileRoh,
  type SteuersatzZeitraum,
} from '@c4/shared';
import { and, between, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import {
  eventKategorien,
  events,
  finBelege,
  finBelegposten,
  finBuchungen,
  finBuchungszeilen,
  finKassenabrechnungEvents,
  finKassenabrechnungen,
  finKonten,
  finSteuersatzZeitraeume,
  gebinde,
  waren,
} from './db/schema';

/** Raw rows for the Auswertungen (docs/finanzen.md „Auswertungen“); all calculation happens in `@c4/shared`. */
export interface AuswertungenStore {
  /** Journal lines of the Buchungen with `von <= datum <= bis`, including Stornos. */
  auswertungZeilen(von: string, bis: string): Promise<AuswertungZeile[]>;
  auswertungKonten(): Promise<AuswertungKonto[]>;
  auswertungSteuersaetze(): Promise<Pick<SteuersatzZeitraum, 'ab' | 'regel' | 'ermaessigt'>[]>;
  /** Event revenue (bar, karte) of events starting in `von..bis` (Berlin date); cancelled sources left out. */
  auswertungEventQuellen(von: string, bis: string): Promise<EventEinnahmeRoh[]>;
  /** Ware items of booked Belege with a Belegdatum in the year plus all Gebinde. */
  auswertungEinkauf(jahr: number): Promise<{ posten: EinkaufPostenRoh[]; gebinde: Gebinde[] }>;
  /** Lines of the account `pfand` up to the end of the year. */
  auswertungPfandZeilen(jahr: number): Promise<PfandZeileRoh[]>;
}

const CHUNK = 500;
const stuecke = <T>(liste: readonly T[], n = CHUNK): T[][] => {
  const teile: T[][] = [];
  for (let i = 0; i < liste.length; i += n) teile.push(liste.slice(i, i + n));
  return teile;
};

const berlinDatumSql = sql`(${events.beginn} AT TIME ZONE 'Europe/Berlin')::date`;

export function createAuswertungenStore(db: Db): AuswertungenStore {
  /** Ids of the Buchungen (of `ids`) that a Storno reverses. */
  const stornierte = async (ids: readonly string[]): Promise<Set<string>> => {
    const ergebnis = new Set<string>();
    for (const teil of stuecke(ids)) {
      const rows = await db
        .select({ id: finBuchungen.stornoVon })
        .from(finBuchungen)
        .where(inArray(finBuchungen.stornoVon, teil));
      for (const r of rows) if (r.id) ergebnis.add(r.id);
    }
    return ergebnis;
  };

  return {
    async auswertungZeilen(von, bis) {
      return db
        .select({
          buchungId: finBuchungen.id,
          datum: finBuchungen.datum,
          quelleTyp: finBuchungen.quelleTyp,
          eventId: finBuchungen.eventId,
          stornoVon: finBuchungen.stornoVon,
          kontoId: finBuchungszeilen.kontoId,
          betragCent: finBuchungszeilen.betragCent,
          nettoCent: finBuchungszeilen.nettoCent,
          steuerCent: finBuchungszeilen.steuerCent,
          steuersatz: finBuchungszeilen.steuersatz,
          steuerArt: finBuchungszeilen.steuerArt,
        })
        .from(finBuchungszeilen)
        .innerJoin(finBuchungen, eq(finBuchungen.id, finBuchungszeilen.buchungId))
        .where(between(finBuchungen.datum, von, bis));
    },

    async auswertungKonten() {
      return db
        .select({
          id: finKonten.id,
          name: finKonten.name,
          art: finKonten.art,
          parentId: finKonten.parentId,
          euerZeile: finKonten.euerZeile,
        })
        .from(finKonten);
    },

    async auswertungSteuersaetze() {
      return db
        .select({
          ab: finSteuersatzZeitraeume.ab,
          regel: finSteuersatzZeitraeume.regel,
          ermaessigt: finSteuersatzZeitraeume.ermaessigt,
        })
        .from(finSteuersatzZeitraeume);
    },

    async auswertungEventQuellen(von, bis) {
      const stamm = {
        eventId: events.id,
        titel: events.titel,
        beginn: events.beginn,
        kategorieId: eventKategorien.id,
        kategorieName: eventKategorien.name,
        kategorieFarbe: eventKategorien.farbe,
      };
      const roh = (r: {
        titel: string | null;
        beginn: Date;
        eventId: string;
        kategorieId: string;
        kategorieName: string;
        kategorieFarbe: string;
      }) => ({
        eventId: r.eventId,
        titel: r.titel || r.kategorieName,
        beginn: r.beginn.toISOString(),
        kategorieId: r.kategorieId,
        kategorieName: r.kategorieName,
        kategorieFarbe: r.kategorieFarbe,
      });
      const imZeitraum = between(berlinDatumSql, sql`${von}::date`, sql`${bis}::date`);
      const ergebnis: EventEinnahmeRoh[] = [];

      // Cash: the Einnahme of the event in a settlement, net share from the Erlös line of its Buchung.
      const bar = await db
        .select({
          ...stamm,
          buchungId: finKassenabrechnungen.buchungId,
          erloesKontoId: finKassenabrechnungen.erloesKontoId,
          betragCent: finKassenabrechnungEvents.betragCent,
        })
        .from(finKassenabrechnungEvents)
        .innerJoin(
          finKassenabrechnungen,
          eq(finKassenabrechnungen.id, finKassenabrechnungEvents.abrechnungId),
        )
        .innerJoin(events, eq(events.id, finKassenabrechnungEvents.eventId))
        .innerJoin(eventKategorien, eq(eventKategorien.id, events.kategorieId))
        .where(and(imZeitraum, isNotNull(finKassenabrechnungen.buchungId)));
      const barBuchungen = [...new Set(bar.flatMap((b) => (b.buchungId ? [b.buchungId] : [])))];
      const barStorniert = await stornierte(barBuchungen);
      const erloesZeilen = new Map<string, { brutto: number; netto: number }>();
      for (const teil of stuecke(barBuchungen)) {
        const rows = await db
          .select({
            buchungId: finBuchungszeilen.buchungId,
            kontoId: finBuchungszeilen.kontoId,
            betragCent: finBuchungszeilen.betragCent,
            nettoCent: finBuchungszeilen.nettoCent,
          })
          .from(finBuchungszeilen)
          .where(inArray(finBuchungszeilen.buchungId, teil));
        for (const r of rows) {
          const abrechnung = bar.find(
            (b) => b.buchungId === r.buchungId && b.erloesKontoId === r.kontoId,
          );
          if (!abrechnung) continue;
          const alt = erloesZeilen.get(r.buchungId) ?? { brutto: 0, netto: 0 };
          erloesZeilen.set(r.buchungId, {
            brutto: alt.brutto - r.betragCent,
            netto: alt.netto - (r.nettoCent ?? r.betragCent),
          });
        }
      }
      for (const b of bar) {
        if (!b.buchungId || barStorniert.has(b.buchungId)) continue;
        const summe = erloesZeilen.get(b.buchungId);
        const netto =
          summe && summe.brutto !== 0
            ? Math.round((b.betragCent * summe.netto) / summe.brutto)
            : b.betragCent;
        ergebnis.push({ ...roh(b), quelle: 'bar', bruttoCent: b.betragCent, nettoCent: netto });
      }

      // Card: SumUp Buchungen with an event, Erlös line `kartenerloese`.
      const karte = await db
        .select({
          ...stamm,
          buchungId: finBuchungen.id,
          betragCent: finBuchungszeilen.betragCent,
          nettoCent: finBuchungszeilen.nettoCent,
        })
        .from(finBuchungen)
        .innerJoin(finBuchungszeilen, eq(finBuchungszeilen.buchungId, finBuchungen.id))
        .innerJoin(events, eq(events.id, finBuchungen.eventId))
        .innerJoin(eventKategorien, eq(eventKategorien.id, events.kategorieId))
        .where(
          and(
            imZeitraum,
            eq(finBuchungen.quelleTyp, 'sumup'),
            isNull(finBuchungen.stornoVon),
            eq(finBuchungszeilen.kontoId, SUMUP_ERLOES_KONTO_ID),
          ),
        );
      const karteStorniert = await stornierte([...new Set(karte.map((k) => k.buchungId))]);
      for (const k of karte) {
        if (karteStorniert.has(k.buchungId)) continue;
        ergebnis.push({
          ...roh(k),
          quelle: 'karte',
          bruttoCent: -k.betragCent,
          nettoCent: -(k.nettoCent ?? k.betragCent),
        });
      }
      return ergebnis;
    },

    async auswertungEinkauf(jahr) {
      const rows = await db
        .select({
          belegId: finBelege.id,
          buchungId: finBelege.buchungId,
          modus: finBelege.modus,
          eigenbelegBegruendung: finBelege.eigenbelegBegruendung,
          dateiSha256: finBelege.dateiSha256,
          wareId: finBelegposten.wareId,
          wareName: waren.name,
          standardGebindeId: waren.standardGebindeId,
          gebindeId: finBelegposten.gebindeId,
          anzahlMilli: finBelegposten.anzahlMilli,
          betragCent: finBelegposten.betragCent,
          steuersatz: finBelegposten.steuersatz,
        })
        .from(finBelegposten)
        .innerJoin(finBelege, eq(finBelege.id, finBelegposten.belegId))
        .innerJoin(waren, eq(waren.id, finBelegposten.wareId))
        .where(
          and(
            eq(finBelegposten.art, 'ware'),
            between(finBelege.belegdatum, `${jahr}-01-01`, `${jahr}-12-31`),
          ),
        );
      const storniert = await stornierte([...new Set(rows.map((r) => r.buchungId))]);
      const posten: EinkaufPostenRoh[] = rows
        .filter((r) => !storniert.has(r.buchungId) && r.wareId && r.gebindeId)
        .map((r) => ({
          wareId: r.wareId!,
          wareName: r.wareName,
          standardGebindeId: r.standardGebindeId,
          gebindeId: r.gebindeId!,
          anzahlMilli: r.anzahlMilli,
          betragCent: r.betragCent,
          steuersatz: r.steuersatz,
          modus: r.modus,
          eigenbeleg: !r.dateiSha256 && !!r.eigenbelegBegruendung,
        }));
      const alle = await db.select().from(gebinde);
      return {
        posten,
        gebinde: alle.map((g) => ({
          id: g.id,
          menge: g.menge,
          einheit: g.einheit,
          verpackungseinheit: g.verpackungseinheit,
          pfandCent: g.pfandCent,
          unterGebindeId: g.unterGebindeId,
          unterAnzahl: g.unterAnzahl,
        })),
      };
    },

    async auswertungPfandZeilen(jahr) {
      return db
        .select({ datum: finBuchungen.datum, betragCent: finBuchungszeilen.betragCent })
        .from(finBuchungszeilen)
        .innerJoin(finBuchungen, eq(finBuchungen.id, finBuchungszeilen.buchungId))
        .where(
          and(
            eq(finBuchungszeilen.kontoId, PFAND_KONTO_ID),
            lte(finBuchungen.datum, `${jahr}-12-31`),
          ),
        );
    },
  };
}
