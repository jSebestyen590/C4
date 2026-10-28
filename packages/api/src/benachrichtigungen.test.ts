import { describe, expect, it } from 'vitest';
import type { EventDto, MitgliedStatus } from '@c4/shared';
import { bestEffort, createBenachrichtigungen, type PushErgebnis } from './benachrichtigungen';
import { createFakeBenachrichtigungenStore } from './benachrichtigungen.fake';
import {
  erinnerungen,
  fehlendeDienste,
  meldeAbsage,
  meldeEventAenderung,
  minutenText,
  registriereKalenderAufgaben,
  waehleErinnerung,
} from './kalenderBenachrichtigungen';
import type { ErinnerungsDienst, EventAenderung, KalenderStore } from './kalender';

function setup(mitglieder: { sub: string; status: MitgliedStatus }[]) {
  const fake = createFakeBenachrichtigungenStore(() => mitglieder);
  const versendet: { endpoint: string; titel: string; text: string; url: string }[] = [];
  const ergebnisse = new Map<string, PushErgebnis>();
  const b = createBenachrichtigungen({
    store: fake.store,
    sender: async (abo, n) => {
      versendet.push({ endpoint: abo.endpoint, titel: n.titel, text: n.text, url: n.url });
      return ergebnisse.get(abo.endpoint) ?? 'ok';
    },
  });
  const abo = (sub: string, geraet = 1) =>
    fake.store.aboSpeichern(sub, {
      endpoint: `https://push.example/${sub}-${geraet}`,
      keys: { p256dh: 'p', auth: 'a' },
    });
  return { ...fake, b, versendet, ergebnisse, abo };
}

