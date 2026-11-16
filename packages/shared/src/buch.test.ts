import { describe, expect, it } from 'vitest';
import {
  buchAbrechnungEingabeSchema,
  buchJahre,
  buchRangliste,
  buchSeiteEingabeSchema,
  buchTarifEingabeSchema,
  eintragWirkungCent,
  gueltigerTarif,
  istUeberzug,
  saldoCent,
  stornoWerte,
  type BuchTarif,
} from './buch';

const tarif = (
  status: BuchTarif['status'],
  gueltigAb: string,
  strichwertCent: number,
  erstelltAm = '2026-01-01T00:00:00Z',
): BuchTarif => ({ status, gueltigAb, strichwertCent, maxUeberzugCent: 3000, erstelltAm });

describe('gueltigerTarif', () => {
  const tarife = [
    tarif('mitglied', '2026-01-01', 100),
    tarif('mitglied', '2026-06-01', 120),
    tarif('mitglied', '2026-06-01', 130, '2026-05-01T00:00:00Z'),
    tarif('extern', '2026-01-01', 200),
  ];

  it('takes the latest gueltigAb not after the date', () => {
    expect(gueltigerTarif(tarife, 'mitglied', '2026-03-01')?.strichwertCent).toBe(100);
    expect(gueltigerTarif(tarife, 'mitglied', '2026-06-01')?.strichwertCent).toBe(130);
    expect(gueltigerTarif(tarife, 'extern', '2027-01-01')?.strichwertCent).toBe(200);
  });

  it('is null before the first tarif or for a status without one', () => {
    expect(gueltigerTarif(tarife, 'mitglied', '2025-12-31')).toBeNull();
    expect(gueltigerTarif(tarife, 'em', '2026-03-01')).toBeNull();
  });
});

describe('Eintrag und Saldo', () => {
  it('payments raise the balance, Striche and Bar lower it', () => {
    expect(
      eintragWirkungCent({ striche: 3, strichwertCent: 150, barCent: 200, abzahlungCent: 1000 }),
    ).toBe(350);
    expect(
      eintragWirkungCent({ striche: 2, strichwertCent: 150, barCent: 0, abzahlungCent: 0 }),
    ).toBe(-300);
  });

  it('a Storno negates the effect', () => {
    const w = { striche: 3, strichwertCent: 150, barCent: 200, abzahlungCent: 100 };
    expect(eintragWirkungCent(stornoWerte(w))).toBe(-eintragWirkungCent(w));
    expect(stornoWerte(w).strichwertCent).toBe(150);
  });

  it('sums the balance and flags an overdraft below the limit only', () => {
    expect(saldoCent([{ betragCent: -500 }, { betragCent: 200 }])).toBe(-300);
    expect(istUeberzug(-3000, 3000)).toBe(false);
    expect(istUeberzug(-3001, 3000)).toBe(true);
    expect(istUeberzug(0, 0)).toBe(false);
    expect(istUeberzug(-1, 0)).toBe(true);
  });
});

describe('buchRangliste', () => {
  const e = (schluessel: string, erstelltAm: string, striche: number, barCent = 0) => ({
    schluessel,
    erstelltAm,
    striche,
    strichwertCent: 100,
    barCent,
  });
  const eintraege = [
    e('a', '2025-12-31T12:00:00Z', 10),
    e('a', '2026-02-01T12:00:00Z', 1),
    e('b', '2026-03-01T12:00:00Z', 2, 500),
    e('c', '2026-03-01T12:00:00Z', 7),
    // a reversal of c's seven Striche
    e('c', '2026-03-02T12:00:00Z', -7),
  ];

  it('sorts by turnover in euro over all years', () => {
    expect(buchRangliste(eintraege, null)).toEqual([
      { schluessel: 'a', umsatzCent: 1100, striche: 11 },
      { schluessel: 'b', umsatzCent: 700, striche: 2 },
    ]);
  });

  it('filters by Berlin year and counts Bar but not payments', () => {
    expect(buchRangliste(eintraege, 2026)).toEqual([
      { schluessel: 'b', umsatzCent: 700, striche: 2 },
      { schluessel: 'a', umsatzCent: 100, striche: 1 },
    ]);
    expect(buchRangliste(eintraege, 2025)).toEqual([
      { schluessel: 'a', umsatzCent: 1000, striche: 10 },
    ]);
  });

  it('lists the years with entries, newest first', () => {
    expect(buchJahre(eintraege)).toEqual([2026, 2025]);
  });
});

describe('Schemas', () => {
  it('a page has either a member or an external name', () => {
    expect(buchSeiteEingabeSchema.safeParse({ nummer: 1, mitgliedSub: 'm' }).success).toBe(true);
    expect(buchSeiteEingabeSchema.safeParse({ nummer: 1, externName: 'Gast' }).success).toBe(true);
    expect(buchSeiteEingabeSchema.safeParse({ nummer: 1 }).success).toBe(false);
    expect(
      buchSeiteEingabeSchema.safeParse({ nummer: 1, mitgliedSub: 'm', externName: 'Gast' }).success,
    ).toBe(false);
    expect(buchSeiteEingabeSchema.safeParse({ nummer: 0, externName: 'Gast' }).success).toBe(false);
  });

  it('a tarif needs a positive Strichwert and a non-negative overdraft', () => {
    const ok = {
      status: 'mitglied',
      strichwertCent: 100,
      maxUeberzugCent: 0,
      gueltigAb: '2026-01-01',
    };
    expect(buchTarifEingabeSchema.safeParse(ok).success).toBe(true);
    expect(buchTarifEingabeSchema.safeParse({ ...ok, strichwertCent: 0 }).success).toBe(false);
    expect(buchTarifEingabeSchema.safeParse({ ...ok, maxUeberzugCent: -1 }).success).toBe(false);
  });

  it('an Abrechnung allows each page only once and needs a key', () => {
    const zeile = { seiteId: 's', striche: 1, barCent: 0, abzahlungCent: 0 };
    const key = crypto.randomUUID();
    expect(
      buchAbrechnungEingabeSchema.safeParse({ idempotenzSchluessel: key, zeilen: [zeile] }).success,
    ).toBe(true);
    expect(
      buchAbrechnungEingabeSchema.safeParse({ idempotenzSchluessel: key, zeilen: [zeile, zeile] })
        .success,
    ).toBe(false);
    expect(buchAbrechnungEingabeSchema.safeParse({ zeilen: [zeile] }).success).toBe(false);
  });
});
