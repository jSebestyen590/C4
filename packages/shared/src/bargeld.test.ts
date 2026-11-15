import { describe, expect, it } from 'vitest';
import {
  berechneZaehlung,
  pruefeBestand,
  stueckelungSumme,
  zaehlungEingabeSchema,
  type BestandKonto,
} from './bargeld';
import { pruefeGruppenregel, pruefeBuchung, saldoGesamt, type PruefKonto } from './finanzen';

const fach = (id: string, name: string, saldoCent: number, anzahl: [number, number][]) =>
  ({
    id,
    name,
    art: 'bargeld',
    stueckelung: true,
    saldoCent,
    anzahl: new Map(anzahl),
  }) satisfies BestandKonto;

describe('Gruppenregel', () => {
  const konten: PruefKonto[] = [
    { id: 'safe', name: 'Safe', stueckelung: false, archiviert: false, hatUnterkonten: true },
    { id: 'bank', name: 'Bank', stueckelung: false, archiviert: false },
  ];
  it('lehnt Zeilen auf ein Konto mit Unterkonten ab', () => {
    const f = pruefeGruppenregel(
      [{ kontoId: 'safe' }, { kontoId: 'safe' }, { kontoId: 'bank' }],
      konten,
    );
    expect(f).toEqual([
      'Auf das Konto „Safe“ kann nicht gebucht werden, weil es Unterkonten hat. Buche auf ein Fach/Unterkonto.',
    ]);
  });
  it('pruefeBuchung wendet sie an', () => {
    const f = pruefeBuchung(
      {
        zeilen: ['safe', 'bank'].map((kontoId, i) => ({
          kontoId,
          betragCent: i === 0 ? 100 : -100,
          stueckelung: null,
          nettoCent: null,
          steuerCent: null,
          steuersatz: null,
          steuerArt: 'keine' as const,
        })),
      },
      konten,
    );
    expect(f.join(' ')).toContain('Unterkonten');
  });
});

describe('saldoGesamt', () => {
  it('summiert Unterkonten mit', () => {
    const m = saldoGesamt([
      { id: 'a', parentId: null, saldoCent: 5 },
      { id: 'b', parentId: 'a', saldoCent: 10 },
      { id: 'c', parentId: 'b', saldoCent: 100 },
    ]);
    expect(m.get('a')).toBe(115);
    expect(m.get('b')).toBe(110);
    expect(m.get('c')).toBe(100);
  });
});

describe('pruefeBestand', () => {
  const bestand = [
    fach('f', 'Wechselgeld', 1000, [
      [200, 3],
      [100, 4],
    ]),
  ];
  it('lässt gedeckte Entnahmen zu', () => {
    expect(
      pruefeBestand(
        [{ kontoId: 'f', betragCent: -600, stueckelung: [{ nennwertCent: 200, anzahl: -3 }] }],
        bestand,
      ),
    ).toEqual([]);
  });
  it('meldet einen zu hohen Nennwert', () => {
    expect(
      pruefeBestand(
        [{ kontoId: 'f', betragCent: -800, stueckelung: [{ nennwertCent: 200, anzahl: -4 }] }],
        bestand,
      ),
    ).toEqual(['Im Fach „Wechselgeld“ sind nur 3 × 2,00 € vorhanden.']);
  });
  it('meldet fehlende Nennwerte', () => {
    expect(
      pruefeBestand(
        [{ kontoId: 'f', betragCent: -500, stueckelung: [{ nennwertCent: 500, anzahl: -1 }] }],
        bestand,
      ),
    ).toEqual(['Im Fach „Wechselgeld“ gibt es keine 5,00 €.']);
  });
  it('rechnet Zeilen auf demselben Konto zusammen (Wechseln)', () => {
    expect(
      pruefeBestand(
        [
          { kontoId: 'f', betragCent: -400, stueckelung: [{ nennwertCent: 200, anzahl: -2 }] },
          { kontoId: 'f', betragCent: 400, stueckelung: [{ nennwertCent: 100, anzahl: 4 }] },
        ],
        bestand,
      ),
    ).toEqual([]);
  });
  it('meldet einen negativen Saldo eines Bargeldkontos ohne Stückelung', () => {
    const kasse: BestandKonto = {
      id: 'k',
      name: 'Kasse',
      art: 'bargeld',
      stueckelung: false,
      saldoCent: 500,
      anzahl: new Map(),
    };
    expect(pruefeBestand([{ kontoId: 'k', betragCent: -600 }], [kasse])).toEqual([
      'Im Konto „Kasse“ sind nur 5,00 € vorhanden.',
    ]);
  });
  it('ignoriert andere Konten', () => {
    expect(pruefeBestand([{ kontoId: 'bank', betragCent: -600 }], bestand)).toEqual([]);
  });
});