describe('senden', () => {
  it('sends to every device of recipients with an active setting', async () => {
    const t = setup([
      { sub: 'a', status: 'mitglied' },
      { sub: 'b', status: 'mitglied' },
      { sub: 'c', status: 'mitglied' },
    ]);
    await t.abo('a', 1);
    await t.abo('a', 2);
    await t.abo('b');
    await t.abo('c');
    await t.store.einstellungSetzen('c', 'kalender.aenderung', false, null);
    const n = await t.b.senden({
      subs: ['a', 'b', 'c'],
      art: 'kalender.aenderung',
      titel: 'T',
      text: 'X',
      url: '/app/x',
    });
    expect(n).toBe(2);
    expect(t.versendet.map((v) => v.endpoint).sort()).toEqual([
      'https://push.example/a-1',
      'https://push.example/a-2',
      'https://push.example/b-1',
    ]);
  });

  it('does not send to EM by default for missing Dienste, but to those who opted in', async () => {
    const t = setup([
      { sub: 'em', status: 'em' },
      { sub: 'mi', status: 'mitglied' },
      { sub: 'em2', status: 'em' },
    ]);
    await t.abo('em');
    await t.abo('mi');
    await t.abo('em2');
    await t.store.einstellungSetzen('em2', 'kalender.fehlende_dienste', true, null);
    await t.b.senden({
      subs: 'alle',
      art: 'kalender.fehlende_dienste',
      titel: 'T',
      text: 'X',
      url: '/',
    });
    expect(t.versendet.map((v) => v.endpoint).sort()).toEqual([
      'https://push.example/em2-1',
      'https://push.example/mi-1',
    ]);
  });

  it('sends a dedupe key only once', async () => {
    const t = setup([{ sub: 'a', status: 'mitglied' }]);
    await t.abo('a');
    const sendung = {
      subs: ['a'],
      art: 'kalender.aenderung',
      titel: 'T',
      text: 'X',
      url: '/',
      dedupeSchluessel: 'k1',
    };
    await t.b.senden(sendung);
    await t.b.senden(sendung);
    expect(t.versendet).toHaveLength(1);
  });

  it('removes subscriptions the push service reports as gone (410)', async () => {
    const t = setup([{ sub: 'a', status: 'mitglied' }]);
    await t.abo('a', 1);
    await t.abo('a', 2);
    t.ergebnisse.set('https://push.example/a-1', 'gone');
    await t.b.senden({ subs: ['a'], art: 'kalender.aenderung', titel: 'T', text: 'X', url: '/' });
    expect(t.abos.map((a) => a.endpoint)).toEqual(['https://push.example/a-2']);
  });

  it('releases the dedupe key when nobody could be reached because of an error', async () => {
    const t = setup([{ sub: 'a', status: 'mitglied' }]);
    await t.abo('a');
    t.ergebnisse.set('https://push.example/a-1', 'fehler');
    const sendung = {
      subs: ['a'],
      art: 'kalender.aenderung',
      titel: 'T',
      text: 'X',
      url: '/',
      dedupeSchluessel: 'k1',
    };
    await t.b.senden(sendung);
    t.ergebnisse.clear();
    await t.b.senden(sendung);
    expect(t.versendet).toHaveLength(2);
  });

  it('does not claim the dedupe key while the recipient has no device yet', async () => {
    const t = setup([{ sub: 'a', status: 'mitglied' }]);
    const sendung = {
      subs: ['a'],
      art: 'kalender.erinnerung',
      titel: 'T',
      text: 'X',
      url: '/',
      dedupeSchluessel: 'k1',
    };
    expect(await t.b.senden(sendung)).toBe(0);
    expect(t.versendet).toHaveLength(0);
    expect(t.versand.has('k1')).toBe(false);
    await t.abo('a');
    await t.b.senden(sendung);
    expect(t.versendet).toHaveLength(1);
    await t.b.senden(sendung);
    expect(t.versendet).toHaveLength(1);
  });

  it('sends a test message to the own devices only, ignoring settings and dedupe', async () => {
    const t = setup([
      { sub: 'a', status: 'mitglied' },
      { sub: 'b', status: 'mitglied' },
    ]);
    await t.abo('a', 1);
    await t.abo('a', 2);
    await t.abo('b');
    t.ergebnisse.set('https://push.example/a-2', 'fehler');
    expect(await t.b.testSenden('a')).toEqual({ geraete: 2, ok: 1, fehler: 1 });
    expect(await t.b.testSenden('nobody')).toEqual({ geraete: 0, ok: 0, fehler: 0 });
    expect(t.versendet.map((v) => v.endpoint)).toEqual([
      'https://push.example/a-1',
      'https://push.example/a-2',
    ]);
  });

  it('rejects unknown types', async () => {
    const t = setup([]);
    await expect(
      t.b.senden({ subs: 'alle', art: 'nope.nope', titel: 'T', text: 'X', url: '/' }),
    ).rejects.toThrow();
  });
});

describe('pushJob', () => {
  it('runs all registered tasks even when one fails', async () => {
    const t = setup([]);
    const lauf: string[] = [];
    t.b.registriereAufgabe('kaputt', async () => {
      throw new Error('boom');
    });
    t.b.registriereAufgabe('gut', async (jetzt) => {
      lauf.push(jetzt.toISOString());
    });
    const jetzt = new Date('2026-10-23T10:00:00Z');
    await t.b.pushJob(jetzt);
    expect(lauf).toEqual([jetzt.toISOString()]);
  });
});

