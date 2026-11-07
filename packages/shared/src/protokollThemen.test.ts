import { describe, expect, it } from 'vitest';
import {
  BAUSTEIN_TYPEN,
  bausteinErzeugen,
  darfInNotizen,
  istThema,
  istVerschachtelbar,
  kannBausteineEnthalten,
  protokollDokumentPruefen,
  protokollLeer,
  protokollVorschlag,
  type ProtokollDokument,
  type ProtokollKnoten,
} from './protokolle';
import { protokollAktionen, type ProtokollAktionenKontext } from './protokollAktionen';
import { nichtBeschlussfaehigeAbstimmungen } from './protokollAnwesenheit';
import { stimmenPruefen } from './protokollStimmen';
import type { MitgliedStatus } from './status';
import type { ProtokollTeilnahmeWert } from './protokolle';

// Themen nest: a Thema may stand in the notes of Event, Vergangenes Event, other Bausteine with notes
// and other Themen (any depth), and Abstimmung / Meinungsbild / Wahl may stand in any of them.

const absatz = { type: 'paragraph' } as const;
const thema = (titel: string, ...inhalt: ProtokollKnoten[]) =>
  bausteinErzeugen('bausteinThema', { titel }, [absatz, ...inhalt, absatz]);

describe('rules for Bausteine in notes', () => {
  it('lets votes, Themen and Todos be nested, nothing else', () => {
    const nestbar = BAUSTEIN_TYPEN.filter(istVerschachtelbar);
    expect(nestbar.sort()).toEqual(
      [
        'bausteinAuswahl',
        'bausteinBeschluss',
        'bausteinMeinungsbild',
        'bausteinThema',
        'bausteinTodo',
        'bausteinWahl',
      ].sort(),
    );
    expect(istThema('bausteinThema')).toBe(true);
    expect(istThema('bausteinEvent')).toBe(false);
  });

  it('holds others in every Baustein with notes except votes and Anwesenheit', () => {
    const traeger = BAUSTEIN_TYPEN.filter(kannBausteineEnthalten);
    expect(traeger.sort()).toEqual(
      [
        'bausteinEvent',
        'bausteinThema',
        'bausteinVergangenesEvent',
        'bausteinAnwaerter',
        'bausteinEm',
        'bausteinAufnahme',
      ].sort(),
    );
    expect(kannBausteineEnthalten('unbekannt')).toBe(false);
  });

  it('combines both', () => {
    expect(darfInNotizen('bausteinThema', 'bausteinThema')).toBe(true);
    expect(darfInNotizen('bausteinEvent', 'bausteinThema')).toBe(true);
    expect(darfInNotizen('bausteinThema', 'bausteinWahl')).toBe(true);
    expect(darfInNotizen('bausteinBeschluss', 'bausteinThema')).toBe(false);
    expect(darfInNotizen('bausteinWahl', 'bausteinThema')).toBe(false);
    expect(darfInNotizen('bausteinAnwesenheit', 'bausteinThema')).toBe(false);
    expect(darfInNotizen('bausteinThema', 'bausteinEvent')).toBe(false);
  });
});

function dokument(...gegenwaertiges: ProtokollKnoten[]): ProtokollDokument {
  const d = protokollLeer();
  d.content[1]!.content = [...gegenwaertiges, absatz];
  return d;
}

describe('validation of nested Themen', () => {
  it('accepts a Thema in a Thema in an Event with votes at every level', () => {
    const wahl = bausteinErzeugen('bausteinWahl');
    const abstimmung = bausteinErzeugen('bausteinBeschluss');
    const tief = thema('A', thema('B', wahl, thema('C', abstimmung)));
    const event = bausteinErzeugen('bausteinEvent', undefined, [absatz, tief, absatz]);
    expect(protokollDokumentPruefen(dokument(event))).toBeNull();
  });
});

type T = { sub: string; status: MitgliedStatus; wert: ProtokollTeilnahmeWert };
const mitglieder = (n: number, anwesend = n): T[] =>
  Array.from({ length: n }, (_, i) => ({
    sub: `m${i}`,
    status: 'mitglied' as const,
    wert: i < anwesend ? ('anwesend' as const) : ('entschuldigt' as const),
  }));

const beschluss = (ja: number, nein: number, enthaltung: number, antrag = 'Bier') =>
  bausteinErzeugen('bausteinBeschluss', {
    antrag,
    ja,
    nein,
    enthaltung,
    ergebnis: null,
    wiederholung: null,
  });

