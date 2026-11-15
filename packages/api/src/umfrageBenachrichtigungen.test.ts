import { describe, expect, it, vi } from 'vitest';
import type { Sendung } from './benachrichtigungen';
import type { UmfrageKontext } from './umfrageAnsicht';
import { erinnerungText, neuText, umfrageErinnerungen } from './umfrageBenachrichtigungen';
import { createFakeUmfragenStore } from './umfragen.fake';

const kontext = (jetzt: Date): UmfrageKontext => ({
  mitglieder: [
    { sub: 'm', status: 'mitglied', vorname: 'M', nachname: 'M', anrede: null },
    { sub: 'n', status: 'mitglied', vorname: 'N', nachname: 'N', anrede: null },
    { sub: 'e', status: 'em', vorname: 'E', nachname: 'E', anrede: null },
  ],
  usernames: new Map(),
  postenInhaber: new Map(),
  jetzt,
});

async function setup() {
  const { store, liste } = createFakeUmfragenStore();
  const id = await store.anlegen(
    {
      titel: 'Fest',
      beschreibung: null,
      endetAm: '2026-11-10',
      anonym: false,
      ergebnisse: 'sofort',
      pflicht: { status: ['mitglied'], posten: [], personen: [] },
      optional: { status: ['em'], posten: [], personen: [] },
      erinnerungenPflicht: [7, 3],
      erinnerungenOptional: [3],
      fragen: [{ id: 'f', text: 'Ja?', freitext: false, maxAntworten: 1, optionen: [{ id: 'o', text: 'Ja', termin: null }] }],
      termin: null,
      terminFrei: false,
    },
    'x',
  );
  liste.get(id)!.erstelltAm = new Date('2026-10-30T12:00:00Z');
  const gesendet: Sendung[] = [];
  const sender = { senden: vi.fn(async (s: Sendung) => (gesendet.push(s), 1)) };
  const lauf = (iso: string) =>
    umfrageErinnerungen(sender, store, async (j) => kontext(j), new Date(iso));
  return { store, liste, id, gesendet, lauf };
}

describe('umfrageErinnerungen', () => {
  it('reminds only the mandatory circle 7 days before, from 9 o’clock Berlin time', async () => {
    const t = await setup();
    await t.lauf('2026-11-03T07:59:00Z'); // 08:59 Berlin
    expect(t.gesendet).toEqual([]);
    await t.lauf('2026-11-03T08:00:00Z');
    expect(t.gesendet.map((s) => [s.subs, s.ohneEinstellung])).toEqual([
      [['m'], true],
      [['n'], true],
    ]);
    expect(t.gesendet[0]).toMatchObject({
      art: 'umfrage.erinnerung',
      text: '„Fest“ endet am 10.11.2026. Bitte stimme noch ab.',
      dedupeSchluessel: `umfrage.erinnerung:${t.id}:2026-11-10:7:m`,
    });
  });

  it('reminds both circles 3 days before, but not those who voted', async () => {
    const t = await setup();
    await t.store.abstimmen(t.id, 'n', [{ frageId: 'f', optionId: 'o', freitext: null }]);
    await t.lauf('2026-11-07T10:00:00Z');
    expect(t.gesendet.map((s) => [s.subs, s.ohneEinstellung])).toEqual([
      [['e'], false],
      [['m'], true],
    ]);
  });

  it('leaves deactivated members out of the circles', async () => {
    const t = await setup();
    const sender = { senden: vi.fn(async (s: Sendung) => (t.gesendet.push(s), 1)) };
    const k = kontext(new Date('2026-11-03T08:00:00Z'));
    const mitDeaktiviertem: UmfrageKontext = {
      ...k,
      mitglieder: k.mitglieder.map((m) =>
        m.sub === 'n' ? { ...m, deaktiviertAm: new Date() } : m,
      ),
    };
    await umfrageErinnerungen(
      sender,
      t.store,
      async () => mitDeaktiviertem,
      new Date('2026-11-03T08:00:00Z'),
    );
    expect(t.gesendet.map((s) => s.subs)).toEqual([['m']]);
  });

  it('skips ended polls and days without a reminder', async () => {
    const t = await setup();
    await t.lauf('2026-11-05T10:00:00Z');
    await t.store.beenden(t.id, new Date('2026-11-06T10:00:00Z'));
    await t.lauf('2026-11-07T10:00:00Z');
    expect(t.gesendet).toEqual([]);
  });
});

describe('texts', () => {
  it('words mandatory and optional messages differently', () => {
    expect(neuText('anna', 'Fest', '2026-11-10', true)).toBe(
      'anna fragt: „Fest“. Bitte stimme bis 10.11.2026 ab.',
    );
    expect(neuText('anna', 'Fest', '2026-11-10', false)).toBe(
      'anna fragt: „Fest“. Du kannst bis 10.11.2026 abstimmen.',
    );
    expect(erinnerungText('Fest', '2026-11-10', '2026-11-10', false)).toBe(
      '„Fest“ endet heute. Du kannst noch abstimmen.',
    );
    expect(erinnerungText('Fest', '2026-11-10', '2026-11-09', true)).toBe(
      '„Fest“ endet morgen. Bitte stimme noch ab.',
    );
  });
});
