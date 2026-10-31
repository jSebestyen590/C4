import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import {
  erinnerungenKodieren,
  erinnerungenLesen,
  teilnahmeKreisKodieren,
  teilnahmeKreisLesen,
  type Stimme,
  type UmfrageErgebnisse,
  type UmfrageKreis,
} from '@c4/shared';
import type { Db } from './db/client';
import {
  umfrageAbgaben,
  umfrageFragen,
  umfrageKreis,
  umfrageOptionen,
  umfragen,
  umfrageStimmen,
  type UmfrageRow,
} from './db/schema';

// Polls (see docs/umfragen.md). Votes are stored with the member's sub so that everybody votes once
// and gets reminders; for anonymous polls the API never hands the subs out.

export interface UmfrageFrage {
  id: string;
  text: string;
  freitext: boolean;
  maxAntworten: number | null;
  optionen: { id: string; text: string }[];
}

/** What is stored when creating or editing; all questions and options carry their (new) ids. */
export interface UmfrageSpeichern {
  titel: string;
  beschreibung: string | null;
  endetAm: string;
  anonym: boolean;
  ergebnisse: UmfrageErgebnisse;
  pflicht: UmfrageKreis;
  optional: UmfrageKreis;
  erinnerungenPflicht: number[];
  erinnerungenOptional: number[];
  fragen: UmfrageFrage[];
}

export interface Abgabe {
  sub: string;
  abgegebenAm: Date;
  erneutNoetig: boolean;
}

export interface UmfrageDaten extends UmfrageSpeichern {
  id: string;
  erstellerSub: string;
  erstelltAm: Date;
  beendetAm: Date | null;
  abgaben: Abgabe[];
}

export interface UmfrageDetails extends UmfrageDaten {
  stimmen: Stimme[];
}

