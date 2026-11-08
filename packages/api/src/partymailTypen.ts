// Types of the Party-Mail (see docs/privatpartys.md), apart from the IMAP/SMTP implementation so
// that the job and the routes do not depend on it.

/** A mail fetched from the inbox. `vonAdresse` is the reply address (Reply-To, else From). */
export interface EingehendeMail {
  uid: number;
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
}

export interface AbrufStandEingabe {
  uidValidity: string | null;
  letzteUid: number;
}

export interface AbrufErgebnis {
  uidValidity: string;
  /** Highest UID that was handled; the next run continues after it. */
  letzteUid: number;
  /** The mailbox was replaced (uidValidity changed) or fetched for the first time: nothing imported. */
  zurueckgesetzt: boolean;
  mails: EingehendeMail[];
}

export interface AusgehendeMail {
  an: string;
  betreff: string;
  text: string;
  inReplyTo: string | null;
  referenzen: string[];
}

export interface GesendeteMail {
  messageId: string;
  /** The complete message, for the Sent folder. */
  raw: Buffer;
  /** Address and display name of the Party-Mail. */
  vonAdresse: string;
  vonName: string | null;
}

export interface PartyMail {
  /** False without secret or with unusable values: the job does nothing and replies are off. */
  eingerichtet(): Promise<boolean>;
  /** At most `max` new mails after the stored position, oldest first. */
  abrufen(stand: AbrufStandEingabe, max: number): Promise<AbrufErgebnis>;
  senden(mail: AusgehendeMail): Promise<GesendeteMail>;
  /** Appends the sent message to the Sent folder. */
  gesendetAblegen(raw: Buffer): Promise<void>;
}

/** Credentials and servers, the JSON value of the secret. */
export interface PartyMailKonfig {
  adresse: string;
  absenderName: string;
  benutzer: string;
  passwort: string;
  imapHost: string;
  imapPort: number;
  imapTls: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  ordnerEingang: string;
  ordnerGesendet: string;
}
