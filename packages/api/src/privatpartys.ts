import { randomUUID } from 'node:crypto';
import { asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type {
  PrivatpartyEingabeDaten,
  PrivatpartyPersonEingabe,
  PrivatpartyStatus,
  PrivatpartyTerminDto,
} from '@c4/shared';
import type { Db } from './db/client';
import {
  mailAbruf,
  privatpartyNachrichten,
  privatpartyPersonen,
  privatpartys,
  privatpartyTermine,
  type PrivatpartyNachrichtRow,
  type PrivatpartyPersonRow,
  type PrivatpartyRow,
  type PrivatpartyTerminRow,
} from './db/schema';

// Private party requests (see docs/privatpartys.md). References between the tables are no foreign
// keys; the API checks them.

export type PrivatpartyPersonDaten = PrivatpartyPersonRow;

export interface PrivatpartyEintrag {
  id: string;
  personId: string | null;
  /** Name of the person; null without one. */
  personName: string | null;
  anlass: string | null;
  notizen: string | null;
  status: PrivatpartyStatus;
  terminId: string | null;
  umfrageId: string | null;
  eventId: string | null;
  mailAdresse: string | null;
  letzteNachrichtAm: Date | null;
  /** The newest message is an incoming one. */
  unbeantwortet: boolean;
  /** In the entered order. */
  termine: PrivatpartyTerminDto[];
  angelegtAm: Date;
  aktualisiertAm: Date;
}

/** What `anlegen` takes: blank entries (e.g. from a mail) have neither person nor dates. */
export interface PrivatpartyAnlegen {
  personId: string | null;
  anlass: string | null;
  notizen: string | null;
  termine: PrivatpartyEingabeDaten['termine'];
  mailAdresse?: string | null;
  letzteNachrichtAm?: Date | null;
}

/** A mail of a request. Incoming: `vonAdresse` is the reply address (Reply-To, else From). */
export interface NachrichtEintrag {
  id: string;
  privatpartyId: string;
  richtung: 'ein' | 'aus';
  messageId: string;
  inReplyTo: string | null;
  referenzen: string[];
  vonAdresse: string | null;
  vonName: string | null;
  anAdresse: string | null;
  betreff: string | null;
  text: string;
  anhaenge: string[];
  zeitpunkt: Date;
  mitgliedSub: string | null;
}

export type NeueNachricht = Omit<NachrichtEintrag, 'id'>;

/** State of the mail job (table `mail_abruf`). */
export interface AbrufStand {
  uidValidity: string | null;
  letzteUid: number;
  letzterAbruf: Date | null;
  fehler: string | null;
}

/** The accepted wish date cannot be removed while the request is accepted. */
export class TerminInBenutzung extends Error {}

export interface PrivatpartysStore {
  personen(): Promise<(PrivatpartyPersonDaten & { anzahl: number })[]>;
  person(id: string): Promise<PrivatpartyPersonDaten | undefined>;
  personAnlegen(daten: PrivatpartyPersonEingabe, von: string): Promise<string>;
  /** False when missing. */
  personAktualisieren(id: string, daten: PrivatpartyPersonEingabe): Promise<boolean>;
  /** 'in_benutzung' while Privatpartys refer to the person. */
  personLoeschen(id: string): Promise<'ok' | 'nicht_gefunden' | 'in_benutzung'>;

  /** Newest activity first; without `status` all. */
  alle(status?: PrivatpartyStatus): Promise<PrivatpartyEintrag[]>;
  holen(id: string): Promise<PrivatpartyEintrag | undefined>;
  nachPerson(personId: string): Promise<PrivatpartyEintrag[]>;
  nachUmfrage(umfrageId: string): Promise<PrivatpartyEintrag | undefined>;
  /** Ids of all polls linked to a Privatparty. */
  umfrageIds(): Promise<Set<string>>;
  nachEvent(eventId: string): Promise<PrivatpartyEintrag | undefined>;
  anlegen(daten: PrivatpartyAnlegen, von: string | null): Promise<string>;
  /**
   * Replaces person, Anlass, notes and dates (dates with a known id keep it). False when missing;
   * throws TerminInBenutzung when the accepted date would disappear.
   */
  aktualisieren(id: string, daten: PrivatpartyEingabeDaten): Promise<boolean>;
  /** False when missing. */
  umfrageSetzen(id: string, umfrageId: string | null): Promise<boolean>;
  /** Marks the request accepted for a date with its event. False when missing. */
  zusagen(id: string, terminId: string | null, eventId: string): Promise<boolean>;
  /** `offen` or `abgesagt`; clears the accepted date and the event. False when missing. */
  statusSetzen(id: string, status: Exclude<PrivatpartyStatus, 'zugesagt'>): Promise<boolean>;
  /** 'in_benutzung' while an event or messages hang on it. */
  loeschen(id: string): Promise<'ok' | 'nicht_gefunden' | 'in_benutzung'>;

  /** Oldest first. */
  nachrichten(privatpartyId: string): Promise<NachrichtEintrag[]>;
  nachricht(id: string): Promise<NachrichtEintrag | undefined>;
  nachrichtNachMessageId(messageId: string): Promise<NachrichtEintrag | undefined>;
  /** The request of the first of these Message-IDs that belongs to a stored message. */
  privatpartyZuMessageIds(messageIds: readonly string[]): Promise<string | undefined>;
  /** Stores the message and updates `letzte_nachricht_am` (and for incoming ones `mail_adresse`) of the request. */
  nachrichtAnlegen(n: NeueNachricht): Promise<string>;
  /** Moves a message to another request and recomputes both. False when the message is missing. */
  nachrichtVerschieben(id: string, zielId: string): Promise<boolean>;
  /** Deletes a request without person, dates, messages, poll and event; true if it was deleted. */
  leerenEintragLoeschen(id: string): Promise<boolean>;

  abrufStand(): Promise<AbrufStand>;
  abrufStandSetzen(stand: Partial<AbrufStand>): Promise<void>;
}

const JSON_LISTE = (wert: string | null): string[] => {
  if (!wert) return [];
  try {
    const l: unknown = JSON.parse(wert);
    return Array.isArray(l) ? l.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const alsNachricht = (r: PrivatpartyNachrichtRow): NachrichtEintrag => ({
  id: r.id,
  privatpartyId: r.privatpartyId,
  richtung: r.richtung,
  messageId: r.messageId,
  inReplyTo: r.inReplyTo,
  referenzen: JSON_LISTE(r.referenzen),
  vonAdresse: r.vonAdresse,
  vonName: r.vonName,
  anAdresse: r.anAdresse,
  betreff: r.betreff,
  text: r.text,
  anhaenge: JSON_LISTE(r.anhaenge),
  zeitpunkt: r.zeitpunkt,
  mitgliedSub: r.mitgliedSub,
});

const STAND_ID = 'partymail';

const alsTermin = (t: PrivatpartyTerminRow): PrivatpartyTerminDto => ({
  id: t.id,
  datum: t.datum,
  beginn: t.beginn,
  ende: t.ende,
  stufe: t.stufe,
});

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const terminZeilen = (privatpartyId: string, termine: PrivatpartyEingabeDaten['termine']) =>
  termine.map((t, position) => ({
    id: t.id ?? randomUUID(),
    privatpartyId,
    datum: t.datum,
    beginn: t.beginn,
    ende: t.ende,
    stufe: t.stufe,
    position,
  }));

export function createPrivatpartysStore(db: Db): PrivatpartysStore {
  /** Requests with dates, person name and whether the newest message is an incoming one. */
  const laden = async (bedingung?: ReturnType<typeof eq>): Promise<PrivatpartyEintrag[]> => {
    const rows = await db.select().from(privatpartys).where(bedingung);
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const personIds = [...new Set(rows.flatMap((r) => (r.personId ? [r.personId] : [])))];
    const [termine, personen, nachrichten] = await Promise.all([
      db
        .select()
        .from(privatpartyTermine)
        .where(inArray(privatpartyTermine.privatpartyId, ids))
        .orderBy(asc(privatpartyTermine.position)),
      personIds.length > 0
        ? db
            .select({ id: privatpartyPersonen.id, name: privatpartyPersonen.name })
            .from(privatpartyPersonen)
            .where(inArray(privatpartyPersonen.id, personIds))
        : Promise.resolve([]),
      db
        .select({
          privatpartyId: privatpartyNachrichten.privatpartyId,
          richtung: privatpartyNachrichten.richtung,
          zeitpunkt: privatpartyNachrichten.zeitpunkt,
        })
        .from(privatpartyNachrichten)
        .where(inArray(privatpartyNachrichten.privatpartyId, ids))
        .orderBy(desc(privatpartyNachrichten.zeitpunkt)),
    ]);
    const namen = new Map(personen.map((p) => [p.id, p.name]));
    // Newest first, so the first message per request is the newest one.
    const letzte = new Map<string, 'ein' | 'aus'>();
    for (const n of nachrichten)
      if (!letzte.has(n.privatpartyId)) letzte.set(n.privatpartyId, n.richtung);
    const eintraege = rows.map((r: PrivatpartyRow): PrivatpartyEintrag => ({
      id: r.id,
      personId: r.personId,
      personName: r.personId ? (namen.get(r.personId) ?? null) : null,
      anlass: r.anlass,
      notizen: r.notizen,
      status: r.status,
      terminId: r.terminId,
      umfrageId: r.umfrageId,
      eventId: r.eventId,
      mailAdresse: r.mailAdresse,
      letzteNachrichtAm: r.letzteNachrichtAm,
      unbeantwortet: letzte.get(r.id) === 'ein',
      termine: termine.filter((t) => t.privatpartyId === r.id).map(alsTermin),
      angelegtAm: r.angelegtAm,
      aktualisiertAm: r.aktualisiertAm,
    }));
    return eintraege.sort(
      (a, b) =>
        (b.letzteNachrichtAm ?? b.angelegtAm).getTime() -
          (a.letzteNachrichtAm ?? a.angelegtAm).getTime() || a.id.localeCompare(b.id),
    );
  };

  const eins = async (bedingung: ReturnType<typeof eq>) => (await laden(bedingung))[0];

  const aendern = async (id: string, werte: Partial<typeof privatpartys.$inferInsert>) => {
    const rows = await db
      .update(privatpartys)
      .set({ ...werte, aktualisiertAm: new Date() })
      .where(eq(privatpartys.id, id))
      .returning({ id: privatpartys.id });
    return rows.length > 0;
  };

  return {
    async personen() {
      const [rows, zaehler] = await Promise.all([
        db.select().from(privatpartyPersonen).orderBy(asc(privatpartyPersonen.name)),
        db.select({ personId: privatpartys.personId }).from(privatpartys),
      ]);
      const anzahl = new Map<string, number>();
      for (const z of zaehler)
        if (z.personId) anzahl.set(z.personId, (anzahl.get(z.personId) ?? 0) + 1);
      return rows.map((p) => ({ ...p, anzahl: anzahl.get(p.id) ?? 0 }));
    },
    async person(id) {
      const [row] = await db
        .select()
        .from(privatpartyPersonen)
        .where(eq(privatpartyPersonen.id, id));
      return row;
    },
    async personAnlegen(daten, von) {
      const id = randomUUID();
      await db.insert(privatpartyPersonen).values({
        id,
        name: daten.name,
        email: daten.email ?? null,
        kontakt: daten.kontakt ?? null,
        notizen: daten.notizen ?? null,
        angelegtVon: von,
      });
      return id;
    },
    async personAktualisieren(id, daten) {
      const rows = await db
        .update(privatpartyPersonen)
        .set({
          name: daten.name,
          email: daten.email ?? null,
          kontakt: daten.kontakt ?? null,
          notizen: daten.notizen ?? null,
          aktualisiertAm: new Date(),
        })
        .where(eq(privatpartyPersonen.id, id))
        .returning({ id: privatpartyPersonen.id });
      return rows.length > 0;
    },
    async personLoeschen(id) {
      const [benutzt] = await db
        .select({ id: privatpartys.id })
        .from(privatpartys)
        .where(eq(privatpartys.personId, id))
        .limit(1);
      if (benutzt) return 'in_benutzung';
      const rows = await db
        .delete(privatpartyPersonen)
        .where(eq(privatpartyPersonen.id, id))
        .returning({ id: privatpartyPersonen.id });
      return rows.length > 0 ? 'ok' : 'nicht_gefunden';
    },

    alle: (status) => laden(status ? eq(privatpartys.status, status) : undefined),
    holen: (id) => eins(eq(privatpartys.id, id)),
    nachPerson: (personId) => laden(eq(privatpartys.personId, personId)),
    nachUmfrage: (umfrageId) => eins(eq(privatpartys.umfrageId, umfrageId)),
    async umfrageIds() {
      const rows = await db
        .select({ id: privatpartys.umfrageId })
        .from(privatpartys)
        .where(isNotNull(privatpartys.umfrageId));
      return new Set(rows.flatMap((r) => (r.id ? [r.id] : [])));
    },
    nachEvent: (eventId) => eins(eq(privatpartys.eventId, eventId)),

    async anlegen(daten, von) {
      const id = randomUUID();
      await db.transaction(async (tx: Tx) => {
        await tx.insert(privatpartys).values({
          id,
          personId: daten.personId,
          anlass: daten.anlass,
          notizen: daten.notizen,
          mailAdresse: daten.mailAdresse ?? null,
          letzteNachrichtAm: daten.letzteNachrichtAm ?? null,
          angelegtVon: von,
        });
        if (daten.termine.length > 0) {
          await tx.insert(privatpartyTermine).values(terminZeilen(id, daten.termine));
        }
      });
      return id;
    },
    async aktualisieren(id, daten) {
      return db.transaction(async (tx: Tx) => {
        const [alt] = await tx.select().from(privatpartys).where(eq(privatpartys.id, id));
        if (!alt) return false;
        const behalten = new Set(daten.termine.flatMap((t) => (t.id ? [t.id] : [])));
        if (alt.status === 'zugesagt' && alt.terminId && !behalten.has(alt.terminId)) {
          throw new TerminInBenutzung();
        }
        const vorhandene = await tx
          .select({ id: privatpartyTermine.id })
          .from(privatpartyTermine)
          .where(eq(privatpartyTermine.privatpartyId, id));
        const bekannt = new Set(vorhandene.map((t) => t.id));
        // Ids the client sends must belong to this request; others are treated as new.
        const termine = daten.termine.map((t) => ({
          ...t,
          id: t.id && bekannt.has(t.id) ? t.id : undefined,
        }));
        await tx.delete(privatpartyTermine).where(eq(privatpartyTermine.privatpartyId, id));
        if (termine.length > 0)
          await tx.insert(privatpartyTermine).values(terminZeilen(id, termine));
        await tx
          .update(privatpartys)
          .set({
            personId: daten.personId,
            anlass: daten.anlass,
            notizen: daten.notizen,
            aktualisiertAm: new Date(),
          })
          .where(eq(privatpartys.id, id));
        return true;
      });
    },
    umfrageSetzen: (id, umfrageId) => aendern(id, { umfrageId }),
    zusagen: (id, terminId, eventId) => aendern(id, { status: 'zugesagt', terminId, eventId }),
    statusSetzen: (id, status) => aendern(id, { status, terminId: null, eventId: null }),
    async loeschen(id) {
      // Checked inside the transaction, so a Nachricht arriving meanwhile is not orphaned.
      return db.transaction(async (tx: Tx) => {
        const [row] = await tx.select().from(privatpartys).where(eq(privatpartys.id, id));
        if (!row) return 'nicht_gefunden';
        const [nachricht] = await tx
          .select({ id: privatpartyNachrichten.id })
          .from(privatpartyNachrichten)
          .where(eq(privatpartyNachrichten.privatpartyId, id))
          .limit(1);
        if (row.eventId || nachricht) return 'in_benutzung';
        await tx.delete(privatpartyTermine).where(eq(privatpartyTermine.privatpartyId, id));
        await tx.delete(privatpartys).where(eq(privatpartys.id, id));
        return 'ok';
      });
    },

    async nachrichten(privatpartyId) {
      const rows = await db
        .select()
        .from(privatpartyNachrichten)
        .where(eq(privatpartyNachrichten.privatpartyId, privatpartyId))
        .orderBy(asc(privatpartyNachrichten.zeitpunkt), asc(privatpartyNachrichten.id));
      return rows.map(alsNachricht);
    },
    async nachricht(id) {
      const [row] = await db
        .select()
        .from(privatpartyNachrichten)
        .where(eq(privatpartyNachrichten.id, id));
      return row && alsNachricht(row);
    },
    async nachrichtNachMessageId(messageId) {
      const [row] = await db
        .select()
        .from(privatpartyNachrichten)
        .where(eq(privatpartyNachrichten.messageId, messageId));
      return row && alsNachricht(row);
    },
    async privatpartyZuMessageIds(messageIds) {
      if (messageIds.length === 0) return undefined;
      const rows = await db
        .select({
          messageId: privatpartyNachrichten.messageId,
          privatpartyId: privatpartyNachrichten.privatpartyId,
        })
        .from(privatpartyNachrichten)
        .where(inArray(privatpartyNachrichten.messageId, [...messageIds]));
      for (const id of messageIds) {
        const treffer = rows.find((r) => r.messageId === id);
        if (treffer) return treffer.privatpartyId;
      }
      return undefined;
    },
    async nachrichtAnlegen(n) {
      const id = randomUUID();
      await db.transaction(async (tx: Tx) => {
        await tx.insert(privatpartyNachrichten).values({
          id,
          privatpartyId: n.privatpartyId,
          richtung: n.richtung,
          messageId: n.messageId,
          inReplyTo: n.inReplyTo,
          referenzen: JSON.stringify(n.referenzen),
          vonAdresse: n.vonAdresse,
          vonName: n.vonName,
          anAdresse: n.anAdresse,
          betreff: n.betreff,
          text: n.text,
          anhaenge: JSON.stringify(n.anhaenge),
          zeitpunkt: n.zeitpunkt,
          mitgliedSub: n.mitgliedSub,
        });
        await tx
          .update(privatpartys)
          .set({
            letzteNachrichtAm: n.zeitpunkt,
            ...(n.richtung === 'ein' && n.vonAdresse && { mailAdresse: n.vonAdresse }),
            aktualisiertAm: new Date(),
          })
          .where(eq(privatpartys.id, n.privatpartyId));
      });
      return id;
    },
    async nachrichtVerschieben(id, zielId) {
      return db.transaction(async (tx: Tx) => {
        const [m] = await tx
          .select()
          .from(privatpartyNachrichten)
          .where(eq(privatpartyNachrichten.id, id));
        if (!m) return false;
        await tx
          .update(privatpartyNachrichten)
          .set({ privatpartyId: zielId })
          .where(eq(privatpartyNachrichten.id, id));
        // Recompute both requests from their remaining messages.
        for (const ppId of [m.privatpartyId, zielId]) {
          const rows = await tx
            .select()
            .from(privatpartyNachrichten)
            .where(eq(privatpartyNachrichten.privatpartyId, ppId))
            .orderBy(desc(privatpartyNachrichten.zeitpunkt));
          const letzteEin = rows.find((r) => r.richtung === 'ein');
          await tx
            .update(privatpartys)
            .set({
              letzteNachrichtAm: rows[0]?.zeitpunkt ?? null,
              mailAdresse: letzteEin?.vonAdresse ?? null,
              aktualisiertAm: new Date(),
            })
            .where(eq(privatpartys.id, ppId));
        }
        return true;
      });
    },
    async leerenEintragLoeschen(id) {
      const [row] = await db.select().from(privatpartys).where(eq(privatpartys.id, id));
      if (!row || row.personId || row.umfrageId || row.eventId) return false;
      const [termin] = await db
        .select({ id: privatpartyTermine.id })
        .from(privatpartyTermine)
        .where(eq(privatpartyTermine.privatpartyId, id))
        .limit(1);
      const [nachricht] = await db
        .select({ id: privatpartyNachrichten.id })
        .from(privatpartyNachrichten)
        .where(eq(privatpartyNachrichten.privatpartyId, id))
        .limit(1);
      if (termin || nachricht) return false;
      await db.delete(privatpartys).where(eq(privatpartys.id, id));
      return true;
    },

    async abrufStand() {
      const [row] = await db.select().from(mailAbruf).where(eq(mailAbruf.id, STAND_ID));
      return {
        uidValidity: row?.uidValidity ?? null,
        letzteUid: row?.letzteUid ?? 0,
        letzterAbruf: row?.letzterAbruf ?? null,
        fehler: row?.fehler ?? null,
      };
    },
    async abrufStandSetzen(stand) {
      const werte = {
        ...(stand.uidValidity !== undefined && { uidValidity: stand.uidValidity }),
        ...(stand.letzteUid !== undefined && { letzteUid: stand.letzteUid }),
        ...(stand.letzterAbruf !== undefined && { letzterAbruf: stand.letzterAbruf }),
        ...(stand.fehler !== undefined && { fehler: stand.fehler }),
      };
      await db
        .insert(mailAbruf)
        .values({ id: STAND_ID, ...werte })
        .onConflictDoUpdate({ target: mailAbruf.id, set: werte });
    },
  };
}
