import { describe, expect, it } from 'vitest';
import {
  aktionLaeuft,
  auswahlUmschalten,
  ergebnisZusammenfassung,
  gueltigeAuswahl,
  vorgewaehlteAktionen,
  zustandText,
} from './aktionenLogik';

const a = (
  id: string,
  ausfuehrbar: boolean,
  zustand: 'offen' | 'erledigt' | 'fehler' | 'nicht_ausfuehrbar',
) => ({
  id,
  ausfuehrbar,
  zustand,
});

describe('vorgewaehlteAktionen', () => {
  it('pre-checks only executable open Aktionen', () => {
    const liste = [
      a('1', true, 'offen'),
      a('2', true, 'fehler'),
      a('3', false, 'nicht_ausfuehrbar'),
      a('4', false, 'erledigt'),
    ];
    expect(vorgewaehlteAktionen(liste)).toEqual(['1']);
  });
});

describe('aktionLaeuft', () => {
  it('allows open and failed executable Aktionen only', () => {
    expect(aktionLaeuft(a('1', true, 'offen'))).toBe(true);
    expect(aktionLaeuft(a('1', true, 'fehler'))).toBe(true);
    expect(aktionLaeuft(a('1', false, 'nicht_ausfuehrbar'))).toBe(false);
    expect(aktionLaeuft(a('1', false, 'erledigt'))).toBe(false);
  });
});

describe('auswahl', () => {
  it('toggles ids without duplicates', () => {
    expect(auswahlUmschalten(['1'], '2', true)).toEqual(['1', '2']);
    expect(auswahlUmschalten(['1', '2'], '1', true)).toEqual(['2', '1']);
    expect(auswahlUmschalten(['1', '2'], '1', false)).toEqual(['2']);
  });

  it('drops ids that cannot run any more', () => {
    const liste = [a('1', true, 'offen'), a('2', false, 'erledigt')];
    expect(gueltigeAuswahl(['1', '2', '9'], liste)).toEqual(['1']);
  });
});

describe('ergebnisZusammenfassung', () => {
  it('uses singular and plural', () => {
    expect(ergebnisZusammenfassung([{ status: 'erledigt' }])).toBe('1 Aktion erledigt');
    expect(
      ergebnisZusammenfassung([
        { status: 'erledigt' },
        { status: 'erledigt' },
        { status: 'erledigt' },
        { status: 'fehler' },
      ]),
    ).toBe('3 Aktionen erledigt, 1 fehlgeschlagen');
    expect(ergebnisZusammenfassung([{ status: 'fehler' }, { status: 'fehler' }])).toBe(
      '2 fehlgeschlagen',
    );
  });

  it('is null when nothing ran', () => {
    expect(ergebnisZusammenfassung([])).toBeNull();
    expect(ergebnisZusammenfassung([{ status: 'uebersprungen' }])).toBeNull();
  });
});

describe('zustandText', () => {
  it('labels every state in German', () => {
    expect(zustandText({ zustand: 'offen' })).toBe('Offen');
    expect(zustandText({ zustand: 'fehler' })).toBe('Fehlgeschlagen');
    expect(zustandText({ zustand: 'erledigt' })).toBe('Erledigt');
    expect(zustandText({ zustand: 'nicht_ausfuehrbar' })).toBe('Nicht ausführbar');
  });
});
