import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, sql } from 'drizzle-orm';
import {
  ABGLEICH_STICHTAG_SCHLUESSEL,
  basisMengeAnzeigen,
  heuteBerlin,
  inBasiseinheiten,
  lagerAbgleich,
  sollMengeBasis,
  type AbgleichGrund,
  type AbgleichIst,
  type AbgleichKorrektur,
  type AbgleichSoll,
  type AbgleichWare,
  type Gebinde,
} from '@c4/shared';
import type { Db } from './db/client';
import {
  bestandsbuchungen,
  bestandsvorgaenge,
  einstellungen,
  finBelege,
  finBelegposten,
  gebinde,
  lagerorte,
  waren,
  wareGebinde,
  warengruppen,
  warenAbgleichKorrekturen,
} from './db/schema';

// Lager-Beleg-Abgleich (see docs/finanzen.md): raw data from the database; the arithmetic is `lagerAbgleich` in shared.

export interface AbgleichWareInfo {
  id: string;
  name: string;
  warengruppe: string | null;
  /** The Ware's own Gebinde (for the mixed display). */
  gebinde: Gebinde[];
}

/** Raw rows, amounts already in base units and dates in Berlin time. */
export interface AbgleichDaten {
  ist: AbgleichIst[];
  soll: AbgleichSoll[];
  korrekturen: AbgleichKorrektur[];
  waren: AbgleichWareInfo[];
  /** All Gebinde (needed to name an Obergebinde's Untergebinde). */
  alleGebinde: Gebinde[];
}

export interface AbgleichKorrekturDaten {
  wareId: string;
  menge: number;
  grund: AbgleichGrund;
  text: string | null;
  datum: string;
}

export interface LagerAbgleichStore {
  stichtag(): Promise<string | null>;
  stichtagSetzen(datum: string, sub: string): Promise<void>;
  /** Data from the Stichtag on, optionally for one Ware only. */
  daten(stichtag: string, wareId?: string): Promise<AbgleichDaten>;
  /** Inserts a Korrektur; null if the Ware does not exist. */
  korrekturAnlegen(daten: AbgleichKorrekturDaten, sub: string): Promise<string | null>;
}

/** Result of the computation with the info of the Waren (those with entries only). */
export interface AbgleichErgebnis {
  waren: { info: AbgleichWareInfo; abgleich: AbgleichWare }[];
  alleGebinde: Gebinde[];
}

/** Runs the shared computation over the raw data. */
export function abgleichBerechnen(stichtag: string, d: AbgleichDaten): AbgleichErgebnis {
  const infos = new Map(d.waren.map((w) => [w.id, w]));
  const waren = lagerAbgleich({
    stichtag,
    ist: d.ist,
    soll: d.soll,
    korrekturen: d.korrekturen,
  }).flatMap((abgleich) => {
    const info = infos.get(abgleich.wareId);
    return info ? [{ info, abgleich }] : [];
  });
  return { waren, alleGebinde: d.alleGebinde };
}

export const textMenge = (menge: number, info: AbgleichWareInfo, alle: Gebinde[]) =>
  basisMengeAnzeigen(menge, info.gebinde, alle);

