import { describe, expect, it } from 'vitest';
import { STEUERSATZ_ZEITRAEUME_SEED } from '@c4/shared';
import {
  anzahlLesen,
  anzahlText,
  einzelpreisHinweis,
  formularEigenbeleg,
  preisPatch,
  saetzeUmstellen,
  bezahltCent,
  datenZuFormular,
  dateiTypVon,
  formularFehler,
  formularSumme,
  formularZuDaten,
  groesseText,
  hatInhalt,
  gefuelltePosten,
  postenLeer,
  tabellenZeilen,
  hexVon,
  leeresFormular,
  mengenAus,
  pfandJeSatz,
  neuerPosten,
  postenHinzufuegen,
  postenSortieren,
  satzText,
  steuersatzVorschlag,
  stueckelungAus,
  stueckelungHinweis,
  verwendeteSaetze,
  type BelegFormular,
} from './belegFormular';

const voll = (): BelegFormular => ({
  ...leeresFormular(),
  rechnungsstellerId: 'r1',
  belegdatum: '2026-03-01',
  posten: [
    {
      ...neuerPosten(1900, 'kategorie'),
      kategorieId: 'k1',
      text: 'Deko',
      anzahl: '2',
      einzelpreisCent: 500,
    },
  ],
  belegsummeCent: 1000,
  zahlweg: 'bar',
  bezahldatum: '2027-03-01',
  fachId: 'f1',
  gegeben: { 1000: 1 },
  wechselgeld: {},
  eigenbeleg: true,
  eigenbelegBegruendung: 'Kassenbon verloren',
});

const ZEITRAEUME = STEUERSATZ_ZEITRAEUME_SEED;

describe('anzahlLesen / anzahlText', () => {
  it('liest Dezimalkomma und Punkt in Tausendstel', () => {
    expect(anzahlLesen('1,5')).toBe(1500);
    expect(anzahlLesen('2')).toBe(2000);
    expect(anzahlLesen('0,125')).toBe(125);
    expect(anzahlLesen('-1')).toBe(-1000);
    expect(anzahlLesen('1.5')).toBe(1500);
  });
  it('lehnt Ungültiges ab', () => {
    expect(anzahlLesen('')).toBeNull();
    expect(anzahlLesen('abc')).toBeNull();
    expect(anzahlLesen('1,2345')).toBeNull();
  });
  it('formatiert ohne überflüssige Nullen', () => {
    expect(anzahlText(1500)).toBe('1,5');
    expect(anzahlText(1000)).toBe('1');
    expect(anzahlText(125)).toBe('0,125');
  });
});

describe('satzText und Vorschlag', () => {
  it('zeigt Prozent', () => {
    expect(satzText(1900)).toBe('19 %');
    expect(satzText(700)).toBe('7 %');
  });
  it('schlägt den Satz der Art im jeweiligen Zeitraum vor', () => {
    const normal = { regel: 1900, ermaessigt: 700 };
    expect(steuersatzVorschlag({ steuersatzArt: 'ermaessigt' }, normal)).toBe(700);
    expect(steuersatzVorschlag({ steuersatzArt: 'regel' }, { regel: 1600, ermaessigt: 500 })).toBe(
      1600,
    );
    expect(steuersatzVorschlag({ steuersatzArt: 'keine' }, normal)).toBe(0);
    expect(steuersatzVorschlag({ steuersatzArt: null }, normal)).toBeNull();
    expect(steuersatzVorschlag(undefined, normal)).toBeNull();
  });
});

