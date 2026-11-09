// German error texts for IMAP/SMTP failures; they end up in `mail_abruf.fehler` and in the UI.
// Never contains credentials.

interface ImapFehler {
  responseText?: string;
  serverResponseCode?: string;
  mailboxMissing?: boolean;
  authenticationFailed?: boolean;
  executedCommand?: string;
  code?: string;
  message?: string;
}

/** The folder a failed command (`SELECT INBOX.X`) was about, else `ordner`. */
const ordnerAus = (e: ImapFehler, ordner?: string): string => {
  const treffer = /^(?:SELECT|EXAMINE|STATUS|APPEND)\s+"?([^"\s]+)"?/i.exec(
    e.executedCommand ?? '',
  );
  return treffer?.[1] ?? ordner ?? '?';
};

export function imapFehlerText(err: unknown, ordner?: string): string {
  const e = (typeof err === 'object' && err !== null ? err : {}) as ImapFehler;
  if (e.mailboxMissing || e.serverResponseCode === 'NONEXISTENT') {
    return `Ordner „${ordnerAus(e, ordner)}“ gibt es im Postfach nicht.`;
  }
  if (e.authenticationFailed || e.serverResponseCode === 'AUTHENTICATIONFAILED') {
    return 'Anmeldung am Postfach fehlgeschlagen.';
  }
  if (e.responseText) return `IMAP-Fehler: ${e.responseText}`;
  if (e.code === 'ETIMEDOUT' || /timeout|Zeitüberschreitung/i.test(e.message ?? '')) {
    return e.message?.startsWith('Zeitüberschreitung')
      ? e.message
      : 'Zeitüberschreitung bei der Verbindung zum Postfach.';
  }
  if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED') {
    return 'Der Mailserver ist nicht erreichbar.';
  }
  return `IMAP-Fehler: ${e.message ?? 'unbekannt'}`;
}

interface SmtpFehler {
  code?: string;
  response?: string;
  responseCode?: number;
  message?: string;
}

export function smtpFehlerText(err: unknown): string {
  const e = (typeof err === 'object' && err !== null ? err : {}) as SmtpFehler;
  if (e.code === 'EAUTH') return 'Anmeldung am Mailserver (SMTP) fehlgeschlagen.';
  if (e.code === 'ETIMEDOUT' || e.code === 'ECONNECTION' || e.code === 'ESOCKET') {
    return 'Der Mailserver (SMTP) ist nicht erreichbar.';
  }
  if (e.response) return `SMTP-Fehler: ${e.response}`;
  return `SMTP-Fehler: ${e.message ?? 'unbekannt'}`;
}

/** At most 15 folder paths for the hint after a missing folder. */
export const ordnerHinweis = (pfade: readonly string[]): string =>
  pfade.length === 0
    ? ''
    : ` Vorhandene Ordner: ${pfade.slice(0, 15).join(', ')}${pfade.length > 15 ? ', …' : ''}`;
