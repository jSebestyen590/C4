import type { DienstPlan, EventEingabe, ProtokollAktion, SchichtDto } from '@c4/shared';
import { describe, expect, it, vi } from 'vitest';
import { KalenderKonflikt } from './kalender';
import { createProtokollAktionen, type AktionenDeps } from './protokollAktionen';

const BEGINN = '2026-12-05T18:00:00.000Z';
const ENDE = '2026-12-05T21:00:00.000Z';

const schicht = (id: string, subs: string[] = []): SchichtDto => ({
  id,
  art: 'betrieb',
  beginn: BEGINN,
  ende: ENDE,
  bedarfe: [{ dienstformId: 'bar', minimum: 1, wunsch: 2 }],
  minimum: null,
  wunsch: null,
  dienste: subs.map((sub, i) => ({
    id: `d${i}`,
    dienstformId: 'bar',
    kommentar: null,
    eingetragenVon: 'v',
    person: {
      art: 'mitglied' as const,
      sub,
      username: sub,
      vorname: 'V',
      nachname: 'N',
      status: 'mitglied' as const,
      anrede: 'neutral' as const,
    },
  })),
});

const dienst = (sub: string): DienstPlan => ({
  art: 'betrieb',
  beginn: BEGINN,
  ende: ENDE,
  dienstformId: 'bar',
  sub,
});

const eingabe = {} as EventEingabe;

function aufbau(
  schichten: SchichtDto[],
  dienstEintragen = vi.fn(async () => ({ id: 'neu', absageAufgehoben: false })),
) {
  const kalender = {
    event: vi.fn(async () => ({ id: 'e1', schichten })),
    eventAnlegen: vi.fn(async () => 'e1'),
    eventAktualisieren: vi.fn(async () => ({ geaendert: true })),
    dienstEintragen,
  };
  const laeufer = createProtokollAktionen({ kalender } as unknown as AktionenDeps);
  const aktion = (plan: ProtokollAktion['plan']): ProtokollAktion => ({
    id: 'b1:event.anlegen',
    bausteinId: 'b1',
    art: plan?.art === 'event.aendern' ? 'event.aendern' : 'event.anlegen',
    text: 'Event',
    ausfuehrbar: true,
    erledigt: false,
    eventId: null,
    subs: [],
    plan,
  });
  return { kalender, laeufer, aktion };
}

describe('Dienste eintragen (event.anlegen / event.aendern)', () => {
  it('enters the persons of a new event into the matching Schicht', async () => {
    const { kalender, laeufer, aktion } = aufbau([schicht('s1')]);
    const a = aktion({ art: 'event.anlegen', eingabe, dienste: [dienst('a'), dienst('b')] });
    const r = await laeufer.laufen([a], [a.id], 'v');
    expect(r.ausgaenge[0]).toMatchObject({ status: 'erledigt' });
    expect(r.ausgaenge[0]!.meldung).toContain('2 Dienste eingetragen');
    expect(kalender.dienstEintragen).toHaveBeenCalledTimes(2);
    expect(kalender.dienstEintragen).toHaveBeenCalledWith(
      's1',
      { kommentar: null, mitgliedSub: 'a', dienstformId: 'bar' },
      'v',
    );
    expect(r.patches).toEqual([{ bausteinId: 'b1', feld: 'eventId', wert: 'e1' }]);
  });

  it('adds only the missing persons when changing an event (idempotent)', async () => {
    const { kalender, laeufer, aktion } = aufbau([schicht('s1', ['a'])]);
    const a = aktion({
      art: 'event.aendern',
      eventId: 'e1',
      eingabe,
      dienste: [dienst('a'), dienst('b')],
    });
    const r = await laeufer.laufen([a], [a.id], 'v');
    expect(r.ausgaenge[0]).toMatchObject({ status: 'erledigt' });
    expect(kalender.dienstEintragen).toHaveBeenCalledTimes(1);
    expect(kalender.dienstEintragen).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ mitgliedSub: 'b' }),
      'v',
    );
    // Everybody there already: nothing to enter.
    const { kalender: k2, laeufer: l2, aktion: a2 } = aufbau([schicht('s1', ['a', 'b'])]);
    const b = a2({
      art: 'event.aendern',
      eventId: 'e1',
      eingabe,
      dienste: [dienst('a'), dienst('b')],
    });
    await l2.laufen([b], [b.id], 'v');
    expect(k2.dienstEintragen).not.toHaveBeenCalled();
  });

  it('fails with a hint when single entries fail, but still tries the others', async () => {
    const eintragen = vi.fn(async (_id: string, d: { mitgliedSub?: string }) => {
      if (d.mitgliedSub === 'a') throw new KalenderKonflikt('Die Person ist abwesend.');
      return { id: 'neu', absageAufgehoben: false };
    });
    const { kalender, laeufer, aktion } = aufbau([schicht('s1')], eintragen as never);
    const a = aktion({ art: 'event.anlegen', eingabe, dienste: [dienst('a'), dienst('b')] });
    const r = await laeufer.laufen([a], [a.id], 'v');
    expect(r.ausgaenge[0]).toMatchObject({ status: 'fehler' });
    expect(r.ausgaenge[0]!.meldung).toContain('1 von 2 Diensten');
    expect(r.ausgaenge[0]!.meldung).toContain('Die Person ist abwesend.');
    expect(kalender.dienstEintragen).toHaveBeenCalledTimes(2);
    // The event exists: its id is still written back, so the next run changes it instead of creating it.
    expect(r.patches).toEqual([{ bausteinId: 'b1', feld: 'eventId', wert: 'e1' }]);
  });

  it('reports a Schicht that is missing in the event', async () => {
    const { laeufer, aktion } = aufbau([]);
    const a = aktion({ art: 'event.anlegen', eingabe, dienste: [dienst('a')] });
    const r = await laeufer.laufen([a], [a.id], 'v');
    expect(r.ausgaenge[0]).toMatchObject({ status: 'fehler' });
    expect(r.ausgaenge[0]!.meldung).toContain('Die Schicht gibt es im Event nicht.');
  });
});
