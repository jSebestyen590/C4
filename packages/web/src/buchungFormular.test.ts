import { describe, expect, it } from 'vitest';
import type { PruefKonto } from '@c4/shared';
import {
  buchbareKonten,
  buchungBody,
  differenzText,
  fehlendeRichtung,
  formularFehler,
  formularLeer,
  freieZeilen,
  HOHER_BETRAG_CENT,
  leereZeile,
  richtungVon,
  schluesselFuer,
  summeCent,
  summen,
  umbuchungFehler,
  umbuchungZeilen,
  warnungen,
  zeilenFehler,
  type FormularStand,
  type FreieZeile,
} from './buchungFormular';

const konten: PruefKonto[] = [
  { id: 'a', name: 'Bank', stueckelung: false, archiviert: false },
  { id: 'b', name: 'Geldtransit', stueckelung: false, archiviert: false },
  { id: 'c', name: 'Alt', stueckelung: false, archiviert: true },
];

const zeile = (
  kontoId: string | null,
  richtung: FreieZeile['richtung'],
  betrag: number | null,
) => ({
  ...leereZeile(richtung),
  kontoId,
  betrag,
});

const frei = (zeilen: FormularStand['zeilen']): FormularStand => ({
  modus: 'frei',
  von: null,
  nach: null,
  betrag: null,
  zeilen,
});
const umbuchung = (
  von: string | null,
  nach: string | null,
  betrag: number | null,
): FormularStand => ({
  modus: 'umbuchung',
  von,
  nach,
  betrag,
  zeilen: [],
});

describe('umbuchungZeilen', () => {
  it('books the amount out of Von (Abgang) and into Nach (Zugang)', () => {
    const z = umbuchungZeilen('a', 'b', 1250);
    expect(z.map((x) => [x.kontoId, x.betragCent])).toEqual([
      ['a', -1250],
      ['b', 1250],
    ]);
    expect(summeCent(z)).toBe(0);
  });
});

describe('freieZeilen', () => {
  it('signs by direction', () => {
    expect(
      freieZeilen([zeile('a', 'zugang', 500), zeile('b', 'abgang', 500)]).map((z) => z.betragCent),
    ).toEqual([500, -500]);
  });
  it('treats an empty field as 0', () => {
    expect(freieZeilen([leereZeile()])[0]?.betragCent).toBe(0);
  });
});

describe('richtungVon', () => {
  it('maps the sign to a word', () => {
    expect(richtungVon(5)).toBe('zugang');
    expect(richtungVon(-5)).toBe('abgang');
  });
});

describe('summen and differenzText', () => {
  it('adds Zugang and Abgang separately', () => {
    expect(summen([zeile('a', 'zugang', 700), zeile('b', 'abgang', 200), leereZeile()])).toEqual({
      zugang: 700,
      abgang: 200,
      differenz: 500,
    });
  });
  it('says what is open', () => {
    expect(differenzText(500)).toBe('Noch 5,00 € Abgang offen');
    expect(differenzText(-500)).toBe('Noch 5,00 € Zugang offen');
    expect(differenzText(0)).toBe('Ausgeglichen');
    expect(differenzText(0, false)).toContain('Noch keine');
  });
  it('proposes the direction that is missing', () => {
    expect(fehlendeRichtung(500)).toBe('abgang');
    expect(fehlendeRichtung(-500)).toBe('zugang');
    expect(fehlendeRichtung(0)).toBe('zugang');
  });
});

describe('field errors', () => {
  it('flags a missing or archived account and a missing amount', () => {
    expect(zeilenFehler({ kontoId: null, betrag: null }, konten)).toEqual({
      konto: 'Bitte wähle ein Konto.',
      betrag: 'Bitte gib einen Betrag über 0 ein.',
    });
    expect(zeilenFehler({ kontoId: 'c', betrag: 5 }, konten).konto).toBeDefined();
    expect(zeilenFehler({ kontoId: 'a', betrag: 5 }, konten)).toEqual({});
  });
  it('flags an Umbuchung with equal accounts', () => {
    expect(umbuchungFehler({ von: 'a', nach: 'a', betrag: 5 }).nach).toContain('verschieden');
    expect(umbuchungFehler({ von: null, nach: null, betrag: null })).toMatchObject({
      von: expect.any(String),
      nach: expect.any(String),
      betrag: expect.any(String),
    });
  });
});

