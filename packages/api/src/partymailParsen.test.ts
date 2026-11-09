import { describe, expect, it } from 'vitest';
import { mailParsen, messageIdsAus, threadIds, threadZuordnen } from './partymailParsen';

const raw = (zeilen: string[]) => Buffer.from(zeilen.join('\r\n'), 'utf8');

const EINFACH = raw([
  'From: Eva Muster <eva@kunde.example>',
  'To: party@c4.example',
  'Subject: =?UTF-8?Q?Anfrage_f=C3=BCr_Geburtstag?=',
  'Message-ID: <abc123@kunde.example>',
  'Date: Mon, 09 Nov 2026 10:00:00 +0100',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Hallo,',
  'habt ihr am 14.3. Platz für 40 Leute?',
]);

const NUR_HTML = raw([
  'From: kunde@example.org',
  'Reply-To: "Paul Beispiel" <paul@privat.example>',
  'To: party@c4.example',
  'Subject: Feier',
  'Message-ID: <html1@example.org>',
  'Date: Tue, 10 Nov 2026 12:00:00 +0100',
  'MIME-Version: 1.0',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<html><body><p>Hallo <b>C4</b>,</p><p>wir feiern.</p></body></html>',
]);

const ANTWORT = raw([
  'From: Eva Muster <eva@kunde.example>',
  'To: party@c4.example',
  'Subject: Re: Anfrage',
  'Message-ID: <re2@kunde.example>',
  'In-Reply-To: <gesendet-1@c4.example>',
  'References: <abc123@kunde.example> <gesendet-1@c4.example>',
  'Date: Wed, 11 Nov 2026 09:00:00 +0100',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="b"',
  '',
  '--b',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Super, danke!',
  '--b',
  'Content-Type: application/pdf; name="plan.pdf"',
  'Content-Disposition: attachment; filename="plan.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  'JVBERi0xLjQK',
  '--b--',
]);

describe('mailParsen', () => {
  it('parses a plain mail with an encoded subject', async () => {
    const m = await mailParsen(EINFACH, 7);
    expect(m).toMatchObject({
      uid: 7,
      messageId: '<abc123@kunde.example>',
      vonAdresse: 'eva@kunde.example',
      vonName: 'Eva Muster',
      anAdresse: 'party@c4.example',
      betreff: 'Anfrage für Geburtstag',
      inReplyTo: null,
      referenzen: [],
      anhaenge: [],
    });
    expect(m.text).toContain('habt ihr am 14.3. Platz');
    expect(m.zeitpunkt.toISOString()).toBe('2026-11-09T09:00:00.000Z');
  });

  it('converts HTML-only mails to text and prefers Reply-To', async () => {
    const m = await mailParsen(NUR_HTML, 8);
    expect(m.text).toBe('Hallo C4,\n\nwir feiern.');
    expect(m.vonAdresse).toBe('paul@privat.example');
    expect(m.vonName).toBe('Paul Beispiel');
  });

  it('reads thread headers and attachment names', async () => {
    const m = await mailParsen(ANTWORT, 9);
    expect(m.inReplyTo).toBe('<gesendet-1@c4.example>');
    expect(m.referenzen).toEqual(['<abc123@kunde.example>', '<gesendet-1@c4.example>']);
    expect(m.text).toBe('Super, danke!');
    expect(m.anhaenge).toEqual(['plan.pdf']);
  });
});

describe('thread matching', () => {
  it('extracts ids from References', () => {
    expect(messageIdsAus('<a@x> <b@y>\n <c@z>')).toEqual(['<a@x>', '<b@y>', '<c@z>']);
    expect(messageIdsAus(undefined)).toEqual([]);
  });

  it('prefers In-Reply-To, then the newest reference', () => {
    const bekannt = new Map([
      ['<alt@x>', 'p1'],
      ['<neu@x>', 'p2'],
    ]);
    expect(threadZuordnen({ inReplyTo: null, referenzen: ['<alt@x>', '<neu@x>'] }, bekannt)).toBe(
      'p2',
    );
    expect(threadZuordnen({ inReplyTo: '<alt@x>', referenzen: ['<neu@x>'] }, bekannt)).toBe('p1');
    expect(threadZuordnen({ inReplyTo: '<fremd@x>', referenzen: [] }, bekannt)).toBeUndefined();
  });

  it('lists the ids to look up without duplicates', () => {
    expect(threadIds({ inReplyTo: '<b@x>', referenzen: ['<a@x>', '<b@x>'] })).toEqual([
      '<b@x>',
      '<a@x>',
    ]);
  });
});
