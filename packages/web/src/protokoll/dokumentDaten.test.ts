import { describe, expect, it } from 'vitest';
import { protokollKopfLeer, type ProtokollKnoten, type ProtokollKopf } from '@c4/shared';
import {
  anwesenheitZeile,
  beschlussfaehigkeitText,
  aufnahmeZeilen,
  beschlussZeilen,
  meinungsbildZeilen,
  datumLang,
  dokumentKopf,
  dokumentTitel,
  emZeilen,
  eroeffnungSatz,
  istQuellenzeile,
  mitLiveKopf,
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
  it('groups attendance, late arrivals get a time', () => {
    const k = dokumentKopf(eingabe([anw('a', 'erscheint', '2', '21:00')]));
    expect(k.anwesende.map((p) => `${p.name} ${p.zusatz}`.trim())).toEqual([
      'leo',
      'julia (21:00 Uhr)',
    ]);
    expect(k.entschuldigt.map((p) => p.name)).toEqual(['V3 N3', 'strobi']);
    expect(k.unentschuldigt.map((p) => p.name)).toEqual(['ida']);
    expect(k.anwaerter.map((p) => p.name)).toEqual(['arne']);
  });

  it('prefers the Kopf time, falls back to "(verspätet)"', () => {
    expect(dokumentKopf(eingabe([], { verspaetung: { '2': '20:30' } })).anwesende[1]?.zusatz).toBe(
      '(20:30 Uhr)',
    );
    expect(dokumentKopf(eingabe()).anwesende[1]?.zusatz).toBe('(verspätet)');
  });

  it('counts an absent member with an erscheint block as present', () => {
    const k = dokumentKopf(eingabe([anw('a', 'erscheint', '5', '22:00')]));
    expect(k.anwesende.map((p) => p.name)).toContain('strobi');
    expect(k.entschuldigt.map((p) => p.name)).not.toContain('strobi');
    expect(k.anwesende.find((p) => p.name === 'strobi')?.zusatz).toBe('(22:00 Uhr)');
  });

  it('resolves Sitzungsleitung and Protokoll, quorum from the opening', () => {
    const k = dokumentKopf(eingabe([], { sitzungsleitung: '1', protokollfuehrung: '999' }));
    expect(k.leitung?.name).toBe('leo');
    expect(k.protokoll).toBeNull();
    expect(k.beschlussfaehigkeit).toMatchObject({ gesamt: 5, anwesend: 1, mindestens: 3 });
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
      name: '',
      sub: 'a',
      stimmen: 'Ja 8 · Nein 3 · Enthaltung 2 – angenommen',
      anwesend: '(13 von 25 Mitgliedern anwesend)',
      nichtBeschlussfaehig: false,
    });
    const nicht = { ...stand, anwesend: 10, beschlussfaehig: false };
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

  it('Neues EM lines', () => {
    const stand = { gesamt: 25, anwesend: 13, mindestens: 13, beschlussfaehig: true };
    const abstimmung = { ja: 8, nein: 3, enthaltung: 2, ergebnis: 'angenommen' };
    expect(emZeilen({ sub: 'a', name: '', abstimmung }, stand)).toEqual({
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