/** Event > Thema > Thema > [Abstimmung, Wahl]. */
function tiefesDokument() {
  const abstimmung = beschluss(1, 0, 0); // 1 vote for 5 present: wrong count
  const wahl = bausteinErzeugen('bausteinWahl', {
    ...bausteinErzeugen('bausteinWahl').attrs.daten,
    posten: 'Kasse',
    kandidaten: [{ id: 'a', sub: 'a', name: '', stimmen: 1 }],
  });
  const innen = thema('Innen', abstimmung, wahl);
  const aussen = thema('Aussen', innen);
  const event = bausteinErzeugen('bausteinEvent', undefined, [absatz, aussen, absatz]);
  return { doc: dokument(event), abstimmung, wahl, event, aussen, innen };
}

describe('votes through nested Themen', () => {
  it('checks the counts of votes and Wahlen at any depth', () => {
    const { doc } = tiefesDokument();
    const ergebnis = stimmenPruefen(doc, { art: 'sitzung', teilnahme: mitglieder(5) });
    expect(ergebnis.problems.length).toBe(2);
    expect(ergebnis.problems[0]!.text).toContain('Abstimmung');
  });

  it('finds votes that are not beschlussfähig at any depth, in document order', () => {
    const { doc, abstimmung, wahl } = tiefesDokument();
    const ids = nichtBeschlussfaehigeAbstimmungen(doc, {
      art: 'sitzung',
      teilnahme: mitglieder(10, 3),
    });
    expect(ids).toEqual([abstimmung.attrs.id, wahl.attrs.id]);
    expect(
      nichtBeschlussfaehigeAbstimmungen(doc, { art: 'sitzung', teilnahme: mitglieder(10, 8) }),
    ).toEqual([]);
  });

  it('repeats a not-quorate vote from a nested Thema, without the Thema and the old vote', () => {
    const { doc, abstimmung, event } = tiefesDokument();
    const neu = protokollVorschlag({
      sitzungDatum: '2026-11-10',
      letztes: doc,
      wiederholen: { bausteinIds: [abstimmung.attrs.id], datum: '2026-11-05', sitzung: 'Sitzung' },
    });
    const gegenwart = (neu.content[1]!.content ?? []).filter((k) => k.type.startsWith('baustein'));
    expect(gegenwart.map((k) => k.type)).toEqual(['bausteinBeschluss']);
    expect(gegenwart[0]!.attrs!.id).not.toBe(abstimmung.attrs.id);
    expect(gegenwart[0]!.attrs!.daten).toMatchObject({
      ja: 0,
      wiederholung: { datum: '2026-11-05' },
    });
    // The Event of the old minutes is gone from Gegenwärtiges and nothing of the Themen is carried over.
    expect(event.type).toBe('bausteinEvent');
    expect(JSON.stringify(neu)).not.toContain('bausteinThema');
    expect(JSON.stringify(neu)).not.toContain('Aussen');
  });

  it('drops nested Themen (with their votes) from the notes of a carried-over Event', () => {
    const innen = thema('Innen', beschluss(1, 0, 0));
    const event = bausteinErzeugen(
      'bausteinEvent',
      { ...bausteinErzeugen('bausteinEvent').attrs.daten, name: 'Fest', datum: '2026-12-01' },
      [{ type: 'paragraph', content: [{ type: 'text', text: 'Text' }] }, thema('Aussen', innen)],
    );
    const d = protokollLeer();
    d.content[2]!.content = [event, absatz];
    const neu = protokollVorschlag({ sitzungDatum: '2026-11-10', letztes: d });
    const json = JSON.stringify(neu);
    expect(json).toContain('Fest');
    expect(json).toContain('Text');
    expect(json).not.toContain('bausteinThema');
    expect(json).not.toContain('bausteinBeschluss');
  });
});

describe('protokollAktionen through nested Themen', () => {
  it('finds a Wahl in a Thema in a Thema in an Event', () => {
    const wahl = bausteinErzeugen('bausteinWahl', {
      ...bausteinErzeugen('bausteinWahl').attrs.daten,
      postenId: null,
    });
    const event = bausteinErzeugen('bausteinEvent', undefined, [
      absatz,
      thema('A', thema('B', wahl)),
      absatz,
    ]);
    const d = protokollLeer();
    d.content[2]!.content = [event, absatz];
    const kontext: ProtokollAktionenKontext = {
      sitzungDatum: '2026-11-10',
      heute: '2026-11-12',
      events: {},
      kategorien: {},
      personen: {},
      posten: {},
    };
    const aktionen = protokollAktionen(d, kontext);
    expect(aktionen.some((a) => a.bausteinId === wahl.attrs.id && a.art === 'wahl.posten')).toBe(
      true,
    );
  });
});
