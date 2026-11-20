import { describe, expect, it } from 'vitest';
import {
  bausteinLeer,
  protokollKopfLeer,
  type ProtokollKnoten,
  type ProtokollKopf,
} from '@c4/shared';
import {
  anwesenheitZeile,
  beschlussfaehigkeitText,
  aufnahmeZeilen,
  beschlussZeilen,
  meinungsbildZeilen,
  wahlZeilen,
  druckTitel,
  datumLang,
  dokumentKopf,
  dokumentTitel,
  emZeilen,
  eroeffnungSatz,
  istQuellenzeile,
  mitLiveKopf,
  naechsteSitzungSatz,
  naechsteSitzungWert,
  ohneLeereEnden,
  type DokumentEingabe,
} from './dokumentDaten';

const m = (sub: string, username: string | null, wert: string, status = 'mitglied') =>
  ({
    sub,
    username,
    vorname: 'V' + sub,
    nachname: 'N' + sub,
    status,
    anrede: 'neutral',
    abgeleitet: wert,
    wert,
    ueberschrieben: false,
  }) as unknown as DokumentEingabe['teilnahme'][number];

const anw = (id: string, art: string, sub: string, uhrzeit = ''): ProtokollKnoten => ({
  type: 'bausteinAnwesenheit',
  attrs: { id, daten: { art, sub, uhrzeit } },
  // Old documents still carry the (unused) note paragraph.
  content: [{ type: 'paragraph' }],
});

function eingabe(inhaltKnoten: ProtokollKnoten[] = [], kopf?: Partial<ProtokollKopf>) {
  return {
    inhalt: {
      type: 'doc',
      content: [
        { type: 'abschnitt', attrs: { art: 'vergangenes' }, content: inhaltKnoten },
        { type: 'abschnitt', attrs: { art: 'gegenwaertiges' }, content: [{ type: 'paragraph' }] },
        { type: 'abschnitt', attrs: { art: 'zukuenftiges' }, content: [{ type: 'paragraph' }] },
      ],
    },
    kopf: { ...protokollKopfLeer(), ...kopf },
    teilnahme: [
      m('1', 'leo', 'anwesend'),
      m('2', 'julia', 'verspaetet'),
      m('3', null, 'entschuldigt'),
      m('4', 'ida', 'unentschuldigt'),
      m('5', 'strobi', 'entschuldigt'),
      m('6', 'arne', 'anwesend', 'anwaerter'),
    ],
    ems: [],
    sitzung: { titel: 'Clubsitzung', beginn: '2024-01-30T19:00:00Z', art: 'sitzung' },
  } as DokumentEingabe;
}

describe('Titel', () => {
  it('uses the Berlin date', () => {
    expect(datumLang('2024-01-30T23:30:00Z')).toBe('31.01.2024');
    expect(dokumentTitel(eingabe().sitzung)).toBe('Clubsitzung 30.01.2024');
  });
});