describe('Stückelung mit Vorzeichen', () => {
  it('bucht Gegebenes negativ und Wechselgeld positiv', () => {
    expect(stueckelungAus({ 1000: 1 }, { 100: 2, 50: 1 })).toEqual([
      { nennwertCent: 50, anzahl: 1 },
      { nennwertCent: 100, anzahl: 2 },
      { nennwertCent: 1000, anzahl: -1 },
    ]);
  });
  it('verrechnet denselben Nennwert in beiden Spalten', () => {
    expect(stueckelungAus({ 100: 3 }, { 100: 1 })).toEqual([{ nennwertCent: 100, anzahl: -2 }]);
    expect(stueckelungAus({ 100: 1 }, { 100: 1 })).toEqual([]);
  });
  it('teilt zurück in die zwei Spalten', () => {
    const m = mengenAus([
      { nennwertCent: 1000, anzahl: -1 },
      { nennwertCent: 100, anzahl: 2 },
    ]);
    expect(m.gegeben).toEqual({ 1000: 1 });
    expect(m.wechselgeld).toEqual({ 100: 2 });
  });
  it('rechnet den bezahlten Betrag', () => {
    expect(bezahltCent({ 1000: 1 }, { 100: 2 })).toBe(800);
  });
  it('meldet, was fehlt oder zu viel ist', () => {
    expect(stueckelungHinweis(1000, {}, {})).toBeNull();
    expect(stueckelungHinweis(1000, { 1000: 1 }, {})).toBeNull();
    expect(stueckelungHinweis(1000, { 500: 1 }, {})).toContain('fehlen');
    expect(stueckelungHinweis(1000, { 2000: 1 }, {})).toContain('zu viel');
  });
});

describe('formularZuDaten', () => {
  it('übernimmt Zahlweg bar mit Fach und Stückelung', () => {
    const d = formularZuDaten(voll());
    expect(d.posten).toEqual([
      {
        art: 'kategorie',
        kategorieId: 'k1',
        text: 'Deko',
        anzahlMilli: 2000,
        einzelpreisCent: 500,
        gesamtCent: null,
        steuersatz: 1900,
      },
    ]);
    expect(d.zahlweg).toBe('bar');
    expect(d.fachId).toBe('f1');
    expect(d.stueckelung).toEqual([{ nennwertCent: 1000, anzahl: -1 }]);
    expect(d.mitgliedId).toBeNull();
    expect(d.eigenbelegBegruendung).toBe('Kassenbon verloren');
  });
  it('lässt Felder anderer Zahlwege weg', () => {
    const d = formularZuDaten({ ...voll(), zahlweg: 'auslage', mitgliedId: 'm1' });
    expect(d.fachId).toBeNull();
    expect(d.stueckelung).toEqual([]);
    expect(d.bezahldatum).toBeNull();
    expect(d.mitgliedId).toBe('m1');
  });
  it('verwirft die Begründung, sobald eine Datei da ist', () => {
    const datei = {
      sha256: 'a'.repeat(64),
      schluessel: 'x',
      typ: 'application/pdf' as const,
      name: 'a.pdf',
    };
    expect(formularZuDaten({ ...voll(), datei }).eigenbelegBegruendung).toBeNull();
  });
  it('speichert Korrekturen nur bei Netto und ohne Nullen', () => {
    const f = {
      ...voll(),
      korrekturen: {
        1900: { nettoCent: 1, steuerCent: null },
        700: { nettoCent: 0, steuerCent: 0 },
      },
    };
    expect(formularZuDaten(f).korrekturen).toEqual([]);
    expect(formularZuDaten({ ...f, modus: 'netto' }).korrekturen).toEqual([
      { steuersatz: 1900, nettoCent: 1, steuerCent: 0 },
    ]);
  });
  it('macht aus leeren Feldern null bzw. 0', () => {
    const d = formularZuDaten({
      ...leeresFormular(),
      posten: [{ ...neuerPosten(700, 'leergut'), text: 'Kästen' }],
    });
    expect(d.belegdatum).toBeNull();
    expect(d.posten[0]!.einzelpreisCent).toBe(0);
    expect(formularZuDaten(leeresFormular()).posten).toEqual([]);
    expect(d.zahlweg).toBeNull();
  });
});

describe('datenZuFormular', () => {
  it('ist die Umkehrung von formularZuDaten', () => {
    const d = formularZuDaten(voll());
    const f = datenZuFormular(d);
    expect(formularZuDaten(f)).toEqual(d);
    expect(f.eigenbeleg).toBe(true);
    expect(f.gegeben).toEqual({ 1000: 1 });
  });
  it('legt für einen leeren Entwurf eine Postenzeile an', () => {
    expect(datenZuFormular(formularZuDaten(leeresFormular())).posten).toHaveLength(1);
  });
});

