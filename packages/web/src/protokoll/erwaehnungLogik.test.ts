import { describe, expect, it } from 'vitest';
import type { ProtokollDokument, ProtokollKnoten } from '@c4/shared';
import {
  auszugAus,
  erwaehnungEintraege,
  erwaehnungErlaubt,
  erwaehnungText,
  meineErwaehnungen,
  type ErwaehnungPerson,
} from './erwaehnungLogik';

const person = (
  sub: string,
  username: string | null,
  vorname: string,
  nachname: string,
  status: ErwaehnungPerson['status'] = 'mitglied',
): ErwaehnungPerson => ({ sub, username, vorname, nachname, status });

const LEUTE = [
  person('z', 'zoe', 'Zoe', 'Zander'),
  person('e', 'gast', 'Erika', 'Extern', 'extern'),
  person('a', 'anna', 'Anna', 'Müller', 'anwaerter'),
  person('n', null, 'Nina', 'Neu', 'anwaerter'),
];

describe('erwaehnungEintraege', () => {
  it('lists the groups first, then members (Externe last) as "username (Vorname Nachname)"', () => {
    const e = erwaehnungEintraege('', LEUTE);
    expect(e.slice(0, 5).map((x) => x.titel)).toEqual([
      'Anwärter:innen',
      'Mitglieder',
      'EMs',
      'Aktive',
      'Alle',
    ]);
    expect(e.slice(0, 5).every((x) => x.symbol === 'gruppe')).toBe(true);
    expect(e.slice(5).map((x) => x.titel)).toEqual([
      'anna (Anna Müller)',
      'Nina Neu',
      'zoe (Zoe Zander)',
      'gast (Erika Extern)',
    ]);
    expect(e[5]!.attrs).toEqual({ art: 'person', sub: 'a' });
    expect(e[0]!.attrs).toEqual({ art: 'gruppe', gruppe: 'anwaerter' });
  });

  it('filters like the slash lists: umlauts spelled out, case ignored', () => {
    expect(erwaehnungEintraege('anwaerter', LEUTE).map((x) => x.attrs)).toContainEqual({
      art: 'gruppe',
      gruppe: 'anwaerter',
    });
    expect(erwaehnungEintraege('MUELLER', LEUTE).map((x) => x.titel)).toEqual([
      'anna (Anna Müller)',
    ]);
    expect(erwaehnungEintraege('zzz', LEUTE)).toEqual([]);
    expect(erwaehnungEintraege('mitglieder', []).map((x) => x.titel)).toContain('Mitglieder');
  });

  it('has unique keys', () => {
    const keys = erwaehnungEintraege('', LEUTE).map((x) => x.schluessel);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('erwaehnungErlaubt', () => {
  it('allows paragraphs only', () => {
    expect(erwaehnungErlaubt('paragraph')).toBe(true);
    expect(erwaehnungErlaubt('heading')).toBe(false);
  });
});

describe('erwaehnungText', () => {
  const name = (sub: string) => (sub === 'z' ? 'zoe' : null);
  it('writes @username and @Gruppe', () => {
    expect(erwaehnungText({ art: 'person', sub: 'z' }, name)).toBe('@zoe');
    expect(erwaehnungText({ art: 'person', sub: 'q' }, name)).toBe('@Unbekannt');
    expect(erwaehnungText({ art: 'gruppe', gruppe: 'ems' }, name)).toBe('@EMs');
    expect(erwaehnungText({ art: 'gruppe', gruppe: 'mitglieder' }, name)).toBe('@Mitglieder');
  });
});

describe('auszugAus', () => {
  it('keeps short lines and cuts long ones around the mention', () => {
    expect(auszugAus('Hallo @zoe da', 6, 10)).toBe('Hallo @zoe da');
    const lang = `${'a '.repeat(50)}@zoe${' b'.repeat(50)}`;
    const von = lang.indexOf('@zoe');
    const a = auszugAus(lang, von, von + 4);
    expect(a.startsWith('… ')).toBe(true);
    expect(a.endsWith(' …')).toBe(true);
    expect(a).toContain('@zoe');
    expect(a.length).toBeLessThan(120);
  });
});

const t = (s: string): ProtokollKnoten => ({ type: 'text', text: s });
const erw = (attrs: Record<string, unknown>): ProtokollKnoten => ({ type: 'erwaehnung', attrs });
const absatz = (...kinder: ProtokollKnoten[]): ProtokollKnoten => ({
  type: 'paragraph',
  content: kinder,
});
const dok = (...abschnitte: ProtokollKnoten[][]): ProtokollDokument => ({
  type: 'doc',
  content: ['vergangenes', 'gegenwaertiges', 'zukuenftiges', 'sonstiges'].map((art, i) => ({
    type: 'abschnitt',
    attrs: { art },
    content: abschnitte[i] ?? [{ type: 'paragraph' }],
  })),
});
const ueberschrift = (s: string): ProtokollKnoten => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [t(s)],
});

describe('meineErwaehnungen', () => {
  const namen = (sub: string) => ({ me: 'ich', z: 'zoe' })[sub as 'me' | 'z'] ?? null;
  const thema: ProtokollKnoten = {
    type: 'bausteinThema',
    attrs: { id: 'x', daten: { titel: 'Finanzen' } },
    content: [absatz(t('Kasse prüft '), erw({ art: 'person', sub: 'me' }), t(' bis Freitag'))],
  };
  const dokument = dok(
    [absatz(t('Gruß an '), erw({ art: 'gruppe', gruppe: 'mitglieder' }))],
    [thema, absatz(erw({ art: 'person', sub: 'z' }), t(' ist dran'))],
    [ueberschrift('Aufgaben'), absatz(erw({ art: 'gruppe', gruppe: 'ems' }))],
  );

  it('finds the mentions of me and of my group in document order with the nearest heading', () => {
    const r = meineErwaehnungen(dokument, { sub: 'me', status: 'mitglied' }, namen);
    expect(r.eintraege.map((e) => [e.ueberschrift, e.auszug])).toEqual([
      ['Vergangenes', 'Gruß an @Mitglieder'],
      ['Finanzen', 'Kasse prüft @ich bis Freitag'],
    ]);
    expect(r.eintraege.map((e) => e.id)).toEqual(['dok-erw-0', 'dok-erw-1']);
    expect(r.eintraege.every((e) => e.ueberschriftId !== null)).toBe(true);
    expect(r.ids.size).toBe(2);
  });

  it('uses the current status for groups', () => {
    const em = meineErwaehnungen(dokument, { sub: 'me', status: 'em' }, namen);
    expect(em.eintraege.map((e) => [e.ueberschrift, e.auszug])).toEqual([
      ['Finanzen', 'Kasse prüft @ich bis Freitag'],
      ['Aufgaben', '@EMs'],
    ]);
    const extern = meineErwaehnungen(dokument, { sub: 'q', status: 'extern' }, namen);
    expect(extern.eintraege).toEqual([]);
  });

  it('is empty without a viewer', () => {
    expect(meineErwaehnungen(dokument, null).eintraege).toEqual([]);
  });

  describe('event lead', () => {
    const event = (verantwortlichSub: string | null): ProtokollKnoten => ({
      type: 'bausteinEvent',
      attrs: {
        id: 'ev',
        daten: {
          vorlageId: null,
          name: 'Superbowl',
          datum: '2024-02-11',
          bisDatum: null,
          beginnZeit: null,
          endeZeit: null,
          schichten: [],
          verantwortlichSub,
          eventId: null,
        },
      },
      content: [{ type: 'paragraph' }],
    });

    it('is a mention of the lead person, with the event heading', () => {
      const r = meineErwaehnungen(
        dok([], [], [event('me')]),
        { sub: 'me', status: 'mitglied' },
        namen,
      );
      expect(r.eintraege).toHaveLength(1);
      expect(r.eintraege[0]!.ueberschrift).toContain('Superbowl');
      expect(r.eintraege[0]!.auszug).toBe('Verantwortlich: ich');
      expect(r.ids.size).toBe(1);
    });

    it('is no mention of me when someone else leads', () => {
      const r = meineErwaehnungen(
        dok([], [], [event('z')]),
        { sub: 'me', status: 'mitglied' },
        namen,
      );
      expect(r.eintraege).toEqual([]);
      expect(r.ids.size).toBe(0);
    });
  });
});