describe('berechneZaehlung', () => {
  const soll = [
    { nennwertCent: 200, anzahl: 3 },
    { nennwertCent: 100, anzahl: 4 },
  ];
  it('ohne Unterschied keine Buchung', () => {
    const e = berechneZaehlung('f', soll, soll);
    expect(e.zeilen).toEqual([]);
    expect(e.differenzCent).toBe(0);
    expect(e.sollCent).toBe(1000);
    expect(e.posten).toHaveLength(13);
  });
  it('mit Fehlbetrag: Fach-Zeile und Kassendifferenz', () => {
    const e = berechneZaehlung('f', soll, [
      { nennwertCent: 200, anzahl: 3 },
      { nennwertCent: 100, anzahl: 2 },
    ]);
    expect(e.differenzCent).toBe(-200);
    expect(e.zeilen).toEqual([
      { kontoId: 'f', betragCent: -200, stueckelung: [{ nennwertCent: 100, anzahl: -2 }] },
      { kontoId: 'kassendifferenz', betragCent: 200, stueckelung: [] },
    ]);
  });
  it('nur Mischung: zwei Fach-Zeilen, keine Kassendifferenz', () => {
    const e = berechneZaehlung('f', soll, [{ nennwertCent: 100, anzahl: 10 }]);
    expect(e.differenzCent).toBe(0);
    expect(e.zeilen).toHaveLength(2);
    expect(e.zeilen.every((z) => z.kontoId === 'f')).toBe(true);
    expect(e.zeilen.reduce((s, z) => s + z.betragCent, 0)).toBe(0);
    expect(e.zeilen.map((z) => stueckelungSumme(z.stueckelung))).toEqual(
      e.zeilen.map((z) => z.betragCent),
    );
  });
  it('Buchung geht immer auf', () => {
    const e = berechneZaehlung('f', soll, [
      { nennwertCent: 500, anzahl: 2 },
      { nennwertCent: 100, anzahl: 1 },
    ]);
    expect(e.zeilen.reduce((s, z) => s + z.betragCent, 0)).toBe(0);
  });
});

describe('zaehlungEingabeSchema', () => {
  const basis = {
    idempotenzSchluessel: '11111111-1111-4111-8111-111111111111',
    kontoId: 'f',
    datum: '2027-01-02',
    ist: [{ nennwertCent: 100, anzahl: 3 }],
  };
  it('nimmt eine gültige Zählung an', () => {
    expect(zaehlungEingabeSchema.safeParse(basis).success).toBe(true);
  });
  it('lehnt negative, gebrochene und doppelte Anzahlen ab', () => {
    for (const ist of [
      [{ nennwertCent: 100, anzahl: -1 }],
      [{ nennwertCent: 100, anzahl: 1.5 }],
      [{ nennwertCent: 3, anzahl: 1 }],
      [
        { nennwertCent: 100, anzahl: 1 },
        { nennwertCent: 100, anzahl: 2 },
      ],
    ])
      expect(zaehlungEingabeSchema.safeParse({ ...basis, ist }).success).toBe(false);
  });
});

describe('pruefeBuchung mit gemischten Vorzeichen', () => {
  it('erlaubt positive und negative Anzahlen in einer Zeile, wenn die Summe passt', () => {
    const konten: PruefKonto[] = [
      { id: 'f', name: 'Kasse', stueckelung: true, archiviert: false },
      { id: 'a', name: 'Aufwand', stueckelung: false, archiviert: false },
    ];
    const zeile = (
      kontoId: string,
      betragCent: number,
      stueckelung: { nennwertCent: number; anzahl: number }[] | null,
    ) => ({
      kontoId,
      betragCent,
      stueckelung,
      nettoCent: null,
      steuerCent: null,
      steuersatz: null,
      steuerArt: 'keine' as const,
    });
    const ok = pruefeBuchung(
      {
        zeilen: [
          zeile('f', -499, [
            { nennwertCent: 1, anzahl: 1 },
            { nennwertCent: 500, anzahl: -1 },
          ]),
          zeile('a', 499, null),
        ],
      },
      konten,
    );
    expect(ok).toEqual([]);
    const falsch = pruefeBuchung(
      {
        zeilen: [
          zeile('f', -498, [
            { nennwertCent: 500, anzahl: -1 },
            { nennwertCent: 1, anzahl: 1 },
          ]),
          zeile('a', 498, null),
        ],
      },
      konten,
    );
    expect(falsch.join(' ')).toContain('passt nicht zum Betrag');
  });
});