describe('Ware, Leergut und Einreichung', () => {
  const lager = (): BelegFormular => ({
    ...voll(),
    posten: [
      {
        ...neuerPosten(700),
        art: 'ware',
        wareId: 'w1',
        gebindeId: 'g1',
        kategorieId: 'k1',
        anzahl: '2',
        einzelpreisCent: 1000,
        pfandCent: 300,
      },
      {
        ...neuerPosten(1900, 'kategorie'),
        kategorieId: 'k2',
        anzahl: '1',
        einzelpreisCent: 100,
      },
      { ...neuerPosten(700), art: 'leergut', text: 'Leergut', anzahl: '1', einzelpreisCent: 600 },
    ],
    eingereichtBetragCent: 1234,
    rechnungsstellerName: ' Getränke Müller ',
    notiz: ' Bon liegt bei ',
  });

  it('trägt Ware- und Leergut-Posten in die Daten', () => {
    const d = formularZuDaten(lager());
    expect(d.posten[0]).toEqual({
      art: 'ware',
      wareId: 'w1',
      gebindeId: 'g1',
      kategorieId: 'k1',
      anzahlMilli: 2000,
      einzelpreisCent: 1000,
      gesamtCent: null,
      steuersatz: 700,
      pfandCent: 300,
    });
    expect(d.posten[2]).toEqual({
      art: 'leergut',
      text: 'Leergut',
      anzahlMilli: 1000,
      einzelpreisCent: 600,
      steuersatz: 700,
    });
    expect(d.posten[1]!.art).toBe('kategorie');
  });
  it('trägt Betrag, Name und Notiz ohne Verlust', () => {
    const d = formularZuDaten(lager());
    expect(d.eingereichtBetragCent).toBe(1234);
    expect(d.rechnungsstellerName).toBe('Getränke Müller');
    expect(d.notiz).toBe('Bon liegt bei');
  });
  it('ist über Laden und Speichern verlustfrei', () => {
    const d = formularZuDaten(lager());
    const f = datenZuFormular(d);
    expect(formularZuDaten(f)).toEqual(d);
    expect(f.posten[0]).toMatchObject({
      art: 'ware',
      wareId: 'w1',
      pfandCent: 300,
    });
    expect(f.notiz).toBe('Bon liegt bei');
  });
  it('rechnet das Pfand je Steuersatz mit', () => {
    const b = formularSumme(lager());
    expect(b.pfandBetraege[0]).toBe(600);
    expect(b.summe).toBe(2000 + 600 - 600 + 100);
  });
  it('summiert das Pfand je Steuersatz', () => {
    const f = lager();
    const b = formularSumme(f);
    expect(pfandJeSatz(f.posten, b.pfandBetraege)).toEqual({ 700: 600 });
  });
  it('verlangt Ware, Gebinde und Leergut-Text', () => {
    const f = lager();
    f.posten[0] = { ...f.posten[0]!, gebindeId: null };
    f.posten[2] = { ...f.posten[2]!, text: '' };
    const m = formularFehler(f, ZEITRAEUME)
      .map((x) => x.meldung)
      .join(' ');
    expect(m).toContain('Bitte wähle ein Gebinde');
    expect(m).toContain('Bitte beschreibe das Leergut');
  });
  it('zählt eine Ware-Zeile als Inhalt', () => {
    const f = { ...leeresFormular(), posten: [{ ...neuerPosten(), wareId: 'w1' }] };
    expect(hatInhalt(f)).toBe(true);
  });
});

