import { describe, expect, it } from 'vitest';
import { ifcoPlatzMasse, ifcoPlatzPruefen } from './ifcoPlatz';
import { ifcos, ifcoTypen, type IfcoRow, type IfcoTypRow } from './db/schema';
import type { Db } from './db/client';

const typen: IfcoTypRow[] = [
  { id: 't10', name: '6410', grundflaeche: 'gross', hoeheCm: 10, archiviert: false },
  { id: 't16', name: '6416', grundflaeche: 'gross', hoeheCm: 16, archiviert: false },
  { id: 'k10', name: '4310', grundflaeche: 'klein', hoeheCm: 10, archiviert: false },
];
const ifco = (id: string, name: string, typId: string | null): IfcoRow => ({
  id,
  name,
  beschreibung: null,
  lagerortId: 'p',
  archiviert: false,
  typId,
});

/** `select().from(table).where(...)` returning fixed rows per table (the where is not evaluated). */
function stub(stehend: IfcoRow[]) {
  return {
    select: () => ({
      from: (tabelle: unknown) => ({
        where: async () => (tabelle === ifcos ? stehend : tabelle === ifcoTypen ? typen : []),
      }),
    }),
  } as unknown as Pick<Db, 'select'>;
}

const ort = { id: 'p', name: 'HR11' };
const masse = { hoeheCm: 20, stellflaechen: 1 };

describe('ifcoPlatzMasse', () => {
  it('is null for a normal Lagerort', () => {
    expect(ifcoPlatzMasse({ ifcoHoeheCm: null, ifcoStellflaechen: null })).toBeNull();
    expect(ifcoPlatzMasse({ ifcoHoeheCm: 20, ifcoStellflaechen: 1.5 })).toEqual({
      hoeheCm: 20,
      stellflaechen: 1.5,
    });
  });
});

describe('ifcoPlatzPruefen', () => {
  const stehend = [ifco('i1', 'Spanngurtkiste', 't10'), ifco('i2', 'Werkzeugkiste', 't10')];

  it('accepts what fits', async () => {
    expect(
      await ifcoPlatzPruefen(stub([stehend[0]!]), ort, masse, {
        neu: [{ name: 'Neu', typId: 't10' }],
      }),
    ).toBeNull();
  });

  it('names the place, what stands there and what does not fit', async () => {
    expect(
      await ifcoPlatzPruefen(stub(stehend), ort, masse, {
        neu: [{ name: 'Strom-IFCO', typId: 't16' }],
      }),
    ).toBe(
      'Passt nicht auf „HR11“ (20 cm hoch, 1 Stellfläche): dort stehen Spanngurtkiste (6410, 10 cm), Werkzeugkiste (6410, 10 cm); „Strom-IFCO“ (6416, 16 cm) hat keinen Platz mehr.',
    );
  });

  it('does not count the IFCO that is being moved', async () => {
    expect(
      await ifcoPlatzPruefen(stub(stehend), ort, masse, {
        ohne: ['i1'],
        neu: [{ name: 'Spanngurtkiste', typId: 't10' }],
      }),
    ).toBeNull();
  });

  it('rejects an IFCO without a type', async () => {
    expect(
      await ifcoPlatzPruefen(stub([]), ort, masse, { neu: [{ name: 'Ohne', typId: null }] }),
    ).toContain('keinen Typ');
    expect(await ifcoPlatzPruefen(stub([ifco('i3', 'Alt', null)]), ort, masse)).toContain(
      '„Alt“ hat keinen Typ',
    );
  });

  it('checks the standing IFCOs against changed dimensions', async () => {
    const klein = { hoeheCm: 15, stellflaechen: 1 };
    expect(await ifcoPlatzPruefen(stub(stehend), ort, klein)).toContain('Passt nicht auf „HR11“');
    expect(
      await ifcoPlatzPruefen(stub(stehend), ort, { hoeheCm: 20, stellflaechen: 1 }),
    ).toBeNull();
  });

  it('uses replacement type dimensions when a type is being edited', async () => {
    const hoeher = new Map([['t10', { grundflaeche: 'gross' as const, hoeheCm: 12 }]]);
    expect(await ifcoPlatzPruefen(stub(stehend), ort, masse, { typen: hoeher })).toContain(
      '(6410, 12 cm)',
    );
    const kleiner = new Map([['t10', { grundflaeche: 'klein' as const, hoeheCm: 10 }]]);
    expect(await ifcoPlatzPruefen(stub(stehend), ort, masse, { typen: kleiner })).toBeNull();
  });
});