describe('dokumentKopf', () => {
  it('groups attendance; people with blocks get their times', () => {
    const k = dokumentKopf(eingabe([anw('a', 'erscheint', '2', '21:00')]));
    // julia is "verspaetet" in old data and counts as da.
    expect(k.anwesende.map((p) => `${p.name} ${p.zusatz}`.trim())).toEqual([
      'leo',
      'julia (ab 21:00 Uhr)',
    ]);
    expect(k.entschuldigt.map((p) => p.name)).toEqual(['V3 N3', 'strobi']);
    expect(k.unentschuldigt.map((p) => p.name)).toEqual(['ida']);
    expect(k.anwaerter.map((p) => p.name)).toEqual(['arne']);
  });

  it('shows ab, bis or both, from the first erscheint and the last geht', () => {
    const zusatz = (knoten: ProtokollKnoten[]) =>
      dokumentKopf(eingabe(knoten)).anwesende.find((p) => p.name === 'leo')?.zusatz;
    expect(zusatz([])).toBe('');
    expect(zusatz([anw('a', 'erscheint', '1', '21:00')])).toBe('(ab 21:00 Uhr)');
    expect(zusatz([anw('a', 'geht', '1', '22:10')])).toBe('(bis 22:10 Uhr)');
    expect(zusatz([anw('a', 'erscheint', '1', '21:00'), anw('b', 'geht', '1', '22:10')])).toBe(
      '(ab 21:00 Uhr, bis 22:10 Uhr)',
    );
    expect(zusatz([anw('a', 'geht', '1', '')])).toBe('');
  });

  it('shows Anwärter:innen with times, too, and ignores the legacy Kopf time', () => {
    const k = dokumentKopf(
      eingabe([anw('a', 'erscheint', '6', '21:30')], { verspaetung: { '1': '20:30' } }),
    );
    expect(k.anwaerter[0]?.zusatz).toBe('(ab 21:30 Uhr)');
    expect(k.anwesende[0]?.zusatz).toBe('');
  });

  it('counts an absent member with a block as present (old data)', () => {
    for (const art of ['erscheint', 'geht']) {
      const k = dokumentKopf(eingabe([anw('a', art, '5', '22:00')]));
      expect(k.anwesende.map((p) => p.name)).toContain('strobi');
      expect(k.entschuldigt.map((p) => p.name)).not.toContain('strobi');
    }
    const k = dokumentKopf(eingabe([anw('a', 'erscheint', '5', '22:00')]));
    expect(k.anwesende.find((p) => p.name === 'strobi')?.zusatz).toBe('(ab 22:00 Uhr)');
  });

  it('resolves Sitzungsleitung and Protokoll, quorum from the opening', () => {
    const k = dokumentKopf(eingabe([], { sitzungsleitung: '1', protokollfuehrung: '999' }));
    expect(k.leitung?.name).toBe('leo');
    expect(k.protokoll).toBeNull();
    expect(k.beschlussfaehigkeit).toMatchObject({ gesamt: 5, anwesend: 2, mindestens: 3 });
  });
});

