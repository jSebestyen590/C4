import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { generateVAPIDKeys, sendNotification } from 'web-push';
import {
  benachrichtigungsArt,
  BENACHRICHTIGUNGS_ARTEN,
  effektiveEinstellung,
  type EinstellungDto,
  type GespeicherteEinstellung,
  type MitgliedStatus,
  type PushAboEingabe,
  type PushNachricht,
} from '@c4/shared';
import type { Db } from './db/client';
import {
  benachrichtigungEinstellungen,
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
  /** Registers a task that runs on every `pushJob`. */
  registriereAufgabe(name: string, aufgabe: (jetzt: Date) => Promise<void>): void;
  /** Runs all registered tasks; one failing task does not stop the others. */
  pushJob(jetzt: Date): Promise<void>;
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
      const empfaenger = (await store.empfaenger(sendung.art, subs)).filter(
        (e) => effektiveEinstellung(art, e.status, e.gespeichert).aktiv,
      );
      if (empfaenger.length === 0) return 0;
      // Without a device nothing can be delivered: don't claim the key, so a later run still sends
      // once the member has activated push.
      const abos = await store.abosVon(empfaenger.map((e) => e.sub));
      if (abos.length === 0) return 0;
      const schluessel = sendung.dedupeSchluessel;
      if (schluessel && !(await store.versandBelegen(schluessel))) return 0;

      const nachricht: PushNachricht = {
        titel: sendung.titel,
        text: sendung.text,
        url: sendung.url,
      };
      const ergebnisse = await liefern(abos, nachricht);
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
        const neu = generateVAPIDKeys();
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
        .where(subs ? inArray(mitglieder.sub, [...subs]) : undefined);
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
      await sendNotification(
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
