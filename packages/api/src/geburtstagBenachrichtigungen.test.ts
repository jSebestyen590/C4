import { describe, expect, it } from 'vitest';
import type { MitgliedStatus } from '@c4/shared';
import { createBenachrichtigungen } from './benachrichtigungen';
import { createFakeBenachrichtigungenStore } from './benachrichtigungen.fake';
import type { MitgliedRow } from './db/schema';
import { geburtstagErinnerungen, geburtstagText } from './geburtstagBenachrichtigungen';

const ART = 'geburtstag.erinnerung';

const zeile = (sub: string, extra: Partial<MitgliedRow> = {}): MitgliedRow => ({
  sub,
  vorname: `V${sub}`,
  nachname: `N${sub}`,
  anrede: null,
  kontaktkanaele: null,
  discordName: null,
  adresse: null,
  telefon: null,
  ueberMich: null,
  profilbildKey: null,
  geburtsdatum: null,
  geburtstagImKalender: null,
  status: 'mitglied',
  deaktiviertAm: null,
  aktualisiertAm: new Date(),
  ...extra,
});

function setup(zeilen: MitgliedRow[], usernames: Record<string, string> = {}) {
  const fake = createFakeBenachrichtigungenStore(() =>
    zeilen.map((z) => ({
      sub: z.sub,
      status: z.status as MitgliedStatus,
      deaktiviert: !!z.deaktiviertAm,
    })),
  );
  const versendet: { endpoint: string; titel: string; text: string; url: string }[] = [];
  const b = createBenachrichtigungen({
    store: fake.store,
    sender: async (abo, n) => {
      versendet.push({ endpoint: abo.endpoint, titel: n.titel, text: n.text, url: n.url });
      return 'ok';
    },
  });
  const run = (jetzt: string) =>
    geburtstagErinnerungen(
      b,
      { alle: async () => zeilen },
      {
        konten: async () =>
          new Map(Object.entries(usernames).map(([s, username]) => [s, { username }])),
      },
      new Date(jetzt),
    );
  const abo = (sub: string) =>
    fake.store.aboSpeichern(sub, {
      endpoint: `https://push.example/${sub}`,
      keys: { p256dh: 'p', auth: 'a' },
    });
  return { ...fake, b, versendet, run, abo };
}

// 2026-06-15 is a Monday; 10:00 Berlin = 08:00Z (CEST).
const MORGENS_10 = '2026-06-15T08:00:00Z';

describe('geburtstagText', () => {
  it('words today, tomorrow and n days', () => {
    expect(geburtstagText('Eva', 0, 30)).toBe('Eva wird heute 30 Jahre alt.');
    expect(geburtstagText('Eva', 1, 30)).toBe('Eva wird morgen 30 Jahre alt.');
    expect(geburtstagText('Eva', 3, 30)).toBe('Eva wird in 3 Tagen 30 Jahre alt.');
    expect(geburtstagText('Eva', 0, 1)).toBe('Eva wird heute 1 Jahr alt.');
  });
});

describe('geburtstagErinnerungen', () => {
  const geburtstagskind = (extra: Partial<MitgliedRow> = {}) =>
    zeile('g', { geburtsdatum: '1996-06-15', ...extra });

  it('tells others on the day, with username and link to the month', async () => {
    const t = setup([geburtstagskind(), zeile('x')], { g: 'eva' });
    await t.abo('x');
    await t.run(MORGENS_10);
    expect(t.versendet).toEqual([
      {
        endpoint: 'https://push.example/x',
        titel: 'Geburtstag',
        text: 'eva wird heute 30 Jahre alt.',
        url: '/app/kalender?monat=2026-06',
      },
    ]);
  });

  it('falls back to the real name without a username', async () => {
    const t = setup([geburtstagskind(), zeile('x')]);
    await t.abo('x');
    await t.run(MORGENS_10);
    expect(t.versendet[0]?.text).toBe('Vg Ng wird heute 30 Jahre alt.');
  });

  it('sends nothing before 09:00 Berlin time', async () => {
    const t = setup([geburtstagskind(), zeile('x')]);
    await t.abo('x');
    await t.run('2026-06-15T06:59:00Z'); // 08:59 Berlin
    expect(t.versendet).toHaveLength(0);
    await t.run('2026-06-15T07:00:00Z'); // 09:00 Berlin
    expect(t.versendet).toHaveLength(1);
  });

  it('uses the lead time of each recipient', async () => {
    const t = setup([
      geburtstagskind({ geburtsdatum: '1996-06-18' }),
      zeile('x'),
      zeile('y'),
      zeile('z'),
    ]);
    await t.abo('x');
    await t.abo('y');
    await t.abo('z');
    await t.store.einstellungSetzen('x', ART, true, 4320); // 3 days
    await t.store.einstellungSetzen('y', ART, true, 1440); // 1 day
    await t.run(MORGENS_10); // z: default 0 days
    expect(t.versendet.map((v) => [v.endpoint, v.text])).toEqual([
      ['https://push.example/x', 'Vg Ng wird in 3 Tagen 30 Jahre alt.'],
    ]);
    await t.run('2026-06-17T08:00:00Z');
    expect(t.versendet.map((v) => v.text).slice(1)).toEqual(['Vg Ng wird morgen 30 Jahre alt.']);
  });

  it('never tells the birthday person about their own birthday', async () => {
    const t = setup([geburtstagskind()]);
    await t.abo('g');
    await t.run(MORGENS_10);
    expect(t.versendet).toHaveLength(0);
  });

  it('sends nothing about a hidden birthday', async () => {
    const t = setup([geburtstagskind({ geburtstagImKalender: false }), zeile('x')]);
    await t.abo('x');
    await t.run(MORGENS_10);
    expect(t.versendet).toHaveLength(0);
  });

  it('sends nothing about a deactivated member and nothing to a deactivated recipient', async () => {
    const weg = setup([geburtstagskind({ deaktiviertAm: new Date() }), zeile('x')]);
    await weg.abo('x');
    await weg.run(MORGENS_10);
    expect(weg.versendet).toHaveLength(0);
    const empfaenger = setup([geburtstagskind(), zeile('x', { deaktiviertAm: new Date() })]);
    await empfaenger.abo('x');
    await empfaenger.run(MORGENS_10);
    expect(empfaenger.versendet).toHaveLength(0);
  });

  it('respects a deactivated setting', async () => {
    const t = setup([geburtstagskind(), zeile('x')]);
    await t.abo('x');
    await t.store.einstellungSetzen('x', ART, false, 0);
    await t.run(MORGENS_10);
    expect(t.versendet).toHaveLength(0);
  });

  it('sends each birthday only once per recipient', async () => {
    const t = setup([geburtstagskind(), zeile('x')]);
    await t.abo('x');
    await t.run(MORGENS_10);
    await t.run('2026-06-15T08:05:00Z');
    await t.run('2026-06-15T15:00:00Z');
    expect(t.versendet).toHaveLength(1);
    expect([...t.versand]).toEqual([`${ART}:g:2026-06-15:x`]);
  });

  it('ignores members without a birthday', async () => {
    const t = setup([zeile('g'), zeile('x')]);
    await t.abo('x');
    await t.run(MORGENS_10);
    expect(t.versendet).toHaveLength(0);
  });
});