describe('formularFehler', () => {
  it('lässt einen vollständigen Beleg durch', () => {
    const f = { ...voll(), gegeben: { 1000: 1 } };
    expect(formularFehler(f, ZEITRAEUME)).toEqual([]);
  });
  it('verlangt Rechnungssteller, Datum, Datei oder Begründung', () => {
    const felder = formularFehler(leeresFormular(), ZEITRAEUME).map((x) => x.feld);
    expect(felder).toEqual(
      expect.arrayContaining(['rechnungssteller', 'belegdatum', 'datei', 'zahlweg']),
    );
  });
  it('meldet eine unlesbare Anzahl und einen fehlenden Preis', () => {
    const f = voll();
    f.posten = [{ ...f.posten[0]!, anzahl: 'x', einzelpreisCent: null }];
    const m = formularFehler(f, ZEITRAEUME)
      .map((x) => x.meldung)
      .join('\n');
    expect(m).toContain('Kategorien, Zeile 1: Die Anzahl');
    expect(m).toContain('Kategorien, Zeile 1: Bitte gib den Einzelpreis an.');
  });
  it('zählt die Zeilen je Tabelle', () => {
    const f = voll();
    f.posten = [
      { ...f.posten[0]!, einzelpreisCent: null },
      { ...neuerPosten(0, 'ware'), wareId: 'w1', einzelpreisCent: null },
      { ...f.posten[0]!, einzelpreisCent: null },
    ];
    const m = formularFehler(f, ZEITRAEUME).map((x) => x.meldung);
    expect(m).toContain('Waren, Zeile 1: Bitte gib den Einzelpreis an.');
    expect(m).toContain('Kategorien, Zeile 2: Bitte gib den Einzelpreis an.');
  });
  it('prüft die Stückelung gegen die Summe', () => {
    const f = { ...voll(), gegeben: { 500: 1 } };
    expect(formularFehler(f, ZEITRAEUME).some((x) => x.feld === 'stueckelung')).toBe(true);
  });
});

describe('Summen und Sätze', () => {
  it('rechnet brutto je Steuersatz', () => {
    const s = formularSumme({ ...voll(), eigenbeleg: false });
    expect(s.summe).toBe(1000);
    expect(s.jeSteuersatz.find((g) => g.satz === 1900)!.steuer).toBe(160);
  });
  it('rechnet einen Eigenbeleg ohne Vorsteuer', () => {
    const s = formularSumme(voll());
    expect(s.summe).toBe(1000);
    expect(s.jeSteuersatz.find((g) => g.satz === 1900)!.steuer).toBe(0);
  });
  it('listet die verwendeten Sätze absteigend', () => {
    const f = {
      ...voll(),
      posten: [
        neuerPosten(700, 'leergut'),
        neuerPosten(1900, 'leergut'),
        neuerPosten(700, 'leergut'),
      ].map((p) => ({ ...p, text: 'x' })),
    };
    expect(verwendeteSaetze(f)).toEqual([1900, 700]);
  });
});

describe('hatInhalt', () => {
  it('zählt ein vorbelegtes Formular nicht als Inhalt', () => {
    expect(hatInhalt(leeresFormular())).toBe(false);
    expect(hatInhalt({ ...leeresFormular(), rechnungsstellerId: 'r1' })).toBe(false);
  });
  it('erkennt Datum, Posten und Datei', () => {
    expect(hatInhalt({ ...leeresFormular(), belegdatum: '2027-01-01' })).toBe(true);
    expect(hatInhalt(voll())).toBe(true);
  });
});

describe('Datei', () => {
  it('erkennt den Typ am Typ oder an der Endung', () => {
    expect(dateiTypVon({ type: 'application/pdf', name: 'a' })).toBe('application/pdf');
    expect(dateiTypVon({ type: '', name: 'IMG_1.HEIC' })).toBe('image/heic');
    expect(dateiTypVon({ type: 'image/heif', name: 'x' })).toBe('image/heic');
    expect(dateiTypVon({ type: '', name: 'foto.jpeg' })).toBe('image/jpeg');
    expect(dateiTypVon({ type: 'text/plain', name: 'a.txt' })).toBeNull();
  });
  it('bildet Hex ab', () => {
    expect(hexVon(new Uint8Array([0, 15, 255]))).toBe('000fff');
  });
  it('kürzt Größen', () => {
    expect(groesseText(500)).toBe('500 B');
    expect(groesseText(2048)).toBe('2 KB');
    expect(groesseText(1.5 * 1024 * 1024)).toBe('1,5 MB');
  });
});

