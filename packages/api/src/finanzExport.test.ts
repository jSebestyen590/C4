import { describe, expect, it } from 'vitest';
import { GENESIS_HASH } from '@c4/shared';
import { finanzExport } from './finanzExport';
import { createFakeFinanzenStore } from './finanzen.fake';

const archivFake = () => {
  const dateien = new Map<string, string>();
  return {
    dateien,
    archiv: {
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
});
