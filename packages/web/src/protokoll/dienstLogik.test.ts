import { describe, expect, it } from 'vitest';
import { bausteinEventDatenSchema, bausteinLeer, type BausteinEventDaten } from '@c4/shared';
import { dienstEintragen, eventZeiten, zeitspanneParsen } from './bausteinLogik';
import { dienstEintraege } from './slashLogik';

const event = (patch: Partial<BausteinEventDaten> = {}): BausteinEventDaten => ({
  ...bausteinLeer('bausteinEvent'),
  name: 'Barabend',
  beginnZeit: '20:00',
  endeZeit: '04:00',
  ...patch,
});

describe('zeitspanneParsen', () => {
  it('reads spans in several spellings', () => {
    const erwartet = { beginnZeit: '18:00', endeZeit: '22:00' };
    for (const t of ['18-22', '18:00-22:00', '18 - 22', '18.00–22.00', '1800-2200', '18 bis 22']) {
      expect(zeitspanneParsen(t), t).toEqual(erwartet);
    }
    expect(zeitspanneParsen('8-9:30')).toEqual({ beginnZeit: '08:00', endeZeit: '09:30' });
  });
  it('rejects what is no span', () => {
    for (const t of ['', '18', '18-', '25-26', '18:60-22', 'abc', '18-22-23']) {
      expect(zeitspanneParsen(t), t).toBeNull();
    }
  });
});

describe('eventZeiten', () => {
  it('uses the times of the event, else 18:00-22:00', () => {
    expect(eventZeiten(event())).toEqual({ beginnZeit: '20:00', endeZeit: '04:00' });
    expect(eventZeiten(event({ beginnZeit: null, endeZeit: null }))).toEqual({
      beginnZeit: '18:00',
      endeZeit: '22:00',
    });
  });
});

describe('dienstEintragen', () => {
  const bar = (zeiten: ReturnType<typeof eventZeiten> | null = null) => ({
    zeiten,
    dienst: 'bar',
  });

  it('creates a Betrieb Schicht with the Bedarf and the person (head count = 1)', () => {
    const neu = dienstEintragen(event(), { ...bar(), sub: 'anna' })!;
    expect(neu.schichten).toEqual([
      {
        art: 'betrieb',
        beginnZeit: '20:00',
        endeZeit: '04:00',
        bedarfe: [{ dienstformId: 'bar', minimum: 1, wunsch: 1, personen: ['anna'] }],
      },
    ]);
    expect(bausteinEventDatenSchema.safeParse(neu).success).toBe(true);
  });
  it('enters a Dienst without a person', () => {
    const neu = dienstEintragen(event(), {
      ...bar({ beginnZeit: '18:00', endeZeit: '22:30' }),
      sub: null,
    })!;
    expect(neu.schichten[0]).toMatchObject({ beginnZeit: '18:00', endeZeit: '22:30' });
    expect(neu.schichten[0]).toMatchObject({ bedarfe: [{ dienstformId: 'bar', personen: [] }] });
  });
  it('finds the Schicht with exactly these times and adds the person; the head count follows', () => {
    let d = event();
    d = dienstEintragen(d, { ...bar(), sub: 'anna' })!;
    d = dienstEintragen(d, { ...bar(), sub: 'julia' })!;
    d = dienstEintragen(d, { ...bar(), sub: 'julia' })!;
    expect(d.schichten).toHaveLength(1);
    expect(d.schichten[0]).toMatchObject({
      bedarfe: [{ dienstformId: 'bar', minimum: 2, wunsch: 2, personen: ['anna', 'julia'] }],
    });
  });
  it('adds a second Dienstform to the same Schicht, other times make a new Schicht', () => {
    let d = event();
    d = dienstEintragen(d, { ...bar(), sub: 'anna' })!;
    d = dienstEintragen(d, { zeiten: null, dienst: 'kasse', sub: 'emil' })!;
    expect(d.schichten).toHaveLength(1);
    expect(d.schichten[0]).toMatchObject({
      bedarfe: [{ dienstformId: 'bar' }, { dienstformId: 'kasse', personen: ['emil'] }],
    });
    d = dienstEintragen(d, { ...bar({ beginnZeit: '18:00', endeZeit: '20:00' }), sub: null })!;
    expect(d.schichten).toHaveLength(2);
  });
  it('keeps a bigger head count of an existing Bedarf', () => {
    const d = event({
      schichten: [
        {
          art: 'betrieb',
          beginnZeit: '20:00',
          endeZeit: '04:00',
          bedarfe: [{ dienstformId: 'bar', minimum: 2, wunsch: 4, personen: [] }],
        },
      ],
    });
    const neu = dienstEintragen(d, { ...bar(), sub: 'anna' })!;
    expect(neu.schichten[0]).toMatchObject({
      bedarfe: [{ minimum: 2, wunsch: 4, personen: ['anna'] }],
    });
  });
  it('creates Aufbau and Putzen Schichten with the persons', () => {
    let d = dienstEintragen(event(), {
      zeiten: { beginnZeit: '16:00', endeZeit: '18:00' },
      dienst: 'aufbau',
      sub: 'anna',
    })!;
    d = dienstEintragen(d, {
      zeiten: { beginnZeit: '16:00', endeZeit: '18:00' },
      dienst: 'aufbau',
      sub: 'julia',
    })!;
    expect(d.schichten).toEqual([
      {
        art: 'aufbau',
        beginnZeit: '16:00',
        endeZeit: '18:00',
        tagVersatz: 0,
        minimum: 2,
        wunsch: 2,
        personen: ['anna', 'julia'],
      },
    ]);
    expect(bausteinEventDatenSchema.safeParse(d).success).toBe(true);
  });
  it('gives up when no Schicht fits any more', () => {
    const voll = event({
      schichten: Array.from({ length: 20 }, (_, i) => ({
        art: 'putzen' as const,
        beginnZeit: '10:00',
        endeZeit: `${String(i).padStart(2, '0')}:30`,
        tagVersatz: 1,
        minimum: 1,
        wunsch: 1,
        personen: [],
      })),
    });
    expect(dienstEintragen(voll, { ...bar(), sub: null })).toBeNull();
  });
});

