import { randomUUID } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { z } from 'zod';
import { imapFehlerText, ordnerHinweis, smtpFehlerText } from './partymailFehler';
import { mailParsen } from './partymailParsen';
import { createSecretLeser } from './secrets';
import type { AbrufErgebnis, EingehendeMail, PartyMail, PartyMailKonfig } from './partymailTypen';

export type { PartyMail } from './partymailTypen';

// Party-Mail over IMAP/SMTP with the credentials from Secrets Manager (see docs/privatpartys.md).

const konfigSchema = z.object({
  adresse: z.string().min(3),
  absenderName: z.string().default(''),
  benutzer: z.string().min(1),
  passwort: z.string().min(1),
  imapHost: z.string().min(1),
  imapPort: z.number().int().default(993),
  imapTls: z.boolean().default(true),
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().default(465),
  smtpSecure: z.boolean().default(true),
  ordnerEingang: z.string().default('INBOX'),
  ordnerGesendet: z.string().default('Sent'),
});

/** The whole run stays well under the Lambda's 15 seconds. */
const ABRUF_MAX_MS = 9_000;
/** Messages above this size are skipped without downloading them. */
const MAIL_MAX_BYTES = 10 * 1024 * 1024;

/** Reads (and caches for 5 minutes) the secret; undefined when unset, empty or unusable. */
export const createKonfigLeser = (secretArn: string | undefined, region: string) =>
  createSecretLeser<PartyMailKonfig>(secretArn, region, konfigSchema, 'Party-Mail');

function imapClient(k: PartyMailKonfig): ImapFlow {
  return new ImapFlow({
    host: k.imapHost,
    port: k.imapPort,
    secure: k.imapTls,
    auth: { user: k.benutzer, pass: k.passwort },
    logger: false,
    connectionTimeout: 5000,
    greetingTimeout: 4000,
    socketTimeout: 8000,
  });
}

/** Rejects (and closes the client) after `ms`. */
async function mitFrist<T>(client: ImapFlow, ms: number, aufgabe: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      aufgabe(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          client.close();
          reject(new Error('Zeitüberschreitung beim Abruf der Party-Mail.'));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createPartyMail(opts: { secretArn?: string; region: string }): PartyMail {
  const konfigLesen = createKonfigLeser(opts.secretArn, opts.region);
  const konfig = async () => {
    const k = await konfigLesen();
    if (!k) throw new Error('Die Party-Mail ist nicht eingerichtet.');
    return k;
  };
  return {
    async eingerichtet() {
      return (await konfigLesen()) !== undefined;
    },

    async abrufen(stand, max): Promise<AbrufErgebnis> {
      const k = await konfig();
      const client = imapClient(k);
      return mitFrist(client, ABRUF_MAX_MS, async () => {
        try {
          await client.connect();
        } catch (err) {
          throw new Error(imapFehlerText(err), { cause: err });
        }
        try {
          const lock = await client.getMailboxLock(k.ordnerEingang).catch(async (err: unknown) => {
            let hinweis = '';
            if (imapFehlerText(err, k.ordnerEingang).startsWith('Ordner')) {
              const ordner = await client.list().catch(() => []);
              hinweis = ordnerHinweis(ordner.map((o) => o.path));
            }
            throw new Error(imapFehlerText(err, k.ordnerEingang) + hinweis, { cause: err });
          });
          try {
            const box = client.mailbox;
            if (!box) throw new Error('Postfach nicht verfügbar.');
            const validity = String(box.uidValidity);
            const hoechste = Math.max(0, box.uidNext - 1);
            // First run or replaced mailbox: start from now, import nothing.
            if (stand.uidValidity !== validity) {
              return {
                uidValidity: validity,
                letzteUid: hoechste,
                zurueckgesetzt: true,
                mails: [],
              };
            }
            const gefunden =
              (await client.search({ uid: `${stand.letzteUid + 1}:*` }, { uid: true })) || [];
            const uids = gefunden
              .filter((u) => u > stand.letzteUid)
              .sort((a, b) => a - b)
              .slice(0, max);
            const mails: EingehendeMail[] = [];
            let uebersprungen = 0;
            for (const uid of uids) {
              // A message that is too large or cannot be parsed is skipped, it must not block the
              // inbox: the position still advances past it. Connection errors still abort the run.
              const kopf = await client.fetchOne(String(uid), { size: true }, { uid: true });
              if (kopf && kopf.size !== undefined && kopf.size > MAIL_MAX_BYTES) {
                console.error(`Party-Mail: UID ${uid} skipped, ${kopf.size} bytes`);
                uebersprungen++;
                continue;
              }
              const nachricht = await client.fetchOne(String(uid), { source: true }, { uid: true });
              if (!nachricht || !nachricht.source) continue;
              try {
                mails.push(await mailParsen(nachricht.source, uid));
              } catch (err) {
                console.error(`Party-Mail: UID ${uid} could not be parsed, skipped`, err);
                uebersprungen++;
              }
            }
            return {
              uidValidity: validity,
              letzteUid: uids.at(-1) ?? stand.letzteUid,
              zurueckgesetzt: false,
              mails,
              uebersprungen,
            };
          } finally {
            lock.release();
          }
        } finally {
          await client.logout().catch(() => client.close());
        }
      });
    },

    async senden(mail) {
      const k = await konfig();
      const domain = k.adresse.split('@')[1] ?? 'localhost';
      const messageId = `<${randomUUID()}@${domain}>`;
      const komponist = new MailComposer({
        from: { name: k.absenderName, address: k.adresse },
        to: mail.an,
        subject: mail.betreff,
        text: mail.text,
        messageId,
        ...(mail.inReplyTo && { inReplyTo: mail.inReplyTo }),
        ...(mail.referenzen.length > 0 && { references: mail.referenzen }),
      });
      const raw = await komponist.compile().build();
      const transport = nodemailer.createTransport({
        host: k.smtpHost,
        port: k.smtpPort,
        secure: k.smtpSecure,
        auth: { user: k.benutzer, pass: k.passwort },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 8000,
      });
      await transport
        .sendMail({ envelope: { from: k.adresse, to: [mail.an] }, raw })
        .catch((err: unknown) => {
          throw new Error(smtpFehlerText(err), { cause: err });
        });
      return { messageId, raw, vonAdresse: k.adresse, vonName: k.absenderName || null };
    },

    async gesendetAblegen(raw) {
      const k = await konfig();
      const client = imapClient(k);
      await mitFrist(client, 8000, async () => {
        await client.connect();
        try {
          await client.append(k.ordnerGesendet, raw, ['\\Seen']).catch((err: unknown) => {
            throw new Error(imapFehlerText(err, k.ordnerGesendet), { cause: err });
          });
        } finally {
          await client.logout().catch(() => client.close());
        }
      });
    },
  };
}
