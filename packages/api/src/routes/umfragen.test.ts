import { describe, expect, it } from 'vitest';
import { heuteBerlin, tagNachher, type EventDto, type UmfrageDetailDto } from '@c4/shared';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('umfragen', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const endetAm = tagNachher(heuteBerlin(), 10);
  const umfrage = (extra: Record<string, unknown> = {}) => ({
    titel: 'Sommerfest',
    beschreibung: null,
    endetAm,
    anonym: false,
    ergebnisse: 'sofort',
    pflicht: { status: ['mitglied'], posten: [], personen: [] },
    optional: { status: ['em'], posten: [], personen: [] },
    erinnerungenPflicht: [3],
    erinnerungenOptional: [],
    fragen: [
      {
        text: 'Wann?',
        freitext: true,
        maxAntworten: 1,
        optionen: [{ text: 'Samstag' }, { text: 'Sonntag' }],
      },
    ],
    ...extra,
  });

  /** Profiles for a, r, v, m2 (usernames user-<sub>): m2 is Mitglied, r EM, the others Anwärter. */
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
      await t.push.store.aboSpeichern(sub, {
        endpoint: `https://push.example/${sub}`,
        keys: { p256dh: 'p', auth: 'a' },
      });
    }
    await t.mitglieder.statusSetzen('m2', 'mitglied');
    await t.mitglieder.statusSetzen('r', 'em');
    const anlegen = async (extra: Record<string, unknown> = {}) => {
      const res = await t.app.request(
        '/api/umfragen',
        json('vorstand-token', 'POST', umfrage(extra)),
      );
      expect(res.status).toBe(201);
      return ((await res.json()) as { id: string }).id;
    };
    const holen = async (id: string, token: string) => {
      const res = await t.app.request(`/api/umfragen/${id}`, json(token, 'GET'));
      return { status: res.status, body: (await res.json()) as UmfrageDetailDto };
    };
    const abstimmen = (id: string, token: string, antworten: unknown) =>
      t.app.request(`/api/umfragen/${id}/stimme`, json(token, 'PUT', { antworten }));
    return { ...t, anlegen, holen, abstimmen };
  }

  it('tells both circles about a new poll, but not the creator', async () => {
    const t = await setup();
    const id = await t.anlegen({ endetAm: '2099-01-31' });
    expect(t.gesendet).toEqual(
      expect.arrayContaining([
        {
          endpoint: 'https://push.example/m2',
          titel: 'Neue Umfrage',
          text: 'user-v fragt: „Sommerfest“. Bitte stimme bis 31.01.2099 ab.',
          url: `/app/umfragen/${id}`,
        },
        {
          endpoint: 'https://push.example/r',
          titel: 'Neue Umfrage',
          text: 'user-v fragt: „Sommerfest“. Du kannst bis 31.01.2099 abstimmen.',
          url: `/app/umfragen/${id}`,
        },
      ]),
    );
    expect(t.gesendet).toHaveLength(2);
  });

  it('uses the question as title of a poll with a single question', async () => {
    const t = await setup();
    const id = await t.anlegen({ endetAm: '2099-01-31', titel: '' });
    const { body } = await t.holen(id, 'member-token');
    expect(body.titel).toBe('Wann?');
    expect(body.fragen[0]!.text).toBe('Wann?');
  });

  it('rejects a status that votes both mandatorily and optionally', async () => {
    const t = await setup();
    const res = await t.app.request(
      '/api/umfragen',
      json(
        'vorstand-token',
        'POST',
        umfrage({ optional: { status: ['mitglied', 'em'], posten: [], personen: [] } }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it('rejects an end date in the past', async () => {
    const t = await setup();
    const res = await t.app.request(
      '/api/umfragen',
      json('vorstand-token', 'POST', umfrage({ endetAm: '2020-01-01' })),
    );
    expect(res.status).toBe(400);
  });

  it('shows a poll only to its circles, the creator and the Verwaltung', async () => {
    const t = await setup();
    const id = await t.anlegen({
      endetAm: '2099-01-31',
      pflicht: { status: [], posten: [], personen: ['m2'] },
      optional: { status: [], posten: [], personen: [] },
    });
    expect((await t.holen(id, 'member-token')).body.meinKreis).toBe('pflicht');
    expect((await t.holen(id, 'vorstand-token')).body.darfBearbeiten).toBe(true);
    expect((await t.holen(id, 'admin-token')).body.darfLoeschen).toBe(true);
    expect((await t.holen(id, 'reader-token')).status).toBe(404);
    const liste = await t.app.request('/api/umfragen', json('reader-token', 'GET'));
    expect(await liste.json()).toEqual([]);
  });

  it('lists running polls and pages through the ended ones the caller may see', async () => {
    const t = await setup();
    const laufend = await t.anlegen({ endetAm: '2099-01-31' });
    const ids: string[] = [];
    for (let i = 0; i < 27; i++) {
      // Every fifth poll is only for a, so the member does not see it.
      const nurA = i % 5 === 0;
      const id = await t.anlegen({
        endetAm: '2099-01-31',
        ...(nurA && {
          pflicht: { status: [], posten: [], personen: ['a'] },
          optional: { status: [], posten: [], personen: [] },
        }),
      });
      await t.app.request(`/api/umfragen/${id}/beenden`, json('vorstand-token', 'POST'));
      t.umfragenListe.get(id)!.erstelltAm = new Date(Date.UTC(2026, 0, 1, 0, i));
      if (!nurA) ids.push(id);
    }
    const laufende = (await (
      await t.app.request('/api/umfragen', json('member-token', 'GET'))
    ).json()) as { id: string }[];
    expect(laufende.map((u) => u.id)).toEqual([laufend]);

    const seite = async (nach?: string) => {
      const res = await t.app.request(
        `/api/umfragen/beendet${nach ? `?nach=${encodeURIComponent(nach)}` : ''}`,
        json('member-token', 'GET'),
      );
      expect(res.status).toBe(200);
      return (await res.json()) as { umfragen: { id: string }[]; weiter: string | null };
    };
    const erste = await seite();
    expect(erste.umfragen).toHaveLength(20);
    expect(erste.weiter).not.toBeNull();
    const zweite = await seite(erste.weiter!);
    expect(zweite.weiter).toBeNull();
    // Newest first, each visible poll exactly once.
    expect([...erste.umfragen, ...zweite.umfragen].map((u) => u.id)).toEqual(ids.reverse());

    const kaputt = await t.app.request(
      '/api/umfragen/beendet?nach=kaputt',
      json('member-token', 'GET'),
    );
    expect(kaputt.status).toBe(400);
  });

  it('checks the ballot and counts the votes', async () => {
    const t = await setup();
    const id = await t.anlegen({ endetAm: '2099-01-31' });
    const { body } = await t.holen(id, 'member-token');
    const frage = body.fragen[0]!;
    const [sa] = frage.optionen;
    expect(
      (
        await t.abstimmen(id, 'member-token', [
          { frageId: frage.id, optionIds: [sa!.id], freitext: 'x' },
        ])
      ).status,
    ).toBe(400);
    expect(
      (await t.abstimmen(id, 'member-token', [{ frageId: frage.id, optionIds: [sa!.id] }])).status,
    ).toBe(200);
    expect(
      (await t.abstimmen(id, 'vorstand-token', [{ frageId: frage.id, optionIds: [sa!.id] }]))
        .status,
    ).toBe(403);
    const nachher = (await t.holen(id, 'reader-token')).body;
    expect(nachher.abgaben).toBe(1);
    expect(nachher.fragen[0]!.optionen[0]).toMatchObject({
      stimmen: 1,
      personen: [expect.objectContaining({ sub: 'm2', username: 'user-m2' })],
    });
    expect(nachher.teilnehmende).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rolle: 'pflicht', abgestimmt: true }),
        expect.objectContaining({ rolle: 'optional', abgestimmt: false }),
      ]),
    );
  });

  it('never reveals who voted in an anonymous poll', async () => {
    const t = await setup();
    const id = await t.anlegen({ endetAm: '2099-01-31', anonym: true });
    const frage = (await t.holen(id, 'member-token')).body.fragen[0]!;
    await t.abstimmen(id, 'member-token', [
      { frageId: frage.id, optionIds: [], freitext: 'Geheim' },
    ]);
    const { body } = await t.holen(id, 'admin-token');
    expect(body.teilnehmende).toBeNull();
    expect(body.fragen[0]!.optionen[0]!.personen).toBeNull();
    expect(body.fragen[0]!.freitexte).toEqual([{ text: 'Geheim', person: null }]);
    expect(JSON.stringify(body)).not.toContain('m2');
    const res = await t.app.request(
      `/api/umfragen/${id}`,
      json('vorstand-token', 'PUT', umfrage({ endetAm: '2099-01-31', anonym: false })),
    );
    expect(res.status).toBe(400);
  });

  it('orders free texts of an anonymous poll by text, not by who voted last', async () => {
    const t = await setup();
    const id = await t.anlegen({ endetAm: '2099-01-31', anonym: true });
    const frage = (await t.holen(id, 'member-token')).body.fragen[0]!;
    await t.abstimmen(id, 'member-token', [{ frageId: frage.id, optionIds: [], freitext: 'Zeta' }]);
    await t.abstimmen(id, 'reader-token', [
      { frageId: frage.id, optionIds: [], freitext: 'Alpha' },
    ]);
    const { body } = await t.holen(id, 'admin-token');
    expect(body.fragen[0]!.freitexte!.map((f) => f.text)).toEqual(['Alpha', 'Zeta']);
  });

  it('hides the results until the end when chosen, except for the creator', async () => {
    const t = await setup();
    const id = await t.anlegen({ endetAm: '2099-01-31', ergebnisse: 'nach_ende' });
    const frage = (await t.holen(id, 'member-token')).body.fragen[0]!;
    await t.abstimmen(id, 'member-token', [
      { frageId: frage.id, optionIds: [frage.optionen[0]!.id] },
    ]);
    expect((await t.holen(id, 'member-token')).body.fragen[0]!.optionen[0]!.stimmen).toBeNull();
    expect((await t.holen(id, 'vorstand-token')).body.fragen[0]!.optionen[0]!.stimmen).toBe(1);
    await t.app.request(`/api/umfragen/${id}/beenden`, json('vorstand-token', 'POST'));
    expect((await t.holen(id, 'member-token')).body.fragen[0]!.optionen[0]!.stimmen).toBe(1);
    expect(
      (
        await t.abstimmen(id, 'member-token', [
          { frageId: frage.id, optionIds: [frage.optionen[0]!.id] },
        ])
      ).status,
    ).toBe(409);
  });

  it('asks voters of a removed option to vote again after confirming', async () => {
    const t = await setup();
    const id = await t.anlegen({ endetAm: '2099-01-31' });
    const frage = (await t.holen(id, 'member-token')).body.fragen[0]!;
    const [sa, so] = frage.optionen;
    await t.abstimmen(id, 'member-token', [{ frageId: frage.id, optionIds: [sa!.id] }]);
    await t.abstimmen(id, 'reader-token', [{ frageId: frage.id, optionIds: [so!.id] }]);
    t.gesendet.length = 0;
    const geaendert = umfrage({
      endetAm: '2099-01-31',
      fragen: [
        {
          id: frage.id,
          text: 'Wann?',
          freitext: true,
          maxAntworten: 1,
          optionen: [{ id: so!.id, text: 'Sonntag' }],
        },
      ],
    });
    const ohne = await t.app.request(
      `/api/umfragen/${id}`,
      json('vorstand-token', 'PUT', geaendert),
    );
    expect(ohne.status).toBe(409);
    expect(await ohne.json()).toMatchObject({ betroffene: 1 });
    const mit = await t.app.request(
      `/api/umfragen/${id}`,
      json('vorstand-token', 'PUT', { ...geaendert, bestaetigt: true }),
    );
    expect(mit.status).toBe(200);
    expect(t.gesendet).toEqual([
      {
        endpoint: 'https://push.example/m2',
        titel: 'Bitte stimme erneut ab',
        text: '„Sommerfest“ wurde geändert, deine Stimme zählt so nicht mehr.',
        url: `/app/umfragen/${id}`,
      },
    ]);
    const m2 = (await t.holen(id, 'member-token')).body;
    expect(m2).toMatchObject({ abgestimmt: false, erneutNoetig: true });
    expect((await t.holen(id, 'reader-token')).body).toMatchObject({
      abgestimmt: true,
      abgaben: 1,
    });
  });

  it('lets only the creator and the Verwaltung edit, and only the Verwaltung delete', async () => {
    const t = await setup();
    const id = await t.anlegen({ endetAm: '2099-01-31' });
    const body = umfrage({ endetAm: '2099-01-31', titel: 'Neu' });
    expect(
      (await t.app.request(`/api/umfragen/${id}`, json('member-token', 'PUT', body))).status,
    ).toBe(403);
    expect(
      (await t.app.request(`/api/umfragen/${id}`, json('admin-token', 'PUT', body))).status,
    ).toBe(200);
    expect(
      (await t.app.request(`/api/umfragen/${id}`, json('vorstand-token', 'DELETE'))).status,
    ).toBe(403);
    expect((await t.app.request(`/api/umfragen/${id}`, json('admin-token', 'DELETE'))).status).toBe(
      200,
    );
    expect(t.umfragenListe.size).toBe(0);
  });

  describe('Terminumfragen', () => {
    const kategorie = (id: string, art: 'dienste' | 'teilnahme') => ({
      id,
      name: id,
      farbe: 'blue',
      art,
      teilnahmeStatus: art === 'teilnahme' ? [] : null,
      dauer: 'eintaegig' as const,
      protokoll: false,
      protokollArt: 'sitzung' as const,
      benutzt: false,
      archiviert: false,
    });
    const terminUmfrage = (termin: Record<string, unknown>) =>
      umfrage({
        endetAm: '2099-01-31',
        titel: 'Sitzung',
        termin: { jeTermin: false, beginn: '19:00', ende: '21:00', bedarf: null, ...termin },
        fragen: [
          {
            text: '',
            freitext: false,
            maxAntworten: null,
            optionen: [
              { text: '', termin: { datum: '2099-01-10', beginn: null, ende: null } },
              { text: '', termin: { datum: '2099-01-11', beginn: null, ende: null } },
            ],
          },
        ],
      });

    async function terminSetup(termin: Record<string, unknown>) {
      const t = await setup();
      t.kalender.kategorien.mockResolvedValue([
        kategorie('sitzung', 'teilnahme'),
        kategorie('bar', 'dienste'),
      ]);
      t.kalender.dienstformen.mockResolvedValue([
        { id: 'tresen', name: 'Tresen', reihenfolge: 1, archiviert: false },
      ]);
      const res = await t.app.request(
        '/api/umfragen',
        json('vorstand-token', 'POST', terminUmfrage(termin)),
      );
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };
      const frage = (await t.holen(id, 'member-token')).body.fragen[0]!;
      const [a, b] = frage.optionen;
      await t.abstimmen(id, 'member-token', [{ frageId: frage.id, optionIds: [a!.id, b!.id] }]);
      await t.abstimmen(id, 'reader-token', [{ frageId: frage.id, optionIds: [b!.id] }]);
      t.gesendet.length = 0;
      const festlegen = (token: string, optionId: string) =>
        t.app.request(`/api/umfragen/${id}/event`, json(token, 'POST', { optionId }));
      return { ...t, id, a: a!, b: b!, festlegen };
    }

    it('creates a participation event with everybody who agreed, once the poll ended', async () => {
      const t = await terminSetup({ kategorieId: 'sitzung' });
      expect(t.a.text).toBe('Sa, 10.01.2099');
      expect((await t.festlegen('vorstand-token', t.a.id)).status).toBe(409);
      await t.app.request(`/api/umfragen/${t.id}/beenden`, json('vorstand-token', 'POST'));
      expect((await t.festlegen('member-token', t.a.id)).status).toBe(403);
      // Not the date with the most votes: the creator decides.
      const res = await t.festlegen('vorstand-token', t.a.id);
      expect(res.status).toBe(201);
      expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
        expect.objectContaining({
          titel: 'Sitzung',
          kategorieId: 'sitzung',
          beginn: '2099-01-10T18:00:00.000Z',
          ende: '2099-01-10T20:00:00.000Z',
          schichten: [],
          teilnahmeStatus: [],
          eingeladen: ['m2'],
        }),
        'v',
      );
      expect(t.gesendet).toEqual(
        expect.arrayContaining([
          {
            endpoint: 'https://push.example/m2',
            titel: 'Termin steht fest',
            text: '„Sitzung“: Sa, 10.01.2099. Du bist eingetragen.',
            url: '/app/kalender/events/e1',
          },
          expect.objectContaining({
            endpoint: 'https://push.example/r',
            text: '„Sitzung“: Sa, 10.01.2099.',
          }),
        ]),
      );
      const { body } = await t.holen(t.id, 'vorstand-token');
      expect(body).toMatchObject({ eventId: 'e1', eventOptionId: t.a.id, darfEventAnlegen: false });
      t.kalender.event.mockResolvedValue({ id: 'e1' } as EventDto);
      expect((await t.festlegen('vorstand-token', t.b.id)).status).toBe(409);
    });

    it('creates one Betrieb Schicht with the Bedarf and enters everybody who agreed', async () => {
      const t = await setup();
      t.kalender.kategorien.mockResolvedValue([kategorie('bar', 'dienste')]);
      const ohne = await t.app.request(
        '/api/umfragen',
        json('vorstand-token', 'POST', terminUmfrage({ kategorieId: 'bar' })),
      );
      expect(ohne.status).toBe(400);

      const d = await terminSetup({
        kategorieId: 'bar',
        bedarf: { dienstformId: 'tresen', minimum: 2, wunsch: 3 },
      });
      d.kalender.event.mockResolvedValueOnce({
        id: 'e1',
        schichten: [
          {
            id: 's1',
            art: 'betrieb',
            bedarfe: [{ dienstformId: 'tresen', minimum: 2, wunsch: 3 }],
          },
        ],
      } as unknown as EventDto);
      await d.app.request(`/api/umfragen/${d.id}/beenden`, json('vorstand-token', 'POST'));
      expect((await d.festlegen('vorstand-token', d.b.id)).status).toBe(201);
      expect(d.kalender.eventAnlegen).toHaveBeenCalledWith(
        expect.objectContaining({
          schichten: [
            expect.objectContaining({
              art: 'betrieb',
              bedarfe: [{ dienstformId: 'tresen', minimum: 2, wunsch: 3 }],
            }),
          ],
          teilnahmeStatus: null,
          eingeladen: [],
        }),
        'v',
      );
      const eingetragen = d.kalender.dienstEintragen.mock.calls.map(([schicht, daten]) => [
        schicht,
        daten.mitgliedSub,
        daten.dienstformId,
      ]);
      expect(eingetragen).toEqual([
        ['s1', 'm2', 'tresen'],
        ['s1', 'r', 'tresen'],
      ]);
    });

    it('takes the title from the Kategorie and lets members answer "none of the dates"', async () => {
      const t = await setup();
      t.kalender.kategorien.mockResolvedValue([kategorie('sitzung', 'teilnahme')]);
      const res = await t.app.request(
        '/api/umfragen',
        json('vorstand-token', 'POST', {
          ...terminUmfrage({ kategorieId: 'sitzung' }),
          titel: '',
        }),
      );
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };
      const { body } = await t.holen(id, 'member-token');
      expect(body.titel).toBe('sitzung');
      const frage = body.fragen[0]!;
      expect(
        (await t.abstimmen(id, 'member-token', [{ frageId: frage.id, optionIds: [] }])).status,
      ).toBe(200);
      const danach = (await t.holen(id, 'vorstand-token')).body;
      expect(danach.abgestimmt).toBe(false);
      expect(danach.abgaben).toBe(1);
      expect(danach.fragen[0]!.keiner).toMatchObject({
        anzahl: 1,
        personen: [expect.objectContaining({ sub: 'm2' })],
      });
      await t.app.request(`/api/umfragen/${id}/beenden`, json('vorstand-token', 'POST'));
      await t.app.request(
        `/api/umfragen/${id}/event`,
        json('vorstand-token', 'POST', { optionId: frage.optionen[0]!.id }),
      );
      // The title came from the Kategorie, so the event keeps following it.
      expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
        expect.objectContaining({ titel: '', eingeladen: [] }),
        'v',
      );
    });

    it('needs an end date per answer for multi-day Kategorien', async () => {
      const t = await setup();
      t.kalender.kategorien.mockResolvedValue([
        { ...kategorie('fahrt', 'teilnahme'), dauer: 'ganztaegig' as const },
      ]);
      const ohneBis = await t.app.request(
        '/api/umfragen',
        json('vorstand-token', 'POST', terminUmfrage({ kategorieId: 'fahrt' })),
      );
      expect(ohneBis.status).toBe(400);
      const body = terminUmfrage({ kategorieId: 'fahrt' }) as unknown as {
        fragen: { optionen: { termin: Record<string, unknown> }[] }[];
      };
      body.fragen[0]!.optionen.forEach((o) => (o.termin.bis = '2099-01-13'));
      const res = await t.app.request('/api/umfragen', json('vorstand-token', 'POST', body));
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };
      const u = (await t.holen(id, 'member-token')).body;
      expect(u.fragen[0]!.optionen[0]!.text).toBe('Sa, 10.01.2099 – Di, 13.01.2099');
      expect(u.terminDauer).toBe('ganztaegig');
    });

    it('creates the event from a Vorlage and spreads everybody over its Dienstformen', async () => {
      const t = await setup();
      t.kalender.kategorien.mockResolvedValue([kategorie('bar', 'dienste')]);
      t.kalender.dienstformen.mockResolvedValue([
        { id: 'tresen', name: 'Tresen', reihenfolge: 1, archiviert: false },
        { id: 'kasse', name: 'Kasse', reihenfolge: 2, archiviert: false },
      ]);
      t.kalender.vorlagen.mockResolvedValue([
        {
          id: 'barabend',
          titel: 'Barabend',
          beschreibung: 'Aus der Vorlage',
          kategorieId: 'bar',
          beginnZeit: '20:00',
          endeZeit: '01:00',
          teilnahmeStatus: null,
          tage: 1,
          bilderOrdner: false,
          archiviert: false,
          schichten: [
            {
              art: 'betrieb',
              beginnZeit: '20:00',
              endeZeit: '01:00',
              bedarfe: [
                { dienstformId: 'tresen', minimum: 1, wunsch: 2 },
                { dienstformId: 'kasse', minimum: 1, wunsch: 1 },
              ],
            },
          ],
        },
      ]);
      const res = await t.app.request(
        '/api/umfragen',
        json('vorstand-token', 'POST', {
          ...terminUmfrage({
            kategorieId: 'egal',
            vorlageId: 'barabend',
            beginn: null,
            ende: null,
          }),
          titel: '',
        }),
      );
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };
      const u = (await t.holen(id, 'member-token')).body;
      expect(u).toMatchObject({
        titel: 'Barabend',
        termin: { kategorieId: 'bar', vorlageId: 'barabend' },
        terminBedarf: { minimum: 2, wunsch: 3, dienstformen: ['Tresen', 'Kasse'] },
      });
      const frage = u.fragen[0]!;
      await t.abstimmen(id, 'member-token', [
        { frageId: frage.id, optionIds: [frage.optionen[0]!.id] },
      ]);
      await t.abstimmen(id, 'reader-token', [
        { frageId: frage.id, optionIds: [frage.optionen[0]!.id] },
      ]);
      await t.app.request(`/api/umfragen/${id}/beenden`, json('vorstand-token', 'POST'));
      t.kalender.event.mockResolvedValueOnce({
        id: 'e1',
        schichten: [
          {
            id: 's1',
            art: 'betrieb',
            bedarfe: [
              { dienstformId: 'tresen', minimum: 1, wunsch: 2 },
              { dienstformId: 'kasse', minimum: 1, wunsch: 1 },
            ],
          },
        ],
      } as unknown as EventDto);
      expect(
        (
          await t.app.request(
            `/api/umfragen/${id}/event`,
            json('vorstand-token', 'POST', { optionId: frage.optionen[0]!.id }),
          )
        ).status,
      ).toBe(201);
      expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
        expect.objectContaining({
          titel: 'Barabend',
          beschreibung: 'Aus der Vorlage',
          kategorieId: 'bar',
          beginn: '2099-01-10T19:00:00.000Z',
          ende: '2099-01-11T00:00:00.000Z',
        }),
        'v',
      );
      expect(
        t.kalender.dienstEintragen.mock.calls.map(([, d]) => [d.mitgliedSub, d.dienstformId]),
      ).toEqual([
        ['m2', 'tresen'],
        ['r', 'kasse'],
      ]);
    });

    it('lets members answer "none" in a free scheduling poll, which never becomes an event', async () => {
      const t = await setup();
      const res = await t.app.request(
        '/api/umfragen',
        json('vorstand-token', 'POST', {
          ...umfrage({ endetAm: '2099-01-31' }),
          terminFrei: true,
          fragen: [
            {
              text: '',
              freitext: false,
              maxAntworten: 1,
              optionen: [
                { text: '', termin: { datum: '2099-01-12', beginn: '19:00', ende: '21:00' } },
              ],
            },
          ],
        }),
      );
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };
      const { body } = await t.holen(id, 'member-token');
      expect(body).toMatchObject({ terminFrei: true, terminumfrage: true, termin: null });
      const frage = body.fragen[0]!;
      expect(frage.optionen[0]).toMatchObject({
        text: 'Mo, 12.01.2099, 19:00–21:00',
        termin: { datum: '2099-01-12', beginn: '19:00', ende: '21:00' },
      });
      expect(
        (await t.abstimmen(id, 'member-token', [{ frageId: frage.id, optionIds: [] }])).status,
      ).toBe(200);
      expect((await t.holen(id, 'member-token')).body.fragen[0]!.keiner).toMatchObject({
        anzahl: 1,
      });
      await t.app.request(`/api/umfragen/${id}/beenden`, json('vorstand-token', 'POST'));
      const event = await t.app.request(
        `/api/umfragen/${id}/event`,
        json('vorstand-token', 'POST', { optionId: frage.optionen[0]!.id }),
      );
      expect(event.status).toBe(400);
    });
  });
});