export interface UmfragenStore {
  /** All polls with their questions and who voted (without the answers), newest first. */
  alle(): Promise<UmfrageDaten[]>;
  holen(id: string): Promise<UmfrageDetails | undefined>;
  anlegen(daten: UmfrageSpeichern, ersteller: string): Promise<string>;
  /**
   * Replaces data, circles, questions and options; first deletes the answers in `loeschen`, then
   * marks the votes of `erneut` as to be repeated. False when the poll does not exist.
   */
  aktualisieren(
    id: string,
    daten: UmfrageSpeichern,
    aenderung: { loeschen: readonly string[]; erneut: readonly string[] },
  ): Promise<boolean>;
  beenden(id: string, zeitpunkt: Date): Promise<boolean>;
  loeschen(id: string): Promise<boolean>;
  /** Replaces the member's answers and records a valid vote. */
  abstimmen(
    id: string,
    sub: string,
    antworten: readonly { frageId: string; optionId: string | null; freitext: string | null }[],
  ): Promise<void>;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const kreisZeilen = (umfrageId: string, kreis: UmfrageKreis, pflicht: boolean) => [
  ...kreis.posten.map((ref) => ({ umfrageId, pflicht, art: 'posten' as const, ref })),
  ...kreis.personen.map((ref) => ({ umfrageId, pflicht, art: 'person' as const, ref })),
];

const zeileSpalten = (d: UmfrageSpeichern) => ({
  titel: d.titel,
  beschreibung: d.beschreibung,
  endetAm: d.endetAm,
  anonym: d.anonym,
  ergebnisse: d.ergebnisse,
  pflichtStatus: teilnahmeKreisKodieren(d.pflicht.status) ?? '',
  optionalStatus: teilnahmeKreisKodieren(d.optional.status) ?? '',
  erinnerungenPflicht: erinnerungenKodieren(d.erinnerungenPflicht),
  erinnerungenOptional: erinnerungenKodieren(d.erinnerungenOptional),
});

/** Writes circles, questions and options; existing ids are updated, new ones inserted. */
async function inhaltSchreiben(tx: Tx, id: string, d: UmfrageSpeichern) {
  await tx.delete(umfrageKreis).where(eq(umfrageKreis.umfrageId, id));
  const kreis = [...kreisZeilen(id, d.pflicht, true), ...kreisZeilen(id, d.optional, false)];
  if (kreis.length > 0) await tx.insert(umfrageKreis).values(kreis);

  for (const [position, f] of d.fragen.entries()) {
    await tx
      .insert(umfrageFragen)
      .values({
        id: f.id,
        umfrageId: id,
        position,
        text: f.text,
        freitext: f.freitext,
        maxAntworten: f.maxAntworten,
      })
      .onConflictDoUpdate({
        target: umfrageFragen.id,
        set: { position, text: f.text, freitext: f.freitext, maxAntworten: f.maxAntworten },
      });
    for (const [opos, o] of f.optionen.entries()) {
      await tx
        .insert(umfrageOptionen)
        .values({ id: o.id, frageId: f.id, position: opos, text: o.text })
        .onConflictDoUpdate({ target: umfrageOptionen.id, set: { position: opos, text: o.text } });
    }
  }
}

function alsDaten(
  row: UmfrageRow,
  kreis: { pflicht: boolean; art: 'posten' | 'person'; ref: string }[],
  fragen: UmfrageFrage[],
  abgaben: Abgabe[],
): UmfrageDaten {
  const kreisVon = (pflicht: boolean, status: string): UmfrageKreis => ({
    status: teilnahmeKreisLesen(status) ?? [],
    posten: kreis.filter((k) => k.pflicht === pflicht && k.art === 'posten').map((k) => k.ref),
    personen: kreis.filter((k) => k.pflicht === pflicht && k.art === 'person').map((k) => k.ref),
  });
  return {
    id: row.id,
    titel: row.titel,
    beschreibung: row.beschreibung,
    erstellerSub: row.erstellerSub,
    erstelltAm: row.erstelltAm,
    endetAm: row.endetAm,
    beendetAm: row.beendetAm,
    anonym: row.anonym,
    ergebnisse: row.ergebnisse,
    pflicht: kreisVon(true, row.pflichtStatus),
    optional: kreisVon(false, row.optionalStatus),
    erinnerungenPflicht: erinnerungenLesen(row.erinnerungenPflicht),
    erinnerungenOptional: erinnerungenLesen(row.erinnerungenOptional),
    fragen,
    abgaben,
  };
}

export function createUmfragenStore(db: Db): UmfragenStore {
  /** Loads everything that belongs to the given poll rows. */
  async function vervollstaendigen(rows: UmfrageRow[]): Promise<UmfrageDaten[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [kreis, fragen, abgaben] = await Promise.all([
      db.select().from(umfrageKreis).where(inArray(umfrageKreis.umfrageId, ids)),
      db
        .select()
        .from(umfrageFragen)
        .where(inArray(umfrageFragen.umfrageId, ids))
        .orderBy(asc(umfrageFragen.position)),
      db.select().from(umfrageAbgaben).where(inArray(umfrageAbgaben.umfrageId, ids)),
    ]);
    const optionen =
      fragen.length === 0
        ? []
        : await db
            .select()
            .from(umfrageOptionen)
            .where(
              inArray(
                umfrageOptionen.frageId,
                fragen.map((f) => f.id),
              ),
            )
            .orderBy(asc(umfrageOptionen.position));
    return rows.map((r) =>
      alsDaten(
        r,
        kreis.filter((k) => k.umfrageId === r.id),
        fragen
          .filter((f) => f.umfrageId === r.id)
          .map((f) => ({
            id: f.id,
            text: f.text,
            freitext: f.freitext,
            maxAntworten: f.maxAntworten,
            optionen: optionen
              .filter((o) => o.frageId === f.id)
              .map((o) => ({ id: o.id, text: o.text })),
          })),
        abgaben
          .filter((a) => a.umfrageId === r.id)
          .map((a) => ({
            sub: a.mitgliedSub,
            abgegebenAm: a.abgegebenAm,
            erneutNoetig: a.erneutNoetig,
          })),
      ),
    );
  }

  return {
    async alle() {
      const rows = await db.select().from(umfragen);
      const daten = await vervollstaendigen(rows);
      return daten.sort((a, b) => b.erstelltAm.getTime() - a.erstelltAm.getTime());
    },

    async holen(id) {
      const [row] = await db.select().from(umfragen).where(eq(umfragen.id, id));
      if (!row) return undefined;
      const [[daten], stimmen] = await Promise.all([
        vervollstaendigen([row]),
        db.select().from(umfrageStimmen).where(eq(umfrageStimmen.umfrageId, id)),
      ]);
      return {
        ...daten!,
        stimmen: stimmen.map((s) => ({
          id: s.id,
          frageId: s.frageId,
          sub: s.mitgliedSub,
          optionId: s.optionId,
          freitext: s.freitext,
        })),
      };
    },

    async anlegen(daten, ersteller) {
      const id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(umfragen).values({ id, erstellerSub: ersteller, ...zeileSpalten(daten) });
        await inhaltSchreiben(tx, id, daten);
      });
      return id;
    },

