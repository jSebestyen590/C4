import type { AbrufErgebnis, AusgehendeMail, EingehendeMail, PartyMail } from './partymailTypen';

/** In-memory Party-Mail for tests: `eingang` is the inbox, `gesendet` records what was sent. */
export function createFakePartyMail(eingerichtet = true) {
  const zustand = {
    eingerichtet,
    eingang: [] as EingehendeMail[],
    gesendet: [] as (AusgehendeMail & { messageId: string })[],
    abgelegt: [] as Buffer[],
    uidValidity: '1',
    /** Makes the next `abrufen` fail. */
    fehler: null as string | null,
    senden_fehler: false,
  };
  const mail: PartyMail = {
    async eingerichtet() {
      return zustand.eingerichtet;
    },
    async abrufen(stand, max): Promise<AbrufErgebnis> {
      if (zustand.fehler) throw new Error(zustand.fehler);
      const hoechste = Math.max(0, ...zustand.eingang.map((m) => m.uid));
      if (stand.uidValidity !== zustand.uidValidity) {
        return {
          uidValidity: zustand.uidValidity,
          letzteUid: hoechste,
          zurueckgesetzt: true,
          mails: [],
        };
      }
      const mails = zustand.eingang
        .filter((m) => m.uid > stand.letzteUid)
        .sort((a, b) => a.uid - b.uid)
        .slice(0, max);
      return {
        uidValidity: zustand.uidValidity,
        letzteUid: mails.at(-1)?.uid ?? stand.letzteUid,
        zurueckgesetzt: false,
        mails,
      };
    },
    async senden(m) {
      if (zustand.senden_fehler) throw new Error('SMTP down');
      const messageId = `<gesendet-${zustand.gesendet.length + 1}@party.example>`;
      zustand.gesendet.push({ ...m, messageId });
      return {
        messageId,
        raw: Buffer.from(m.text),
        vonAdresse: 'party@party.example',
        vonName: 'C4 Party-Mail',
      };
    },
    async gesendetAblegen(raw) {
      zustand.abgelegt.push(raw);
    },
  };
  return { mail, zustand };
}
