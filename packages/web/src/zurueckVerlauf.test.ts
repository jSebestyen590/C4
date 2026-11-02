import { describe, expect, it } from 'vitest';
import { merken, rueckweg, type Ort, type Verlauf } from './zurueckVerlauf';

const ort = (key: string, pathname: string, search = ''): Ort => ({ key, pathname, search });

describe('zurueckVerlauf', () => {
  const liste = ort('a', '/inventar', '?ansicht=ifcos');
  const eltern = ort('b', '/inventar/gegenstaende/1');
  const teil = ort('c', '/inventar/gegenstaende/2');

  it('returns to the page the user came from, not a fixed list', () => {
    let v: Verlauf = {};
    v = merken(v, null, liste, 'POP');
    v = merken(v, liste, eltern, 'PUSH');
    v = merken(v, eltern, teil, 'PUSH');
    expect(rueckweg(v, teil)).toEqual({ ort: eltern, schritte: 1 });
    expect(rueckweg(v, eltern)).toEqual({ ort: liste, schritte: 1 });
    expect(rueckweg(v, liste)).toBeNull();
  });

  it('lets a replaced entry inherit the origin of the page it replaced', () => {
    const kalender = ort('k', '/kalender');
    const formular = ort('f', '/kalender/events/neu');
    const event = ort('e', '/kalender/events/9');
    let v: Verlauf = merken({}, kalender, formular, 'PUSH');
    v = merken(v, formular, event, 'REPLACE');
    expect(rueckweg(v, event)).toEqual({ ort: kalender, schritte: 1 });
  });

  it('skips entries of the same page, e.g. after editing it', () => {
    const kalender = ort('k', '/kalender');
    const event = ort('e', '/kalender/events/9');
    const formular = ort('f', '/kalender/events/9/bearbeiten');
    const gespeichert = ort('g', '/kalender/events/9');
    let v: Verlauf = merken({}, kalender, event, 'PUSH');
    v = merken(v, event, formular, 'PUSH');
    v = merken(v, formular, gespeichert, 'REPLACE');
    expect(rueckweg(v, gespeichert)).toEqual({ ort: kalender, schritte: 2 });
  });

  it('records nothing on back/forward or reloads', () => {
    const v = merken({ c: eltern }, teil, eltern, 'POP');
    expect(v).toEqual({ c: eltern });
  });
});
