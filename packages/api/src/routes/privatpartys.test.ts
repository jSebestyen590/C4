import { describe, expect, it } from 'vitest';
import {
  type EventDto,
  type PrivatpartyDetailDto,
  type UmfrageDetailDto,
  type UmfrageListeDto,
} from '@c4/shared';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('privatpartys', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const termin = (extra: Record<string, unknown> = {}) => ({
    datum: '2099-03-14',
    beginn: '19:00',
    ende: '02:00',
    stufe: 'bevorzugt',
    ...extra,
  });
  const kategorie = {
    id: 'party',
    name: 'Party',
    farbe: 'blue',
    art: 'dienste' as const,
    teilnahmeStatus: null,
    dauer: 'eintaegig' as const,
    protokoll: false,
    protokollArt: 'sitzung' as const,
    benutzt: false,
    archiviert: false,
  };
  const vorlage = {
    id: 'privat',
    titel: 'Privatparty',
    beschreibung: null,
    kategorieId: 'party',
    beginnZeit: '20:00',
    endeZeit: '02:00',
    teilnahmeStatus: null,
    tage: 1,
    bilderOrdner: false,
    archiviert: false,
    schichten: [
      {
        art: 'betrieb' as const,
        beginnZeit: '20:00',
        endeZeit: '02:00',
        bedarfe: [{ dienstformId: 'tresen', minimum: 1, wunsch: 2 }],
      },
    ],
  };

  /** Profiles for a (admin), v, m2 and a Kategorie and Vorlage for the events. */
  async function setup() {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map(
        ['a', 'v', 'm2'].map((sub) => [
          sub,
          { sub, kontoName: sub, username: `user-${sub}`, aktiviert: true, enabled: true },
        ]),
      ),
    );
    for (const sub of ['a', 'v', 'm2']) {
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
      await t.push.store.aboSpeichern(sub, {
        endpoint: `https://push.example/${sub}`,
        keys: { p256dh: 'p', auth: 'a' },
      });
    }
    t.kalender.kategorien.mockResolvedValue([kategorie]);
    t.kalender.dienstformen.mockResolvedValue([
      { id: 'tresen', name: 'Tresen', reihenfolge: 1, archiviert: false },
    ]);
    t.kalender.vorlagen.mockResolvedValue([vorlage]);
    const person = async () => {
      const res = await t.app.request(
        '/api/privatpartys/personen',
        json('admin-token', 'POST', { name: 'Eva Muster', email: 'eva@example.de' }),
      );
      expect(res.status).toBe(201);
      return ((await res.json()) as { id: string }).id;
    };
    const anlegen = async (extra: Record<string, unknown> = {}) => {
      const personId = await person();
      const res = await t.app.request(
        '/api/privatpartys',
        json('admin-token', 'POST', {
          personId,
          anlass: '30. Geburtstag',
          termine: [termin(), termin({ datum: '2099-03-21', stufe: 'notfalls' })],
          ...extra,
        }),
      );
      expect(res.status).toBe(201);
      return { id: ((await res.json()) as { id: string }).id, personId };
    };
    const holen = async (id: string) =>
      (await (
        await t.app.request(`/api/privatpartys/${id}`, json('admin-token', 'GET'))
      ).json()) as PrivatpartyDetailDto;
    return { ...t, person, anlegen, holen };
  }

  it('is only open to holders of the right', async () => {
    const t = await setup();
    for (const [methode, pfad] of [
      ['GET', '/api/privatpartys'],
      ['GET', '/api/privatpartys/personen'],
      ['POST', '/api/privatpartys'],
    ] as const) {
      expect(
        (
          await t.app.request(
            pfad,
            json('member-token', methode, methode === 'GET' ? undefined : {}),
          )
        ).status,
      ).toBe(403);
    }
    expect((await t.app.request('/api/privatpartys', json('admin-token', 'GET'))).status).toBe(200);
    // A Posten can grant the right.
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'v' ? ['privatpartys:verwalten' as const] : [],
    );
    expect((await t.app.request('/api/privatpartys', json('vorstand-token', 'GET'))).status).toBe(
      200,
    );
  });

  it('manages people and refuses to delete one with Privatpartys', async () => {
    const t = await setup();
    const bad = await t.app.request(
      '/api/privatpartys/personen',
      json('admin-token', 'POST', { name: '', email: 'kaputt' }),
    );
    expect(bad.status).toBe(400);
    const { id, personId } = await t.anlegen();
    const put = await t.app.request(
      `/api/privatpartys/personen/${personId}`,
      json('admin-token', 'PUT', { name: 'Eva M.', kontakt: 'Instagram @eva' }),
    );
    expect(put.status).toBe(200);
    const detail = await (
      await t.app.request(`/api/privatpartys/personen/${personId}`, json('admin-token', 'GET'))
    ).json();
    expect(detail).toMatchObject({
      name: 'Eva M.',
      email: null,
      kontakt: 'Instagram @eva',
      anzahlPrivatpartys: 1,
      privatpartys: [{ id }],
    });
    expect(
      (await t.app.request(`/api/privatpartys/personen/${personId}`, json('admin-token', 'DELETE')))
        .status,
    ).toBe(409);
    await t.app.request(`/api/privatpartys/${id}`, json('admin-token', 'DELETE'));
    expect(
      (await t.app.request(`/api/privatpartys/personen/${personId}`, json('admin-token', 'DELETE')))
        .status,
    ).toBe(200);
  });

  it('creates, lists, edits and deletes a Privatparty', async () => {
    const t = await setup();
    const personId = await t.person();
    const post = (body: unknown) =>
      t.app.request('/api/privatpartys', json('admin-token', 'POST', body));
    expect((await post({ personId, termine: [] })).status).toBe(400);
    expect((await post({ termine: [termin()] })).status).toBe(400);
    expect((await post({ personId: 'gibt-es-nicht', termine: [termin()] })).status).toBe(404);
    const { id } = await t.anlegen();
    const abgesagt = await t.anlegen({ anlass: null });
    await t.app.request(
      `/api/privatpartys/${abgesagt.id}/status`,
      json('admin-token', 'PUT', { status: 'abgesagt' }),
    );
    const liste = async (status?: string) =>
      (await (
        await t.app.request(
          `/api/privatpartys${status ? `?status=${status}` : ''}`,
          json('admin-token', 'GET'),
        )
      ).json()) as { id: string }[];
    expect((await liste()).map((p) => p.id)).toEqual([id]);
    expect((await liste('alle')).map((p) => p.id).sort()).toEqual([id, abgesagt.id].sort());
    expect((await liste('abgesagt')).map((p) => p.id)).toEqual([abgesagt.id]);

    const d = await t.holen(id);
    expect(d).toMatchObject({
      status: 'offen',
      anlass: '30. Geburtstag',
      person: { name: 'Eva Muster' },
      unbeantwortet: false,
      umfrage: null,
      event: null,
    });
    expect(d.termine.map((x) => [x.datum, x.stufe])).toEqual([
      ['2099-03-14', 'bevorzugt'],
      ['2099-03-21', 'notfalls'],
    ]);
    const put = await t.app.request(
      `/api/privatpartys/${id}`,
      json('admin-token', 'PUT', {
        personId: d.person!.id,
        anlass: null,
        notizen: 'Wünscht DJ',
        termine: [{ ...d.termine[1]!, stufe: 'moeglich' }],
      }),
    );
    expect(put.status).toBe(200);
    const neu = await t.holen(id);
    expect(neu).toMatchObject({ anlass: null, notizen: 'Wünscht DJ' });
    expect(neu.termine).toEqual([{ ...d.termine[1], stufe: 'moeglich' }]);
    expect(
      (await t.app.request(`/api/privatpartys/${id}`, json('admin-token', 'DELETE'))).status,
    ).toBe(200);
    expect(
      (await t.app.request(`/api/privatpartys/${id}`, json('admin-token', 'GET'))).status,
    ).toBe(404);
  });

  it('accepts a date directly: event at the wished times, no contact data, status zugesagt', async () => {
    const t = await setup();
    const { id } = await t.anlegen();
    const d = await t.holen(id);
    const wunsch = d.termine[0]!;
    expect(
      (
        await t.app.request(
          `/api/privatpartys/${id}/zusage`,
          json('admin-token', 'POST', { terminId: 'x', vorlageId: 'privat' }),
        )
      ).status,
    ).toBe(400);
    const res = await t.app.request(
      `/api/privatpartys/${id}/zusage`,
      json('admin-token', 'POST', { terminId: wunsch.id, vorlageId: 'privat' }),
    );
    expect(res.status).toBe(201);
    expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
      expect.objectContaining({
        titel: 'Privatparty',
        kategorieId: 'party',
        beginn: '2099-03-14T18:00:00.000Z',
        ende: '2099-03-15T01:00:00.000Z',
        beschreibung: null,
      }),
      'a',
    );
    t.kalender.event.mockResolvedValue({
      id: 'e1',
      anzeigeTitel: 'Privatparty',
      beginn: '2099-03-14T18:00:00.000Z',
    } as unknown as EventDto);
    expect(await t.holen(id)).toMatchObject({
      status: 'zugesagt',
      terminId: wunsch.id,
      event: { id: 'e1' },
    });
    // Already accepted.
    expect(
      (
        await t.app.request(
          `/api/privatpartys/${id}/zusage`,
          json('admin-token', 'POST', { terminId: wunsch.id, vorlageId: 'privat' }),
        )
      ).status,
    ).toBe(409);
    // The accepted date cannot be removed.
    const d2 = await t.holen(id);
    const put = await t.app.request(
      `/api/privatpartys/${id}`,
      json('admin-token', 'PUT', {
        personId: d2.person!.id,
        termine: [{ ...d2.termine[1]! }],
      }),
    );
    expect(put.status).toBe(409);
    // A request with an event cannot be deleted.
    expect(
      (await t.app.request(`/api/privatpartys/${id}`, json('admin-token', 'DELETE'))).status,
    ).toBe(409);
  });

  it('deletes the event when the request leaves "zugesagt"', async () => {
    const t = await setup();
    const { id } = await t.anlegen();
    const wunsch = (await t.holen(id)).termine[0]!;
    await t.app.request(
      `/api/privatpartys/${id}/zusage`,
      json('admin-token', 'POST', { terminId: wunsch.id, vorlageId: 'privat' }),
    );
    const res = await t.app.request(
      `/api/privatpartys/${id}/status`,
      json('admin-token', 'PUT', { status: 'abgesagt' }),
    );
    expect(res.status).toBe(200);
    expect(t.kalender.eventLoeschen).toHaveBeenCalledWith('e1');
    expect(await t.holen(id)).toMatchObject({ status: 'abgesagt', terminId: null, event: null });
    // Accepting again through the status route needs date and Vorlage.
    expect(
      (
        await t.app.request(
          `/api/privatpartys/${id}/status`,
          json('admin-token', 'PUT', { status: 'zugesagt' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await t.app.request(
          `/api/privatpartys/${id}/status`,
          json('admin-token', 'PUT', {
            status: 'zugesagt',
            terminId: wunsch.id,
            vorlageId: 'privat',
          }),
        )
      ).status,
    ).toBe(200);
    // An event that is already gone does not block going back to "offen".
    t.kalender.eventLoeschen.mockResolvedValueOnce(false);
    expect(
      (
        await t.app.request(
          `/api/privatpartys/${id}/status`,
          json('admin-token', 'PUT', { status: 'offen' }),
        )
      ).status,
    ).toBe(200);
    expect(await t.holen(id)).toMatchObject({ status: 'offen', terminId: null });
  });

  it('builds a poll over the wish dates and turns the chosen one into the event', async () => {
    const t = await setup();
    const { id } = await t.anlegen();
    const umfrage = (body: unknown, token = 'admin-token') =>
      t.app.request(`/api/privatpartys/${id}/umfrage`, json(token, 'POST', body));
    expect(
      (await umfrage({ vorlageId: 'gibt-es-nicht', endetAm: '2099-03-01', pflicht: true })).status,
    ).toBe(400);
    expect(
      (await umfrage({ vorlageId: 'privat', endetAm: '2000-01-01', pflicht: true })).status,
    ).toBe(400);
    const res = await umfrage({ vorlageId: 'privat', endetAm: '2099-03-01', pflicht: false });
    expect(res.status).toBe(201);
    const { id: umfrageId } = (await res.json()) as { id: string };
    expect(
      (await umfrage({ vorlageId: 'privat', endetAm: '2099-03-01', pflicht: true })).status,
    ).toBe(409);
    const d = await t.holen(id);
    expect(d.umfrage).toMatchObject({ id: umfrageId, laeuft: true });
    const u = (await (
      await t.app.request(`/api/umfragen/${umfrageId}`, json('member-token', 'GET'))
    ).json()) as UmfrageDetailDto;
    expect(u).toMatchObject({
      titel: 'Privatparty: Terminabstimmung',
      termin: { vorlageId: 'privat', kategorieId: 'party' },
      pflicht: { status: [] },
      optional: { status: ['anwaerter', 'mitglied', 'em', 'extern'] },
    });
    expect(u.fragen[0]!.optionen.map((o) => o.text)).toEqual([
      'Sa, 14.03.2099 · 19:00–02:00 · Bevorzugt',
      'Sa, 21.03.2099 · 19:00–02:00 · Nur notfalls',
    ]);
    // The member without the right does not see the poll's controls, the holder of the right does.
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'v' ? ['privatpartys:verwalten' as const] : [],
    );
    const sicht = async (token: string) =>
      (await (
        await t.app.request(`/api/umfragen/${umfrageId}`, json(token, 'GET'))
      ).json()) as UmfrageDetailDto;
    expect((await sicht('vorstand-token')).darfBearbeiten).toBe(true);
    expect((await sicht('member-token')).darfBearbeiten).toBe(false);
    // End the poll and create the event with the wished times.
    expect(
      (await t.app.request(`/api/umfragen/${umfrageId}/beenden`, json('member-token', 'POST')))
        .status,
    ).toBe(403);
    expect(
      (await t.app.request(`/api/umfragen/${umfrageId}/beenden`, json('vorstand-token', 'POST')))
        .status,
    ).toBe(200);
    const zweite = u.fragen[0]!.optionen[1]!;
    t.kalender.event.mockResolvedValue({
      id: 'e1',
      anzeigeTitel: 'Privatparty',
      beginn: '2099-03-21T18:00:00.000Z',
      schichten: [],
    } as unknown as EventDto);
    const ev = await t.app.request(
      `/api/umfragen/${umfrageId}/event`,
      json('vorstand-token', 'POST', { optionId: zweite.id }),
    );
    expect(ev.status).toBe(201);
    expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
      expect.objectContaining({
        titel: 'Privatparty',
        beginn: '2099-03-21T18:00:00.000Z',
        ende: '2099-03-22T01:00:00.000Z',
      }),
      'v',
    );
    const danach = await t.holen(id);
    expect(danach).toMatchObject({ status: 'zugesagt', event: { id: 'e1' } });
    expect(danach.terminId).toBe(danach.termine[1]!.id);
  });

  it('adjusts the options of a running poll when the Wunschtermine change', async () => {
    const t = await setup();
    const { id } = await t.anlegen();
    const res = await t.app.request(
      `/api/privatpartys/${id}/umfrage`,
      json('admin-token', 'POST', { vorlageId: 'privat', endetAm: '2099-03-01', pflicht: false }),
    );
    const { id: umfrageId } = (await res.json()) as { id: string };
    const optionen = async () =>
      (
        (await (
          await t.app.request(`/api/umfragen/${umfrageId}`, json('member-token', 'GET'))
        ).json()) as UmfrageDetailDto
      ).fragen[0]!;
    const vorher = await optionen();
    const [erste, zweite] = vorher.optionen;
    // Everybody votes for the second date; the vote is gone when it is removed.
    const stimme = await t.app.request(
      `/api/umfragen/${umfrageId}/stimme`,
      json('member-token', 'PUT', {
        antworten: [{ frageId: vorher.id, optionIds: [zweite!.id] }],
      }),
    );
    expect(stimme.status).toBe(200);
    // 'a' votes for the first date.
    await t.app.request(
      `/api/umfragen/${umfrageId}/stimme`,
      json('admin-token', 'PUT', {
        antworten: [{ frageId: vorher.id, optionIds: [erste!.id] }],
      }),
    );
    const poll = (await optionen()) && t.umfragenListe.get(umfrageId)!;
    const nachrichten = () =>
      t.gesendet.splice(0).filter((g) => g.url === `/app/umfragen/${umfrageId}`);
    nachrichten();
    const d = await t.holen(id);
    const put = (termine: unknown[]) =>
      t.app.request(
        `/api/privatpartys/${id}`,
        json('admin-token', 'PUT', {
          personId: d.person!.id,
          anlass: d.anlass,
          notizen: null,
          termine,
        }),
      );
    // Added date: new option, old ones (and their ids) stay.
    expect(
      (
        await put([
          d.termine[0],
          d.termine[1],
          { datum: '2099-03-28', beginn: '18:00', ende: '23:00', stufe: 'moeglich' },
        ])
      ).status,
    ).toBe(200);
    // Nobody's vote became invalid: everybody in the circle hears about the change, once.
    expect(
      nachrichten()
        .map((g) => [g.endpoint.split('/').pop(), g.titel, g.text])
        .sort(),
    ).toEqual(['a', 'm2', 'v'].map((sub) => [sub, poll.titel, 'Die Termine haben sich geändert.']));
    // Same dates again: nothing changes, nothing is sent.
    expect(
      (
        await put([
          d.termine[0],
          d.termine[1],
          { datum: '2099-03-28', beginn: '18:00', ende: '23:00', stufe: 'moeglich' },
        ])
      ).status,
    ).toBe(200);
    expect(nachrichten()).toEqual([]);
    const mitNeuem = await optionen();
    expect(mitNeuem.optionen.map((o) => o.text)).toEqual([
      'Sa, 14.03.2099 · 19:00–02:00 · Bevorzugt',
      'Sa, 21.03.2099 · 19:00–02:00 · Nur notfalls',
      'Sa, 28.03.2099 · 18:00–23:00 · Möglich',
    ]);
    expect(mitNeuem.optionen.slice(0, 2).map((o) => o.id)).toEqual([erste!.id, zweite!.id]);
    // Changed time of the first date: old option goes, a new one comes; the second keeps its vote.
    expect((await put([{ ...d.termine[0], beginn: '20:00' }, d.termine[1]])).status).toBe(200);
    // 'a' lost the vote on the first date and is asked to vote again; the others are just told.
    expect(
      nachrichten()
        .map((g) => [g.endpoint.split('/').pop(), g.titel, g.text])
        .sort(),
    ).toEqual([
      [
        'a',
        'Bitte stimme erneut ab',
        `Die Termine von „${poll.titel}“ haben sich geändert. Bitte stimme erneut ab.`,
      ],
      ['m2', poll.titel, 'Die Termine haben sich geändert.'],
      ['v', poll.titel, 'Die Termine haben sich geändert.'],
    ]);
    const geaendert = await optionen();
    expect(geaendert.optionen.map((o) => o.text)).toEqual([
      'Sa, 14.03.2099 · 20:00–02:00 · Bevorzugt',
      'Sa, 21.03.2099 · 19:00–02:00 · Nur notfalls',
    ]);
    expect(geaendert.optionen[0]!.id).not.toBe(erste!.id);
    expect(geaendert.optionen[1]!.id).toBe(zweite!.id);
    // Removing the voted date drops the vote.
    expect((await put([{ ...d.termine[0], beginn: '20:00' }])).status).toBe(200);
    const nurErste = await optionen();
    expect(nurErste.optionen).toHaveLength(1);
    expect(t.umfragenListe.get(umfrageId)!.stimmen).toEqual([]);
    // The chosen option is still matched back to its wish date.
    t.kalender.event.mockResolvedValue({
      id: 'e1',
      anzeigeTitel: 'Privatparty',
      beginn: '2099-03-14T19:00:00.000Z',
      schichten: [],
    } as unknown as EventDto);
    await t.app.request(`/api/umfragen/${umfrageId}/beenden`, json('admin-token', 'POST'));
    const ev = await t.app.request(
      `/api/umfragen/${umfrageId}/event`,
      json('admin-token', 'POST', { optionId: nurErste.optionen[0]!.id }),
    );
    expect(ev.status).toBe(201);
    expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
      expect.objectContaining({ beginn: '2099-03-14T19:00:00.000Z' }),
      expect.anything(),
    );
  });

  it('lets holders of the right outside the circle see and vote in the poll of a Privatparty only', async () => {
    const t = await setup();
    const { id } = await t.anlegen();
    const res = await t.app.request(
      `/api/privatpartys/${id}/umfrage`,
      json('admin-token', 'POST', { vorlageId: 'privat', endetAm: '2099-03-01', pflicht: false }),
    );
    const { id: umfrageId } = (await res.json()) as { id: string };
    const fremd = await t.app.request('/api/umfragen', {
      ...json('admin-token', 'POST', {
        titel: 'Sommerfest',
        beschreibung: null,
        endetAm: '2099-03-01',
        anonym: false,
        ergebnisse: 'sofort',
        pflicht: { status: [], posten: [], personen: ['a'] },
        optional: { status: [], posten: [], personen: [] },
        erinnerungenPflicht: [],
        erinnerungenOptional: [],
        fragen: [
          {
            text: 'Wann?',
            freitext: false,
            maxAntworten: 1,
            optionen: [{ text: 'A' }, { text: 'B' }],
          },
        ],
      }),
    });
    expect(fremd.status).toBe(201);
    const fremdId = ((await fremd.json()) as { id: string }).id;
    // r has no profile and so is outside the circle; m2 is in it. Only r holds the right.
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'r' ? ['privatpartys:verwalten' as const] : [],
    );
    const ids = async (token: string, pfad: string) => {
      const r = await t.app.request(pfad, json(token, 'GET'));
      if (r.status !== 200) throw new Error(`${token} ${r.status} ${await r.text()}`);
      return ((await r.json()) as UmfrageListeDto[]).map((u) => u.id);
    };
    // The holder outside the circle sees the poll in the list and may vote (the gate passes; without a profile: 400, not 403).
    expect(await ids('reader-token', '/api/umfragen')).toEqual([umfrageId]);
    const detail = (await (
      await t.app.request(`/api/umfragen/${umfrageId}`, json('reader-token', 'GET'))
    ).json()) as UmfrageDetailDto;
    expect(detail).toMatchObject({ meinKreis: null, darfAbstimmen: true });
    const stimme = (token: string, uid: string) =>
      t.app.request(
        `/api/umfragen/${uid}/stimme`,
        json(token, 'PUT', {
          antworten: [
            { frageId: detail.fragen[0]!.id, optionIds: [detail.fragen[0]!.optionen[0]!.id] },
          ],
        }),
      );
    expect((await stimme('reader-token', umfrageId)).status).toBe(400);
    // Without the right the same caller gets 404 (poll hidden), also on the list.
    t.posten.rechteVon.mockImplementation(async () => []);
    expect(await ids('reader-token', '/api/umfragen')).toEqual([]);
    expect((await stimme('reader-token', umfrageId)).status).toBe(404);
    // The right grants nothing on other polls.
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'r' ? ['privatpartys:verwalten' as const] : [],
    );
    expect(
      (await t.app.request(`/api/umfragen/${fremdId}`, json('reader-token', 'GET'))).status,
    ).toBe(404);
    expect((await stimme('reader-token', fremdId)).status).toBe(404);
    expect(await ids('reader-token', '/api/umfragen')).toEqual([umfrageId]);
  });

  it('ends the running poll when the request is declined and then refuses an event from it', async () => {
    const t = await setup();
    const { id } = await t.anlegen();
    const res = await t.app.request(
      `/api/privatpartys/${id}/umfrage`,
      json('admin-token', 'POST', { vorlageId: 'privat', endetAm: '2099-03-01', pflicht: false }),
    );
    const { id: umfrageId } = (await res.json()) as { id: string };
    expect((await t.holen(id)).umfrage).toMatchObject({ laeuft: true });
    await t.app.request(
      `/api/privatpartys/${id}/status`,
      json('admin-token', 'PUT', { status: 'abgesagt' }),
    );
    expect((await t.holen(id)).umfrage).toMatchObject({ laeuft: false });
    const u = (await (
      await t.app.request(`/api/umfragen/${umfrageId}`, json('admin-token', 'GET'))
    ).json()) as UmfrageDetailDto;
    const ev = await t.app.request(
      `/api/umfragen/${umfrageId}/event`,
      json('admin-token', 'POST', { optionId: u.fragen[0]!.optionen[0]!.id }),
    );
    expect(ev.status).toBe(409);
    expect(await ev.json()).toEqual({
      error: 'Die Privatparty ist bereits zugesagt oder abgesagt.',
    });
    expect(t.kalender.eventAnlegen).not.toHaveBeenCalled();
  });

  it('refuses an event from the poll of an already accepted request', async () => {
    const t = await setup();
    const { id } = await t.anlegen();
    const res = await t.app.request(
      `/api/privatpartys/${id}/umfrage`,
      json('admin-token', 'POST', { vorlageId: 'privat', endetAm: '2099-03-01', pflicht: false }),
    );
    const { id: umfrageId } = (await res.json()) as { id: string };
    const wunsch = (await t.holen(id)).termine[0]!;
    // The direct acceptance also ends the poll.
    await t.app.request(
      `/api/privatpartys/${id}/zusage`,
      json('admin-token', 'POST', { terminId: wunsch.id, vorlageId: 'privat' }),
    );
    t.kalender.event.mockResolvedValue({
      id: 'e1',
      anzeigeTitel: 'Privatparty',
      schichten: [],
    } as unknown as EventDto);
    t.kalender.eventAnlegen.mockClear();
    const u = (await (
      await t.app.request(`/api/umfragen/${umfrageId}`, json('admin-token', 'GET'))
    ).json()) as UmfrageDetailDto;
    const ev = await t.app.request(
      `/api/umfragen/${umfrageId}/event`,
      json('admin-token', 'POST', { optionId: u.fragen[0]!.optionen[0]!.id }),
    );
    expect(ev.status).toBe(409);
    expect(t.kalender.eventAnlegen).not.toHaveBeenCalled();
  });

  it('shows the link to the Privatparty in the event only to holders of the right', async () => {
    const t = await setup();
    const { id } = await t.anlegen();
    const wunsch = (await t.holen(id)).termine[0]!;
    await t.app.request(
      `/api/privatpartys/${id}/zusage`,
      json('admin-token', 'POST', { terminId: wunsch.id, vorlageId: 'privat' }),
    );
    t.kalender.event.mockResolvedValue({
      id: 'e1',
      titel: 'Privatparty',
      anzeigeTitel: 'Privatparty',
      schichten: [],
      teilnahmen: [],
      nichtVerfuegbar: [],
      verantwortlich: null,
    } as unknown as EventDto);
    const abfrage = async (token: string) =>
      (await (
        await t.app.request('/api/kalender/events/e1', json(token, 'GET'))
      ).json()) as EventDto;
    expect((await abfrage('admin-token')).privatpartyId).toBe(id);
    expect((await abfrage('member-token')).privatpartyId).toBeUndefined();
  });
});
