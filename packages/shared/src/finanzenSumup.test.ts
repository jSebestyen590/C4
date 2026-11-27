import { describe, expect, it } from 'vitest';
import {
  planeSumupAuszahlung,
  planeSumupBuchung,
  sumupAuszahlungen,
  sumupAuszahlungFuerUmsatz,
  sumupEventVorschlag,
  sumupGeschaeftstag,
  sumupGruppen,
  type SumupAuszahlungZeile,
  type SumupEvent,
  type SumupTransaktion,
} from './finanzenSumup';

const ev = (id: string, beginn: string, ende: string, abgesagt = false): SumupEvent => ({
  id,
  beginn,
  ende,
  abgesagt,
});
const tx = (id: string, zeitpunkt: string, betragCent: number, trinkgeldCent = 0): SumupTransaktion => ({
  id,
  transactionCode: `T${id}`,
  zeitpunkt,
  betragCent,
  typ: 'PAYMENT',
  status: 'SUCCESSFUL',
  trinkgeldCent,
  sumupBenutzer: null,
});

// 2026-03-14 20:00-04:00 Berlin (CET, +1) = 19:00-03:00 UTC
const abend = ev('a', '2026-03-14T19:00:00Z', '2026-03-15T03:00:00Z');

describe('sumupEventVorschlag', () => {
  it('trifft Beginn, Ende und Ende + 3 h, aber nicht danach', () => {
    expect(sumupEventVorschlag('2026-03-14T19:00:00Z', [abend])?.id).toBe('a');
    expect(sumupEventVorschlag('2026-03-15T03:00:00Z', [abend])?.id).toBe('a');
    expect(sumupEventVorschlag('2026-03-15T06:00:00Z', [abend])?.id).toBe('a');
    expect(sumupEventVorschlag('2026-03-15T06:00:01Z', [abend])).toBeNull();
    expect(sumupEventVorschlag('2026-03-14T18:59:59Z', [abend])).toBeNull();
  });
  it('nimmt bei Überlappung das zuletzt begonnene', () => {
    const spaet = ev('b', '2026-03-15T01:00:00Z', '2026-03-15T05:00:00Z');
    expect(sumupEventVorschlag('2026-03-15T02:00:00Z', [abend, spaet])?.id).toBe('b');
    expect(sumupEventVorschlag('2026-03-15T02:00:00Z', [spaet, abend])?.id).toBe('b');
  });
  it('ignoriert abgesagte Events', () => {
    const abgesagt = ev('x', '2026-03-14T19:00:00Z', '2026-03-15T03:00:00Z', true);
    expect(sumupEventVorschlag('2026-03-14T21:00:00Z', [abgesagt])).toBeNull();
    expect(sumupEventVorschlag('2026-03-14T21:00:00Z', [abgesagt, abend])?.id).toBe('a');
  });
});

describe('sumupGeschaeftstag', () => {
  it('Tag endet um 6 Uhr Berlin', () => {
    expect(sumupGeschaeftstag('2026-03-14T23:30:00Z')).toBe('2026-03-14'); // 00:30 Berlin
    expect(sumupGeschaeftstag('2026-03-15T01:00:00Z')).toBe('2026-03-14'); // 02:00 Berlin
    expect(sumupGeschaeftstag('2026-03-15T04:59:00Z')).toBe('2026-03-14'); // 05:59
    expect(sumupGeschaeftstag('2026-03-15T05:00:00Z')).toBe('2026-03-15'); // 06:00
  });
  it('ist über die Zeitumstellung stabil', () => {
    // 2026-03-29: 02:00 -> 03:00 (CEST). 05:30 CEST = 03:30 UTC, 06:00 CEST = 04:00 UTC
    expect(sumupGeschaeftstag('2026-03-29T03:30:00Z')).toBe('2026-03-28');
    expect(sumupGeschaeftstag('2026-03-29T04:00:00Z')).toBe('2026-03-29');
    // 2026-10-25: 03:00 -> 02:00 (CET). 05:30 CET = 04:30 UTC, 06:00 CET = 05:00 UTC
    expect(sumupGeschaeftstag('2026-10-25T04:30:00Z')).toBe('2026-10-24');
    expect(sumupGeschaeftstag('2026-10-25T05:00:00Z')).toBe('2026-10-25');
  });
});

describe('sumupGruppen', () => {
  it('fasst eine Nacht über Mitternacht zu einem Event zusammen', () => {
    const g = sumupGruppen(
      [tx('1', '2026-03-14T21:00:00Z', 500), tx('2', '2026-03-15T01:30:00Z', 700, 50)],
      [abend],
    );
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({
      key: 'event:a',
      geschaeftstag: '2026-03-14',
      eventId: 'a',
      summeCent: 1200,
      anzahl: 2,
      hinweise: ['trinkgeld'],
    });
  });
  it('gruppiert ohne Event nach Geschäftstag, markiert und sortiert', () => {
    const g = sumupGruppen(
      [
        tx('3', '2026-03-17T10:00:00Z', 100),
        tx('1', '2026-03-15T22:00:00Z', 300), // 23:00 -> 15.
        tx('2', '2026-03-16T02:00:00Z', 200), // 03:00 -> 15.
      ],
      [],
    );
    expect(g.map((x) => [x.key, x.summeCent, x.hinweise])).toEqual([
      ['tag:2026-03-15', 500, ['ohne_event']],
      ['tag:2026-03-17', 100, ['ohne_event']],
    ]);
  });
});