describe('Reihenfolge der Posten', () => {
  const p = (art: 'ware' | 'kategorie' | 'leergut', key: string) => ({
    ...neuerPosten(700, art),
    key,
  });
  it('neue Posten sind standardmäßig Ware', () => {
    expect(neuerPosten().art).toBe('ware');
  });
  it('sortiert Waren, Kategorien, Leergut und erhält die Reihenfolge innerhalb einer Art', () => {
    const s = postenSortieren([
      p('leergut', 'a'),
      p('kategorie', 'b'),
      p('ware', 'c'),
      p('kategorie', 'd'),
      p('ware', 'e'),
    ]);
    expect(s.map((x) => x.key)).toEqual(['c', 'e', 'b', 'd', 'a']);
  });
  it('fügt einen Posten am Ende seiner Gruppe ein', () => {
    const liste = [p('ware', 'a'), p('kategorie', 'b'), p('leergut', 'c')];
    expect(postenHinzufuegen(liste, p('ware', 'n')).map((x) => x.key)).toEqual([
      'a',
      'n',
      'b',
      'c',
    ]);
    expect(postenHinzufuegen(liste, p('leergut', 'n')).map((x) => x.key)).toEqual([
      'a',
      'b',
      'c',
      'n',
    ]);
    expect(postenHinzufuegen([], p('kategorie', 'n')).map((x) => x.key)).toEqual(['n']);
  });
  it('speichert die Posten gruppiert', () => {
    const f = {
      ...voll(),
      posten: [
        { ...p('leergut', 'a'), text: 'L' },
        { ...p('ware', 'b'), wareId: 'w1', anzahl: '1' },
      ],
    };
    expect(formularZuDaten(f).posten.map((x) => x.art)).toEqual(['ware', 'leergut']);
  });
});

describe('leere Zeilen', () => {
  const leere = () => ({
    ware: neuerPosten(1900, 'ware'),
    kategorie: neuerPosten(1900, 'kategorie'),
    leergut: neuerPosten(1900, 'leergut'),
  });
  it('kennt den Inhalt je Art (vorbelegte Anzahl und Steuersatz zählen nicht)', () => {
    expect(postenLeer(neuerPosten(700, 'ware'))).toBe(true);
    expect(postenLeer({ ...neuerPosten(), wareId: 'w1' })).toBe(false);
    expect(postenLeer(neuerPosten(700, 'kategorie'))).toBe(true);
    expect(postenLeer({ ...neuerPosten(700, 'kategorie'), text: ' ' })).toBe(true);
    expect(postenLeer({ ...neuerPosten(700, 'kategorie'), einzelpreisCent: 0 })).toBe(false);
    expect(postenLeer({ ...neuerPosten(700, 'kategorie'), kategorieId: 'k' })).toBe(false);
    expect(postenLeer({ ...neuerPosten(700, 'leergut'), kategorieId: 'k' })).toBe(true);
    expect(postenLeer({ ...neuerPosten(700, 'leergut'), text: 'Kästen' })).toBe(false);
  });
  it('speichert und prüft leere Zeilen nicht', () => {
    const f = { ...voll(), posten: [...voll().posten, neuerPosten(700, 'leergut')] };
    expect(formularZuDaten(f).posten).toHaveLength(voll().posten.length);
    expect(gefuelltePosten(f.posten)).toHaveLength(voll().posten.length);
    expect(hatInhalt({ ...leeresFormular(), posten: [neuerPosten(700, 'leergut')] })).toBe(false);
  });
  it('zeigt je Tabelle die gefüllten Zeilen und genau eine leere', () => {
    const l = leere();
    const k = { ...neuerPosten(1900, 'kategorie'), text: 'Deko' };
    const z = tabellenZeilen([k], l, 'kategorie');
    expect(z.map((x) => [x.p.key, x.leer, x.nr])).toEqual([
      [k.key, false, 1],
      [l.kategorie.key, true, null],
    ]);
    // Without items the table only has its empty row.
    expect(tabellenZeilen([k], l, 'leergut').map((x) => x.leer)).toEqual([true]);
  });
  it('nutzt die zuletzt geleerte Zeile der Form als leere Zeile', () => {
    const l = leere();
    const gefuellt = { ...neuerPosten(1900, 'leergut'), text: 'a' };
    const geleert = neuerPosten(1900, 'leergut');
    const z = tabellenZeilen([gefuellt, geleert], l, 'leergut');
    expect(z.map((x) => x.p.key)).toEqual([gefuellt.key, geleert.key]);
    expect(z.at(-1)?.leer).toBe(true);
  });
});

