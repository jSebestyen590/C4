import { describe, expect, it, vi } from 'vitest';
import { GENESIS_HASH } from '@c4/shared';
import { finanzExport, isoWoche } from './finanzExport';
import { createFakeFinanzenStore } from './finanzen.fake';

const archivFake = () => {
  const dateien = new Map<string, string>();
  return {
    dateien,
    archiv: {
      eingerichtet: true,
      versionenAuflisten: () => Promise.reject(new Error('nicht benötigt')),
      lesen: () => Promise.reject(new Error('nicht benötigt')),
      dateiPruefsumme: () => Promise.reject(new Error('nicht benötigt')),
      uploadVorbereiten: () => Promise.reject(new Error('nicht benötigt')),
      anzeigeUrl: () => Promise.reject(new Error('nicht benötigt')),
      exportSchreiben: async (k: string, inhalt: string | Uint8Array) => {
        dateien.set(k, String(inhalt));
      },
    },
  };
};

const buchung = (seq: number) => ({
  seq,
  id: `b${seq}`,
  datum: '2026-11-17',
  text: 'Test',
  quelleTyp: 'manuell',
  quelleId: null,
  eventId: null,
  stornoVon: null,
  erstelltVon: 'u',
  erstelltAm: '2026-11-17T10:00:00.000Z',
  prevHash: 'p',
  hash: `h${seq}`,
  zeilen: [],
});

describe('finanzExport', () => {
  it('writes only an anchor without entries', async () => {
    const { store, exporte } = createFakeFinanzenStore();
    const { archiv, dateien } = archivFake();
    await finanzExport({ store, archiv }, new Date('2026-11-18T02:00:00Z'));
    expect([...dateien.keys()]).toEqual(['anker/2026-11-18.json']);
    expect(JSON.parse(dateien.get('anker/2026-11-18.json')!)).toMatchObject({
      bis_seq: 0,
      kopf_hash: GENESIS_HASH,
    });
    expect(exporte).toHaveLength(1);
  });

  it('exports only entries since the last export', async () => {
    const { store, buchungen, exporte } = createFakeFinanzenStore();
    const { archiv, dateien } = archivFake();
    buchungen.push(buchung(1), buchung(2));
    await finanzExport({ store, archiv }, new Date('2026-11-18T02:00:00Z'));
    expect(dateien.get('export/2026-11-18.jsonl')!.trim().split('\n')).toHaveLength(2);
    buchungen.push(buchung(3));
    const r = await finanzExport({ store, archiv }, new Date('2026-11-19T02:00:00Z'));
    expect(r).toEqual({ neu: 1, bisSeq: 3 });
    expect(dateien.get('export/2026-11-19.jsonl')!.trim().split('\n')).toHaveLength(1);
    expect(exporte.map((e) => [e.vonSeq, e.bisSeq])).toEqual([
      [0, 2],
      [2, 3],
    ]);
    await finanzExport({ store, archiv }, new Date('2026-11-20T02:00:00Z'));
    expect(dateien.has('export/2026-11-20.jsonl')).toBe(false);
    expect(dateien.has('anker/2026-11-20.json')).toBe(true);
  });

  describe('Festschreibung reminder', () => {
    const aufbau = () => {
      const fake = createFakeFinanzenStore();
      const { archiv } = archivFake();
      const senden = vi.fn(async () => undefined);
      const deps = {
        store: fake.store,
        archiv,
        benachrichtigungen: { senden },
        posten: { inhaberMitRecht: vi.fn(async () => ['fin']) },
        userAdmin: { rollen: vi.fn(async () => new Map([['adm', ['admin']]])) },
      } as unknown as Parameters<typeof finanzExport>[0];
      fake.buchungen.push({ ...buchung(1), datum: '2026-10-05' });
      return { senden, deps, ...fake };
    };

    it('sends from the 10th on, to finanzen:verwalten, with a weekly dedupe key', async () => {
      const t = aufbau();
      await finanzExport(t.deps, new Date('2026-11-09T12:00:00Z'));
      expect(t.senden).not.toHaveBeenCalled();
      await finanzExport(t.deps, new Date('2026-11-12T12:00:00Z'));
      expect(t.senden).toHaveBeenCalledWith(
        expect.objectContaining({
          subs: expect.arrayContaining(['fin']),
          art: 'finanzen.festschreibung_faellig',
          text: 'Der Monat 10/2026 ist noch nicht festgeschrieben.',
          url: '/app/finanzen/festschreibung',
          dedupeSchluessel: 'festschreibung-faellig:2026-10:2026-W46',
        }),
      );
    });

    it('stays quiet when nothing is due', async () => {
      const t = aufbau();
      t.festschreibungenListe.push({
        id: 'f',
        monat: '2026-10-01',
        bisSeq: 1,
        kopfHash: 'h',
        anzahl: 1,
        exportSchluessel: 'x',
        festgeschriebenVon: 'a',
        festgeschriebenAm: new Date(),
      });
      await finanzExport(t.deps, new Date('2026-11-12T12:00:00Z'));
      expect(t.senden).not.toHaveBeenCalled();
    });

    it('numbers ISO weeks', () => {
      expect(isoWoche('2026-11-12')).toBe('2026-W46');
      expect(isoWoche('2027-01-01')).toBe('2026-W53');
      expect(isoWoche('2026-12-28')).toBe('2026-W53');
    });
  });
});