describe('Texte', () => {
  it('opening sentence', () => {
    expect(eroeffnungSatz('sitzung', true, '20:04')).toBe(' eröffnet die Sitzung um 20:04 Uhr.');
    expect(eroeffnungSatz('mitgliederversammlung', true, null)).toBe(
      ' eröffnet die Mitgliederversammlung.',
    );
    expect(eroeffnungSatz('sitzung', false, '20:04')).toBe(
      'Die Sitzung wird um 20:04 Uhr eröffnet.',
    );
    expect(eroeffnungSatz('sitzung', false, null)).toBeNull();
  });

  it('quorum text', () => {
    const b = { gesamt: 25, anwesend: 13, mindestens: 13, beschlussfaehig: true };
    expect(beschlussfaehigkeitText('sitzung', b)).toEqual({
      fakten:
        'Beschlussfähigkeit: 13 von 25 Mitgliedern anwesend, nötig sind mindestens 13 (mehr als die Hälfte).',
      urteil: 'Die Sitzung ist beschlussfähig.',
    });
    const mv = beschlussfaehigkeitText('mitgliederversammlung', {
      ...b,
      mindestens: 17,
      beschlussfaehig: false,
    });
    expect(mv.fakten).toContain('mehr als zwei Drittel');
    expect(mv.urteil).toBe('Die Mitgliederversammlung ist nicht beschlussfähig.');
  });

  it('Anwesenheit line', () => {
    const stand = {
      gesamt: 25,
      anwesend: 14,
      mindestens: 13,
      beschlussfaehig: true,
      wechsel: true,
    };
    const z = anwesenheitZeile({ art: 'erscheint', sub: '2', uhrzeit: '21:00' }, 'sitzung', stand);
    expect(z?.nach).toBe(' erscheint um 21:00 Uhr.');
    expect(z?.wechsel).toBe(
      'Die Sitzung ist jetzt beschlussfähig (14 von 25 Mitgliedern anwesend).',
    );
    expect(
      anwesenheitZeile({ art: 'geht', sub: '2', uhrzeit: '' }, 'sitzung', undefined)?.nach,
    ).toBe(' geht.');
    expect(
      anwesenheitZeile({ art: 'geht', sub: '2', uhrzeit: '22:10' }, 'sitzung', undefined)?.nach,
    ).toBe(' geht um 22:10 Uhr.');
    expect(
      anwesenheitZeile({ art: 'geht', sub: null, uhrzeit: '' }, 'sitzung', undefined),
    ).toBeNull();
    const nicht = { ...stand, anwesend: 12, beschlussfaehig: false };
    expect(
      anwesenheitZeile({ art: 'geht', sub: '2', uhrzeit: '' }, 'sitzung', nicht)?.wechsel,
    ).toBe('Die Sitzung ist nicht mehr beschlussfähig (12 von 25 Mitgliedern anwesend).');
  });

  it('Beschluss lines', () => {
    const stand = { gesamt: 25, anwesend: 10, mindestens: 13, beschlussfaehig: false };
    expect(
      beschlussZeilen(
        { antrag: ' Neuer Tresen ', ja: 8, nein: 3, enthaltung: 2, ergebnis: 'angenommen' },
        stand,
      ),
    ).toEqual({
      wiederholung: '',
      antrag: 'Neuer Tresen',
      stimmen: 'Ja 8 · Nein 3 · Enthaltung 2 – angenommen',
      anwesend: '(10 von 25 Mitgliedern anwesend)',
      nichtBeschlussfaehig: true,
    });
    expect(
      beschlussZeilen({ antrag: 'x', ja: 1, nein: 0, enthaltung: 0, ergebnis: null }, undefined)
        .stimmen,
    ).toBe('Ja 1 · Nein 0 · Enthaltung 0');
  });

  it('Aufnahme lines look like an Abstimmung', () => {
    const stand = { gesamt: 25, anwesend: 13, mindestens: 13, beschlussfaehig: true };
    const abstimmung = { ja: 8, nein: 3, enthaltung: 2, ergebnis: 'angenommen' };
    expect(aufnahmeZeilen({ sub: 'a', name: '', abstimmung }, stand)).toEqual({
      wiederholung: '',
      name: '',
      sub: 'a',
      stimmen: 'Ja 8 · Nein 3 · Enthaltung 2 – angenommen',
      anwesend: '(13 von 25 Mitgliedern anwesend)',
      nichtBeschlussfaehig: false,
    });
    const nicht = { ...stand, anwesend: 10, beschlussfaehig: false };
    expect(
      aufnahmeZeilen(
        {
          sub: null,
          name: 'Max',
          abstimmung,
          wiederholung: { datum: '2026-11-05', sitzung: 'Test Sitzung' },
        },
        nicht,
      ).wiederholung,
    ).toBe(
      'Wiederholung der Aufnahme-Abstimmung vom 05.11.2026 (Test Sitzung), damals nicht beschlussfähig.',
    );
    expect(aufnahmeZeilen({ sub: null, name: ' Max ', abstimmung }, nicht)).toMatchObject({
      name: 'Max',
      sub: null,
      nichtBeschlussfaehig: true,
    });
  });

  it('Meinungsbild lines skip options without a text', () => {
    expect(
      meinungsbildZeilen({
        frage: ' Ernst oder Spaß? ',
        optionen: [
          { text: 'Ernst', stimmen: 4 },
          { text: ' ', stimmen: 9 },
          { text: 'Spaß', stimmen: 3 },
          { text: 'Enthaltung', stimmen: 2 },
        ],
      }),
    ).toEqual({ frage: 'Ernst oder Spaß?', optionen: 'Ernst 4 · Spaß 3 · Enthaltung 2' });
    expect(meinungsbildZeilen({ frage: '', optionen: [] }).optionen).toBe('');
    expect(meinungsbildZeilen(null)).toEqual({ frage: '', optionen: '' });
  });

  it('Wahl lines: result, runoff and quorum', () => {
    const stand = { gesamt: 25, anwesend: 13, mindestens: 13, beschlussfaehig: true };
    const wahl = (stichwahlen: unknown[]) => ({
      posten: ' Finanzen ',
      anzahl: 2,
      kandidaten: [
        { id: 'a', sub: 's1', name: '', stimmen: 5 },
        { id: 'b', sub: null, name: ' Bea ', stimmen: 3 },
        { id: 'c', sub: null, name: 'Cem', stimmen: 3 },
      ],
      enthaltung: 1,
      stichwahlen,
    });
    const offen = wahlZeilen(wahl([]), stand)!;
    expect(offen).toMatchObject({
      posten: 'Finanzen',
      plaetze: '2 Plätze',
      offen: true,
      enthaltung: 1,
    });
    expect(offen.gewaehlt.map((g) => g.id)).toEqual(['a']);
    expect(offen.anwesend).toBe('(13 von 25 Mitgliedern anwesend)');
    const fertig = wahlZeilen(wahl([{ stimmen: { b: 1, c: 4 }, enthaltung: 2 }]), {
      ...stand,
      anwesend: 10,
      beschlussfaehig: false,
    })!;
    expect(fertig.offen).toBe(false);
    expect(fertig.gewaehlt.map((g) => g.id)).toEqual(['a', 'c']);
    expect(fertig.stichwahlen).toEqual([
      {
        kandidaten: [
          { id: 'b', sub: null, name: 'Bea', stimmen: 1 },
          { id: 'c', sub: null, name: 'Cem', stimmen: 4 },
        ],
        enthaltung: 2,
      },
    ]);
    expect(fertig.nichtBeschlussfaehig).toBe(true);
    expect(offen.giltAb).toBe('');
    expect(
      wahlZeilen({ ...wahl([]), postenId: 'p1', gueltigAb: '2027-01-01' }, stand),
    ).toMatchObject({
      giltAb: 'Gilt ab 01.01.2027',
    });
    const abgesagt = wahlZeilen(
      { ...wahl([]), anzahl: 1, nichtAngetreten: ['s9'], annahme: { a: false } },
      stand,
    )!;
    expect(abgesagt.nichtAngetreten).toEqual(['s9']);
    expect(abgesagt.abgelehnt.map((g) => g.id)).toEqual(['a']);
    expect(abgesagt.offen).toBe(true);
    expect(abgesagt.gewaehlt).toEqual([]);
    expect(wahlZeilen({ posten: 'x' }, stand)).toBeNull();
  });

  it('Neues EM lines', () => {
    const stand = { gesamt: 25, anwesend: 13, mindestens: 13, beschlussfaehig: true };
    const abstimmung = { ja: 8, nein: 3, enthaltung: 2, ergebnis: 'angenommen' };
    expect(emZeilen({ sub: 'a', name: '', abstimmung }, stand)).toEqual({
      wiederholung: '',
      name: '',
      sub: 'a',
      abstimmung:
        'Abstimmung: Ja 8 · Nein 3 · Enthaltung 2 – angenommen (13 von 25 Mitgliedern anwesend)',
      nichtBeschlussfaehig: false,
    });
    const nicht = { ...stand, anwesend: 10, beschlussfaehig: false };
    expect(emZeilen({ sub: null, name: ' Gast ', abstimmung }, nicht)).toMatchObject({
      name: 'Gast',
      nichtBeschlussfaehig: true,
    });
    expect(emZeilen({ sub: 'a', name: '', abstimmung: null }, nicht)).toEqual({
      wiederholung: '',
      name: '',
      sub: 'a',
      abstimmung: '',
      nichtBeschlussfaehig: false,
    });
  });
});

