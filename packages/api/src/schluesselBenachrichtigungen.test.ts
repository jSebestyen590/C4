import { describe, expect, it } from 'vitest';
import { heuteBerlin, tagNachher } from '@c4/shared';
import { createBenachrichtigungen } from './benachrichtigungen';
import { createFakeBenachrichtigungenStore } from './benachrichtigungen.fake';
import { createFakeSchluesselAnfragenStore } from './schluesselAnfragen.fake';
import { antwortBerechtigte, schluesselErinnerungen } from './schluesselBenachrichtigungen';
import type { MitgliedRow } from './db/schema';
import type { SchluesselDaten } from './schluessel';

const SUBS = ['ersteller', 'halter', 'wohn1', 'wohn2'];
const HEUTE = heuteBerlin();
// A fixed time of day inside the allowed window, on today's Berlin date.
const nachmittag = (stunden = 0) => new Date(`${HEUTE}T13:${String(stunden).padStart(2, '0')}:00Z`);

function setup() {
  const fake = createFakeBenachrichtigungenStore(() =>
    SUBS.map((sub) => ({ sub, status: 'mitglied' as const })),
  );
  const versendet: { endpoint: string; text: string }[] = [];
  const b = createBenachrichtigungen({
    store: fake.store,
    sender: async (abo, n) => {
      versendet.push({ endpoint: abo.endpoint.split('/').pop()!, text: n.text });
      return 'ok';
    },
  });
  const anfragen = createFakeSchluesselAnfragenStore();
  const schluessel = [
    {
      id: 's1',
      name: 'Haupttür',
      archiviert: false,
      halter: { art: 'mitglied', sub: 'halter' },
    } as SchluesselDaten,
  ];
  const mitglieder = SUBS.map(
    (sub) =>
      ({
        sub,
        vorname: sub,
        nachname: '',
        wohnheim: sub.startsWith('wohn'),
        deaktiviertAm: null,
      }) as MitgliedRow,
  );
  const run = (jetzt: Date) =>
    schluesselErinnerungen(
      {
        sender: b,
        schluessel: { alle: async () => schluessel },
        anfragen: anfragen.store,
        mitglieder: { alle: async () => mitglieder },
        userAdmin: { konten: async () => new Map() },
      },
      jetzt,
    );
  const abos = Promise.all(
    SUBS.map((sub) =>
      fake.store.aboSpeichern(sub, {
        endpoint: `https://push.example/${sub}`,
        keys: { p256dh: 'p', auth: 'a' },
      }),
    ),
  );
  const neu = async (art: 'bedarf' | 'abgabe', extra = {}) => {
    const id = await anfragen.store.anlegen({
      art,
      erstellerSub: 'ersteller',
      schluesselId: 's1',
      datum: HEUTE,
      ab: null,
      bis: null,
      notiz: null,
      ...extra,
    });
    // Created two hours ago, so a repeat is due.
    await anfragen.store.erinnertSetzen([id], new Date(nachmittag().getTime() - 2 * 3600_000));
    return id;
  };
  return { anfragen, versendet, run, abos, neu };
}

describe('antwortBerechtigte', () => {
  const kontext = {
    schluessel: [
      { id: 's1', halterSub: 'h1' },
      { id: 's2', halterSub: 'h2' },
    ],
    planungen: [
      { schluesselId: 's1', anSub: 'p1', datum: '2030-01-02', ab: null },
      { schluesselId: 's1', anSub: 'p2', datum: '2030-01-03', ab: null },
    ],
    wohnheimSubs: ['w1', 'ersteller'],
  };
  const basis = { erstellerSub: 'ersteller', art: 'bedarf' as const, ab: null };
  it('picks the expected holder at the request time for a Bedarf', () => {
    const f = (datum: string, schluesselId: string | null) =>
      antwortBerechtigte({ ...basis, datum, schluesselId }, kontext);
    expect(f('2030-01-01', 's1')).toEqual(['h1']);
    expect(f('2030-01-02', 's1')).toEqual(['h1', 'p1']);
    expect(f('2030-01-04', 's1')).toEqual(['p2']);
    expect(f('2030-01-01', null)).toEqual(['h1', 'h2']);
    expect(f('2030-01-04', null)).toEqual(['p2', 'h2']);
  });
  it('picks the Wohnheim members for an Abgabe', () => {
    expect(
      antwortBerechtigte(
        { ...basis, art: 'abgabe', datum: '2030-01-01', schluesselId: 's1' },
        kontext,
      ),
    ).toEqual(['w1']);
  });
});

describe('schluesselErinnerungen', () => {
  it('repeats to everybody who has not answered, once per hour', async () => {
    const t = setup();
    await t.abos;
    const id = await t.neu('abgabe');
    await t.anfragen.store.antwortSpeichern(
      id,
      {
        sub: 'wohn1',
        art: 'ablehnung',
        datum: null,
        ab: null,
        bis: null,
        notiz: null,
        schluesselId: null,
      },
      null,
    );
    await t.run(nachmittag());
    expect(t.versendet.map((v) => v.endpoint)).toEqual(['wohn2']);
    await t.run(nachmittag(30));
    expect(t.versendet).toHaveLength(1);
  });

  it('stays quiet at night and when everybody declined', async () => {
    const t = setup();
    await t.abos;
    const id = await t.neu('bedarf');
    await t.run(new Date(`${HEUTE}T21:30:00Z`)); // 22:30 or 23:30 Berlin
    await t.run(new Date(`${HEUTE}T04:30:00Z`)); // 05:30 or 06:30 Berlin
    expect(t.versendet).toHaveLength(0);
    await t.anfragen.store.antwortSpeichern(
      id,
      {
        sub: 'halter',
        art: 'ablehnung',
        datum: null,
        ab: null,
        bis: null,
        notiz: null,
        schluesselId: null,
      },
      null,
    );
    await t.run(nachmittag()); // the only possible responder declined
    expect(t.versendet).toHaveLength(0);
  });

  it('stays quiet when the day is over or the request is settled', async () => {
    const t = setup();
    await t.abos;
    await t.neu('abgabe', { datum: tagNachher(HEUTE, -1) });
    const vergeben = await t.neu('abgabe');
    await t.anfragen.store.antwortSpeichern(
      vergeben,
      {
        sub: 'wohn1',
        art: 'zusage',
        datum: null,
        ab: null,
        bis: null,
        notiz: null,
        schluesselId: null,
      },
      {
        schluesselId: 's1',
        anSub: 'wohn1',
        datum: HEUTE,
        ab: null,
        bis: null,
        notiz: null,
        anfrageId: vergeben,
        erstelltVon: 'wohn1',
      },
    );
    await t.run(nachmittag());
    await t.run(nachmittag());
    expect(t.versendet).toHaveLength(0);
  });
});
