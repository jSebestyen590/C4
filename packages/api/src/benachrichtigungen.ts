import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import webpush from 'web-push';
import {
  benachrichtigungsArt,
  BENACHRICHTIGUNGS_ARTEN,
  VERLAUF_AUFBEWAHRUNG_TAGE,
  type VerlaufFilter,
  effektiveEinstellung,
  istAbschaltbar,
  type EinstellungDto,
  type GespeicherteEinstellung,
  type MitgliedStatus,
  type PushAboEingabe,
  type PushNachricht,
} from '@c4/shared';
import type { Db } from './db/client';
import {
  benachrichtigungEinstellungen,
  benachrichtigungVerlauf,
  mitglieder,
  pushAbos,
  pushSchluessel,
  pushVersand,
} from './db/schema';

// Generic notification module: nothing in here knows about a feature area (see
// docs/benachrichtigungen.md). Features define their types in the shared registry and register
// job tasks via `registriereAufgabe`.

export interface Vapid {
  publicKey: string;
  privateKey: string;
}

export interface PushAbo {
  id: string;
  mitgliedSub: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** A member with the stored setting of one type (null = default applies). */
export interface Empfaenger {
  sub: string;
  status: MitgliedStatus;
  gespeichert: GespeicherteEinstellung | null;
}

/** A history entry to write; `schluessel` makes it unique per member (null = no dedupe). */
export interface VerlaufNeu {
  sub: string;
  art: string;
  titel: string;
  text: string;
  url: string;
  schluessel: string | null;
}

export interface VerlaufZeile {
  id: string;
  art: string;
  titel: string;
  text: string;
  url: string;
  erstellt: Date;
  gelesen: Date | null;
}

/** Position after which the next history page starts (newest first). */
export interface VerlaufCursor {
  erstellt: Date;
  id: string;
}

export interface VerlaufAbfrage {
  /** Only these types (resolved from the `art`/`bereich` filter). */
  arten?: readonly string[];
  nurUngelesen?: boolean;
  vor?: VerlaufCursor;
  limit: number;
}

export interface BenachrichtigungenStore {
  /** The VAPID key pair; generated and stored on first use. */
  vapid(): Promise<Vapid>;
  /** Stores the device's subscription for the member (an existing endpoint is taken over). */
  aboSpeichern(sub: string, abo: PushAboEingabe): Promise<void>;
  /** Removes one of the member's own subscriptions. */
  aboLoeschen(sub: string, endpoint: string): Promise<void>;
  /** Removes a subscription the push service reported as gone. */
  aboEntfernen(endpoint: string): Promise<void>;
  abosVon(subs: readonly string[]): Promise<PushAbo[]>;
  /** Whether the member has a subscription with this endpoint. */
  aboVorhanden(sub: string, endpoint: string): Promise<boolean>;
  /** Members (all when `subs` is undefined) with their status and stored setting of `art`. */
  empfaenger(art: string, subs?: readonly string[]): Promise<Empfaenger[]>;
  /** Status and all stored settings of one member; undefined without profile. */
  mitgliedEinstellungen(
    sub: string,
  ): Promise<
    { status: MitgliedStatus; gespeichert: Map<string, GespeicherteEinstellung> } | undefined
  >;
  einstellungSetzen(
    sub: string,
    art: string,
    aktiv: boolean,
    minuten: number | null,
  ): Promise<void>;
  /** Claims a dedupe key; false when it was already claimed. */
  versandBelegen(schluessel: string): Promise<boolean>;
  versandFreigeben(schluessel: string): Promise<void>;
  /**
   * Writes history entries; an entry whose (member, schluessel) exists is kept. Returns the id of
   * each member's entry (also of already existing ones).
   */
  verlaufEintragen(eintraege: readonly VerlaufNeu[]): Promise<Map<string, string>>;
  verlaufSeite(sub: string, abfrage: VerlaufAbfrage): Promise<VerlaufZeile[]>;
  verlaufUngelesen(sub: string): Promise<number>;
  /** Marks one of the member's entries as read; false when it does not exist (or is not theirs). */
  verlaufGelesen(sub: string, id: string): Promise<boolean>;
  /** Marks all unread entries (of the given types) as read. */
  verlaufAlleGelesen(sub: string, arten?: readonly string[]): Promise<void>;
  /** Deletes entries created before `vor`; returns how many. */
  verlaufAufraeumen(vor: Date): Promise<number>;
}

/** Result of one delivery: `gone` = subscription expired (404/410), `fehler` = try again later. */
export type PushErgebnis = 'ok' | 'gone' | 'fehler';
export type PushSender = (abo: PushAbo, nachricht: PushNachricht) => Promise<PushErgebnis>;

export interface Sendung {
  /** Recipients; `'alle'` = every member. Each one is filtered by their own setting of `art`. */
  subs: readonly string[] | 'alle';
  art: string;
  titel: string;
  text: string;
  /** App-relative path opened when the notification is clicked. */
  url: string;
  /** Sends at most once per key (e.g. `kalender.erinnerung:<dienst>:<beginn>`). */
  dedupeSchluessel?: string;
  /** Sends regardless of the recipients' settings of `art` (a device is still required). */
  ohneEinstellung?: boolean;
  /** Members left out, e.g. because they get an own message. */
  ausser?: readonly string[];
}

export interface Benachrichtigungen {
  publicKey(): Promise<string>;
  aboSpeichern(sub: string, abo: PushAboEingabe): Promise<void>;
  aboLoeschen(sub: string, endpoint: string): Promise<void>;
  aboRegistriert(sub: string, endpoint: string): Promise<boolean>;
  /** All types with the member's effective values; undefined without profile. */
  einstellungen(sub: string): Promise<EinstellungDto[] | undefined>;
  einstellungSetzen(sub: string, art: string, aktiv: boolean, minuten?: number): Promise<boolean>;
  /** Effective settings of `art` for jobs that need per-member values (e.g. minutes). */
  empfaengerEinstellungen(
    art: string,
    subs?: readonly string[],
  ): Promise<{ sub: string; aktiv: boolean; minuten: number | null }[]>;
  /** Sends to the devices of every recipient whose setting is active; returns the number of recipients. */
  senden(sendung: Sendung): Promise<number>;
  /** Sends a test message to all of the member's own devices (no dedupe, no setting filter). */
  testSenden(sub: string): Promise<{ geraete: number; ok: number; fehler: number }>;
  /** Claims a once-only marker (e.g. a job that runs once per day); false when already claimed. */
  einmalBelegen(schluessel: string): Promise<boolean>;
  einmalFreigeben(schluessel: string): Promise<void>;
  /** History page (newest first); `weiter` is the cursor of the next page. */
  verlaufSeite(
    sub: string,
    abfrage: VerlaufFilter & { nurUngelesen?: boolean; vor?: VerlaufCursor; limit: number },
  ): Promise<{ eintraege: VerlaufZeile[]; weiter: VerlaufCursor | null }>;
  verlaufUngelesen(sub: string): Promise<number>;
  verlaufGelesen(sub: string, id: string): Promise<boolean>;
  verlaufAlleGelesen(sub: string, filter: VerlaufFilter): Promise<void>;
  /** Deletes history entries older than the retention period. */
  verlaufAufraeumen(jetzt: Date): Promise<number>;
  /** Registers a task that runs on every `pushJob`. */
  registriereAufgabe(name: string, aufgabe: (jetzt: Date) => Promise<void>): void;
  /** Runs all registered tasks; one failing task does not stop the others. */
  pushJob(jetzt: Date): Promise<void>;
}

/** Type keys matching a history filter; undefined = all types. */
function verlaufArten(art?: string, bereich?: string): string[] | undefined {
  if (art) return [art];
  if (bereich)
    return BENACHRICHTIGUNGS_ARTEN.filter((a) => a.bereich === bereich).map((a) => a.key);
  return undefined;
}

/** Registers the daily clean-up of old history entries. */
export function registriereVerlaufAufraeumen(
  benachrichtigungen: Pick<
    Benachrichtigungen,
    'registriereAufgabe' | 'einmalBelegen' | 'einmalFreigeben' | 'verlaufAufraeumen'
  >,
): void {
  benachrichtigungen.registriereAufgabe('verlauf-aufraeumen', async (jetzt) => {
    const schluessel = `verlauf-aufraeumen:${jetzt.toISOString().slice(0, 10)}`;
    if (!(await benachrichtigungen.einmalBelegen(schluessel))) return;
    try {
      const n = await benachrichtigungen.verlaufAufraeumen(jetzt);
      if (n > 0) console.log(`Notification history: deleted ${n} old entries`);
    } catch (err) {
      await benachrichtigungen.einmalFreigeben(schluessel).catch(() => {});
      throw err;
    }
  });
}

export function createBenachrichtigungen(deps: {
  store: BenachrichtigungenStore;
  sender: PushSender;
}): Benachrichtigungen {
  const { store, sender } = deps;
  const aufgaben = new Map<string, (jetzt: Date) => Promise<void>>();

  const artOderFehler = (key: string) => {
    const art = benachrichtigungsArt(key);
    if (!art) throw new Error(`Unknown notification type ${key}`);
    return art;
  };

  const liefern = (abos: PushAbo[], nachricht: PushNachricht) =>
    Promise.all(
      abos.map(async (abo) => {
        let ergebnis: PushErgebnis;
        try {
          ergebnis = await sender(abo, nachricht);
        } catch (err) {
          console.error('Push delivery failed', err);
          ergebnis = 'fehler';
        }
        if (ergebnis === 'gone') await store.aboEntfernen(abo.endpoint).catch(() => {});
        return ergebnis;
      }),
    );

  return {
    async publicKey() {
      return (await store.vapid()).publicKey;
    },
    aboSpeichern: (sub, abo) => store.aboSpeichern(sub, abo),
    aboLoeschen: (sub, endpoint) => store.aboLoeschen(sub, endpoint),
    aboRegistriert: (sub, endpoint) => store.aboVorhanden(sub, endpoint),

    async einstellungen(sub) {
      const m = await store.mitgliedEinstellungen(sub);
      if (!m) return undefined;
      return BENACHRICHTIGUNGS_ARTEN.map((art) => {
        const e = effektiveEinstellung(art, m.status, m.gespeichert.get(art.key));
        return {
          art: art.key,
          bereich: art.bereich,
          aktiv: e.aktiv,
          abschaltbar: istAbschaltbar(art),
          minuten: e.minuten,
          minutenOptionen: art.minuten?.optionen ?? null,
        };
      });
    },

    async einstellungSetzen(sub, key, aktiv, minuten) {
      const art = artOderFehler(key);
      const m = await store.mitgliedEinstellungen(sub);
      if (!m) return false;
      const aktuell = effektiveEinstellung(art, m.status, m.gespeichert.get(key));
      await store.einstellungSetzen(
        sub,
        key,
        aktiv,
        art.minuten ? (minuten ?? aktuell.minuten) : null,
      );
      return true;
    },

    async empfaengerEinstellungen(key, subs) {
      const art = artOderFehler(key);
      return (await store.empfaenger(key, subs)).map((e) => {
        const eff = effektiveEinstellung(art, e.status, e.gespeichert);
        return { sub: e.sub, ...eff };
      });
    },

    async senden(sendung) {
      const art = artOderFehler(sendung.art);
      const subs = sendung.subs === 'alle' ? undefined : [...new Set(sendung.subs)];
      if (subs && subs.length === 0) return 0;
      const ausgenommen = new Set(sendung.ausser ?? []);
      const empfaenger = (await store.empfaenger(sendung.art, subs)).filter(
        (e) =>
          !ausgenommen.has(e.sub) &&
          (sendung.ohneEinstellung === true ||
            effektiveEinstellung(art, e.status, e.gespeichert).aktiv),
      );
      if (empfaenger.length === 0) return 0;
      const schluessel = sendung.dedupeSchluessel;
      const abos = await store.abosVon(empfaenger.map((e) => e.sub));

      const verlaufSchreiben = async (): Promise<Map<string, string>> => {
        try {
          return await store.verlaufEintragen(
            empfaenger.map((e) => ({
              sub: e.sub,
              art: sendung.art,
              titel: sendung.titel,
              text: sendung.text,
              url: sendung.url,
              schluessel: schluessel ?? null,
            })),
          );
        } catch (err) {
          console.error('Notification history could not be written', err);
          return new Map();
        }
      };

      // Without a device nothing can be delivered: only the history is written and the key stays
      // unclaimed, so a later run still sends once the member has activated push.
      if (abos.length === 0) {
        await verlaufSchreiben();
        return 0;
      }
      if (schluessel && !(await store.versandBelegen(schluessel))) return 0;
      const ids = await verlaufSchreiben();

      const proMitglied = new Map<string, PushAbo[]>();
      for (const abo of abos) {
        const liste = proMitglied.get(abo.mitgliedSub) ?? [];
        liste.push(abo);
        proMitglied.set(abo.mitgliedSub, liste);
      }
      const ergebnisse = (
        await Promise.all(
          [...proMitglied].map(([sub, meine]) =>
            liefern(meine, {
              titel: sendung.titel,
              text: sendung.text,
              url: sendung.url,
              ...(ids.has(sub) ? { id: ids.get(sub) } : {}),
            }),
          ),
        )
      ).flat();
      // Nobody could be reached because of a transient error: allow a retry in the next run.
      if (schluessel && ergebnisse.includes('fehler') && !ergebnisse.includes('ok')) {
        await store.versandFreigeben(schluessel).catch(() => {});
      }
      return empfaenger.length;
    },

    async testSenden(sub) {
      const abos = await store.abosVon([sub]);
      const ergebnisse = await liefern(abos, {
        titel: 'Test',
        text: 'Push funktioniert auf diesem Gerät.',
        url: '/app/benachrichtigungen',
      });
      return {
        geraete: abos.length,
        ok: ergebnisse.filter((e) => e === 'ok').length,
        fehler: ergebnisse.filter((e) => e !== 'ok').length,
      };
    },

    einmalBelegen: (schluessel) => store.versandBelegen(schluessel),
    einmalFreigeben: (schluessel) => store.versandFreigeben(schluessel),

    async verlaufSeite(sub, { art, bereich, nurUngelesen, vor, limit }) {
      const arten = verlaufArten(art, bereich);
      const zeilen = await store.verlaufSeite(sub, { arten, nurUngelesen, vor, limit: limit + 1 });
      const seite = zeilen.slice(0, limit);
      const letzte = seite.at(-1);
      return {
        eintraege: seite,
        weiter:
          zeilen.length > seite.length && letzte
            ? { erstellt: letzte.erstellt, id: letzte.id }
            : null,
      };
    },
    verlaufUngelesen: (sub) => store.verlaufUngelesen(sub),
    verlaufGelesen: (sub, id) => store.verlaufGelesen(sub, id),
    verlaufAlleGelesen: (sub, { art, bereich }) =>
      store.verlaufAlleGelesen(sub, verlaufArten(art, bereich)),
    verlaufAufraeumen: (jetzt) =>
      store.verlaufAufraeumen(new Date(jetzt.getTime() - VERLAUF_AUFBEWAHRUNG_TAGE * 86_400_000)),

    registriereAufgabe(name, aufgabe) {
      aufgaben.set(name, aufgabe);
    },

    async pushJob(jetzt) {
      for (const [name, aufgabe] of aufgaben) {
        try {
          await aufgabe(jetzt);
        } catch (err) {
          console.error(`Push job task ${name} failed`, err);
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Drizzle store
// ---------------------------------------------------------------------------------------------

const VAPID_ID = 'vapid';
/** Rows per statement for history writes (Aurora DSQL limits rows per transaction). */
const VERLAUF_STAPEL = 500;

export function createBenachrichtigungenStore(db: Db): BenachrichtigungenStore {
  let vapidCache: Vapid | undefined;
  return {
    async vapid() {
      if (vapidCache) return vapidCache;
      const lesen = async () => {
        const [row] = await db.select().from(pushSchluessel).where(eq(pushSchluessel.id, VAPID_ID));
        return row && { publicKey: row.publicKey, privateKey: row.privateKey };
      };
      let vapid = await lesen();
      if (!vapid) {
        const neu = webpush.generateVAPIDKeys();
        await db
          .insert(pushSchluessel)
          .values({ id: VAPID_ID, publicKey: neu.publicKey, privateKey: neu.privateKey })
          .onConflictDoNothing();
        // Re-read so concurrent cold starts agree on the winner.
        vapid = await lesen();
      }
      if (!vapid) throw new Error('VAPID keys could not be stored');
      vapidCache = vapid;
      return vapid;
    },

    async aboSpeichern(sub, abo) {
      const werte = { mitgliedSub: sub, p256dh: abo.keys.p256dh, auth: abo.keys.auth };
      await db
        .insert(pushAbos)
        .values({ id: randomUUID(), endpoint: abo.endpoint, ...werte })
        .onConflictDoUpdate({ target: pushAbos.endpoint, set: werte });
    },

    async aboLoeschen(sub, endpoint) {
      await db
        .delete(pushAbos)
        .where(and(eq(pushAbos.mitgliedSub, sub), eq(pushAbos.endpoint, endpoint)));
    },

    async aboEntfernen(endpoint) {
      await db.delete(pushAbos).where(eq(pushAbos.endpoint, endpoint));
    },

    async aboVorhanden(sub, endpoint) {
      const zeilen = await db
        .select({ id: pushAbos.id })
        .from(pushAbos)
        .where(and(eq(pushAbos.mitgliedSub, sub), eq(pushAbos.endpoint, endpoint)))
        .limit(1);
      return zeilen.length > 0;
    },

    async abosVon(subs) {
      if (subs.length === 0) return [];
      return db
        .select()
        .from(pushAbos)
        .where(inArray(pushAbos.mitgliedSub, [...subs]));
    },

    async empfaenger(art, subs) {
      if (subs && subs.length === 0) return [];
      const rows = await db
        .select({
          sub: mitglieder.sub,
          status: mitglieder.status,
          aktiv: benachrichtigungEinstellungen.aktiv,
          minuten: benachrichtigungEinstellungen.minuten,
        })
        .from(mitglieder)
        .leftJoin(
          benachrichtigungEinstellungen,
          and(
            eq(benachrichtigungEinstellungen.mitgliedSub, mitglieder.sub),
            eq(benachrichtigungEinstellungen.art, art),
          ),
        )
        .where(
          and(
            // Subscriptions of deactivated members stay stored but are never served.
            isNull(mitglieder.deaktiviertAm),
            subs ? inArray(mitglieder.sub, [...subs]) : undefined,
          ),
        );
      return rows.map((r) => ({
        sub: r.sub,
        status: r.status,
        gespeichert: r.aktiv === null ? null : { aktiv: r.aktiv, minuten: r.minuten },
      }));
    },

    async mitgliedEinstellungen(sub) {
      const [m] = await db.select().from(mitglieder).where(eq(mitglieder.sub, sub));
      if (!m) return undefined;
      const rows = await db
        .select()
        .from(benachrichtigungEinstellungen)
        .where(eq(benachrichtigungEinstellungen.mitgliedSub, sub));
      return {
        status: m.status,
        gespeichert: new Map(rows.map((r) => [r.art, { aktiv: r.aktiv, minuten: r.minuten }])),
      };
    },

    async einstellungSetzen(sub, art, aktiv, minuten) {
      await db
        .insert(benachrichtigungEinstellungen)
        .values({ mitgliedSub: sub, art, aktiv, minuten })
        .onConflictDoUpdate({
          target: [benachrichtigungEinstellungen.mitgliedSub, benachrichtigungEinstellungen.art],
          set: { aktiv, minuten },
        });
    },

    async versandBelegen(schluessel) {
      const rows = await db
        .insert(pushVersand)
        .values({ schluessel })
        .onConflictDoNothing()
        .returning({ schluessel: pushVersand.schluessel });
      return rows.length > 0;
    },

    async versandFreigeben(schluessel) {
      await db.delete(pushVersand).where(eq(pushVersand.schluessel, schluessel));
    },

    async verlaufEintragen(eintraege) {
      const ids = new Map<string, string>();
      for (let i = 0; i < eintraege.length; i += VERLAUF_STAPEL) {
        const stapel = eintraege.slice(i, i + VERLAUF_STAPEL);
        const neu = stapel.map((e) => ({ e, id: randomUUID() }));
        await db
          .insert(benachrichtigungVerlauf)
          .values(
            neu.map(({ e, id }) => ({
              id,
              mitgliedSub: e.sub,
              art: e.art,
              titel: e.titel,
              text: e.text,
              url: e.url,
              schluessel: e.schluessel,
            })),
          )
          .onConflictDoNothing();
        for (const { e, id } of neu) ids.set(e.sub, id);
        // Entries with a key may already exist: they keep their id, so read those back.
        const mitSchluessel = stapel.filter((e) => e.schluessel !== null);
        if (mitSchluessel.length > 0) {
          const zeilen = await db
            .select({
              id: benachrichtigungVerlauf.id,
              sub: benachrichtigungVerlauf.mitgliedSub,
              schluessel: benachrichtigungVerlauf.schluessel,
            })
            .from(benachrichtigungVerlauf)
            .where(
              and(
                inArray(
                  benachrichtigungVerlauf.mitgliedSub,
                  mitSchluessel.map((e) => e.sub),
                ),
                inArray(benachrichtigungVerlauf.schluessel, [
                  ...new Set(mitSchluessel.map((e) => e.schluessel!)),
                ]),
              ),
            );
          const gewollt = new Set(mitSchluessel.map((e) => `${e.sub}|${e.schluessel}`));
          for (const z of zeilen) {
            if (gewollt.has(`${z.sub}|${z.schluessel}`)) ids.set(z.sub, z.id);
          }
        }
      }
      return ids;
    },

    async verlaufSeite(sub, { arten, nurUngelesen, vor, limit }) {
      if (arten && arten.length === 0) return [];
      const t = benachrichtigungVerlauf;
      return db
        .select({
          id: t.id,
          art: t.art,
          titel: t.titel,
          text: t.text,
          url: t.url,
          erstellt: t.erstellt,
          gelesen: t.gelesen,
        })
        .from(t)
        .where(
          and(
            eq(t.mitgliedSub, sub),
            arten ? inArray(t.art, [...arten]) : undefined,
            nurUngelesen ? isNull(t.gelesen) : undefined,
            vor
              ? or(
                  lt(t.erstellt, vor.erstellt),
                  and(eq(t.erstellt, vor.erstellt), lt(t.id, vor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(t.erstellt), desc(t.id))
        .limit(limit);
    },

    async verlaufUngelesen(sub) {
      const t = benachrichtigungVerlauf;
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(t)
        .where(and(eq(t.mitgliedSub, sub), isNull(t.gelesen)));
      return row?.n ?? 0;
    },

    async verlaufGelesen(sub, id) {
      const t = benachrichtigungVerlauf;
      const vorhanden = await db
        .select({ id: t.id })
        .from(t)
        .where(and(eq(t.id, id), eq(t.mitgliedSub, sub)));
      if (vorhanden.length === 0) return false;
      await db
        .update(t)
        .set({ gelesen: new Date() })
        .where(and(eq(t.id, id), eq(t.mitgliedSub, sub), isNull(t.gelesen)));
      return true;
    },

    async verlaufAlleGelesen(sub, arten) {
      if (arten && arten.length === 0) return;
      const t = benachrichtigungVerlauf;
      const jetzt = new Date();
      // Batches stay below the per-transaction row limit of Aurora DSQL.
      for (;;) {
        const offen = await db
          .select({ id: t.id })
          .from(t)
          .where(
            and(
              eq(t.mitgliedSub, sub),
              isNull(t.gelesen),
              arten ? inArray(t.art, [...arten]) : undefined,
            ),
          )
          .limit(VERLAUF_STAPEL);
        if (offen.length === 0) return;
        await db
          .update(t)
          .set({ gelesen: jetzt })
          .where(
            inArray(
              t.id,
              offen.map((o) => o.id),
            ),
          );
        if (offen.length < VERLAUF_STAPEL) return;
      }
    },

    async verlaufAufraeumen(vor) {
      const t = benachrichtigungVerlauf;
      let gesamt = 0;
      for (;;) {
        const alt = await db
          .select({ id: t.id })
          .from(t)
          .where(lt(t.erstellt, vor))
          .limit(VERLAUF_STAPEL);
        if (alt.length === 0) return gesamt;
        await db.delete(t).where(
          inArray(
            t.id,
            alt.map((a) => a.id),
          ),
        );
        gesamt += alt.length;
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Web Push sender
// ---------------------------------------------------------------------------------------------

/** Sends through the browsers' push services with the stored VAPID keys. */
export function createWebPushSender(store: BenachrichtigungenStore, subject: string): PushSender {
  return async (abo, nachricht) => {
    const vapid = await store.vapid();
    try {
      await webpush.sendNotification(
        { endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } },
        JSON.stringify(nachricht),
        {
          vapidDetails: { subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
          TTL: 60 * 60,
          urgency: 'high',
        },
      );
      return 'ok';
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'gone';
      const body = (err as { body?: string }).body;
      console.error('Web push failed', { status, body, endpointHost: new URL(abo.endpoint).host });
      if (status === undefined) console.error(err);
      return 'fehler';
    }
  };
}

/**
 * Runs a notification step without ever failing the caller: errors are logged and the wait is
 * capped, because the Lambda may be frozen once the response is sent.
 */
export async function bestEffort(aufgabe: () => Promise<unknown>, maxMs = 5000): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      aufgabe(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, maxMs);
      }),
    ]);
  } catch (err) {
    console.error('Notification failed', err);
  } finally {
    clearTimeout(timer);
  }
}
