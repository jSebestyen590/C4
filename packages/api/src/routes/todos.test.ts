import { describe, expect, it } from 'vitest';
import { type Todo } from '@c4/shared';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('todos', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const eingabe = { titel: ' Kasse prüfen ', notizen: 'Beleg holen', faelligAm: '2026-11-14' };

  /** App with profiles for a, r, v, m2 (usernames = sub). */
  async function setup() {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map(
        ['a', 'r', 'v', 'm2'].map((sub) => [
          sub,
          { sub, kontoName: sub, username: `user-${sub}`, aktiviert: true, enabled: true },
        ]),
      ),
    );
    for (const sub of ['a', 'r', 'v', 'm2']) {
      await t.mitglieder.speichern(sub, {
        vorname: 'A',
        nachname: 'B',
        anrede: 'neutral',
        kontaktkanaele: null,
        discordName: null,
        adresse: null,
        telefon: null,
        ueberMich: null,
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: null,
        wohnheim: null,
      });
    }
    const liste = async (token: string) =>
      (await (await t.app.request('/api/me/todos', json(token, 'GET'))).json()) as Todo[];
    const anlegen = async (token: string, body: unknown = eingabe) => {
      const res = await t.app.request('/api/me/todos', json(token, 'POST', body));
      return { res, todo: (await res.clone().json()) as Todo };
    };
    const abhaken = (token: string, id: string, erledigt: boolean) =>
      t.app.request(`/api/me/todos/${id}/erledigt`, json(token, 'PUT', { erledigt }));
    /** A Todo from a protocol for the given people. */
    const ausProtokoll = (modus: 'gemeinsam' | 'einzeln', subs: string[], extra = {}) =>
      t.todos.anlegen({
        titel: 'Aus Sitzung',
        notizen: null,
        faelligAm: '2026-11-20',
        modus,
        protokollId: 'p1',
        bausteinId: 'b1',
        erstelltVon: 'v',
        subs,
        ...extra,
      });
    return { ...t, liste, anlegen, abhaken, ausProtokoll };
  }

  it('needs a signed-in member', async () => {
    const t = await setup();
    expect((await t.app.request('/api/me/todos')).status).toBe(401);
  });

  it('creates an own Todo for the member only, in mode einzeln', async () => {
    const t = await setup();
    const { res, todo } = await t.anlegen('member-token');
    expect(res.status).toBe(201);
    expect(todo).toMatchObject({
      titel: 'Kasse prüfen',
      notizen: 'Beleg holen',
      faelligAm: '2026-11-14',
      modus: 'einzeln',
      quelle: null,
      erledigtAm: null,
      erledigtVon: null,
      ichErledigt: false,
      bearbeitbar: true,
      zustaendige: [{ sub: 'm2', username: 'user-m2', status: 'anwaerter', erledigtAm: null }],
    });
    expect(await t.liste('member-token')).toHaveLength(1);
    expect(await t.liste('reader-token')).toEqual([]);
    expect([...t.todosListe.values()][0]).toMatchObject({ erstelltVon: 'm2', protokollId: null });
  });

  it('validates the input', async () => {
    const t = await setup();
    for (const body of [
      { ...eingabe, titel: '  ' },
      { ...eingabe, titel: 'x'.repeat(201) },
      { ...eingabe, faelligAm: '14.11.2026' },
      { ...eingabe, notizen: 'x'.repeat(2001) },
      { titel: 'x' },
    ]) {
      expect((await t.anlegen('member-token', body)).res.status).toBe(400);
    }
    expect(
      (await t.anlegen('member-token', { titel: 'x', faelligAm: '2026-11-14' })).res.status,
    ).toBe(201);
  });

  it('lists the Todos of the member, open ones first by deadline, then done ones', async () => {
    const t = await setup();
    const spaet = (
      await t.anlegen('member-token', { ...eingabe, titel: 'spät', faelligAm: '2026-12-01' })
    ).todo;
    const frueh = (
      await t.anlegen('member-token', { ...eingabe, titel: 'früh', faelligAm: '2026-11-10' })
    ).todo;
    const fertig = (
      await t.anlegen('member-token', { ...eingabe, titel: 'fertig', faelligAm: '2026-11-01' })
    ).todo;
    await t.ausProtokoll('einzeln', ['r']);
    await t.abhaken('member-token', fertig.id, true);
    const liste = await t.liste('member-token');
    expect(liste.map((x) => [x.titel, x.ichErledigt])).toEqual([
      ['früh', false],
      ['spät', false],
      ['fertig', true],
    ]);
    expect([frueh.id, spaet.id, fertig.id]).toHaveLength(3);
  });

  it('shows the source of a Todo from a protocol and does not let it be changed', async () => {
    const t = await setup();
    t.kalender.eventsKurz.mockResolvedValue([
      {
        id: 's1',
        titel: 'Sitzung',
        beginn: '2026-11-04T18:00:00.000Z',
        ende: '2026-11-04T20:00:00.000Z',
        abgesagt: false,
        kategorie: null,
        protokoll: true,
        protokollArt: 'sitzung',
      },
    ]);
    t.protokollListe.set('p1', {
      id: 'p1',
      eventId: 's1',
      status: 'abgeschlossen',
      version: 2,
      erstelltVon: 'v',
      erstelltAm: new Date('2026-11-01T10:00:00Z'),
      geaendertVon: 'v',
      geaendertAm: new Date('2026-11-04T21:00:00Z'),
    } as never);
    const id = await t.ausProtokoll('einzeln', ['m2', 'r']);
    const [todo] = await t.liste('member-token');
    expect(todo).toMatchObject({
      id,
      bearbeitbar: false,
      quelle: { protokollId: 'p1', eventName: 'Sitzung', datum: '2026-11-04' },
      zustaendige: [{ sub: 'm2' }, { sub: 'r' }],
    });
    const put = await t.app.request(`/api/me/todos/${id}`, json('member-token', 'PUT', eingabe));
    expect(put.status).toBe(403);
    expect(((await put.json()) as { error: string }).error).toBe(
      'Dieses Todo kannst du nicht ändern.',
    );
    expect(
      (await t.app.request(`/api/me/todos/${id}`, json('member-token', 'DELETE'))).status,
    ).toBe(403);
    // Not even the member who closed the protocol (its creator) may.
    expect(
      (await t.app.request(`/api/me/todos/${id}`, json('vorstand-token', 'DELETE'))).status,
    ).toBe(403);
  });

  it('edits and deletes only own Todos', async () => {
    const t = await setup();
    const { todo } = await t.anlegen('member-token');
    const neu = { titel: 'Anders', notizen: '', faelligAm: '2026-12-24' };
    const put = await t.app.request(`/api/me/todos/${todo.id}`, json('member-token', 'PUT', neu));
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({
      id: todo.id,
      titel: 'Anders',
      notizen: null,
      faelligAm: '2026-12-24',
    });
    // Others do not see it at all.
    expect(
      (await t.app.request(`/api/me/todos/${todo.id}`, json('reader-token', 'PUT', neu))).status,
    ).toBe(404);
    expect(
      (await t.app.request(`/api/me/todos/${todo.id}`, json('reader-token', 'DELETE'))).status,
    ).toBe(404);
    // Zuständig but created by somebody else: visible, not editable.
    const fremd = await t.ausProtokoll('einzeln', ['r'], { protokollId: null, erstelltVon: 'a' });
    expect(
      (await t.app.request(`/api/me/todos/${fremd}`, json('reader-token', 'DELETE'))).status,
    ).toBe(403);
    expect(
      (await t.app.request('/api/me/todos/gibtsnicht', json('member-token', 'PUT', neu))).status,
    ).toBe(404);
    expect(
      (await t.app.request(`/api/me/todos/${todo.id}`, json('member-token', 'DELETE'))).status,
    ).toBe(200);
    expect(await t.liste('member-token')).toEqual([]);
  });

  it('ticks a gemeinsam Todo for everybody and unticks it again', async () => {
    const t = await setup();
    const id = await t.ausProtokoll('gemeinsam', ['m2', 'r']);
    const hakt = await t.abhaken('member-token', id, true);
    expect(hakt.status).toBe(200);
    expect(await hakt.json()).toMatchObject({
      ichErledigt: true,
      erledigtVon: 'm2',
      erledigtAm: expect.any(String),
    });
    expect((await t.liste('reader-token'))[0]).toMatchObject({
      ichErledigt: true,
      erledigtVon: 'm2',
      zustaendige: [{ erledigtAm: null }, { erledigtAm: null }],
    });
    // Anybody zuständig can take the tick back.
    const zurueck = await t.abhaken('reader-token', id, false);
    expect(await zurueck.json()).toMatchObject({
      ichErledigt: false,
      erledigtAm: null,
      erledigtVon: null,
    });
    expect((await t.liste('member-token'))[0]!.ichErledigt).toBe(false);
  });

  it('ticks an einzeln Todo for the member only', async () => {
    const t = await setup();
    const id = await t.ausProtokoll('einzeln', ['m2', 'r']);
    await t.abhaken('member-token', id, true);
    const meins = (await t.liste('member-token'))[0]!;
    expect(meins).toMatchObject({ ichErledigt: true, erledigtAm: null });
    expect(meins.zustaendige.map((z) => [z.sub, z.erledigtAm !== null])).toEqual([
      ['m2', true],
      ['r', false],
    ]);
    expect((await t.liste('reader-token'))[0]!.ichErledigt).toBe(false);
    const zurueck = await t.abhaken('member-token', id, false);
    expect(await zurueck.json()).toMatchObject({ ichErledigt: false });
    expect(
      (await t.liste('member-token'))[0]!.zustaendige.every((z) => z.erledigtAm === null),
    ).toBe(true);
  });

  it('lets only people who are zuständig tick', async () => {
    const t = await setup();
    const id = await t.ausProtokoll('gemeinsam', ['r']);
    const res = await t.abhaken('member-token', id, true);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe(
      'Du bist für dieses Todo nicht zuständig.',
    );
    expect((await t.abhaken('member-token', 'gibtsnicht', true)).status).toBe(404);
    expect(
      (await t.app.request(`/api/me/todos/${id}/erledigt`, json('reader-token', 'PUT', {}))).status,
    ).toBe(400);
    expect(t.todosListe.get(id)!.erledigtAm).toBeNull();
  });
});