describe('Hilfen', () => {
  it('drops trailing empty paragraphs and detects attribution lines', () => {
    const text: ProtokollKnoten = { type: 'paragraph', content: [{ type: 'text', text: 'a' }] };
    expect(ohneLeereEnden([text, { type: 'paragraph' }, { type: 'paragraph' }])).toEqual([text]);
    expect(
      istQuellenzeile({ type: 'paragraph', content: [{ type: 'text', text: '– Strobi' }] }),
    ).toBe(true);
    expect(istQuellenzeile(text)).toBe(false);
  });

  it('drops lists that only hold empty items, keeps lists with text', () => {
    const text: ProtokollKnoten = { type: 'paragraph', content: [{ type: 'text', text: 'a' }] };
    const leer = (type: string): ProtokollKnoten => ({
      type,
      content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
    });
    const voll: ProtokollKnoten = {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [text] }],
    };
    expect(ohneLeereEnden([leer('bulletList')])).toEqual([]);
    expect(ohneLeereEnden([leer('orderedList')])).toEqual([]);
    expect(ohneLeereEnden([leer('bulletList'), text])).toEqual([text]);
    expect(ohneLeereEnden([text, leer('bulletList'), { type: 'paragraph' }])).toEqual([text]);
    expect(ohneLeereEnden([voll, leer('bulletList')])).toEqual([voll]);
    expect(ohneLeereEnden([voll])).toEqual([voll]);
  });

  it('mitLiveKopf applies overrides only to drafts', () => {
    const t = [m('1', 'leo', 'anwesend')];
    const kopf = { ...protokollKopfLeer(), teilnahme: { '1': 'entschuldigt' as const } };
    expect(mitLiveKopf({ teilnahme: t, ems: [], status: 'entwurf' }, kopf).teilnahme[0]?.wert).toBe(
      'entschuldigt',
    );
    expect(
      mitLiveKopf({ teilnahme: t, ems: [], status: 'abgeschlossen' }, kopf).teilnahme[0]?.wert,
    ).toBe('anwesend');
  });
});