describe('bestEffort', () => {
  it('swallows errors and stops waiting after the timeout', async () => {
    await expect(
      bestEffort(async () => {
        throw new Error('x');
      }),
    ).resolves.toBeUndefined();
    const start = Date.now();
    await bestEffort(() => new Promise(() => {}), 20);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

const BEGINN = '2026-10-23T18:00:00.000Z'; // Fr 20:00 Berlin (CEST)

const dienst = (patch: Partial<ErinnerungsDienst> = {}): ErinnerungsDienst => ({
  dienstId: 'd1',
  mitgliedSub: 'a',
  eventId: 'e1',
  eventTitel: 'Offener Abend',
  schichtArt: 'betrieb',
  dienstformName: 'Bar',
  beginn: BEGINN,
  ...patch,
});

describe('Erinnerungen', () => {
  const minutenVorher = (m: number) => new Date(new Date(BEGINN).getTime() - m * 60_000);
  const store = (liste: ErinnerungsDienst[]) => ({
    erinnerungsDienste: async (von: Date, bis: Date) =>
      liste.filter((d) => new Date(d.beginn) >= von && new Date(d.beginn) < bis),
  });

  it('sends within the window, once, with the configured minutes', async () => {
    const t = setup([{ sub: 'a', status: 'mitglied' }]);
    await t.abo('a');
    const kalender = store([dienst()]);
    await erinnerungen(t.b, kalender, minutenVorher(31));
    expect(t.versendet).toHaveLength(0);
    await erinnerungen(t.b, kalender, minutenVorher(30));
    expect(t.versendet).toHaveLength(1);
    expect(t.versendet[0]).toMatchObject({
      titel: 'Bar-Dienst in 30 Minuten',
      text: 'Offener Abend (Fr 20:00)',
      url: '/app/kalender/events/e1',
    });
    await erinnerungen(t.b, kalender, minutenVorher(25));
    await erinnerungen(t.b, kalender, minutenVorher(5));
    expect(t.versendet).toHaveLength(1);
    // Started: no reminder any more (new key would not matter, the start is not in the future).
    await erinnerungen(t.b, kalender, new Date(BEGINN));
    expect(t.versendet).toHaveLength(1);
  });

  it('follows the member setting and can be switched off', async () => {
    const t = setup([
      { sub: 'a', status: 'mitglied' },
      { sub: 'b', status: 'mitglied' },
    ]);
    await t.abo('a');
    await t.abo('b');
    await t.store.einstellungSetzen('a', 'kalender.erinnerung', true, 120);
    await t.store.einstellungSetzen('b', 'kalender.erinnerung', false, 30);
    const kalender = store([dienst(), dienst({ dienstId: 'd2', mitgliedSub: 'b' })]);
    await erinnerungen(t.b, kalender, minutenVorher(110));
    expect(t.versendet.map((v) => v.endpoint)).toEqual(['https://push.example/a-1']);
    expect(t.versendet[0]!.titel).toBe('Bar-Dienst in 2 Stunden');
  });

  it('reminds again when the start time changed', async () => {
    const t = setup([{ sub: 'a', status: 'mitglied' }]);
    await t.abo('a');
    await erinnerungen(t.b, store([dienst()]), minutenVorher(20));
    const neu = '2026-10-23T19:00:00.000Z';
    await erinnerungen(t.b, store([dienst({ beginn: neu })]), new Date('2026-10-23T18:40:00.000Z'));
    expect(t.versendet).toHaveLength(2);
  });

  it('formats minutes', () => {
    expect([15, 60, 120, 1440].map(minutenText)).toEqual([
      '15 Minuten',
      '1 Stunde',
      '2 Stunden',
      '1 Tag',
    ]);
  });
});

const event = (patch: Partial<EventDto> = {}): EventDto => ({
  id: 'e1',
  titel: 'Offener Abend',
  beschreibung: null,
  kategorie: null,
  beginn: BEGINN,
  ende: '2026-10-23T22:00:00.000Z',
  abgesagt: false,
  schichten: [],
  bewertung: 'rot',
  ...patch,
});

describe('fehlende Dienste', () => {
  const kalender = (liste: EventDto[], zeitpunkte = [1440]) => ({
    events: async () => liste,
    erinnerungen: async () => zeitpunkte,
  });
  const stundenVorher = (h: number) => new Date(new Date(BEGINN).getTime() - h * 3600_000);

  it('sends once per event when the hint time is reached and the event is red', async () => {
    const t = setup([
      { sub: 'a', status: 'mitglied' },
      { sub: 'b', status: 'em' },
    ]);
    await t.abo('a');
    await t.abo('b');
    const k = kalender([event()]);
    await fehlendeDienste(t.b, k, stundenVorher(25));
    expect(t.versendet).toHaveLength(0);
    await fehlendeDienste(t.b, k, stundenVorher(24));
    // EM is off by default.
    expect(t.versendet.map((v) => v.endpoint)).toEqual(['https://push.example/a-1']);
    expect(t.versendet[0]!.text).toBe('Für „Offener Abend“ am Fr, 23.10. fehlen noch Dienste.');
    await fehlendeDienste(t.b, k, stundenVorher(12));
    expect(t.versendet).toHaveLength(1);
  });

  it('stays quiet for non-red, cancelled, reminder-less and started events', async () => {
    const t = setup([{ sub: 'a', status: 'mitglied' }]);
    await t.abo('a');
    const jetzt = stundenVorher(10);
    await fehlendeDienste(t.b, kalender([event({ bewertung: 'gelb' })]), jetzt);
    await fehlendeDienste(t.b, kalender([event({ bewertung: 'gruen' })]), jetzt);
    await fehlendeDienste(t.b, kalender([event({ abgesagt: true })]), jetzt);
    await fehlendeDienste(t.b, kalender([event()], []), jetzt);
    await fehlendeDienste(t.b, kalender([event()]), new Date(BEGINN));
    expect(t.versendet).toHaveLength(0);
  });

  it('sends later when the event only turns red after the hint time', async () => {
    const t = setup([{ sub: 'a', status: 'mitglied' }]);
    await t.abo('a');
    await fehlendeDienste(t.b, kalender([event({ bewertung: 'gelb' })]), stundenVorher(23));
    expect(t.versendet).toHaveLength(0);
    await fehlendeDienste(t.b, kalender([event({ bewertung: 'rot' })]), stundenVorher(20));
    expect(t.versendet).toHaveLength(1);
  });
});

describe('waehleErinnerung', () => {
  const beginn = new Date(BEGINN).getTime();
  const vor = (min: number) => beginn - min * 60_000;
  const zeitpunkte = [10080, 2880, 1440];
  it('picks the smallest offset already reached', () => {
    expect(waehleErinnerung(beginn, vor(10081), zeitpunkte)).toBeUndefined();
    expect(waehleErinnerung(beginn, vor(10080), zeitpunkte)).toBe(10080);
    expect(waehleErinnerung(beginn, vor(3000), zeitpunkte)).toBe(10080);
    expect(waehleErinnerung(beginn, vor(2880), zeitpunkte)).toBe(2880);
    expect(waehleErinnerung(beginn, vor(1440), zeitpunkte)).toBe(1440);
    expect(waehleErinnerung(beginn, vor(10), zeitpunkte)).toBe(1440);
  });
  it('does not backfill older offsets for short-notice events', () => {
    // created 5 hours before: only the 1 day offset is picked, not 1 week and 2 days
    expect(waehleErinnerung(beginn, vor(300), zeitpunkte)).toBe(1440);
  });
  it('ignores started events and empty settings', () => {
    expect(waehleErinnerung(beginn, beginn, zeitpunkte)).toBeUndefined();
    expect(waehleErinnerung(beginn, vor(10), [])).toBeUndefined();
  });
  it('sends each reached offset once across job runs', async () => {
    const t = setup([{ sub: 'a', status: 'mitglied' }]);
    await t.abo('a');
    const k = {
      events: async () => [event()],
      erinnerungen: async () => zeitpunkte,
    };
    await fehlendeDienste(t.b, k, new Date(vor(10000)));
    await fehlendeDienste(t.b, k, new Date(vor(9990)));
    expect(t.versendet).toHaveLength(1);
    await fehlendeDienste(t.b, k, new Date(vor(2000)));
    expect(t.versendet).toHaveLength(2);
  });
});

describe('registriereKalenderAufgaben', () => {
  it('hooks both tasks into the job runner', async () => {
    const t = setup([{ sub: 'a', status: 'mitglied' }]);
    await t.abo('a');
    const store = {
      events: async () => [event()],
      erinnerungen: async () => [1440],
      erinnerungsDienste: async () => [dienst()],
    } satisfies Pick<KalenderStore, 'events' | 'erinnerungsDienste' | 'erinnerungen'>;
    registriereKalenderAufgaben(t.b, store);
    await t.b.pushJob(new Date(new Date(BEGINN).getTime() - 20 * 60_000));
    expect(t.versendet.map((v) => v.titel).sort()).toEqual([
      'Bar-Dienst in 30 Minuten',
      'Es fehlen noch Dienste',
    ]);
  });
});

describe('Änderungen', () => {
  const keine: EventAenderung = {
    zeitGeaendert: false,
    geaenderteSchichten: [],
    entfernteDienste: [],
    mitgliedSubs: [],
  };
  const person = (sub: string) =>
    ({
      art: 'mitglied',
      sub,
      username: null,
      vorname: 'A',
      nachname: 'B',
      status: 'mitglied',
      anrede: 'neutral',
    }) as const;

  it('notifies affected members but not the actor', async () => {
    const t = setup([
      { sub: 'a', status: 'mitglied' },
      { sub: 'b', status: 'mitglied' },
      { sub: 'actor', status: 'mitglied' },
    ]);
    for (const s of ['a', 'b', 'actor']) await t.abo(s);
    await meldeEventAenderung(
      t.b,
      event(),
      { ...keine, zeitGeaendert: true, mitgliedSubs: ['a', 'actor'] },
      'actor',
    );
    expect(t.versendet.map((v) => v.endpoint)).toEqual(['https://push.example/a-1']);
    expect(t.versendet[0]).toMatchObject({ titel: 'Event verschoben' });
    expect(t.versendet[0]!.text).toContain('Fr, 23.10. um 20:00 Uhr');
  });

  it('notifies about a changed Schicht and combines it with a removed Dienst', async () => {
    const t = setup([
      { sub: 'a', status: 'mitglied' },
      { sub: 'b', status: 'mitglied' },
    ]);
    await t.abo('a');
    await t.abo('b');
    const e = event({
      schichten: [
        {
          id: 's1',
          art: 'betrieb',
          beginn: BEGINN,
          ende: '2026-10-23T22:00:00.000Z',
          bedarfe: [],
          minimum: null,
          wunsch: null,
          dienste: [],
        },
      ],
    });
    await meldeEventAenderung(
      t.b,
      e,
      {
        ...keine,
        geaenderteSchichten: [
          {
            schichtId: 's1',
            art: 'betrieb',
            beginn: '2026-10-23T18:00:00.000Z',
            ende: '2026-10-23T22:00:00.000Z',
            mitgliedSubs: ['a'],
          },
        ],
        entfernteDienste: [
          {
            dienstId: 'd9',
            schichtId: 's2',
            schichtArt: 'putzen',
            schichtBeginn: '2026-10-23T22:00:00.000Z',
            schichtEnde: '2026-10-24T00:00:00.000Z',
            dienstformId: 'f1',
            person: person('a'),
            grund: 'schicht',
          },
          {
            dienstId: 'd10',
            schichtId: 's2',
            schichtArt: 'putzen',
            schichtBeginn: '2026-10-23T22:00:00.000Z',
            schichtEnde: '2026-10-24T00:00:00.000Z',
            dienstformId: 'f1',
            person: { art: 'extern', id: 'x1', name: 'Eva', quelle: null },
            grund: 'schicht',
          },
        ],
      },
      'actor',
    );
    expect(t.versendet).toHaveLength(1);
    expect(t.versendet[0]!.text).toContain('Betrieb 20:00–00:00 Uhr');
    expect(t.versendet[0]!.text).toContain('Putzen Sa 24.10. 00:00–02:00');
  });

  it('respects the aenderung setting and reinstatement text', async () => {
    const t = setup([
      { sub: 'a', status: 'mitglied' },
      { sub: 'b', status: 'mitglied' },
    ]);
    await t.abo('a');
    await t.abo('b');
    await t.store.einstellungSetzen('b', 'kalender.aenderung', false, null);
    await meldeAbsage(t.b, event(), false, ['a', 'b'], 'actor');
    expect(t.versendet).toHaveLength(1);
    expect(t.versendet[0]).toMatchObject({ titel: 'Event findet statt' });
  });
});
