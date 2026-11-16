import { describe, expect, it, vi } from 'vitest';
import { type Konto } from '../admin';
import { type MitgliedRow } from '../db/schema';
import {
  EntfernungBestaetigen,
  KalenderKonflikt,
  VerfuegbarkeitBestaetigen,
  KalenderUngueltig,
  SerieBetroffen,
  tokenHash,
  type DienstInfo,
} from '../kalender';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('kalender', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const eventBody = {
    titel: 'Offener Abend',
    kategorieId: 'k1',
    beginn: '2026-06-05T17:00:00.000Z',
    ende: '2026-06-05T23:00:00.000Z',
    schichten: [],
  };
  const dienstInfo = (patch: Partial<DienstInfo>): DienstInfo => ({
    id: 'd1',
    schichtId: 's1',
    schichtArt: 'betrieb',
    schichtBeginn: '2026-06-05T17:00:00.000Z',
    schichtEnde: '2026-06-05T21:00:00.000Z',
    eventId: 'e1',
    eventTitel: 'Offener Abend',
    eventBeginn: '2026-06-05T17:00:00.000Z',
    abgesagt: false,
    dienstformId: 'f1',
    mitgliedSub: null,
    externId: null,
    eingetragenVon: 'm2',
    ...patch,
  });
  /** Gives every caller a profile row, which entering Dienste and Externe requires. */
  const mitProfil = (app: ReturnType<typeof makeApp>) =>
    app.mitglieder.holen.mockImplementation(
      async (sub: string) =>
        ({ sub, vorname: 'A', nachname: 'B', status: 'mitglied' }) as MitgliedRow,
    );

  it('lets everyone read, but only Verwalter and Einrichter write', async () => {
    const t = makeApp();
    for (const url of [
      '/api/kalender/events?von=2026-06-01&bis=2026-06-30',
      '/api/kalender/externe',
      '/api/kalender/dienstformen',
      '/api/kalender/kategorien',
      '/api/kalender/vorlagen',
      '/api/kalender/serien',
      '/api/kalender/erinnerungen',
      '/api/kalender/statistik?jahr=2026',
    ]) {
      expect((await t.app.request(url, json('reader-token', 'GET'))).status, url).toBe(200);
    }
    expect(
      (await t.app.request('/api/kalender/events/e1', json('reader-token', 'GET'))).status,
    ).toBe(404);
    for (const [url, method] of [
      ['/api/kalender/events', 'POST'],
      ['/api/kalender/events/e1', 'PUT'],
      ['/api/kalender/events/e1', 'DELETE'],
      ['/api/kalender/events/e1/absage', 'PUT'],
      ['/api/kalender/externe/x1', 'PUT'],
      ['/api/kalender/externe/zusammenfuehren', 'POST'],
      ['/api/kalender/dienstformen', 'POST'],
      ['/api/kalender/dienstformen/f1', 'PUT'],
      ['/api/kalender/kategorien', 'POST'],
      ['/api/kalender/kategorien/k1', 'PUT'],
      ['/api/kalender/vorlagen', 'POST'],
      ['/api/kalender/vorlagen/v1', 'PUT'],
      ['/api/kalender/vorlagen/v1', 'DELETE'],
      ['/api/kalender/serien', 'POST'],
      ['/api/kalender/serien/plenum', 'PUT'],
      ['/api/kalender/serien/plenum/aktiv', 'PUT'],
      ['/api/kalender/serien/plenum', 'DELETE'],
      ['/api/kalender/erinnerungen', 'PUT'],
    ] as const) {
      const res = await t.app.request(url, json('reader-token', method, {}));
      expect(res.status, `${method} ${url}`).toBe(403);
    }
    expect(t.kalender.eventAnlegen).not.toHaveBeenCalled();
    expect(t.kalender.dienstformAnlegen).not.toHaveBeenCalled();
    expect((await t.app.request('/api/kalender/events')).status).toBe(401);
  });

  it('creates events for Verwalter and rejects invalid input', async () => {
    const t = makeApp();
    const post = (token: string, body: unknown) =>
      t.app.request('/api/kalender/events', json(token, 'POST', body));
    const ok = await post('vorstand-token', eventBody);
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ id: 'e1' });
    expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
      expect.objectContaining({ titel: 'Offener Abend', kategorieId: 'k1' }),
      'v',
    );
    expect((await post('admin-token', eventBody)).status).toBe(201);
    expect((await post('admin-token', { ...eventBody, ende: eventBody.beginn })).status).toBe(400);
    const betrieb = {
      art: 'betrieb',
      beginn: eventBody.beginn,
      ende: eventBody.ende,
      bedarfe: [{ dienstformId: 'f1', minimum: 1, wunsch: 2 }],
    };
    const aufbau = { art: 'aufbau', beginn: eventBody.beginn, ende: eventBody.ende };
    const mitSchicht = (schicht: unknown) => ({ ...eventBody, schichten: [schicht] });
    expect((await post('admin-token', mitSchicht(betrieb))).status).toBe(201);
    expect(
      (await post('admin-token', mitSchicht({ ...aufbau, minimum: 0, wunsch: 2 }))).status,
    ).toBe(201);
    // Betrieb without Dienstform or with minimum 0, Aufbau without wish
    expect((await post('admin-token', mitSchicht({ ...betrieb, bedarfe: [] }))).status).toBe(400);
    expect(
      (
        await post(
          'admin-token',
          mitSchicht({ ...betrieb, bedarfe: [{ dienstformId: 'f1', minimum: 0, wunsch: 1 }] }),
        )
      ).status,
    ).toBe(400);
    const ohneWunsch = await post('admin-token', mitSchicht({ ...aufbau, minimum: 0 }));
    expect(ohneWunsch.status).toBe(400);
    t.kalender.eventAnlegen.mockRejectedValueOnce(
      new KalenderUngueltig('Die Kategorie gibt es nicht.'),
    );
    const res = await post('admin-token', eventBody);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Die Kategorie gibt es nicht.' });
  });

  it('requires a Kategorie for events', async () => {
    const t = makeApp();
    const ohne: Record<string, unknown> = { ...eventBody };
    delete ohne.kategorieId;
    for (const body of [ohne, { ...eventBody, kategorieId: '' }]) {
      expect(
        (await t.app.request('/api/kalender/events', json('admin-token', 'POST', body))).status,
      ).toBe(400);
    }
  });

  it('answers 409 with the affected participations when the kind changes', async () => {
    const t = makeApp();
    t.kalender.eventAktualisieren.mockRejectedValueOnce(
      new EntfernungBestaetigen(
        [],
        [
          {
            zustand: 'teilnahme',
            eingeladen: true,
            person: {
              art: 'mitglied',
              sub: 'm2',
              username: null,
              vorname: 'Max',
              nachname: 'Muster',
              status: 'mitglied',
              anrede: 'neutral',
            },
          },
        ],
      ),
    );
    t.userAdmin.konten.mockResolvedValue(new Map([['m2', { username: 'max' } as Konto]]));
    const res = await t.app.request(
      '/api/kalender/events/e1',
      json('admin-token', 'PUT', eventBody),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      betroffene: [],
      teilnahmen: [{ zustand: 'teilnahme', person: { username: 'max' } }],
    });
  });

  it('answers 409 with the affected Dienste when an update needs confirmation', async () => {
    const t = makeApp();
    t.kalender.eventAktualisieren.mockRejectedValueOnce(
      new EntfernungBestaetigen([
        {
          dienstId: 'd1',
          schichtId: 's1',
          schichtArt: 'betrieb',
          schichtBeginn: '2026-06-05T17:00:00.000Z',
          schichtEnde: '2026-06-05T21:00:00.000Z',
          dienstformId: 'f1',
          grund: 'schicht',
          person: {
            art: 'mitglied',
            sub: 'm2',
            username: null,
            vorname: 'Max',
            nachname: 'Muster',
            status: 'mitglied',
            anrede: 'neutral',
          },
        },
      ]),
    );
    t.userAdmin.konten.mockResolvedValue(new Map([['m2', { username: 'max' } as Konto]]));
    const res = await t.app.request(
      '/api/kalender/events/e1',
      json('admin-token', 'PUT', eventBody),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      betroffene: [{ dienstId: 'd1', schichtArt: 'betrieb', person: { username: 'max' } }],
    });
    // Confirmed updates pass `bestaetigt` on to the store.
    const ok = await t.app.request(
      '/api/kalender/events/e1',
      json('admin-token', 'PUT', { ...eventBody, bestaetigt: true }),
    );
    expect(ok.status).toBe(200);
    expect(t.kalender.eventAktualisieren).toHaveBeenLastCalledWith(
      'e1',
      expect.objectContaining({ bestaetigt: true }),
    );
    t.kalender.eventAktualisieren.mockResolvedValueOnce(undefined);
    expect(
      (await t.app.request('/api/kalender/events/nope', json('admin-token', 'PUT', eventBody)))
        .status,
    ).toBe(404);
  });

  it('passes ersetzeSerie on to the store when updating', async () => {
    const t = makeApp();
    const res = await t.app.request(
      '/api/kalender/events/e1',
      json('admin-token', 'PUT', { ...eventBody, ersetzeSerie: true }),
    );
    expect(res.status).toBe(200);
    expect(t.kalender.eventAktualisieren).toHaveBeenLastCalledWith(
      'e1',
      expect.objectContaining({ ersetzeSerie: true }),
    );
    const falsch = await t.app.request(
      '/api/kalender/events/e1',
      json('admin-token', 'PUT', { ...eventBody, ersetzeSerie: 'ja' }),
    );
    expect(falsch.status).toBe(400);
  });

  it('refuses to delete events that Finanzen rows reference, with the message', async () => {
    const t = makeApp();
    const meldung =
      'Zum Event gibt es Buchungen oder Kassenzählungen und es kann nicht gelöscht werden. Sage es stattdessen ab.';
    t.kalender.eventLoeschen.mockRejectedValueOnce(new KalenderKonflikt(meldung));
    const res = await t.app.request('/api/kalender/events/e1', json('admin-token', 'DELETE'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: meldung });
  });

  it('refuses to delete events with Dienste and cancels instead', async () => {
    const t = makeApp();
    t.kalender.eventLoeschen.mockRejectedValueOnce(new KalenderKonflikt('Das Event hat Dienste.'));
    expect(
      (await t.app.request('/api/kalender/events/e1', json('admin-token', 'DELETE'))).status,
    ).toBe(409);
    expect(
      (await t.app.request('/api/kalender/events/e1', json('admin-token', 'DELETE'))).status,
    ).toBe(200);
    t.kalender.eventLoeschen.mockResolvedValueOnce(false);
    expect(
      (await t.app.request('/api/kalender/events/e1', json('admin-token', 'DELETE'))).status,
    ).toBe(404);

    const absage = await t.app.request(
      '/api/kalender/events/e1/absage',
      json('vorstand-token', 'PUT', { abgesagt: true }),
    );
    expect(absage.status).toBe(200);
    expect(t.kalender.absageSetzen).toHaveBeenCalledWith('e1', true);
    expect(
      (await t.app.request('/api/kalender/events/e1/absage', json('admin-token', 'PUT', {})))
        .status,
    ).toBe(400);
  });

  it('lets every member enter themselves, Externe and other members with a profile', async () => {
    const t = makeApp();
    mitProfil(t);
    const post = (token: string, body: unknown) =>
      t.app.request('/api/kalender/schichten/s1/dienste', json(token, 'POST', body));

    expect((await post('member-token', { dienstformId: 'f1' })).status).toBe(201);
    expect(t.kalender.dienstEintragen).toHaveBeenLastCalledWith(
      's1',
      { dienstformId: 'f1', kommentar: null },
      'm2',
    );
    // Entering oneself explicitly is the same as the default.
    expect((await post('member-token', { dienstformId: 'f1', mitgliedSub: 'm2' })).status).toBe(
      201,
    );
    expect((await post('member-token', { dienstformId: 'f1', externId: 'x1' })).status).toBe(201);

    // Others may be entered by anybody (formerly only Verwalter).
    const fremd = await post('member-token', { dienstformId: 'f1', mitgliedSub: 'r' });
    expect(fremd.status).toBe(201);
    expect(t.kalender.dienstEintragen).toHaveBeenLastCalledWith(
      's1',
      { dienstformId: 'f1', kommentar: null, mitgliedSub: 'r' },
      'm2',
    );
    expect(t.kalender.dienstEintragen).toHaveBeenCalledTimes(4);
    // Entering a member who had declared themselves unavailable tells the UI the absage is gone.
    t.kalender.dienstEintragen.mockResolvedValueOnce({ id: 'd-neu', absageAufgehoben: true });
    const aufgehoben = await post('member-token', { dienstformId: 'f1' });
    expect(await aufgehoben.json()).toEqual({ id: 'd-neu', absageAufgehoben: true });
    t.kalender.dienstEintragen.mockResolvedValueOnce({ id: 'd-neu', absageAufgehoben: true });
    const fremdAufgehoben = await post('member-token', { dienstformId: 'f1', mitgliedSub: 'r' });
    expect(await fremdAufgehoben.json()).toEqual({ id: 'd-neu', absageAufgehoben: true });

    expect((await post('vorstand-token', { dienstformId: 'f1', mitgliedSub: 'r' })).status).toBe(
      201,
    );
    expect(t.kalender.dienstEintragen).toHaveBeenLastCalledWith(
      's1',
      { dienstformId: 'f1', kommentar: null, mitgliedSub: 'r' },
      'v',
    );
    expect(
      (await post('admin-token', { dienstformId: 'f1', mitgliedSub: 'r', externId: 'x1' })).status,
    ).toBe(400);
  });

  it('rejects entering a member without a profile row and callers without kalender:lesen', async () => {
    const t = makeApp();
    mitProfil(t);
    t.mitglieder.holen.mockImplementation(async (sub: string) =>
      sub === 'ohne'
        ? undefined
        : ({ sub, vorname: 'A', nachname: 'B', status: 'mitglied' } as MitgliedRow),
    );
    const res = await t.app.request(
      '/api/kalender/schichten/s1/dienste',
      json('member-token', 'POST', { dienstformId: 'f1', mitgliedSub: 'ohne' }),
    );
    expect(res.status).toBe(400);
    expect(t.kalender.dienstEintragen).not.toHaveBeenCalled();
    const ohneToken = await t.app.request('/api/kalender/schichten/s1/dienste', {
      method: 'POST',
    });
    expect(ohneToken.status).toBe(401);
  });

  it('maps the store rules of entering a Dienst to statuses', async () => {
    const t = makeApp();
    mitProfil(t);
    const post = () =>
      t.app.request(
        '/api/kalender/schichten/s1/dienste',
        json('member-token', 'POST', { dienstformId: 'f1' }),
      );
    t.kalender.dienstEintragen.mockRejectedValueOnce(
      new KalenderKonflikt('Das Event ist abgesagt.'),
    );
    expect((await post()).status).toBe(409);
    t.kalender.dienstEintragen.mockRejectedValueOnce(new KalenderUngueltig('Kein Bedarf.'));
    expect((await post()).status).toBe(400);
    t.kalender.dienstEintragen.mockResolvedValueOnce(undefined);
    expect((await post()).status).toBe(404);
  });

  it('requires a profile to enter Dienste or create Externe', async () => {
    const t = makeApp();
    const dienst = await t.app.request(
      '/api/kalender/schichten/s1/dienste',
      json('member-token', 'POST', { dienstformId: 'f1' }),
    );
    expect(dienst.status).toBe(400);
    const extern = await t.app.request(
      '/api/kalender/externe',
      json('member-token', 'POST', { name: 'Eva' }),
    );
    expect(extern.status).toBe(400);
    expect(t.kalender.dienstEintragen).not.toHaveBeenCalled();
    expect(t.kalender.externAnlegen).not.toHaveBeenCalled();
  });

  it('lets everyone create Externe, but archiving needs Einrichten', async () => {
    const t = makeApp();
    mitProfil(t);
    const res = await t.app.request(
      '/api/kalender/externe',
      json('member-token', 'POST', { name: 'Eva', quelle: 'StuK', archiviert: true }),
    );
    expect(res.status).toBe(201);
    expect(t.kalender.externAnlegen).toHaveBeenCalledWith(
      { name: 'Eva', quelle: 'StuK', kontakt: null, archiviert: false },
      'm2',
    );
    const merge = (token: string, body: unknown) =>
      t.app.request('/api/kalender/externe/zusammenfuehren', json(token, 'POST', body));
    expect((await merge('member-token', { zielId: 'x1', quelleIds: ['x2'] })).status).toBe(403);
    const ok = await merge('vorstand-token', { zielId: 'x1', quelleIds: ['x2'] });
    expect(await ok.json()).toEqual({ verschoben: 1, verworfen: 0 });
    expect((await merge('vorstand-token', { zielId: 'x1', quelleIds: ['x1'] })).status).toBe(400);
    expect((await merge('vorstand-token', { zielId: 'x9', quelleIds: ['x2'] })).status).toBe(404);
  });

  it('lets every member remove members, but Externe only the enterer or Verwalter', async () => {
    const t = makeApp();
    const entfernen = (token: string, id: string) =>
      t.app.request(`/api/kalender/dienste/${id}`, json(token, 'DELETE'));
    t.kalenderDienste.set(
      'eigen',
      dienstInfo({ id: 'eigen', mitgliedSub: 'm2', eingetragenVon: 'm2' }),
    );
    t.kalenderDienste.set(
      'fremd',
      dienstInfo({ id: 'fremd', mitgliedSub: 'r', eingetragenVon: 'r' }),
    );
    t.kalenderDienste.set(
      'von-mir',
      dienstInfo({ id: 'von-mir', mitgliedSub: 'r', eingetragenVon: 'm2' }),
    );
    t.kalenderDienste.set(
      'extern',
      dienstInfo({ id: 'extern', externId: 'x1', eingetragenVon: 'm2' }),
    );
    t.kalenderDienste.set(
      'extern2',
      dienstInfo({ id: 'extern2', externId: 'x1', eingetragenVon: 'm2' }),
    );

    expect((await entfernen('reader-token', 'extern')).status).toBe(403);
    expect((await entfernen('member-token', 'fremd')).status).toBe(200);
    expect((await entfernen('member-token', 'von-mir')).status).toBe(200);
    expect((await entfernen('member-token', 'eigen')).status).toBe(200);
    expect((await entfernen('member-token', 'extern')).status).toBe(200);
    expect((await entfernen('vorstand-token', 'extern2')).status).toBe(200);
    expect((await entfernen('vorstand-token', 'fremd')).status).toBe(404);
    expect(t.kalender.dienstEntfernen).toHaveBeenCalledTimes(5);
  });

  it('adds Cognito usernames to events and the Statistik', async () => {
    const t = makeApp();
    const person = {
      art: 'mitglied' as const,
      sub: 'm2',
      username: null,
      vorname: 'Max',
      nachname: 'Muster',
      status: 'mitglied' as const,
      anrede: 'neutral' as const,
    };
    t.userAdmin.konten.mockResolvedValue(new Map([['m2', { username: 'max' } as Konto]]));
    t.kalender.event.mockResolvedValueOnce({
      id: 'e1',
      titel: 'Offener Abend',
      anzeigeTitel: 'Offener Abend',
      beschreibung: null,
      kategorie: null,
      art: 'dienste' as const,
      dauer: 'eintaegig' as const,
      beginn: eventBody.beginn,
      ende: eventBody.ende,
      abgesagt: false,
      serie: null,
      bewertung: 'gruen',
      teilnahmeStatus: null,
      teilnahmen: [],
      ichNehmeTeil: null,
      meineTeilnahme: null,
      nichtVerfuegbar: [],
      ichBinNichtVerfuegbar: false,
      verantwortlich: person,
      imAbo: false,
      bilderOrdnerUrl: null,
      bilderOrdnerId: null,
      schichten: [
        {
          id: 's1',
          art: 'betrieb',
          beginn: eventBody.beginn,
          ende: eventBody.ende,
          bedarfe: [],
          minimum: null,
          wunsch: null,
          dienste: [
            { id: 'd1', dienstformId: 'f1', kommentar: null, eingetragenVon: 'm2', person },
            {
              id: 'd2',
              dienstformId: 'f1',
              kommentar: null,
              eingetragenVon: 'm2',
              person: { art: 'extern', id: 'x1', name: 'Eva', quelle: null },
            },
          ],
        },
      ],
    });
    const res = await t.app.request('/api/kalender/events/e1', json('reader-token', 'GET'));
    const body = (await res.json()) as {
      verantwortlich: unknown;
      schichten: { dienste: { person: unknown }[] }[];
    };
    expect(body.schichten[0]!.dienste[0]!.person).toMatchObject({ username: 'max' });
    expect(body.schichten[0]!.dienste[1]!.person).toMatchObject({ art: 'extern', name: 'Eva' });
    expect(body).toMatchObject({ verantwortlich: { sub: 'm2', username: 'max' } });

    t.kalender.statistik.mockResolvedValueOnce([{ person, gesamt: 2, nachSpalte: { f1: 2 } }]);
    const stat = await t.app.request(
      '/api/kalender/statistik?jahr=2026',
      json('reader-token', 'GET'),
    );
    expect(await stat.json()).toMatchObject({
      jahr: 2026,
      zeilen: [{ person: { username: 'max' } }],
    });
    expect(
      (await t.app.request('/api/kalender/statistik?jahr=abc', json('reader-token', 'GET'))).status,
    ).toBe(400);
    expect(
      (
        await t.app.request(
          '/api/kalender/events?von=2026-07-01&bis=2026-06-01',
          json('reader-token', 'GET'),
        )
      ).status,
    ).toBe(400);
  });

  it('manages Stammdaten for Einrichter', async () => {
    const t = makeApp();
    const form = await t.app.request(
      '/api/kalender/dienstformen',
      json('vorstand-token', 'POST', { name: 'Bar' }),
    );
    expect(form.status).toBe(201);
    expect(t.kalender.dienstformAnlegen).toHaveBeenCalledWith({ name: 'Bar' });
    expect(
      (
        await t.app.request(
          '/api/kalender/dienstformen/f9',
          json('vorstand-token', 'PUT', { name: 'X' }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await t.app.request(
          '/api/kalender/kategorien',
          json('vorstand-token', 'POST', { name: 'Konzert', farbe: 'red', art: 'dienste' }),
        )
      ).status,
    ).toBe(201);
    // Without a kind, or a Teilnahme Kategorie without default circle
    for (const body of [
      { name: 'Konzert', farbe: 'red' },
      { name: 'Plenum', farbe: 'red', art: 'teilnahme' },
    ]) {
      expect(
        (await t.app.request('/api/kalender/kategorien', json('vorstand-token', 'POST', body)))
          .status,
      ).toBe(400);
    }
    const plenum = {
      name: 'Plenum',
      farbe: 'red',
      art: 'teilnahme',
      teilnahmeStatus: ['mitglied'],
    };
    expect(
      (await t.app.request('/api/kalender/kategorien', json('vorstand-token', 'POST', plenum)))
        .status,
    ).toBe(201);
    expect(t.kalender.kategorieAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ art: 'teilnahme', teilnahmeStatus: ['mitglied'] }),
    );
    expect(
      (
        await t.app.request(
          '/api/kalender/kategorien',
          json('vorstand-token', 'POST', { name: 'Konzert' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await t.app.request('/api/kalender/vorlagen/v9', json('vorstand-token', 'DELETE'))).status,
    ).toBe(404);
    expect(
      (await t.app.request('/api/kalender/vorlagen/v1', json('vorstand-token', 'DELETE'))).status,
    ).toBe(200);
  });

  describe('Serien', () => {
    const serie = {
      name: 'Plenum',
      vorlageId: 'v1',
      regel: 'monatlich',
      wochentage: [2],
      wochen: [1],
      startDatum: '2026-11-01',
      endDatum: null,
    };

    it('creates a series and rejects invalid rules', async () => {
      const t = makeApp();
      const post = (body: unknown) =>
        t.app.request('/api/kalender/serien', json('vorstand-token', 'POST', body));
      expect((await post(serie)).status).toBe(201);
      expect(t.kalender.serieAnlegen).toHaveBeenCalledOnce();
      expect((await post({ ...serie, wochen: [] })).status).toBe(400);
      expect((await post({ ...serie, wochentage: [] })).status).toBe(400);
      expect((await post({ ...serie, endDatum: '2026-10-01' })).status).toBe(400);
      expect(t.kalender.serieAnlegen).toHaveBeenCalledOnce();
    });

    it('creates the due events right away and never fails the save because of it', async () => {
      const t = makeApp();
      t.kalender.serien.mockResolvedValue([
        {
          id: 'plenum',
          name: 'Plenum',
          vorlageId: 'v1',
          regel: 'woechentlich',
          wochentage: [0, 1, 2, 3, 4, 5, 6],
          wochen: [],
          startDatum: '2020-01-01',
          endDatum: null,
          aktiv: true,
        },
      ]);
      t.kalender.vorlagen.mockResolvedValue([
        {
          id: 'v1',
          titel: 'Plenum',
          beschreibung: null,
          kategorieId: 'k1',
          beginnZeit: '20:00',
          endeZeit: '22:00',
          teilnahmeStatus: null,
          tage: 1,
          bilderOrdner: false,
          archiviert: false,
          schichten: [],
        },
      ]);
      const post = await t.app.request(
        '/api/kalender/serien',
        json('vorstand-token', 'POST', serie),
      );
      expect(post.status).toBe(201);
      expect(await post.json()).toEqual({ id: 'plenum', erzeugt: 40 });
      expect(t.kalender.serienTerminAnlegen).toHaveBeenCalledTimes(40);
      const put = await t.app.request(
        '/api/kalender/serien/plenum',
        json('vorstand-token', 'PUT', serie),
      );
      expect(await put.json()).toMatchObject({ ok: true, erzeugt: 40 });
      const an = await t.app.request(
        '/api/kalender/serien/plenum/aktiv',
        json('vorstand-token', 'PUT', { aktiv: true }),
      );
      expect(await an.json()).toEqual({ aktiv: true, erzeugt: 40 });
      const aus = await t.app.request(
        '/api/kalender/serien/plenum/aktiv',
        json('vorstand-token', 'PUT', { aktiv: false }),
      );
      expect(await aus.json()).toEqual({ aktiv: false, erzeugt: 0 });
      // A failing generation is logged and the save still succeeds.
      vi.spyOn(console, 'error').mockImplementation(() => {});
      t.kalender.serien.mockRejectedValue(new Error('db down'));
      const kaputt = await t.app.request(
        '/api/kalender/serien',
        json('vorstand-token', 'POST', serie),
      );
      expect(kaputt.status).toBe(201);
      expect(await kaputt.json()).toEqual({ id: 'plenum', erzeugt: 0 });
    });

    it('asks (409 with counts) before changing, then applies either variant', async () => {
      const t = makeApp();
      t.kalender.serieAktualisieren.mockRejectedValueOnce(new SerieBetroffen(5, 2));
      const put = (body: unknown, id = 'plenum') =>
        t.app.request(`/api/kalender/serien/${id}`, json('vorstand-token', 'PUT', body));
      const res = await put(serie);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ unveraendert: 5, angepasst: 2 });
      expect((await put({ ...serie, bestehende: 'anpassen' })).status).toBe(200);
      expect(t.kalender.serieAktualisieren).toHaveBeenLastCalledWith(
        'plenum',
        expect.objectContaining({ name: 'Plenum', wochen: [1] }),
        'anpassen',
      );
      expect((await put({ ...serie, bestehende: 'behalten' })).status).toBe(200);
      expect(t.kalender.serieAktualisieren).toHaveBeenLastCalledWith(
        'plenum',
        expect.anything(),
        'behalten',
      );
      expect((await put({ ...serie, bestehende: 'alles' })).status).toBe(400);
      expect((await put(serie, 'x')).status).toBe(404);
    });

    it('asks before turning off or deleting, with both variants', async () => {
      const t = makeApp();
      t.kalender.serieAktivSetzen.mockRejectedValueOnce(new SerieBetroffen(3, 0));
      t.kalender.serieLoeschen.mockRejectedValueOnce(new SerieBetroffen(3, 1));
      const aktiv = (body: unknown) =>
        t.app.request('/api/kalender/serien/plenum/aktiv', json('vorstand-token', 'PUT', body));
      const loeschen = (query = '') =>
        t.app.request(`/api/kalender/serien/plenum${query}`, json('vorstand-token', 'DELETE'));
      expect((await aktiv({ aktiv: false })).status).toBe(409);
      expect((await aktiv({ aktiv: false, bestehende: 'anpassen' })).status).toBe(200);
      expect(t.kalender.serieAktivSetzen).toHaveBeenLastCalledWith('plenum', false, 'anpassen');
      expect((await loeschen()).status).toBe(409);
      expect((await loeschen('?bestehende=behalten')).status).toBe(200);
      expect(t.kalender.serieLoeschen).toHaveBeenLastCalledWith('plenum', 'behalten');
      expect((await loeschen('?bestehende=anpassen')).status).toBe(200);
      expect(t.kalender.serieLoeschen).toHaveBeenLastCalledWith('plenum', 'anpassen');
      expect((await loeschen('?bestehende=x')).status).toBe(400);
    });
  });

  it('reads and replaces the global reminders', async () => {
    const t = makeApp();
    const put = (body: unknown) =>
      t.app.request('/api/kalender/erinnerungen', json('vorstand-token', 'PUT', body));
    expect(
      await (await t.app.request('/api/kalender/erinnerungen', json('reader-token', 'GET'))).json(),
    ).toEqual({ minutenVorher: [10080, 2880, 1440] });
    for (const bad of [[], [14], [43201], [60, 60], Array.from({ length: 21 }, (_, i) => 15 + i)]) {
      expect((await put({ minutenVorher: bad })).status).toBe(400);
    }
    expect(t.kalender.erinnerungenSetzen).not.toHaveBeenCalled();
    expect((await put({ minutenVorher: [180, 2880] })).status).toBe(200);
    expect(t.kalender.erinnerungenSetzen).toHaveBeenCalledWith([180, 2880]);
  });

  it('manages the feed token: lesen right, profile row needed, only the hash is stored', async () => {
    const t = makeApp();
    mitProfil(t);
    const get = () => t.app.request('/api/me/kalender-token', json('reader-token', 'GET'));
    expect(await (await get()).json()).toEqual({ vorhanden: false });
    const res = await t.app.request('/api/me/kalender-token', json('reader-token', 'POST'));
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    expect(token).toBe('tok-1');
    expect(await (await get()).json()).toEqual({ vorhanden: true });
    // A new token replaces the old one.
    const neu = (await (
      await t.app.request('/api/me/kalender-token', json('reader-token', 'POST'))
    ).json()) as { token: string };
    expect(neu.token).not.toBe(token);
    expect(await t.kalender.subPerTokenHash(tokenHash(token))).toBeUndefined();
    expect(await t.kalender.subPerTokenHash(tokenHash(neu.token))).toBe('r');
    expect((await t.app.request('/api/me/kalender-token')).status).toBe(401);
    // Without a profile row there is nothing to attach the token to.
    const ohne = makeApp();
    expect(
      (await ohne.app.request('/api/me/kalender-token', json('reader-token', 'POST'))).status,
    ).toBe(404);
  });

  it('serves the feed without authorization and 404s for unknown tokens', async () => {
    const t = makeApp(undefined, 'https://c4.example');
    t.kalender.meineDienste.mockResolvedValue([
      {
        id: 'd1',
        eventId: 'e1',
        eventTitel: 'Offener Abend',
        schichtArt: 'betrieb',
        dienstformName: 'Bardienst',
        beginn: '2026-06-05T17:00:00.000Z',
        ende: '2026-06-05T21:00:00.000Z',
        abgesagt: true,
      },
    ]);
    const token = await t.kalender.tokenErzeugen('r');
    for (const url of [`/api/kalender/feed/${token}`, `/api/kalender/feed/${token}.ics`]) {
      const res = await t.app.request(url);
      expect(res.status, url).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
      expect(res.headers.get('cache-control')).toBe('no-store');
      const ics = await res.text();
      expect(ics).toContain('SUMMARY:Bardienst · Offener Abend');
      expect(ics).toContain('STATUS:CANCELLED');
      expect(ics).toContain('X-WR-CALNAME:C4 – Mein Kalender');
      expect(ics).toContain('https://c4.example/app/kalender/events/e1');
    }
    const [sub, ab] = t.kalender.meineDienste.mock.calls[0]!;
    expect(sub).toBe('r');
    const tage = (Date.now() - ab.getTime()) / 86_400_000;
    expect(tage).toBeGreaterThan(89.9);
    expect(tage).toBeLessThan(90.1);
    expect((await t.app.request('/api/kalender/feed/unbekannt.ics')).status).toBe(404);
  });

  it('404s the feed for a deactivated member or one without the calendar right', async () => {
    const t = makeApp();
    const token = await t.kalender.tokenErzeugen('r');
    expect((await t.app.request(`/api/kalender/feed/${token}`)).status).toBe(200);
    await t.mitglieder.speichern('r', {
      vorname: 'A',
      nachname: 'B',
      anrede: null,
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
    expect((await t.app.request(`/api/kalender/feed/${token}`)).status).toBe(200);
    await t.mitglieder.deaktiviertSetzen('r', true);
    const res = await t.app.request(`/api/kalender/feed/${token}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Kalender nicht gefunden' });
    await t.mitglieder.deaktiviertSetzen('r', false);
    expect((await t.app.request(`/api/kalender/feed/${token}`)).status).toBe(200);
  });

  it('puts participation and subscribed events into the feed next to the Dienste', async () => {
    const t = makeApp(undefined, 'https://c4.example');
    t.kalender.meineEvents.mockResolvedValue([
      {
        id: 'e2',
        titel: 'Plenum',
        beschreibung: null,
        beginn: '2026-06-06T17:00:00.000Z',
        ende: '2026-06-06T19:00:00.000Z',
        abgesagt: false,
      },
    ]);
    const token = await t.kalender.tokenErzeugen('r');
    const ics = await (await t.app.request(`/api/kalender/feed/${token}`)).text();
    expect(ics).toContain('UID:event-e2@c4-leipzig.de');
    expect(ics).toContain('DTSTART:20260606T170000Z');
    expect(ics).toContain('SUMMARY:Plenum');
    expect(t.kalender.meineEvents).toHaveBeenCalledWith('r', expect.any(Date));
  });

  it('removes the one-off Dienste download route', async () => {
    const t = makeApp();
    expect((await t.app.request('/api/me/dienste', json('reader-token', 'GET'))).status).toBe(404);
  });

  describe('Teilnahme und Event-Abo', () => {
    it('lets everyone change only their own participation, with a profile row', async () => {
      const t = makeApp();
      const put = (token: string, body: unknown) =>
        t.app.request('/api/kalender/events/e1/teilnahme', json(token, 'PUT', body));
      expect((await put('reader-token', { teilnahme: false })).status).toBe(400);
      mitProfil(t);
      const res = await put('reader-token', { teilnahme: false });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ teilnahme: false });
      expect(t.kalender.teilnahmeSetzen).toHaveBeenCalledWith('e1', 'r', false);
      expect((await put('reader-token', { teilnahme: 'ja' })).status).toBe(400);
      expect(
        (await t.app.request('/api/kalender/events/e1/teilnahme', { method: 'PUT' })).status,
      ).toBe(401);
    });

    it('maps missing events and conflicts', async () => {
      const t = makeApp();
      mitProfil(t);
      const put = () =>
        t.app.request(
          '/api/kalender/events/e1/teilnahme',
          json('reader-token', 'PUT', { teilnahme: true }),
        );
      t.kalender.teilnahmeSetzen.mockResolvedValueOnce(undefined);
      expect((await put()).status).toBe(404);
      t.kalender.teilnahmeSetzen.mockRejectedValueOnce(
        new KalenderKonflikt('Das Event ist abgesagt.'),
      );
      expect((await put()).status).toBe(409);
    });

    it('stores an absage for a Teilnahme event even outside the circle', async () => {
      const t = makeApp();
      mitProfil(t);
      const res = await t.app.request(
        '/api/kalender/events/e1/teilnahme',
        json('reader-token', 'PUT', { teilnahme: false }),
      );
      expect(res.status).toBe(200);
      expect(t.kalender.teilnahmeSetzen).toHaveBeenCalledWith('e1', 'r', false);
    });

    it('lets everyone set only their own availability, with a profile row', async () => {
      const t = makeApp();
      const put = (token: string, body: unknown) =>
        t.app.request('/api/kalender/events/e1/verfuegbarkeit', json(token, 'PUT', body));
      expect((await put('reader-token', { verfuegbar: false })).status).toBe(400);
      mitProfil(t);
      const res = await put('reader-token', { verfuegbar: false });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ verfuegbar: false });
      expect(t.kalender.verfuegbarkeitSetzen).toHaveBeenLastCalledWith('e1', 'r', false, false);
      await put('reader-token', { verfuegbar: false, bestaetigt: true });
      expect(t.kalender.verfuegbarkeitSetzen).toHaveBeenLastCalledWith('e1', 'r', false, true);
      await put('reader-token', { verfuegbar: true });
      expect(t.kalender.verfuegbarkeitSetzen).toHaveBeenLastCalledWith('e1', 'r', true, false);
      expect((await put('reader-token', { verfuegbar: 'ja' })).status).toBe(400);
      expect((await put('reader-token', {})).status).toBe(400);
      expect(
        (await t.app.request('/api/kalender/events/e1/verfuegbarkeit', { method: 'PUT' })).status,
      ).toBe(401);
    });

    it('asks for confirmation when the absage would remove own Dienste', async () => {
      const t = makeApp();
      mitProfil(t);
      const put = (body: unknown) =>
        t.app.request('/api/kalender/events/e1/verfuegbarkeit', json('reader-token', 'PUT', body));
      t.kalender.verfuegbarkeitSetzen.mockRejectedValueOnce(new VerfuegbarkeitBestaetigen(2));
      const res = await put({ verfuegbar: false });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error:
          'Du bist für 2 Dienste eingetragen. Wenn du dich als nicht verfügbar meldest, wirst du ausgetragen.',
        dienste: 2,
      });
      // Confirmed: the store removes the Dienste and stores the absage.
      expect((await put({ verfuegbar: false, bestaetigt: true })).status).toBe(200);
    });

    it('maps missing events and conflicts of the availability', async () => {
      const t = makeApp();
      mitProfil(t);
      const put = () =>
        t.app.request(
          '/api/kalender/events/e1/verfuegbarkeit',
          json('reader-token', 'PUT', { verfuegbar: false }),
        );
      t.kalender.verfuegbarkeitSetzen.mockResolvedValueOnce(undefined);
      expect((await put()).status).toBe(404);
      t.kalender.verfuegbarkeitSetzen.mockRejectedValueOnce(
        new KalenderKonflikt('Das Event ist abgesagt.'),
      );
      expect((await put()).status).toBe(409);
      t.kalender.verfuegbarkeitSetzen.mockRejectedValueOnce(
        new KalenderKonflikt('Bei Events mit Teilnahme …'),
      );
      expect((await put()).status).toBe(409);
    });

    it('adds and removes an event in the own feed', async () => {
      const t = makeApp();
      mitProfil(t);
      const put = await t.app.request('/api/kalender/events/e1/abo', json('reader-token', 'PUT'));
      expect(await put.json()).toEqual({ imAbo: true });
      expect(t.kalender.eventAboSetzen).toHaveBeenLastCalledWith('e1', 'r', true);
      const del = await t.app.request(
        '/api/kalender/events/e1/abo',
        json('reader-token', 'DELETE'),
      );
      expect(await del.json()).toEqual({ imAbo: false });
      expect(t.kalender.eventAboSetzen).toHaveBeenLastCalledWith('e1', 'r', false);
      t.kalender.eventAboSetzen.mockResolvedValueOnce(false);
      expect(
        (await t.app.request('/api/kalender/events/x/abo', json('reader-token', 'DELETE'))).status,
      ).toBe(404);
    });

    it('passes the caller to the event reads and adds usernames to the list', async () => {
      const t = makeApp();
      t.userAdmin.konten.mockResolvedValue(new Map([['m2', { username: 'max' } as Konto]]));
      const einEvent = {
        id: 'e1',
        titel: 'Plenum',
        anzeigeTitel: 'Plenum',
        beschreibung: null,
        kategorie: null,
        art: 'dienste' as const,
        dauer: 'eintaegig' as const,
        beginn: eventBody.beginn,
        ende: eventBody.ende,
        abgesagt: false,
        serie: null,
        bewertung: 'gruen' as const,
        schichten: [],
        teilnahmeStatus: ['mitglied' as const],
        teilnahmen: [
          {
            person: {
              art: 'mitglied' as const,
              sub: 'm2',
              username: null,
              vorname: 'Max',
              nachname: 'Muster',
              status: 'mitglied' as const,
              anrede: 'neutral' as const,
            },
            zustand: 'teilnahme' as const,
            eingeladen: false,
          },
        ],
        ichNehmeTeil: true,
        meineTeilnahme: 'teilnahme' as const,
        nichtVerfuegbar: [],
        ichBinNichtVerfuegbar: false,
        verantwortlich: null,
        imAbo: false,
        bilderOrdnerUrl: null,
        bilderOrdnerId: null,
      };
      t.kalender.event.mockResolvedValueOnce(einEvent);
      const res = await t.app.request('/api/kalender/events/e1', json('reader-token', 'GET'));
      expect(t.kalender.event).toHaveBeenCalledWith('e1', 'r');
      expect(((await res.json()) as typeof einEvent).teilnahmen[0]!.person.username).toBe('max');
      await t.app.request(
        '/api/kalender/events?von=2026-06-01&bis=2026-06-30',
        json('reader-token', 'GET'),
      );
      expect(t.kalender.events).toHaveBeenCalledWith('2026-06-01', '2026-06-30', 'r');
    });

    it('accepts the circle and invitations on create', async () => {
      const t = makeApp();
      const res = await t.app.request(
        '/api/kalender/events',
        json('vorstand-token', 'POST', {
          ...eventBody,
          teilnahmeStatus: ['em'],
          eingeladen: ['m2'],
        }),
      );
      expect(res.status).toBe(201);
      expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
        expect.objectContaining({ teilnahmeStatus: ['em'], eingeladen: ['m2'] }),
        expect.any(String),
      );
      expect(
        (
          await t.app.request(
            '/api/kalender/events',
            json('vorstand-token', 'POST', { ...eventBody, teilnahmeStatus: ['chef'] }),
          )
        ).status,
      ).toBe(400);
    });
  });

  describe('push notifications', () => {
    const abo = (endpoint: string) => ({
      endpoint,
      keys: { p256dh: 'p', auth: 'a' },
    });
    const ereignis = (id: string, beginn: string) => ({
      id,
      titel: 'Offener Abend',
      anzeigeTitel: 'Offener Abend',
      beschreibung: null,
      kategorie: null,
      art: 'dienste' as const,
      dauer: 'eintaegig' as const,
      beginn,
      ende: '2026-10-23T22:00:00.000Z',
      abgesagt: false,
      serie: null,
      bewertung: 'gruen' as const,
      schichten: [],
      teilnahmeStatus: null,
      teilnahmen: [],
      ichNehmeTeil: null,
      meineTeilnahme: null,
      nichtVerfuegbar: [],
      ichBinNichtVerfuegbar: false,
      verantwortlich: null,
      imAbo: false,
      bilderOrdnerUrl: null,
      bilderOrdnerId: null,
    });

    it("serves the public key and manages the caller's subscriptions", async () => {
      const t = makeApp();
      mitProfil(t);
      expect((await t.app.request('/api/push/schluessel')).status).toBe(401);
      const key = await t.app.request('/api/push/schluessel', json('member-token', 'GET'));
      expect(await key.json()).toEqual({ publicKey: 'public-key' });

      const post = (body: unknown) =>
        t.app.request('/api/push/abos', json('member-token', 'POST', body));
      expect((await post({ endpoint: 'kaputt', keys: { p256dh: 'p', auth: 'a' } })).status).toBe(
        400,
      );
      expect((await post(abo('https://push.example/1'))).status).toBe(201);
      expect((await post(abo('https://push.example/1'))).status).toBe(201);
      expect(t.push.abos).toHaveLength(1);
      expect(t.push.abos[0]).toMatchObject({
        mitgliedSub: 'm2',
        endpoint: 'https://push.example/1',
      });

      const del = (token: string) =>
        t.app.request(
          '/api/push/abos',
          json(token, 'DELETE', { endpoint: 'https://push.example/1' }),
        );
      await del('reader-token');
      expect(t.push.abos).toHaveLength(1);
      expect((await del('member-token')).status).toBe(200);
      expect(t.push.abos).toHaveLength(0);
    });

    it('reports whether an endpoint is registered for the caller', async () => {
      const t = makeApp();
      mitProfil(t);
      const url = 'https://push.example/1';
      const status = (token: string) =>
        t.app.request(
          `/api/push/abos/status?endpoint=${encodeURIComponent(url)}`,
          json(token, 'GET'),
        );
      expect((await status('member-token')).status).toBe(200);
      expect(await (await status('member-token')).json()).toEqual({ registriert: false });
      await t.push.store.aboSpeichern('m2', abo(url));
      expect(await (await status('member-token')).json()).toEqual({ registriert: true });
      // Another member's endpoint does not count.
      expect(await (await status('reader-token')).json()).toEqual({ registriert: false });
      expect(
        (await t.app.request('/api/push/abos/status', json('member-token', 'GET'))).status,
      ).toBe(400);
    });

    it('sends a test message to the own devices and reports the result', async () => {
      const t = makeApp();
      mitProfil(t);
      const test = (token: string) => t.app.request('/api/push/test', json(token, 'POST'));
      expect((await t.app.request('/api/push/test', { method: 'POST' })).status).toBe(401);
      expect(await (await test('member-token')).json()).toEqual({ geraete: 0, ok: 0, fehler: 0 });
      await t.push.store.aboSpeichern('m2', abo('https://push.example/1'));
      expect(await (await test('member-token')).json()).toEqual({ geraete: 1, ok: 1, fehler: 0 });
    });

    it('needs a profile for subscriptions and settings', async () => {
      const t = makeApp();
      const res = await t.app.request(
        '/api/push/abos',
        json('member-token', 'POST', abo('https://push.example/1')),
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(t.push.abos).toHaveLength(0);
    });

    it('lists all types with defaults and stores changes', async () => {
      const t = makeApp();
      t.pushMitglieder.find((m) => m.sub === 'm2')!.status = 'em';
      const lesen = async () =>
        (await (
          await t.app.request('/api/me/benachrichtigungen', json('member-token', 'GET'))
        ).json()) as {
          art: string;
          aktiv: boolean;
          minuten: number | null;
          minutenOptionen: number[] | null;
        }[];
      const anfang = await lesen();
      expect(anfang.map((e) => e.art)).toEqual([
        'kalender.erinnerung',
        'kalender.fehlende_dienste',
        'kalender.aenderung',
        'kalender.teilnahme_erinnerung',
        'geburtstag.erinnerung',
        'schluessel.uebergabe',
        'schluessel.bedarf',
        'schluessel.abgabe',
        'schluessel.antwort',
        'schluessel.planung',
        'umfrage.neu',
        'umfrage.erinnerung',
        'umfrage.termin',
        'umfrage.erneut_abstimmen',
        'todo.frist',
        'privatpartys.anfrage',
        'privatpartys.nachricht',
      ]);
      expect(anfang[5]).toMatchObject({ aktiv: true, abschaltbar: false });
      expect(
        (
          await t.app.request(
            '/api/me/benachrichtigungen',
            json('member-token', 'PUT', { art: 'schluessel.uebergabe', aktiv: false }),
          )
        ).status,
      ).toBe(400);
      expect(anfang[4]).toMatchObject({
        aktiv: true,
        minuten: 0,
        minutenOptionen: [0, 1440, 2880, 4320, 7200, 10080],
      });
      // 0 (on the day) is a valid, storable lead time.
      expect(
        (
          await t.app.request(
            '/api/me/benachrichtigungen',
            json('member-token', 'PUT', {
              art: 'geburtstag.erinnerung',
              aktiv: true,
              minuten: 1440,
            }),
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await t.app.request(
            '/api/me/benachrichtigungen',
            json('member-token', 'PUT', { art: 'geburtstag.erinnerung', aktiv: true, minuten: 0 }),
          )
        ).status,
      ).toBe(200);
      expect((await lesen())[4]).toMatchObject({ aktiv: true, minuten: 0 });
      expect(anfang[0]).toMatchObject({
        aktiv: true,
        minuten: 30,
        minutenOptionen: [15, 30, 60, 120, 1440],
      });
      expect(anfang[1]).toMatchObject({ aktiv: false, minuten: null, minutenOptionen: null });

      const put = (body: unknown) =>
        t.app.request('/api/me/benachrichtigungen', json('member-token', 'PUT', body));
      expect((await put({ art: 'kalender.erinnerung', aktiv: true, minuten: 60 })).status).toBe(
        200,
      );
      expect((await put({ art: 'kalender.fehlende_dienste', aktiv: true })).status).toBe(200);
      // Switching off keeps the chosen minutes.
      expect((await put({ art: 'kalender.erinnerung', aktiv: false })).status).toBe(200);
      const danach = await lesen();
      expect(danach[0]).toMatchObject({ aktiv: false, minuten: 60 });
      expect(danach[1]).toMatchObject({ aktiv: true });

      expect((await put({ art: 'kalender.erinnerung', aktiv: true, minuten: 7 })).status).toBe(400);
      expect((await put({ art: 'kalender.aenderung', aktiv: true, minuten: 15 })).status).toBe(400);
      expect((await put({ art: 'gibt.es.nicht', aktiv: true })).status).toBe(400);
      expect((await t.app.request('/api/me/benachrichtigungen', { method: 'GET' })).status).toBe(
        401,
      );
    });

    describe('notification history', () => {
      const base = '/api/me/benachrichtigungen/verlauf';
      const eintragen = (t: ReturnType<typeof makeApp>, sub: string, art: string, titel: string) =>
        t.push.store.verlaufEintragen([
          { sub, art, titel, text: 'x', url: '/app/x', schluessel: null },
        ]);

      it('lists with filters and pagination, newest first', async () => {
        const t = makeApp();
        mitProfil(t);
        for (let i = 1; i <= 31; i++) await eintragen(t, 'm2', 'umfrage.neu', `U${i}`);
        await eintragen(t, 'm2', 'kalender.aenderung', 'K1');
        await eintragen(t, 'a', 'umfrage.neu', 'fremd');
        const get = async (query = '') =>
          (await t.app.request(`${base}${query}`, json('member-token', 'GET'))).json() as Promise<{
            eintraege: { id: string; titel: string; gelesen: boolean }[];
            weiter: string | null;
          }>;
        const seite1 = await get();
        expect(seite1.eintraege).toHaveLength(30);
        expect(seite1.eintraege[0]!.titel).toBe('K1');
        expect(seite1.weiter).not.toBeNull();
        const seite2 = await get(`?vor=${encodeURIComponent(seite1.weiter!)}`);
        expect(seite2.eintraege.map((e) => e.titel)).toEqual(['U2', 'U1']);
        expect(seite2.weiter).toBeNull();

        expect((await get('?art=kalender.aenderung')).eintraege).toHaveLength(1);
        expect((await get('?bereich=umfrage')).eintraege).toHaveLength(30);
        const res = await t.app.request(`${base}?art=gibt.es.nicht`, json('member-token', 'GET'));
        expect(res.status).toBe(400);

        const erste = seite1.eintraege[0]!.id;
        await t.app.request(`${base}/${erste}/gelesen`, json('member-token', 'POST'));
        const ungelesen = await get('?ungelesen=true&bereich=kalender');
        expect(ungelesen.eintraege).toHaveLength(0);
        expect((await t.app.request(base, { method: 'GET' })).status).toBe(401);
      });

      it('returns 404 for a foreign or unknown id and 204 for an own one', async () => {
        const t = makeApp();
        mitProfil(t);
        const fremd = (await eintragen(t, 'a', 'umfrage.neu', 'fremd')).get('a')!;
        const eigen = (await eintragen(t, 'm2', 'umfrage.neu', 'eigen')).get('m2')!;
        const post = (id: string) =>
          t.app.request(`${base}/${id}/gelesen`, json('member-token', 'POST'));
        expect((await post(fremd)).status).toBe(404);
        expect((await post('unbekannt')).status).toBe(404);
        expect((await post(eigen)).status).toBe(204);
        expect(await t.push.store.verlaufUngelesen('a')).toBe(1);
      });

      it('counts unread entries and marks all matching the filter as read', async () => {
        const t = makeApp();
        mitProfil(t);
        await eintragen(t, 'm2', 'umfrage.neu', 'U1');
        await eintragen(t, 'm2', 'umfrage.erinnerung', 'U2');
        await eintragen(t, 'm2', 'kalender.aenderung', 'K1');
        const anzahl = async () =>
          (
            (await (
              await t.app.request(`${base}/ungelesen`, json('member-token', 'GET'))
            ).json()) as { anzahl: number }
          ).anzahl;
        expect(await anzahl()).toBe(3);
        const alle = (body: unknown) =>
          t.app.request(`${base}/gelesen`, json('member-token', 'POST', body));
        expect((await alle({ bereich: 'umfrage' })).status).toBe(204);
        expect(await anzahl()).toBe(1);
        expect((await alle({ art: 'gibt.es.nicht' })).status).toBe(400);
        expect((await alle({})).status).toBe(204);
        expect(await anzahl()).toBe(0);
      });
    });

    it('notifies a removed member, but not the person who removed themself', async () => {
      const t = makeApp();
      mitProfil(t);
      t.userAdmin.konten.mockResolvedValue(new Map([['v', { username: 'leonard' } as Konto]]));
      await t.push.store.aboSpeichern('r', {
        endpoint: 'https://push.example/r',
        keys: { p256dh: 'p', auth: 'a' },
      });
      t.kalenderDienste.set(
        'd-r',
        dienstInfo({ id: 'd-r', mitgliedSub: 'r', eingetragenVon: 'r' }),
      );
      t.kalenderDienste.set(
        'd-r2',
        dienstInfo({ id: 'd-r2', mitgliedSub: 'r', eingetragenVon: 'r' }),
      );

      expect(
        (await t.app.request('/api/kalender/dienste/d-r', json('reader-token', 'DELETE'))).status,
      ).toBe(200);
      expect(t.gesendet).toHaveLength(0);

      expect(
        (await t.app.request('/api/kalender/dienste/d-r2', json('vorstand-token', 'DELETE')))
          .status,
      ).toBe(200);
      expect(t.gesendet).toEqual([
        {
          endpoint: 'https://push.example/r',
          titel: 'Du wurdest ausgetragen',
          text: 'leonard hat dich aus der 19-Uhr-Schicht bei „Offener Abend“ am 05.06. ausgetragen.',
          url: '/app/kalender/events/e1',
        },
      ]);
    });

    it('notifies a member entered by somebody else (username, else Vorname), not oneself', async () => {
      const t = makeApp();
      mitProfil(t);
      await t.push.store.aboSpeichern('r', {
        endpoint: 'https://push.example/r',
        keys: { p256dh: 'p', auth: 'a' },
      });
      const eintragen = (token: string, body: unknown) =>
        t.app.request('/api/kalender/schichten/s1/dienste', json(token, 'POST', body));
      t.kalenderDienste.set(
        'd-neu',
        dienstInfo({ id: 'd-neu', mitgliedSub: 'r', schichtArt: 'aufbau', dienstformId: null }),
      );

      // Without a username the actor's Vorname is used.
      expect(
        (await eintragen('member-token', { dienstformId: 'f1', mitgliedSub: 'r' })).status,
      ).toBe(201);
      expect(t.gesendet).toEqual([
        {
          endpoint: 'https://push.example/r',
          titel: 'Du wurdest eingetragen',
          text: 'A hat dich für den Aufbau bei „Offener Abend“ am 05.06. eingetragen.',
          url: '/app/kalender/events/e1',
        },
      ]);

      // Entering oneself or an Externe sends nothing.
      t.gesendet.length = 0;
      await eintragen('reader-token', { dienstformId: 'f1', mitgliedSub: 'r' });
      await eintragen('reader-token', { dienstformId: 'f1' });
      await eintragen('reader-token', { dienstformId: 'f1', externId: 'x1' });
      expect(t.gesendet).toHaveLength(0);
    });

    it('notifies Dienst holders about a cancellation, except the actor', async () => {
      const t = makeApp();
      for (const sub of ['r', 'v']) {
        await t.push.store.aboSpeichern(sub, {
          endpoint: `https://push.example/${sub}`,
          keys: { p256dh: 'p', auth: 'a' },
        });
      }
      t.kalender.absageSetzen.mockResolvedValueOnce({
        geaendert: true,
        mitgliedSubs: ['r', 'v'],
        teilnehmerSubs: [],
      });
      t.kalender.event.mockResolvedValueOnce(ereignis('e1', '2026-10-23T18:00:00.000Z'));
      const res = await t.app.request(
        '/api/kalender/events/e1/absage',
        json('vorstand-token', 'PUT', { abgesagt: true }),
      );
      expect(res.status).toBe(200);
      expect(t.gesendet.map((g) => g.endpoint)).toEqual(['https://push.example/r']);
      expect(t.gesendet[0]).toMatchObject({ titel: 'Event abgesagt' });
      expect(t.gesendet[0]!.text).toContain('Fr, 23.10.');

      // Unchanged state: nothing is sent.
      t.gesendet.length = 0;
      t.kalender.absageSetzen.mockResolvedValueOnce({
        geaendert: false,
        mitgliedSubs: ['r'],
        teilnehmerSubs: [],
      });
      await t.app.request(
        '/api/kalender/events/e1/absage',
        json('vorstand-token', 'PUT', { abgesagt: true }),
      );
      expect(t.gesendet).toHaveLength(0);
    });

    it('notifies about a moved event and survives push failures', async () => {
      const t = makeApp();
      await t.push.store.aboSpeichern('r', {
        endpoint: 'https://push.example/r',
        keys: { p256dh: 'p', auth: 'a' },
      });
      t.kalender.eventAktualisieren.mockResolvedValueOnce({
        zeitGeaendert: true,
        geaenderteSchichten: [],
        entfernteDienste: [],
        mitgliedSubs: ['r', 'v'],
        teilnehmerSubs: [],
        verantwortlichNeu: null,
      });
      t.kalender.event.mockResolvedValueOnce(ereignis('e1', '2026-10-23T18:00:00.000Z'));
      t.pushErgebnis.wert = 'fehler';
      const res = await t.app.request(
        '/api/kalender/events/e1',
        json('vorstand-token', 'PUT', eventBody),
      );
      expect(res.status).toBe(200);
      expect(t.gesendet).toHaveLength(1);
      expect(t.gesendet[0]).toMatchObject({ titel: 'Event verschoben' });
      expect(t.gesendet[0]!.text).toContain('um 20:00 Uhr');
    });
  });
});