describe('dienstEintragen mit Zahlen', () => {
  const bar = { zeiten: null, dienst: 'bar', sub: null } as const;
  it('uses typed counts (minimum = wunsch, or min/wunsch)', () => {
    const a = dienstEintragen(event(), { ...bar, minimum: 2 })!;
    expect(a.schichten[0]).toMatchObject({ bedarfe: [{ minimum: 2, wunsch: 2 }] });
    const b = dienstEintragen(event(), { ...bar, minimum: 2, wunsch: 3, sub: 'anna' })!;
    expect(b.schichten[0]).toMatchObject({
      bedarfe: [{ minimum: 2, wunsch: 3, personen: ['anna'] }],
    });
  });
  it('keeps wunsch >= minimum and >= head count, and betrieb minimum >= 1', () => {
    const a = dienstEintragen(event(), { ...bar, minimum: 3, wunsch: 1 })!;
    expect(a.schichten[0]).toMatchObject({ bedarfe: [{ minimum: 3, wunsch: 3 }] });
    const b = dienstEintragen(event(), { ...bar, minimum: 0 })!;
    expect(b.schichten[0]).toMatchObject({ bedarfe: [{ minimum: 1, wunsch: 1 }] });
    let d = dienstEintragen(event(), { ...bar, sub: 'a', minimum: 1 })!;
    d = dienstEintragen(d, { ...bar, sub: 'b', minimum: 1 })!;
    expect(d.schichten[0]).toMatchObject({ bedarfe: [{ minimum: 1, wunsch: 2 }] });
  });
});

describe('dienstEintraege', () => {
  const formen = [{ id: 'bar', name: 'Bar' }];
  const personen = [
    { sub: 'a', titel: 'Anna', beschreibung: '', extern: false, mitglied: true, da: true },
    { sub: 'b', titel: 'Ben', beschreibung: '', extern: false, mitglied: true, da: true },
  ];
  const titel = (r: string, e = event()) =>
    dienstEintraege(r, e, formen, personen as never).map((x) => x.titel);

  it('offers Schicht times and a hint while the time does not parse', () => {
    const e = dienstEintragen(event(), {
      zeiten: { beginnZeit: '18:00', endeZeit: '22:00' },
      dienst: 'bar',
      sub: null,
    })!;
    expect(titel('', e)).toEqual(['Gesamt (Eventzeit)', '18:00–22:00']);
    expect(titel('18', e)).toContain('Uhrzeit eingeben');
    expect(titel('18-22', e)).not.toContain('Uhrzeit eingeben');
  });
  it('reads counts after the Dienst name', () => {
    const t = dienstEintraege('gesamt › bar 2/3', event(), formen, [])[0]!;
    expect(t.titel).toBe('Bar · min. 2, Wunsch 3');
    expect((t.aktion as { text: string }).text).toBe('dienst gesamt › bar 2/3 › ');
    const p = dienstEintraege('gesamt › bar 2 › ', event(), formen, personen as never);
    expect(p[1]!.aktion).toMatchObject({
      art: 'dienst',
      eingabe: { dienst: 'bar', sub: 'a', minimum: 2 },
      weiter: 'dienst gesamt › bar 2 › ',
    });
  });
  it('hides chosen persons, offers Fertig and no Ohne Personen once someone is in', () => {
    expect(titel('gesamt › bar › ')).toEqual(['Ohne Personen', 'Anna', 'Ben']);
    const e = dienstEintragen(event(), { zeiten: null, dienst: 'bar', sub: 'a' })!;
    expect(titel('gesamt › bar › ', e)).toEqual(['Fertig', 'Ben']);
    expect(titel('gesamt › bar › b', e)).toEqual(['Ben']);
  });
});