describe('naechsteSitzung', () => {
  const vorschlag = { eventId: 'e9', titel: 'Sitzung', beginn: '2026-11-10T19:00:00.000Z' };

  it('takes the calendar suggestion while automatic (Berlin time)', () => {
    const w = naechsteSitzungWert(protokollKopfLeer(), vorschlag);
    expect(w).toEqual({ eventId: 'e9', datum: '2026-11-10', uhrzeit: '20:00' });
    expect(naechsteSitzungSatz(w)).toBe(
      'Die nächste Sitzung findet am Dienstag, 10.11.2026 um 20:00 Uhr statt.',
    );
    expect(naechsteSitzungWert(protokollKopfLeer(), null)).toBeNull();
    expect(naechsteSitzungSatz(null)).toBeNull();
  });

  it('lets the override win and leaves out an unknown time or date', () => {
    const kopf = (datum: string, uhrzeit: string) => ({
      ...protokollKopfLeer(),
      naechsteSitzung: { eventId: null, datum, uhrzeit },
    });
    expect(naechsteSitzungSatz(naechsteSitzungWert(kopf('2026-12-01', ''), vorschlag))).toBe(
      'Die nächste Sitzung findet am Dienstag, 01.12.2026 statt.',
    );
    expect(naechsteSitzungSatz(naechsteSitzungWert(kopf('2026-12-02', '19:30'), vorschlag))).toBe(
      'Die nächste Sitzung findet am Mittwoch, 02.12.2026 um 19:30 Uhr statt.',
    );
    expect(naechsteSitzungWert(kopf('', ''), vorschlag)).toBeNull();
  });
});

describe('wahlZeilen, single seat', () => {
  it('shows no seat count for a single seat', () => {
    expect(
      wahlZeilen({ ...bausteinLeer('bausteinWahl'), posten: 'Kasse' }, undefined)?.plaetze,
    ).toBe('');
  });
});

describe('druckTitel', () => {
  it('builds "YYYY-MM-DD_Sitzungsname" with the Berlin date', () => {
    expect(druckTitel({ titel: 'Clubsitzung', beginn: '2024-01-30T18:00:00.000Z' })).toBe(
      '2024-01-30_Clubsitzung',
    );
    // 23:30 UTC is already the next day in Berlin.
    expect(druckTitel({ titel: 'MV', beginn: '2026-11-04T23:30:00.000Z' })).toBe('2026-11-05_MV');
  });
  it('drops a trailing dot', () => {
    expect(druckTitel({ titel: 'Sitzung 04.11.', beginn: '2026-11-04T18:00:00.000Z' })).toBe(
      '2026-11-04_Sitzung 04.11',
    );
  });
  it('drops characters not allowed in file names', () => {
    expect(
      druckTitel({ titel: 'Sitzung 04/11: Teil 2?', beginn: '2026-11-04T18:00:00.000Z' }),
    ).toBe('2026-11-04_Sitzung 0411 Teil 2');
  });
});
