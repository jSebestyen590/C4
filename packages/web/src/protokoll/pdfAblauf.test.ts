import { describe, expect, it, vi } from 'vitest';
import {
  protokollPdfAblauf,
  PDF_ONEDRIVE_FEHLER,
  type PdfAblaufDeps,
  type PdfMeldung,
} from './pdfAblauf';
import type { DokumentEingabe } from './dokumentDaten';

const eingabe = {
  sitzung: { titel: 'Clubsitzung', beginn: '2026-11-04T19:00:00Z', art: 'sitzung' },
} as DokumentEingabe;
const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' });

function deps(extra: Partial<PdfAblaufDeps> = {}) {
  const meldungen: PdfMeldung[] = [];
  const d = {
    eingabe: vi.fn(async () => eingabe),
    erzeugen: vi.fn(async () => pdf),
    hochladen: vi.fn(async (name: string) => `Cloud4/Sitzungen/Protokolle/${name}`),
    herunterladen: vi.fn(),
    melden: (m: PdfMeldung) => meldungen.push(m),
    ...extra,
  } satisfies PdfAblaufDeps;
  return { d, meldungen };
}

describe('protokollPdfAblauf', () => {
  it('uploads to OneDrive and reports the path, without a download', async () => {
    const { d, meldungen } = deps();
    expect(await protokollPdfAblauf(d)).toBe('gespeichert');
    expect(d.hochladen).toHaveBeenCalledWith('2026-11-04_Clubsitzung.pdf', pdf);
    expect(d.herunterladen).not.toHaveBeenCalled();
    expect(meldungen.map((m) => m.art)).toEqual(['laedt', 'ok']);
    expect(meldungen[1]!.text).toBe(
      'Protokoll als PDF in OneDrive gespeichert: Cloud4/Sitzungen/Protokolle/2026-11-04_Clubsitzung.pdf',
    );
  });

  it('downloads the PDF when OneDrive fails', async () => {
    const { d, meldungen } = deps({
      hochladen: vi.fn(async () => {
        throw new Error('503');
      }),
    });
    expect(await protokollPdfAblauf(d)).toBe('heruntergeladen');
    expect(d.herunterladen).toHaveBeenCalledWith(pdf, '2026-11-04_Clubsitzung.pdf');
    expect(meldungen.at(-1)).toEqual({ art: 'warnung', text: PDF_ONEDRIVE_FEHLER });
  });

  it('reports an error when the PDF cannot be created', async () => {
    const { d, meldungen } = deps({
      erzeugen: vi.fn(async () => {
        throw new Error('kaputt');
      }),
    });
    expect(await protokollPdfAblauf(d)).toBe('fehler');
    expect(d.hochladen).not.toHaveBeenCalled();
    expect(meldungen.at(-1)?.art).toBe('fehler');
  });
});
