import { describe, expect, it } from 'vitest';
import { imapFehlerText, ordnerHinweis, smtpFehlerText } from './partymailFehler';

describe('imapFehlerText', () => {
  it('names a missing folder from the failed command', () => {
    const err = Object.assign(new Error('Command failed'), {
      mailboxMissing: true,
      serverResponseCode: 'NONEXISTENT',
      responseText: "Mailbox doesn't exist: INBOX.Posteingang",
      executedCommand: 'SELECT INBOX.Posteingang',
    });
    expect(imapFehlerText(err, 'INBOX')).toBe(
      'Ordner „INBOX.Posteingang“ gibt es im Postfach nicht.',
    );
    expect(imapFehlerText({ serverResponseCode: 'NONEXISTENT' }, 'Sent')).toBe(
      'Ordner „Sent“ gibt es im Postfach nicht.',
    );
  });
  it('reports a failed login', () => {
    expect(imapFehlerText({ authenticationFailed: true })).toBe(
      'Anmeldung am Postfach fehlgeschlagen.',
    );
    expect(imapFehlerText({ serverResponseCode: 'AUTHENTICATIONFAILED' })).toBe(
      'Anmeldung am Postfach fehlgeschlagen.',
    );
  });
  it('falls back to the server text', () => {
    expect(imapFehlerText({ responseText: 'Too many connections' })).toBe(
      'IMAP-Fehler: Too many connections',
    );
    expect(imapFehlerText(new Error('Command failed'))).toBe('IMAP-Fehler: Command failed');
  });
});

describe('smtpFehlerText', () => {
  it('maps common failures', () => {
    expect(smtpFehlerText({ code: 'EAUTH' })).toBe(
      'Anmeldung am Mailserver (SMTP) fehlgeschlagen.',
    );
    expect(smtpFehlerText({ code: 'ETIMEDOUT' })).toContain('nicht erreichbar');
    expect(smtpFehlerText({ code: 'EENVELOPE', response: '550 No such user' })).toBe(
      'SMTP-Fehler: 550 No such user',
    );
  });
});

describe('ordnerHinweis', () => {
  it('lists at most 15 folders', () => {
    expect(ordnerHinweis([])).toBe('');
    expect(ordnerHinweis(['INBOX', 'INBOX.Sent'])).toBe(' Vorhandene Ordner: INBOX, INBOX.Sent');
    expect(ordnerHinweis(Array.from({ length: 20 }, (_, i) => `O${i}`))).toMatch(/O14, …$/);
  });
});