    async aktualisieren(id, daten, aenderung) {
      return db.transaction(async (tx) => {
        const rows = await tx
          .update(umfragen)
          .set(zeileSpalten(daten))
          .where(eq(umfragen.id, id))
          .returning({ id: umfragen.id });
        if (rows.length === 0) return false;
        if (aenderung.loeschen.length > 0) {
          await tx
            .delete(umfrageStimmen)
            .where(
              and(
                eq(umfrageStimmen.umfrageId, id),
                inArray(umfrageStimmen.id, [...aenderung.loeschen]),
              ),
            );
        }
        const fragenIds = daten.fragen.map((f) => f.id);
        const alteFragen = await tx
          .select({ id: umfrageFragen.id })
          .from(umfrageFragen)
          .where(eq(umfrageFragen.umfrageId, id));
        const optionIds = daten.fragen.flatMap((f) => f.optionen.map((o) => o.id));
        if (alteFragen.length > 0) {
          const alteIds = alteFragen.map((f) => f.id);
          await tx
            .delete(umfrageOptionen)
            .where(
              and(
                inArray(umfrageOptionen.frageId, alteIds),
                optionIds.length > 0 ? notInArray(umfrageOptionen.id, optionIds) : undefined,
              ),
            );
          const weg = alteIds.filter((f) => !fragenIds.includes(f));
          if (weg.length > 0) await tx.delete(umfrageFragen).where(inArray(umfrageFragen.id, weg));
        }
        await inhaltSchreiben(tx, id, daten);
        if (aenderung.erneut.length > 0) {
          await tx
            .update(umfrageAbgaben)
            .set({ erneutNoetig: true })
            .where(
              and(
                eq(umfrageAbgaben.umfrageId, id),
                inArray(umfrageAbgaben.mitgliedSub, [...aenderung.erneut]),
              ),
            );
        }
        return true;
      });
    },

    async beenden(id, zeitpunkt) {
      const rows = await db
        .update(umfragen)
        .set({ beendetAm: zeitpunkt })
        .where(eq(umfragen.id, id))
        .returning({ id: umfragen.id });
      return rows.length > 0;
    },

    async loeschen(id) {
      return db.transaction(async (tx) => {
        const fragen = await tx
          .select({ id: umfrageFragen.id })
          .from(umfrageFragen)
          .where(eq(umfrageFragen.umfrageId, id));
        await tx.delete(umfrageStimmen).where(eq(umfrageStimmen.umfrageId, id));
        await tx.delete(umfrageAbgaben).where(eq(umfrageAbgaben.umfrageId, id));
        if (fragen.length > 0) {
          await tx.delete(umfrageOptionen).where(
            inArray(
              umfrageOptionen.frageId,
              fragen.map((f) => f.id),
            ),
          );
        }
        await tx.delete(umfrageFragen).where(eq(umfrageFragen.umfrageId, id));
        await tx.delete(umfrageKreis).where(eq(umfrageKreis.umfrageId, id));
        const rows = await tx
          .delete(umfragen)
          .where(eq(umfragen.id, id))
          .returning({ id: umfragen.id });
        return rows.length > 0;
      });
    },

    async abstimmen(id, sub, antworten) {
      await db.transaction(async (tx) => {
        await tx
          .delete(umfrageStimmen)
          .where(and(eq(umfrageStimmen.umfrageId, id), eq(umfrageStimmen.mitgliedSub, sub)));
        if (antworten.length > 0) {
          await tx.insert(umfrageStimmen).values(
            antworten.map((a) => ({
              id: randomUUID(),
              umfrageId: id,
              frageId: a.frageId,
              mitgliedSub: sub,
              optionId: a.optionId,
              freitext: a.freitext,
            })),
          );
        }
        const abgegebenAm = new Date();
        await tx
          .insert(umfrageAbgaben)
          .values({ umfrageId: id, mitgliedSub: sub, abgegebenAm, erneutNoetig: false })
          .onConflictDoUpdate({
            target: [umfrageAbgaben.umfrageId, umfrageAbgaben.mitgliedSub],
            set: { abgegebenAm, erneutNoetig: false },
          });
      });
    },
  };
}