describe('planeSumupBuchung', () => {
  it('bucht brutto auf das Guthaben und netto/steuer auf die Kartenerlöse', () => {
    const p = planeSumupBuchung({ geschaeftstag: '2026-03-14', summeCent: 11900 }, 'a', 'Barabend');
    expect(p.datum).toBe('2026-03-14');
    expect(p.text).toBe('SumUp Barabend');
    expect(p.zeilen[0]).toMatchObject({ kontoId: 'sumup', betragCent: 11900, steuerArt: 'keine' });
    expect(p.zeilen[1]).toMatchObject({
      kontoId: 'kartenerloese',
      betragCent: -11900,
      nettoCent: -10000,
      steuerCent: -1900,
      steuersatz: 1900,
      steuerArt: 'ust',
    });
    expect(p.zeilen.reduce((s, z) => s + z.betragCent, 0)).toBe(0);
  });
  it('nimmt ohne Event das Datum und kommt mit Erstattungen (negative Summe) zurecht', () => {
    const p = planeSumupBuchung({ geschaeftstag: '2026-03-14', summeCent: -1190 }, null);
    expect(p.text).toBe('SumUp 14.03.2026');
    expect(p.zeilen[0]!.betragCent).toBe(-1190);
    expect(p.zeilen[1]).toMatchObject({ betragCent: 1190, nettoCent: 1000, steuerCent: 190 });
  });
  it('lehnt die Summe 0 ab', () => {
    expect(() => planeSumupBuchung({ geschaeftstag: '2026-03-14', summeCent: 0 }, null)).toThrow(
      'Summe',
    );
  });
});

const az = (
  id: string,
  datum: string,
  betragCent: number,
  gebuehrCent = 0,
  typ = 'PAYOUT',
): SumupAuszahlungZeile => ({
  id,
  datum,
  typ,
  betragCent,
  gebuehrCent,
  transactionCode: null,
  referenz: null,
  status: 'SUCCESSFUL',
});

describe('sumupAuszahlungen', () => {
  it('rechnet je Datum Netto, Gebühr und Brutto, Abzüge sind negativ', () => {
    const r = sumupAuszahlungen([
      az('2', '2026-03-20', 9000, 150),
      az('3', '2026-03-20', -500, 0, 'REFUND_DEDUCTION'),
      az('1', '2026-03-13', 4000, 60),
    ]);
    expect(r.map((x) => [x.datum, x.nettoCent, x.gebuehrCent, x.bruttoCent])).toEqual([
      ['2026-03-13', 4000, 60, 4060],
      ['2026-03-20', 8500, 150, 8650],
    ]);
    expect(r[1]!.zeilen).toHaveLength(2);
  });
});

describe('Schnittstelle zur Bank', () => {
  const auszahlungen = sumupAuszahlungen([az('1', '2026-03-13', 4000, 60), az('2', '2026-03-20', 8500)]);
  const umsatz = (betragCent: number, buchungsdatum: string, gegenName = 'Foo', zweck = '') => ({
    betragCent,
    buchungsdatum,
    verwendungszweck: zweck,
    gegenName,
  });

  it('findet die Auszahlung mit gleichem Betrag und passendem Datum', () => {
    const v = sumupAuszahlungFuerUmsatz(umsatz(4000, '2026-03-15'), auszahlungen);
    expect(v).toMatchObject({
      art: 'sumup_auszahlung',
      zielId: '2026-03-13',
      text: 'SumUp-Auszahlung vom 13.03.2026',
    });
  });
  it('bewertet "SumUp" und ein näheres Datum höher', () => {
    const a = sumupAuszahlungFuerUmsatz(umsatz(4000, '2026-03-15'), auszahlungen)!;
    const b = sumupAuszahlungFuerUmsatz(umsatz(4000, '2026-03-15', 'SUMUP PAYMENTS'), auszahlungen)!;
    const c = sumupAuszahlungFuerUmsatz(umsatz(4000, '2026-03-14', 'x', 'sumup payout'), auszahlungen)!;
    expect(b.punkte).toBeGreaterThan(a.punkte);
    expect(c.punkte).toBeGreaterThan(b.punkte);
  });
  it('akzeptiert ±5 Tage, sonst keinen Treffer', () => {
    expect(sumupAuszahlungFuerUmsatz(umsatz(4000, '2026-03-18'), auszahlungen)).not.toBeNull();
    expect(sumupAuszahlungFuerUmsatz(umsatz(4000, '2026-03-08'), auszahlungen)).not.toBeNull();
    expect(sumupAuszahlungFuerUmsatz(umsatz(4000, '2026-03-19'), auszahlungen)).toBeNull();
    expect(sumupAuszahlungFuerUmsatz(umsatz(4001, '2026-03-13'), auszahlungen)).toBeNull();
    expect(sumupAuszahlungFuerUmsatz(umsatz(4000, '2026-03-13'), [])).toBeNull();
  });
  it('wählt bei mehreren Kandidaten den besten', () => {
    const zwei = sumupAuszahlungen([az('1', '2026-03-10', 4000), az('2', '2026-03-14', 4000)]);
    expect(sumupAuszahlungFuerUmsatz(umsatz(4000, '2026-03-15'), zwei)?.zielId).toBe('2026-03-14');
  });
  it('plant die Buchung der Auszahlung', () => {
    const p = planeSumupAuszahlung(umsatz(4000, '2026-03-15'), auszahlungen[0]!, 'bank');
    expect(p.datum).toBe('2026-03-15');
    expect(p.zeilen.map((z) => [z.kontoId, z.betragCent, z.steuerArt])).toEqual([
      ['bank', 4000, 'keine'],
      ['sumup-gebuehren', 60, 'keine'],
      ['sumup', -4060, 'keine'],
    ]);
  });
  it('wirft bei abweichendem Betrag einen deutschen Fehler', () => {
    expect(() => planeSumupAuszahlung(umsatz(3999, '2026-03-15'), auszahlungen[0]!, 'bank')).toThrow(
      'passt nicht',
    );
  });
});