describe('Gesamtpreis, Eigenbeleg und Sätze nach Belegdatum', () => {
  const zeile = () => ({
    ...neuerPosten(1900, 'kategorie'),
    kategorieId: 'k1',
    text: 'Steaks',
    anzahl: '8',
  });

  it('startet ohne Anzahl', () => {
    expect(neuerPosten().anzahl).toBe('');
  });

  it('meldet eine leere Anzahl als Fehler', () => {
    const f = { ...voll(), posten: [{ ...zeile(), anzahl: '', einzelpreisCent: 100 }] };
    expect(formularFehler(f, ZEITRAEUME).map((x) => x.meldung)).toContain(
      'Kategorien, Zeile 1: Bitte gib die Anzahl an.',
    );
  });

  it('ein exakter Preis wird als Gesamtbetrag der Zeile gespeichert', () => {
    const p = { ...zeile(), anzahl: '8', ...preisPatch(100, 799 / 8) };
    expect(p).toMatchObject({ einzelpreisCent: 100, preisExaktCent: 99.875 });
    const d = formularZuDaten({ ...voll(), posten: [p] }).posten[0]!;
    expect(d).toMatchObject({ gesamtCent: 799, einzelpreisCent: 100 });
    expect(formularSumme({ ...voll(), posten: [p] }).summe).toBe(799);
    expect(einzelpreisHinweis(p)).toBe(100);
  });

  it('ein ganzer Cent-Preis speichert keinen Gesamtbetrag', () => {
    const p = { ...zeile(), anzahl: '8', ...preisPatch(100, 100) };
    expect(p.preisExaktCent).toBeNull();
    expect(formularZuDaten({ ...voll(), posten: [p] }).posten[0]).toMatchObject({
      gesamtCent: null,
    });
    expect(einzelpreisHinweis(p)).toBeNull();
    expect(preisPatch(null, null)).toEqual({ einzelpreisCent: null, preisExaktCent: null });
  });

  it('rechnet den Betrag bei geänderter Anzahl aus dem exakten Preis neu', () => {
    const p = { ...zeile(), anzahl: '8', ...preisPatch(100, 99.875) };
    const mehr = { ...p, anzahl: '16' };
    expect(formularZuDaten({ ...voll(), posten: [mehr] }).posten[0]).toMatchObject({
      gesamtCent: 1598,
    });
  });

  it('liest den exakten Preis aus dem Gesamtbetrag des Entwurfs', () => {
    const p = { ...zeile(), anzahl: '8', ...preisPatch(100, 99.875) };
    const zurueck = datenZuFormular(formularZuDaten({ ...voll(), posten: [p] }));
    expect(zurueck.posten[0]).toMatchObject({ einzelpreisCent: 100, preisExaktCent: 99.875 });
  });

  it('füllt die Belegsumme mit dem eingereichten Betrag, wenn sie leer ist', () => {
    const d = { ...formularZuDaten(voll()), belegsummeCent: null, eingereichtBetragCent: 1234 };
    expect(datenZuFormular(d).belegsummeCent).toBe(1234);
    expect(datenZuFormular({ ...d, belegsummeCent: 500 }).belegsummeCent).toBe(500);
  });

  it('erkennt einen Eigenbeleg erst mit Begründung', () => {
    expect(formularEigenbeleg({ datei: null, eigenbeleg: true, eigenbelegBegruendung: ' ' })).toBe(
      false,
    );
    expect(
      formularEigenbeleg({ datei: null, eigenbeleg: true, eigenbelegBegruendung: 'Bon weg' }),
    ).toBe(true);
  });

  it('stellt Regel- und ermäßigten Satz beim Wechsel des Zeitraums um', () => {
    const alt = { regel: 1900, ermaessigt: 700 };
    const neu = { regel: 1600, ermaessigt: 500 };
    const f = {
      ...voll(),
      korrekturen: { 1900: { nettoCent: 1, steuerCent: null } },
      posten: [zeile(), { ...zeile(), steuersatz: 700 }, { ...zeile(), steuersatz: 0 }],
    };
    const r = saetzeUmstellen(f, alt, neu);
    expect(r.form.posten.map((p) => p.steuersatz)).toEqual([1600, 500, 0]);
    expect(Object.keys(r.form.korrekturen)).toEqual(['1600']);
    expect(r.geaendert).toBe(2);
    expect(saetzeUmstellen(f, alt, alt).form).toBe(f);
  });
});
