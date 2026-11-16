import { describe, expect, it } from 'vitest';
import { type Konto } from '../admin';
import { verwendetMeldung, WarenKonflikt, WarenUngueltig } from '../waren';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('inventar', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const zeitpunkt = '2026-05-01T10:00:00.000Z';

  it('lets everyone read and rearrange, but only Inventar-Verwalter change master data', async () => {
    const { app, inventar } = makeApp();
    for (const url of [
      '/api/inventar/kategorien',
      '/api/inventar/gegenstaende',
      '/api/inventar/gegenstaende/g1',
      '/api/inventar/ifcos',
      '/api/inventar/ifcos/i1',
      '/api/inventar/ifco-typen',
      '/api/inventar/ausleihen',
      '/api/inventar/ausleihen/a1',
    ]) {
      expect((await app.request(url, json('reader-token', 'GET'))).status, url).toBe(200);
    }
    for (const [url, method] of [
      ['/api/inventar/kategorien', 'POST'],
      ['/api/inventar/kategorien/k1', 'PUT'],
      ['/api/inventar/kategorien/k1', 'DELETE'],
      ['/api/inventar/kategorien/k1/archiv', 'PUT'],
      ['/api/inventar/gegenstaende', 'POST'],
      ['/api/inventar/gegenstaende/g1', 'PUT'],
      ['/api/inventar/gegenstaende/g1', 'DELETE'],
      ['/api/inventar/gegenstaende/g1/archiv', 'PUT'],
      ['/api/inventar/ifcos', 'POST'],
      ['/api/inventar/ifcos/i1', 'PUT'],
      ['/api/inventar/ifcos/i1', 'DELETE'],
      ['/api/inventar/ifcos/i1/archiv', 'PUT'],
      ['/api/inventar/ifco-typen', 'POST'],
      ['/api/inventar/ifco-typen/t1', 'PUT'],
      ['/api/inventar/ifco-typen/t1', 'DELETE'],
      ['/api/inventar/ifco-typen/t1/archiv', 'PUT'],
    ] as const) {
      const res = await app.request(url, json('reader-token', method, {}));
      expect(res.status, `${method} ${url}`).toBe(403);
    }
    expect(inventar.kategorieAnlegen).not.toHaveBeenCalled();
    expect(inventar.gegenstandAnlegen).not.toHaveBeenCalled();
    expect(inventar.ifcoAnlegen).not.toHaveBeenCalled();

    const ok = await app.request(
      '/api/inventar/kategorien',
      json('vorstand-token', 'POST', { name: 'Technik' }),
    );
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ id: 'k2' });
    expect(inventar.kategorieAnlegen).toHaveBeenCalledWith({ name: 'Technik', parentId: null });
    const admin = await app.request(
      '/api/inventar/ifcos',
      json('admin-token', 'POST', { name: 'Spanngurtkiste' }),
    );
    expect(admin.status).toBe(201);
    expect(inventar.ifcoAnlegen).toHaveBeenCalledWith({
      name: 'Spanngurtkiste',
      beschreibung: null,
      lagerortId: null,
      typId: null,
      inhalt: [],
    });
  });

  it('manages IFCO-Typen: validates, deletes only unused ones, archives', async () => {
    const { app, inventar, inventarVerwendet } = makeApp();
    const typ = { name: ' 6410 ', grundflaeche: 'gross', hoeheCm: 10 };
    const send = (url: string, method: string, body?: unknown) =>
      app.request(url, json('vorstand-token', method, body));
    const res = await send('/api/inventar/ifco-typen', 'POST', typ);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 't2' });
    expect(inventar.ifcoTypAnlegen).toHaveBeenCalledWith({
      name: '6410',
      grundflaeche: 'gross',
      hoeheCm: 10,
    });
    for (const ungueltig of [
      { ...typ, hoeheCm: 0 },
      { ...typ, hoeheCm: 10.25 },
      { ...typ, grundflaeche: 'mittel' },
      { ...typ, name: ' ' },
      { name: 'x' },
    ]) {
      expect((await send('/api/inventar/ifco-typen', 'POST', ungueltig)).status).toBe(400);
    }
    expect((await send('/api/inventar/ifco-typen/t1', 'PUT', typ)).status).toBe(200);
    expect((await send('/api/inventar/ifco-typen/nix', 'PUT', typ)).status).toBe(404);
    expect((await send('/api/inventar/ifco-typen/nix', 'DELETE')).status).toBe(404);
    expect((await send('/api/inventar/ifco-typen/t1', 'DELETE')).status).toBe(200);
    inventarVerwendet.add('t1');
    const used = await send('/api/inventar/ifco-typen/t1', 'DELETE');
    expect(used.status).toBe(409);
    expect(await used.json()).toEqual({ error: verwendetMeldung('IFCO-Typ') });
    const archiv = await send('/api/inventar/ifco-typen/t1/archiv', 'PUT', { archiviert: true });
    expect(archiv.status).toBe(200);
    expect(inventar.ifcoTypArchivieren).toHaveBeenCalledWith('t1', true);
  });

  it('passes the IFCO type and maps a capacity error to 400', async () => {
    const { app, inventar } = makeApp();
    const meldung =
      'Passt nicht auf „HR11“ (20 cm hoch, 1 Stellfläche): „X“ (6416, 16 cm) hat keinen Platz.';
    inventar.ifcoPlatzSetzen.mockRejectedValueOnce(new WarenUngueltig(meldung));
    const res = await app.request(
      '/api/inventar/ifcos/i1/platz',
      json('reader-token', 'PUT', { lagerortId: 'l1' }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: meldung });
    await app.request(
      '/api/inventar/ifcos',
      json('admin-token', 'POST', { name: 'Kiste', typId: 't1', lagerortId: 'l1' }),
    );
    expect(inventar.ifcoAnlegen).toHaveBeenCalledWith({
      name: 'Kiste',
      beschreibung: null,
      lagerortId: 'l1',
      typId: 't1',
      inhalt: [],
    });
  });

  it('requires authentication', async () => {
    const { app } = makeApp();
    expect((await app.request('/api/inventar/gegenstaende')).status).toBe(401);
  });

  it('creates a Gegenstand with its first Zugang (Anzahl 1, gekauft by default)', async () => {
    const { app, inventar } = makeApp();
    const datum = '2026-10-10';
    const post = (body: unknown) =>
      app.request('/api/inventar/gegenstaende', json('admin-token', 'POST', body));
    expect((await post({ name: 'Beamer', datum })).status).toBe(400);
    expect((await post({ name: 'Beamer', kategorieId: 'k1', anzahl: 0, datum })).status).toBe(400);
    expect((await post({ name: ' ', kategorieId: 'k1', datum })).status).toBe(400);
    expect((await post({ name: 'Beamer', kategorieId: 'k1' })).status).toBe(400);
    expect((await post({ name: 'Beamer', kategorieId: 'k1', datum })).status).toBe(201);
    expect(inventar.gegenstandAnlegen).toHaveBeenCalledWith(
      {
        name: 'Beamer',
        beschreibung: null,
        kategorieId: 'k1',
        anzahl: 1,
        grund: 'gekauft',
        datum,
        platz: null,
        teilVon: null,
        virtuell: false,
        anzahlJe: null,
        teile: [],
      },
      'a',
    );
    const platz = { lagerortId: 'l1', ifcoId: null, anzahl: 3 };
    expect(
      (await post({ name: 'Zelt', kategorieId: 'k1', anzahl: 3, datum, grund: 'geschenkt', platz }))
        .status,
    ).toBe(201);
    expect(inventar.gegenstandAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ platz, grund: 'geschenkt' }),
      'a',
    );
    const zwei = { lagerortId: 'l1', ifcoId: 'i1', anzahl: 1 };
    expect((await post({ name: 'Zelt', kategorieId: 'k1', datum, platz: zwei })).status).toBe(400);
  });

  it('validates parts and virtual Gegenstände when creating', async () => {
    const { app, inventar } = makeApp();
    const datum = '2026-10-10';
    const post = (body: unknown) =>
      app.request('/api/inventar/gegenstaende', json('admin-token', 'POST', body));
    const basis = { name: 'Winkel', kategorieId: 'k1', datum };
    // A part needs pieces per parent, and cannot be virtual.
    expect((await post({ ...basis, teilVon: 'g1' })).status).toBe(400);
    expect((await post({ ...basis, teilVon: 'g1', anzahlJe: 0 })).status).toBe(400);
    expect((await post({ ...basis, teilVon: 'g1', anzahlJe: 4, virtuell: true })).status).toBe(400);
    expect((await post({ ...basis, teilVon: 'g1', anzahlJe: 12 })).status).toBe(201);
    expect(inventar.gegenstandAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ teilVon: 'g1', anzahlJe: 12, virtuell: false }),
      'a',
    );
    // anzahlJe without a parent is dropped.
    expect((await post({ ...basis, anzahlJe: 3 })).status).toBe(201);
    expect(inventar.gegenstandAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ teilVon: null, anzahlJe: null }),
      'a',
    );
    // A virtual Gegenstand has no Platz of its own.
    const platz = { lagerortId: 'l1', ifcoId: null, anzahl: 1 };
    expect((await post({ ...basis, virtuell: true, platz })).status).toBe(400);
    expect((await post({ ...basis, virtuell: true })).status).toBe(201);
  });

  it('creates parts without category, reason and day, and parts together with their parent', async () => {
    const { app, inventar } = makeApp();
    const datum = '2026-10-10';
    const post = (body: unknown) =>
      app.request('/api/inventar/gegenstaende', json('admin-token', 'POST', body));
    // A part needs no category, reason or day.
    expect((await post({ name: 'Winkel', teilVon: 'g1', anzahlJe: 12, anzahl: 5 })).status).toBe(
      201,
    );
    const teilDaten = inventar.gegenstandAnlegen.mock.lastCall?.[0];
    expect(teilDaten).toMatchObject({ kategorieId: null, teilVon: 'g1', anzahl: 5 });
    expect(teilDaten?.grund).toBeUndefined();
    expect(teilDaten?.datum).toBeUndefined();
    // Everything else still does.
    expect((await post({ name: 'Zelt', datum })).status).toBe(400);
    expect((await post({ name: 'Zelt', kategorieId: 'k1' })).status).toBe(400);
    // Parts together with the parent.
    const teile = [
      { name: 'Plane', anzahlJe: 1 },
      { name: 'Winkel', anzahlJe: 12, platz: { lagerortId: 'l1' } },
    ];
    const zelt = { name: 'Pavillon', kategorieId: 'k1', datum, anzahl: 3 };
    expect((await post({ ...zelt, teile })).status).toBe(201);
    expect(inventar.gegenstandAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({
        teile: [
          { name: 'Plane', anzahlJe: 1, platz: null },
          { name: 'Winkel', anzahlJe: 12, platz: { lagerortId: 'l1', ifcoId: null } },
        ],
      }),
      'a',
    );
    expect((await post({ ...zelt, teile: [{ name: 'Plane' }] })).status).toBe(400);
    expect((await post({ ...zelt, teile: [{ name: ' ', anzahlJe: 1 }] })).status).toBe(400);
    expect(
      (
        await post({
          ...zelt,
          teile: [{ name: 'Plane', anzahlJe: 1, platz: { lagerortId: 'l1', ifcoId: 'i1' } }],
        })
      ).status,
    ).toBe(400);
    const doppelt = [
      { name: 'Plane', anzahlJe: 1 },
      { name: 'plane ', anzahlJe: 2 },
    ];
    expect((await post({ ...zelt, teile: doppelt })).status).toBe(400);
    // A part cannot have parts.
    expect((await post({ ...zelt, teilVon: 'g1', anzahlJe: 1, teile })).status).toBe(400);
  });

  it('lists, books and deletes Zugänge and Abgänge', async () => {
    const { app, inventar, userAdmin } = makeApp();
    userAdmin.konten.mockResolvedValue(new Map([['v', { username: 'vera' } as Konto]]));
    const liste = await app.request(
      '/api/inventar/gegenstaende/g1/bewegungen',
      json('reader-token', 'GET'),
    );
    expect(liste.status).toBe(200);
    expect(
      ((await liste.json()) as { ersteller: { username: string } }[])[0]!.ersteller.username,
    ).toBe('vera');
    expect(
      (await app.request('/api/inventar/gegenstaende/nix/bewegungen', json('reader-token', 'GET')))
        .status,
    ).toBe(404);
    const abgang = {
      art: 'abgang',
      grund: 'verloren',
      anzahl: 3,
      datum: '2026-10-11',
      von: { art: 'platz', lagerortId: 'l1' },
    };
    const post = (token: string, body: unknown) =>
      app.request('/api/inventar/gegenstaende/g1/bewegungen', json(token, 'POST', body));
    expect((await post('reader-token', abgang)).status).toBe(403);
    expect((await post('admin-token', abgang)).status).toBe(201);
    expect(inventar.bewegungBuchen).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({
        art: 'abgang',
        von: { art: 'platz', lagerortId: 'l1', ifcoId: null },
      }),
      'a',
    );
    expect((await post('admin-token', { ...abgang, grund: 'gekauft' })).status).toBe(400);
    const loeschen = (token: string, id: string) =>
      app.request(`/api/inventar/gegenstaende/g1/bewegungen/${id}`, json(token, 'DELETE'));
    expect((await loeschen('reader-token', 'b1')).status).toBe(403);
    expect((await loeschen('admin-token', 'b1')).status).toBe(200);
    expect((await loeschen('admin-token', 'nix')).status).toBe(404);
  });

  it('maps unknown ids to 404 and used entries to 409', async () => {
    const { app, inventarVerwendet } = makeApp();
    expect(
      (await app.request('/api/inventar/gegenstaende/nix', json('reader-token', 'GET'))).status,
    ).toBe(404);
    expect((await app.request('/api/inventar/ifcos/nix', json('reader-token', 'GET'))).status).toBe(
      404,
    );
    expect(
      (await app.request('/api/inventar/ausleihen/nix', json('reader-token', 'GET'))).status,
    ).toBe(404);
    expect(
      (await app.request('/api/inventar/kategorien/nix', json('admin-token', 'DELETE'))).status,
    ).toBe(404);
    inventarVerwendet.add('g1');
    const res = await app.request('/api/inventar/gegenstaende/g1', json('admin-token', 'DELETE'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: verwendetMeldung('Gegenstand') });
  });

  it('archives with the flag from the body', async () => {
    const { app, inventar } = makeApp();
    const res = await app.request(
      '/api/inventar/kategorien/k1/archiv',
      json('admin-token', 'PUT', { archiviert: true }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ archiviert: true });
    expect(inventar.kategorieArchivieren).toHaveBeenCalledWith('k1', true);
  });

  it('replaces Plätze, IFCO-Platz and IFCO-Inhalt for every member', async () => {
    const { app, inventar, inventarVerwendet } = makeApp();
    const plaetze = {
      plaetze: [
        { lagerortId: 'l1', anzahl: 6 },
        { ifcoId: 'i1', anzahl: 4 },
      ],
    };
    const put = (url: string, body: unknown, token = 'reader-token') =>
      app.request(url, json(token, 'PUT', body));
    expect((await put('/api/inventar/gegenstaende/g1/plaetze', plaetze)).status).toBe(200);
    expect(inventar.gegenstandPlaetzeSetzen).toHaveBeenCalledWith(
      'g1',
      [
        { lagerortId: 'l1', ifcoId: null, anzahl: 6 },
        { lagerortId: null, ifcoId: 'i1', anzahl: 4 },
      ],
      undefined,
    );
    expect(
      (
        await put('/api/inventar/gegenstaende/g1/plaetze', {
          plaetze: [],
          verbaut: [{ ort: ' unter der Bar ', anzahl: 3 }],
        })
      ).status,
    ).toBe(200);
    expect(inventar.gegenstandPlaetzeSetzen).toHaveBeenLastCalledWith(
      'g1',
      [],
      [{ ort: 'unter der Bar', anzahl: 3 }],
    );
    expect((await put('/api/inventar/gegenstaende/nix/plaetze', plaetze)).status).toBe(404);
    // Invalid: both targets, no target, zero amount, duplicate target.
    for (const ungueltig of [
      [{ lagerortId: 'l1', ifcoId: 'i1', anzahl: 1 }],
      [{ anzahl: 1 }],
      [{ lagerortId: 'l1', anzahl: 0 }],
      [
        { lagerortId: 'l1', anzahl: 1 },
        { lagerortId: 'l1', anzahl: 2 },
      ],
    ]) {
      expect(
        (await put('/api/inventar/gegenstaende/g1/plaetze', { plaetze: ungueltig })).status,
      ).toBe(400);
    }
    inventarVerwendet.add('g1');
    const konflikt = await put('/api/inventar/gegenstaende/g1/plaetze', { plaetze: [] });
    expect(konflikt.status).toBe(409);
    expect(await konflikt.json()).toEqual({
      error: 'Davon sind noch 3 verliehen oder vorgemerkt.',
    });

    expect((await put('/api/inventar/ifcos/i1/platz', { lagerortId: 'l1' })).status).toBe(200);
    expect(inventar.ifcoPlatzSetzen).toHaveBeenCalledWith('i1', 'l1');
    expect((await put('/api/inventar/ifcos/i1/platz', { lagerortId: null })).status).toBe(200);
    expect(inventar.ifcoPlatzSetzen).toHaveBeenLastCalledWith('i1', null);
    expect((await put('/api/inventar/ifcos/nix/platz', {})).status).toBe(404);

    const inhalt = { positionen: [{ gegenstandId: 'g1', anzahl: 6 }] };
    expect((await put('/api/inventar/ifcos/i1/inhalt', inhalt)).status).toBe(200);
    expect(inventar.ifcoInhaltSetzen).toHaveBeenCalledWith(
      'i1',
      inhalt.positionen.map((p) => ({ ...p, andere: [] })),
    );
    const andere = [{ lagerortId: 'l1', ifcoId: null, anzahl: 0 }];
    await put('/api/inventar/ifcos/i1/inhalt', {
      positionen: [{ gegenstandId: 'g1', anzahl: 2, andere }],
    });
    expect(inventar.ifcoInhaltSetzen).toHaveBeenLastCalledWith('i1', [
      { gegenstandId: 'g1', anzahl: 2, andere },
    ]);
    expect(
      (
        await put('/api/inventar/ifcos/i1/inhalt', {
          positionen: [
            { gegenstandId: 'g1', anzahl: 1 },
            { gegenstandId: 'g1', anzahl: 2 },
          ],
        })
      ).status,
    ).toBe(400);
  });

  describe('ausleihen', () => {
    const position = { gegenstandId: 'g1', lagerortId: 'l1', anzahl: 3 };
    const ausleihe = {
      an: 'Feuerwehr Musterdorf',
      organisiertVon: 'r',
      ausgeliehenAm: zeitpunkt,
      rueckgabeGeplant: '2026-05-08',
      positionen: [position],
    };

    it('creates an Ausleihe for the caller and returns its id', async () => {
      const { app, inventar } = makeApp();
      const res = await app.request(
        '/api/inventar/ausleihen',
        json('reader-token', 'POST', ausleihe),
      );
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ id: 'a2' });
      expect(inventar.ausleiheAnlegen).toHaveBeenCalledWith(
        {
          an: 'Feuerwehr Musterdorf',
          organisiertVon: 'r',
          ausgeliehenAm: zeitpunkt,
          rueckgabeGeplant: '2026-05-08',
          kommentar: null,
          positionen: [{ gegenstandId: 'g1', lagerortId: 'l1', ifcoId: null, anzahl: 3 }],
        },
        'r',
      );
    });

    it('rejects invalid Ausleihen with 400 and too large amounts with the store message', async () => {
      const { app } = makeApp();
      const post = (body: unknown) =>
        app.request('/api/inventar/ausleihen', json('reader-token', 'POST', body));
      expect((await post({ ...ausleihe, positionen: [] })).status).toBe(400);
      expect((await post({ ...ausleihe, an: ' ' })).status).toBe(400);
      expect((await post({ ...ausleihe, organisiertVon: undefined })).status).toBe(400);
      expect(
        (await post({ ...ausleihe, positionen: [{ ...position, ganzeIfco: true }] })).status,
      ).toBe(400);
      expect(
        (await post({ ...ausleihe, positionen: [{ ...position, ifcoId: 'i1' }] })).status,
      ).toBe(400);
      expect((await post({ ...ausleihe, positionen: [position, position] })).status).toBe(400);
      expect((await post({ ...ausleihe, ausgeliehenAm: 'gestern' })).status).toBe(400);
      expect((await post({ ...ausleihe, rueckgabeGeplant: '2026-04-30' })).status).toBe(400);
      const zuViel = await post({ ...ausleihe, positionen: [{ ...position, anzahl: 6 }] });
      expect(zuViel.status).toBe(400);
      expect(await zuViel.json()).toEqual({
        error: 'Von „Kabeltrommel“ sind bei „Lager“ nur noch 5 verfügbar.',
      });
    });

    it('requires a planned return day on create and edit', async () => {
      const { app, inventar } = makeApp();
      const ohne = { ...ausleihe, rueckgabeGeplant: undefined };
      for (const body of [ohne, { ...ohne, rueckgabeGeplant: null }]) {
        const res = await app.request(
          '/api/inventar/ausleihen',
          json('reader-token', 'POST', body),
        );
        expect(res.status).toBe(400);
        expect(JSON.stringify(await res.json())).toContain('Bitte gib an, wann es zurückkommt.');
      }
      const kopf = { ...ohne, positionen: undefined };
      const put = await app.request(
        '/api/inventar/ausleihen/a1',
        json('reader-token', 'PUT', kopf),
      );
      expect(put.status).toBe(400);
      expect(JSON.stringify(await put.json())).toContain('Bitte gib an, wann es zurückkommt.');
      expect(inventar.ausleiheAnlegen).not.toHaveBeenCalled();
      expect(inventar.ausleiheAktualisieren).not.toHaveBeenCalled();
    });

    it('accepts a reservation next to an existing one and rejects an overlapping one', async () => {
      const { app } = makeApp();
      const post = (von: string, bis: string) =>
        app.request(
          '/api/inventar/ausleihen',
          json('reader-token', 'POST', {
            ...ausleihe,
            ausgeliehenAm: `${von}T08:00:00.000Z`,
            rueckgabeGeplant: bis,
            positionen: [{ ...position, anzahl: 5 }],
          }),
        );
      expect((await post('2026-10-22', '2026-10-25')).status).toBe(201);
      expect((await post('2026-10-27', '2026-10-29')).status).toBe(201);
      const belegt = await post('2026-10-24', '2026-10-26');
      expect(belegt.status).toBe(400);
      expect(((await belegt.json()) as { error: string }).error).toContain(
        '5 an Jugendgruppe vorgemerkt (25.10.–27.10.2026)',
      );
    });

    it('shows the organiser with the Cognito username', async () => {
      const { app, userAdmin } = makeApp();
      userAdmin.konten.mockResolvedValue(
        new Map([['r', { sub: 'r', kontoName: 'u1', username: 'rita', aktiviert: true } as Konto]]),
      );
      const res = await app.request('/api/inventar/ausleihen/a1', json('reader-token', 'GET'));
      expect(
        ((await res.json()) as { organisator: { username: string } }).organisator.username,
      ).toBe('rita');
    });

    it('returns positions, edits the header and deletes', async () => {
      const { app, inventar } = makeApp();
      const rueckgabe = (id: string, body: unknown) =>
        app.request(`/api/inventar/ausleihen/${id}/rueckgabe`, json('reader-token', 'POST', body));
      expect((await rueckgabe('a1', { positionIds: ['p1'], zurueckAm: zeitpunkt })).status).toBe(
        200,
      );
      expect(inventar.ausleiheRueckgabe).toHaveBeenCalledWith('a1', ['p1'], zeitpunkt);
      expect((await rueckgabe('nix', { positionIds: ['p1'], zurueckAm: zeitpunkt })).status).toBe(
        404,
      );
      expect((await rueckgabe('a1', { positionIds: [], zurueckAm: zeitpunkt })).status).toBe(400);
      expect((await rueckgabe('a1', { positionIds: ['p1'] })).status).toBe(400);
      const morgenIso = new Date(Date.now() + 2 * 86_400_000).toISOString();
      expect((await rueckgabe('a1', { positionIds: ['p1'], zurueckAm: morgenIso })).status).toBe(
        400,
      );
      expect(
        (await rueckgabe('a1', { positionIds: ['bereits'], zurueckAm: zeitpunkt })).status,
      ).toBe(400);

      const kopf = {
        an: 'Verein',
        organisiertVon: 'r',
        ausgeliehenAm: zeitpunkt,
        rueckgabeGeplant: '2026-05-08',
      };
      expect(
        (await app.request('/api/inventar/ausleihen/a1', json('reader-token', 'PUT', kopf))).status,
      ).toBe(200);
      expect(inventar.ausleiheAktualisieren).toHaveBeenCalledWith('a1', {
        ...kopf,
        kommentar: null,
      });
      // The open Positionen can be replaced together with the header.
      const position = { gegenstandId: 'g1', lagerortId: 'l1', anzahl: 2 };
      const mitPositionen = (positionen: unknown) =>
        app.request(
          '/api/inventar/ausleihen/a1',
          json('reader-token', 'PUT', { ...kopf, positionen }),
        );
      expect((await mitPositionen([position])).status).toBe(200);
      expect(inventar.ausleiheAktualisieren).toHaveBeenLastCalledWith('a1', {
        ...kopf,
        kommentar: null,
        positionen: [{ ...position, ifcoId: null }],
      });
      expect((await mitPositionen([position, position])).status).toBe(400);
      expect((await mitPositionen([{ ...position, lagerortId: null }])).status).toBe(400);
      expect(
        (await app.request('/api/inventar/ausleihen/nix', json('reader-token', 'PUT', kopf)))
          .status,
      ).toBe(404);
      expect(
        (await app.request('/api/inventar/ausleihen/a1', json('reader-token', 'DELETE'))).status,
      ).toBe(200);
      expect(
        (await app.request('/api/inventar/ausleihen/nix', json('reader-token', 'DELETE'))).status,
      ).toBe(404);
    });

    it('lists only open Ausleihen with ?status=offen', async () => {
      const { app, inventar } = makeApp();
      await app.request('/api/inventar/ausleihen?status=offen', json('reader-token', 'GET'));
      expect(inventar.ausleihen).toHaveBeenLastCalledWith(true);
      await app.request('/api/inventar/ausleihen', json('reader-token', 'GET'));
      expect(inventar.ausleihen).toHaveBeenLastCalledWith(false);
    });
  });

  describe('aufraeumen', () => {
    it('shows the running Aufräumaktion with usernames', async () => {
      const { app, userAdmin } = makeApp();
      userAdmin.konten.mockResolvedValue(new Map([['v', { username: 'vera' } as Konto]]));
      const res = await app.request('/api/inventar/aufraeumen', json('reader-token', 'GET'));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        aktion: { gestartetVon: { username: string }; fertig: { ifcoId: string }[] };
      };
      expect(body.aktion.gestartetVon.username).toBe('vera');
      expect(body.aktion.fertig.map((f) => f.ifcoId)).toEqual(['i1']);
    });

    it('lets everyone start, end and mark IFCOs as the caller', async () => {
      const { app, inventar } = makeApp();
      const start = await app.request('/api/inventar/aufraeumen', json('reader-token', 'POST'));
      expect(start.status).toBe(201);
      expect(inventar.aufraeumenStarten).toHaveBeenCalledWith('r');
      const put = (id: string, body: unknown) =>
        app.request(`/api/inventar/aufraeumen/ifcos/${id}`, json('reader-token', 'PUT', body));
      expect((await put('i1', { fertig: true })).status).toBe(200);
      expect(inventar.aufraeumIfcoSetzen).toHaveBeenCalledWith('i1', true, 'r');
      expect((await put('i1', {})).status).toBe(400);
      expect((await put('nix', { fertig: false })).status).toBe(404);
      const ende = await app.request(
        '/api/inventar/aufraeumen/beenden',
        json('reader-token', 'POST'),
      );
      expect(ende.status).toBe(200);
      expect(inventar.aufraeumenBeenden).toHaveBeenCalledWith('r');
    });

    it('maps a second start to 409 and ending without one to 404', async () => {
      const { app, inventar } = makeApp();
      inventar.aufraeumenStarten.mockRejectedValueOnce(new WarenKonflikt('läuft schon'));
      expect(
        (await app.request('/api/inventar/aufraeumen', json('reader-token', 'POST'))).status,
      ).toBe(409);
      inventar.aufraeumenBeenden.mockResolvedValueOnce(false);
      expect(
        (await app.request('/api/inventar/aufraeumen/beenden', json('reader-token', 'POST')))
          .status,
      ).toBe(404);
    });
  });
});
