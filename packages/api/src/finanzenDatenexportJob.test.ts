import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { DatenexportDaten, ExportBeleg } from '@c4/shared';
import { datenexportMitBelegdateien, type DatenexportJobDeps } from './finanzenDatenexportJob';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const inhaltA = new TextEncoder().encode('beleg-a-inhalt');
const inhaltB = new TextEncoder().encode('beleg-b-inhalt');

const beleg = (nummer: string, inhalt: Uint8Array): ExportBeleg => ({
  id: `id-${nummer}`,
  nummer,
  rechnungsstellerId: 'r1',
  belegdatum: '2025-03-01',
  modus: 'brutto',
  zahlweg: 'bar',
  bezahldatum: null,
  mitgliedId: null,
  eigenbelegBegruendung: null,
  dateiSha256: sha(inhalt),
  dateiSchluessel: `belege/${sha(inhalt)}.pdf`,
  dateiTyp: 'application/pdf',
  dateiName: 'x.pdf',
  summeCent: 100,
  buchungId: 'bu1',
  erstelltVon: 'a',
  erstelltAm: '2025-03-01T10:00:00.000Z',
});

const leer: DatenexportDaten = {
  konten: [],
  buchungen: [],
  zeilen: [],
  stueckelung: [],
  belege: [],
  belegposten: [],
  rechnungssteller: [],
  rechnungen: [],
  rechnungsposten: [],
  rechnungszahlungen: [],
  festschreibungen: [],
} as unknown as DatenexportDaten;

function aufbau(belege: ExportBeleg[], dateien: Map<string, Uint8Array>) {
  const geschrieben = new Map<string, Uint8Array>();
  const senden = vi.fn<(s: unknown) => Promise<number>>(async () => 1);
  const eintragen = vi.fn<(e: unknown) => Promise<string>>(async () => 'id');
  const deps: DatenexportJobDeps = {
    store: {
      datenexportDaten: async () => ({ ...leer, belege }),
      datenexportEintragen: eintragen,
    },
    archiv: {
      lesenStream: async (k) => {
        const b = dateien.get(k);
        if (!b) throw new Error('NoSuchKey');
        // Several small chunks, like a network stream.
        return Readable.from([b.slice(0, 5), b.slice(5)]);
      },
      streamSchreiben: async (k, inhalt) => {
        const teile: Buffer[] = [];
        for await (const t of inhalt) teile.push(Buffer.from(t as Uint8Array));
        geschrieben.set(k, new Uint8Array(Buffer.concat(teile)));
      },
    },
    benachrichtigungen: { senden },
    erstellerName: async () => 'anna',
  };
  return { deps, geschrieben, senden, eintragen };
}

const auftrag = { id: 'e1', von: '2025-01-01', bis: '2025-12-31', sub: 'a' };
const jetzt = new Date('2026-01-02T10:00:00Z');

describe('datenexportMitBelegdateien', () => {
  it('writes a ZIP with the CSVs and every Beleg file once, records it and pushes', async () => {
    const t = aufbau(
      // Two Belege share one file.
      [beleg('B-2025-0001', inhaltA), beleg('B-2025-0002', inhaltA), beleg('B-2025-0003', inhaltB)],
      new Map([
        [`belege/${sha(inhaltA)}.pdf`, inhaltA],
        [`belege/${sha(inhaltB)}.pdf`, inhaltB],
      ]),
    );
    const r = await datenexportMitBelegdateien(t.deps, auftrag, jetzt);
    expect(r).toEqual({ ok: true, id: 'e1' });
    const [schluessel, zip] = [...t.geschrieben][0]!;
    expect(schluessel).toBe('datenexport/20260102-100000-2025-01-01-2025-12-31.zip');
    const dateien = unzipSync(zip);
    expect(Object.keys(dateien).sort()).toEqual(
      expect.arrayContaining([
        'belege.csv',
        'index.xml',
        'gdpdu-01-03-2019.dtd',
        'beschreibung.txt',
        'buchungen.csv',
      ]),
    );
    expect(Object.keys(dateien).filter((n) => n.startsWith('belege/'))).toHaveLength(2);
    expect(dateien[`belege/${sha(inhaltA)}.pdf`]).toEqual(inhaltA);
    expect(dateien[`belege/${sha(inhaltB)}.pdf`]).toEqual(inhaltB);
    expect(strFromU8(dateien['belege.csv']!)).toContain(`belege/${sha(inhaltA)}.pdf`);
    expect(strFromU8(dateien['beschreibung.txt']!)).toContain('Ordner belege/');
    expect(t.eintragen).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'e1',
        schluessel,
        sha256: sha(zip),
        erstelltVon: 'a',
        mitBelegdateien: true,
      }),
    );
    expect(t.senden).toHaveBeenCalledWith(
      expect.objectContaining({
        subs: ['a'],
        art: 'finanzen.datenexport_fertig',
        text: 'Dein Datenexport 01.01.2025–31.12.2025 mit Belegdateien ist fertig.',
        url: '/app/finanzen/datenexport',
      }),
    );
  });

  it('fails without a row when a Beleg file is missing, naming the Beleg', async () => {
    const t = aufbau([beleg('B-2025-0007', inhaltA)], new Map());
    const r = await datenexportMitBelegdateien(t.deps, auftrag, jetzt);
    expect(r.ok).toBe(false);
    expect(r.fehler).toContain('B-2025-0007');
    expect(t.eintragen).not.toHaveBeenCalled();
    const push = t.senden.mock.calls[0]![0] as { text: string };
    expect(push.text).toContain('ist fehlgeschlagen');
    expect(push.text).toContain('B-2025-0007');
  });

  it('fails when a file does not match its SHA-256', async () => {
    const t = aufbau(
      [beleg('B-2025-0009', inhaltA)],
      new Map([[`belege/${sha(inhaltA)}.pdf`, inhaltB]]),
    );
    const r = await datenexportMitBelegdateien(t.deps, auftrag, jetzt);
    expect(r.ok).toBe(false);
    expect(t.eintragen).not.toHaveBeenCalled();
  });

  it('fails when the upload fails', async () => {
    const t = aufbau([], new Map());
    t.deps.archiv.streamSchreiben = async (_k, inhalt) => {
      inhalt.destroy();
      throw new Error('S3 down');
    };
    const r = await datenexportMitBelegdateien(t.deps, auftrag, jetzt);
    expect(r.ok).toBe(false);
    expect(t.eintragen).not.toHaveBeenCalled();
    expect(t.senden).toHaveBeenCalledTimes(1);
  });
});