export function createLagerAbgleichStore(db: Db): LagerAbgleichStore {
  return {
    async stichtag() {
      const [row] = await db
        .select({ wert: einstellungen.wert })
        .from(einstellungen)
        .where(eq(einstellungen.schluessel, ABGLEICH_STICHTAG_SCHLUESSEL));
      return row?.wert ?? null;
    },

    async stichtagSetzen(datum, sub) {
      const jetzt = new Date();
      await db
        .insert(einstellungen)
        .values({
          schluessel: ABGLEICH_STICHTAG_SCHLUESSEL,
          wert: datum,
          geaendertVon: sub,
          geaendertAm: jetzt,
        })
        .onConflictDoUpdate({
          target: einstellungen.schluessel,
          set: { wert: datum, geaendertVon: sub, geaendertAm: jetzt },
        });
    },

    async daten(stichtag, wareId) {
      // Pre-filter generously (Berlin day start is at most 2 h before UTC midnight); the exact cut is in `lagerAbgleich`.
      const ab = new Date(new Date(`${stichtag}T00:00:00Z`).getTime() - 24 * 3600 * 1000);
      const [istRows, sollRows, korrekturRows, wareRows, gebindeRows, verknuepft, gruppen] =
        await Promise.all([
          db
            .select({
              vorgangId: bestandsvorgaenge.id,
              zeitpunkt: bestandsvorgaenge.zeitpunkt,
              wareId: bestandsbuchungen.wareId,
              gebindeId: bestandsbuchungen.gebindeId,
              menge: bestandsbuchungen.menge,
              lagerort: lagerorte.name,
            })
            .from(bestandsbuchungen)
            .innerJoin(bestandsvorgaenge, eq(bestandsvorgaenge.id, bestandsbuchungen.vorgangId))
            .innerJoin(lagerorte, eq(lagerorte.id, bestandsbuchungen.lagerortId))
            .where(
              and(
                eq(bestandsvorgaenge.typ, 'einlagerung'),
                eq(bestandsbuchungen.art, 'zugang'),
                gte(bestandsvorgaenge.zeitpunkt, ab),
                wareId ? eq(bestandsbuchungen.wareId, wareId) : undefined,
              ),
            ),
          db
            .select({
              belegId: finBelege.id,
              nummer: finBelege.nummer,
              datum: finBelege.belegdatum,
              wareId: finBelegposten.wareId,
              gebindeId: finBelegposten.gebindeId,
              anzahlMilli: finBelegposten.anzahlMilli,
              storniert: sql<boolean>`EXISTS (SELECT 1 FROM fin_buchungen s WHERE s.storno_von = ${finBelege.buchungId})`,
            })
            .from(finBelegposten)
            .innerJoin(finBelege, eq(finBelege.id, finBelegposten.belegId))
            .where(
              and(
                eq(finBelegposten.art, 'ware'),
                gte(finBelege.belegdatum, stichtag),
                wareId ? eq(finBelegposten.wareId, wareId) : undefined,
              ),
            ),
          db
            .select()
            .from(warenAbgleichKorrekturen)
            .where(
              and(
                gte(warenAbgleichKorrekturen.datum, stichtag),
                wareId ? eq(warenAbgleichKorrekturen.wareId, wareId) : undefined,
              ),
            )
            .orderBy(asc(warenAbgleichKorrekturen.erstelltAm)),
          db
            .select()
            .from(waren)
            .where(wareId ? eq(waren.id, wareId) : undefined),
          db.select().from(gebinde),
          db.select().from(wareGebinde),
          db.select().from(warengruppen),
        ]);
      const alle = gebindeRows as Gebinde[];
      const basis = (gebindeId: string | null, menge: number) =>
        gebindeId ? sollMengeBasis(menge, gebindeId, alle) : 0;
      const bewegt = new Set([
        ...istRows.map((r) => r.wareId),
        ...sollRows.flatMap((r) => (r.wareId ? [r.wareId] : [])),
        ...korrekturRows.map((r) => r.wareId),
      ]);
      return {
        ist: istRows.map((r) => ({
          wareId: r.wareId,
          datum: heuteBerlin(r.zeitpunkt),
          menge: inBasiseinheiten(r.gebindeId, r.menge, alle),
          vorgangId: r.vorgangId,
          lagerortName: r.lagerort,
        })),
        soll: sollRows.flatMap((r) =>
          r.wareId && r.gebindeId
            ? [
                {
                  wareId: r.wareId,
                  datum: r.datum,
                  menge: basis(r.gebindeId, r.anzahlMilli),
                  belegId: r.belegId,
                  belegNummer: r.nummer,
                  storniert: r.storniert,
                },
              ]
            : [],
        ),
        korrekturen: korrekturRows.map((r) => ({
          id: r.id,
          wareId: r.wareId,
          datum: r.datum,
          menge: r.menge,
          grund: r.grund,
          text: r.text,
          erstelltVon: r.erstelltVon,
        })),
        waren: wareRows
          .filter((w) => bewegt.has(w.id))
          .map((w) => ({
            id: w.id,
            name: w.name,
            warengruppe: gruppen.find((g) => g.id === w.warengruppeId)?.name ?? null,
            gebinde: verknuepft
              .filter((v) => v.wareId === w.id)
              .flatMap((v) => alle.filter((g) => g.id === v.gebindeId)),
          })),
        alleGebinde: alle,
      };
    },

    async korrekturAnlegen(daten, sub) {
      const [ware] = await db
        .select({ id: waren.id })
        .from(waren)
        .where(eq(waren.id, daten.wareId));
      if (!ware) return null;
      const id = randomUUID();
      await db.insert(warenAbgleichKorrekturen).values({
        id,
        ...daten,
        erstelltVon: sub,
        erstelltAm: new Date(),
      });
      return id;
    },
  };
}