describe('formularFehler', () => {
  it('accepts a balanced free booking', () => {
    const z = [zeile('a', 'zugang', 500), zeile('b', 'abgang', 500)];
    expect(formularFehler(frei(z), konten)).toEqual([]);
  });
  it('reports an unbalanced free booking', () => {
    const z = [zeile('a', 'zugang', 500), zeile('b', 'abgang', 400)];
    expect(formularFehler(frei(z), konten).join(' ')).toContain('geht nicht auf');
  });
  it('reports a missing amount and a missing account', () => {
    expect(
      formularFehler(frei([zeile('a', 'zugang', null), zeile('b', 'abgang', 5)]), konten),
    ).toEqual(['Bitte gib bei jeder Zeile einen Betrag über 0 ein.']);
    const z = [zeile(null, 'zugang', 500), zeile('b', 'abgang', 500)];
    expect(formularFehler(frei(z), konten).join(' ')).toContain('Das Konto gibt es nicht');
  });
  it('accepts an Umbuchung and rejects same account, zero and archived', () => {
    expect(formularFehler(umbuchung('a', 'b', 300), konten)).toEqual([]);
    expect(formularFehler(umbuchung('a', 'a', 300), konten)).toContain(
      'Die beiden Konten müssen verschieden sein.',
    );
    expect(formularFehler(umbuchung('a', 'b', null), konten)).toContain(
      'Bitte gib einen Betrag über 0 ein.',
    );
    expect(formularFehler(umbuchung('a', 'c', 300), konten).join(' ')).toContain('archiviert');
    expect(formularFehler(umbuchung(null, 'b', 300), konten).length).toBeGreaterThan(0);
  });
});

describe('buchungBody', () => {
  it('sets source type by mode, trims the text and carries the key', () => {
    const b = buchungBody({ datum: '2026-01-02', text: ' Test ' }, umbuchung('a', 'b', 100), 'k-1');
    expect(b.quelleTyp).toBe('umbuchung');
    expect(b.text).toBe('Test');
    expect(b.idempotenzSchluessel).toBe('k-1');
    expect(buchungBody({ datum: '2026-01-02', text: 'x' }, frei([]), 'k').quelleTyp).toBe(
      'manuell',
    );
  });
});

describe('warnungen', () => {
  const kopf = { datum: '2026-05-01', text: 'x' };
  const ok = umbuchung('a', 'b', 500);
  it('has none for an ordinary booking', () => {
    expect(warnungen(kopf, ok, '2026-05-01')).toEqual([]);
  });
  it('warns about a date in the future', () => {
    expect(warnungen(kopf, ok, '2026-04-30').join(' ')).toContain('Zukunft');
  });
  it('warns about an unusually high amount from the threshold on', () => {
    expect(warnungen(kopf, umbuchung('a', 'b', HOHER_BETRAG_CENT - 1), '2026-05-01')).toEqual([]);
    expect(
      warnungen(kopf, umbuchung('a', 'b', HOHER_BETRAG_CENT), '2026-05-01').join(' '),
    ).toContain('ungewöhnlich hoch');
  });
});

describe('formularLeer', () => {
  const kopf = { datum: '2026-05-01', text: '' };
  it('is empty without input and not after typing', () => {
    const leer = frei([leereZeile(), leereZeile('abgang')]);
    expect(formularLeer(kopf, leer)).toBe(true);
    expect(formularLeer({ ...kopf, text: 'x' }, leer)).toBe(false);
    expect(formularLeer(kopf, frei([zeile('a', 'zugang', null)]))).toBe(false);
    expect(formularLeer(kopf, umbuchung(null, null, 5))).toBe(false);
  });
});

describe('schluesselFuer', () => {
  it('keeps the key for the same content and renews it for changed content', () => {
    let n = 0;
    const neu = () => `k${++n}`;
    const a = schluesselFuer(null, 'x', neu);
    expect(schluesselFuer(a, 'x', neu)).toBe(a);
    expect(schluesselFuer(a, 'y', neu).schluessel).toBe('k2');
  });
});

describe('buchbareKonten', () => {
  it('drops archived accounts and accounts with Stückelung', () => {
    const k = (id: string, archiviert: boolean, stueckelung: boolean) =>
      ({ id, archiviert, stueckelung }) as Parameters<typeof buchbareKonten>[0][number];
    expect(
      buchbareKonten([k('a', false, false), k('b', true, false), k('c', false, true)]).map(
        (x) => x.id,
      ),
    ).toEqual(['a']);
  });
});
