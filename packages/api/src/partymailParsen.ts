import { htmlToText } from 'html-to-text';
import { simpleParser, type AddressObject } from 'mailparser';
import type { EingehendeMail } from './partymailTypen';

// Raw RFC 822 message -> `EingehendeMail`, and matching a mail to a request by its thread headers.

const erste = (a: AddressObject | AddressObject[] | undefined) => {
  const obj = Array.isArray(a) ? a[0] : a;
  return obj?.value[0];
};

/** "<id>" tokens of a References header. */
export const messageIdsAus = (wert: string | string[] | undefined | null): string[] => {
  const text = Array.isArray(wert) ? wert.join(' ') : (wert ?? '');
  return text.match(/<[^<>\s]+>/g) ?? [];
};

export async function mailParsen(raw: Buffer, uid: number): Promise<EingehendeMail> {
  const m = await simpleParser(raw);
  const von = erste(m.from);
  const antwort = erste(m.replyTo);
  const text =
    m.text?.trim() ||
    (typeof m.html === 'string'
      ? htmlToText(m.html, {
          wordwrap: false,
          selectors: [{ selector: 'img', format: 'skip' }],
        }).trim()
      : '');
  return {
    uid,
    // Without a Message-ID a stable fallback keeps duplicates out.
    messageId: m.messageId ?? `<uid-${uid}@fehlt.invalid>`,
    inReplyTo: messageIdsAus(m.inReplyTo)[0] ?? null,
    referenzen: messageIdsAus(m.references),
    vonAdresse: antwort?.address ?? von?.address ?? null,
    vonName: (antwort?.name || von?.name) ?? null,
    anAdresse: erste(m.to)?.address ?? null,
    betreff: m.subject ?? null,
    text,
    anhaenge: m.attachments.map((a) => a.filename ?? 'Anhang'),
    zeitpunkt: m.date ?? new Date(),
  };
}

/**
 * The request a mail belongs to: the first of its In-Reply-To / References ids (newest reference
 * first) that is already stored. `bekannt` maps stored Message-IDs to request ids.
 */
export function threadZuordnen(
  mail: Pick<EingehendeMail, 'inReplyTo' | 'referenzen'>,
  bekannt: ReadonlyMap<string, string>,
): string | undefined {
  const ids = [...(mail.inReplyTo ? [mail.inReplyTo] : []), ...[...mail.referenzen].reverse()];
  for (const id of ids) {
    const treffer = bekannt.get(id);
    if (treffer) return treffer;
  }
  return undefined;
}

/** The ids the thread match looks for, in order. */
export const threadIds = (mail: Pick<EingehendeMail, 'inReplyTo' | 'referenzen'>): string[] => [
  ...new Set([...(mail.inReplyTo ? [mail.inReplyTo] : []), ...[...mail.referenzen].reverse()]),
];
