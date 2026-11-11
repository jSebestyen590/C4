import type { Benachrichtigungen } from './benachrichtigungen';
import { bestEffort } from './benachrichtigungen';
import type { UserAdmin } from './admin';
import type { PostenStore } from './posten';
import { threadIds } from './partymailParsen';
import { mitgliederMitRecht } from './privatpartyBenachrichtigungen';
import type { PrivatpartysStore } from './privatpartys';
import type { PartyMail } from './partymailTypen';

// The mail job: fetches new mails of the Party-Mail into the Privatpartys (see docs/privatpartys.md).

/** Most mails imported per run. */
export const MAIL_JOB_MAX = 20;
/** Longest stored mail text (same limit as outgoing replies). */
const NACHRICHT_TEXT_MAX = 20000;

export interface MailJobDeps {
  partymail: PartyMail;
  privatpartys: PrivatpartysStore;
  benachrichtigungen: Pick<Benachrichtigungen, 'senden'>;
  posten: Pick<PostenStore, 'inhaberMitRecht'>;
  userAdmin: Pick<UserAdmin, 'rollen'>;
}

export interface MailJobErgebnis {
  eingerichtet: boolean;
  /** Stored mails (duplicates not counted). */
  neu: number;
  fehler: string | null;
}

/**
 * One run: new mails after the stored UID become messages of the request their thread headers point
 * to, else of a new blank request; the holders of `privatpartys:verwalten` are notified. Errors land
 * in `mail_abruf.fehler` and are not thrown.
 */
export async function mailJob(deps: MailJobDeps, jetzt = new Date()): Promise<MailJobErgebnis> {
  if (!(await deps.partymail.eingerichtet())) return { eingerichtet: false, neu: 0, fehler: null };
  const store = deps.privatpartys;
  let neu = 0;
  let uebersprungen = 0;
  try {
    const stand = await store.abrufStand();
    const ergebnis = await deps.partymail.abrufen(stand, MAIL_JOB_MAX);
    uebersprungen += ergebnis.uebersprungen ?? 0;
    let angelegt: string | null = null;
    let vorherigeUid = stand.letzteUid;
    for (const mail of ergebnis.mails) {
      angelegt = null;
      try {
        if (await store.nachrichtNachMessageId(mail.messageId)) {
          vorherigeUid = mail.uid;
          continue;
        }
        const bisherige = await store.privatpartyZuMessageIds(threadIds(mail));
        const id =
          bisherige ??
          (angelegt = await store.anlegen(
            {
              personId: null,
              anlass: null,
              notizen: null,
              termine: [],
              mailAdresse: mail.vonAdresse,
              letzteNachrichtAm: mail.zeitpunkt,
            },
            null,
          ));
        await store.nachrichtAnlegen({
          privatpartyId: id,
          richtung: 'ein',
          messageId: mail.messageId,
          inReplyTo: mail.inReplyTo,
          referenzen: mail.referenzen,
          vonAdresse: mail.vonAdresse,
          vonName: mail.vonName,
          anAdresse: mail.anAdresse,
          betreff: mail.betreff,
          text: mail.text.slice(0, NACHRICHT_TEXT_MAX),
          anhaenge: mail.anhaenge,
          zeitpunkt: mail.zeitpunkt,
          mitgliedSub: null,
        });
        neu++;
        const absender = mail.vonName || mail.vonAdresse || 'Jemand';
        await bestEffort(async () => {
          await deps.benachrichtigungen.senden({
            subs: await mitgliederMitRecht(deps, 'privatpartys:verwalten'),
            art: bisherige ? 'privatpartys.nachricht' : 'privatpartys.anfrage',
            titel: bisherige ? 'Neue Nachricht zu einer Privatparty' : 'Neue Privatparty-Anfrage',
            text: `${absender}: ${mail.betreff ?? '(ohne Betreff)'}`,
            url: `/app/privatpartys/${id}`,
            dedupeSchluessel: mail.messageId,
          });
        });
        vorherigeUid = mail.uid;
      } catch (err) {
        // A store error may be transient: stop here, keep the position before this mail and retry it
        // in the next run. Remove the empty request created for it, else the retry makes a second one.
        console.error('Mail job: storing a mail failed', mail.messageId, err);
        if (angelegt) await store.loeschen(angelegt).catch(() => undefined);
        await store.abrufStandSetzen({
          uidValidity: ergebnis.uidValidity,
          letzteUid: vorherigeUid,
          letzterAbruf: jetzt,
          fehler:
            'Eine Mail konnte nicht gespeichert werden. Der Abruf versucht es beim nächsten Mal erneut.',
        });
        return { eingerichtet: true, neu, fehler: null };
      }
    }
    await store.abrufStandSetzen({
      uidValidity: ergebnis.uidValidity,
      letzteUid: ergebnis.letzteUid,
      letzterAbruf: jetzt,
      fehler:
        uebersprungen > 0
          ? `${uebersprungen === 1 ? '1 Mail konnte' : `${uebersprungen} Mails konnten`} nicht verarbeitet werden und ${uebersprungen === 1 ? 'wurde' : 'wurden'} übersprungen.`
          : null,
    });
    // Skipped mails are shown in the status line, but the run itself succeeded.
    return { eingerichtet: true, neu, fehler: null };
  } catch (err) {
    const meldung = err instanceof Error ? err.message : 'Unbekannter Fehler';
    console.error('Mail job failed', err);
    await store
      .abrufStandSetzen({ letzterAbruf: jetzt, fehler: meldung.slice(0, 500) })
      .catch(() => undefined);
    return { eingerichtet: true, neu, fehler: meldung };
  }
}
