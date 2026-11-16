import { describe, expect, it, vi } from 'vitest';
import { type BilderOrdnerDto, type EventDto } from '@c4/shared';
import { KalenderKonflikt } from '../kalender';
import { freigabenNachziehen } from '../onedrive';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('bilder', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  /** Event as the store returns it: 14.06.2026, 20:00-23:00 Berlin. */
  const bilderEvent = (patch: Partial<EventDto> = {}): EventDto =>
    ({
      id: 'e1',
      titel: 'Sommerfest',
      anzeigeTitel: 'Sommerfest',
      beschreibung: null,
      kategorie: null,
      art: 'dienste',
      dauer: 'eintaegig',
      beginn: '2026-06-14T18:00:00.000Z',
      ende: '2026-06-14T21:00:00.000Z',
      abgesagt: false,
      serie: null,
      bewertung: 'gruen',
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
      ...patch,
    }) as EventDto;
  const eventBody = {
    titel: 'Sommerfest',
    kategorieId: 'k1',
    beginn: '2026-06-14T18:00:00.000Z',
    ende: '2026-06-14T21:00:00.000Z',
    schichten: [],
  };
  const speichern = (t: ReturnType<typeof makeApp>, event: EventDto) =>
    t.kalender.event.mockImplementation(async () => event);

  describe('Ordnerliste', () => {
    it('lists folders newest first with date, name and linked event', async () => {
      const t = makeApp();
      t.onedrive.hinzufuegen('2025-06-14_Alt');
      const neu = t.onedrive.hinzufuegen('2026-07-18-20_Festival');
      t.onedrive.hinzufuegen('Lose Fotos');
      t.kalenderBilder.set('e9', { id: neu.id, url: neu.webUrl });
      const res = await t.app.request('/api/bilder/ordner', json('reader-token', 'GET'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        verbunden: true,
        stand: expect.any(String),
        ausCache: false,
        ordner: [
          {
            id: neu.id,
            name: '2026-07-18-20_Festival',
            webUrl: neu.webUrl,
            von: '2026-07-18',
            bis: '2026-07-20',
            eventName: 'Festival',
            genauigkeit: 'tag',
            freigabeUrl: null,
            eventId: 'e9',
          },
          expect.objectContaining({ name: '2025-06-14_Alt', eventId: null, bis: '2025-06-14' }),
          expect.objectContaining({
            name: 'Lose Fotos',
            von: null,
            bis: null,
            eventName: 'Lose Fotos',
          }),
        ],
      });
    });

    it('uses cached sharing links and creates no links while listing', async () => {
      const t = makeApp();
      const a = t.onedrive.hinzufuegen('2025-06-14_A');
      const b = t.onedrive.hinzufuegen('2025-06-15_B');
      t.freigaben.karte.set(a.id, 'https://1drv.ms/f/cached');
      const res = await t.app.request('/api/bilder/ordner', json('reader-token', 'GET'));
      const ordner = ((await res.json()) as { ordner: BilderOrdnerDto[] }).ordner;
      expect(ordner.find((o) => o.id === a.id)?.freigabeUrl).toBe('https://1drv.ms/f/cached');
      expect(ordner.find((o) => o.id === b.id)?.freigabeUrl).toBeNull();
      expect(t.onedrive.freigaben).toBe(0);
    });

    describe('Snapshot (quelle=cache)', () => {
      const lesen = async (t: ReturnType<typeof makeApp>, quelle = '?quelle=cache') =>
        (await (
          await t.app.request(`/api/bilder/ordner${quelle}`, json('reader-token', 'GET'))
        ).json()) as {
          verbunden: boolean;
          ordner: BilderOrdnerDto[];
          stand: string | null;
          ausCache: boolean;
        };

      it('is empty without a snapshot and does not ask OneDrive', async () => {
        const t = makeApp();
        t.onedrive.hinzufuegen('2025-06-14_A');
        t.onedrive.zustand.ausfall = true;
        expect(await lesen(t)).toEqual({
          verbunden: true,
          ordner: [],
          stand: null,
          ausCache: true,
        });
      });

      it('reports verbunden: false from the status', async () => {
        const t = makeApp();
        t.onedrive.zustand.verbunden = false;
        expect(await lesen(t)).toEqual({
          verbunden: false,
          ordner: [],
          stand: null,
          ausCache: true,
        });
      });

      it('returns the list stored by the live load, with fresh event and link data', async () => {
        const t = makeApp();
        const a = t.onedrive.hinzufuegen('2025-06-14_A');
        t.onedrive.hinzufuegen('2025-06-15_B');
        const live = await lesen(t, '');
        expect(live.ausCache).toBe(false);
        // OneDrive is not asked for the snapshot; links and events changed after the live load show up.
        t.onedrive.zustand.ausfall = true;
        t.kalenderBilder.set('e5', { id: a.id, url: a.webUrl });
        t.freigaben.karte.set(a.id, 'https://1drv.ms/f/neu');
        const cache = await lesen(t);
        expect(cache).toMatchObject({ verbunden: true, ausCache: true, stand: live.stand });
        expect(cache.ordner.map((o) => o.name)).toEqual(['2025-06-15_B', '2025-06-14_A']);
        expect(cache.ordner.find((o) => o.id === a.id)).toMatchObject({
          eventId: 'e5',
          freigabeUrl: 'https://1drv.ms/f/neu',
        });
      });

      it('shows a folder created with POST at once', async () => {
        const t = makeApp();
        t.onedrive.hinzufuegen('2025-06-14_A');
        await lesen(t, '');
        await t.app.request(
          '/api/bilder/ordner',
          json('reader-token', 'POST', { eventName: 'Neu', von: '2026-05-01' }),
        );
        const cache = await lesen(t);
        expect(cache.ordner.map((o) => o.name)).toEqual(['2026-05-01_Neu', '2025-06-14_A']);
      });
    });

    describe('Job bilder.freigaben', () => {
      it('creates the missing links of the snapshot folders', async () => {
        const t = makeApp();
        const a = t.onedrive.hinzufuegen('2025-06-14_A');
        const b = t.onedrive.hinzufuegen('2025-06-15_B');
        t.freigaben.karte.set(a.id, 'https://1drv.ms/f/cached');
        await t.app.request('/api/bilder/ordner', json('reader-token', 'GET'));
        const deps = { onedrive: t.onedrive, ordnerCache: t.ordnerCache, freigaben: t.freigaben };
        expect(await freigabenNachziehen(deps)).toBe(1);
        expect(t.onedrive.freigaben).toBe(1);
        expect(t.freigaben.karte.get(b.id)).toBe(`https://1drv.ms/f/${b.id}`);
        expect(await freigabenNachziehen(deps)).toBe(0);
      });

      it('respects the time budget, logs failures and does nothing when not connected', async () => {
        const t = makeApp();
        const a = t.onedrive.hinzufuegen('2025-06-14_A');
        const b = t.onedrive.hinzufuegen('2025-06-15_B');
        await t.app.request('/api/bilder/ordner', json('reader-token', 'GET'));
        const deps = { onedrive: t.onedrive, ordnerCache: t.ordnerCache, freigaben: t.freigaben };
        expect(await freigabenNachziehen(deps, 0)).toBe(0);
        const echt = t.onedrive.freigabeLink;
        t.onedrive.freigabeLink = async (id) => {
          if (id === a.id) throw new Error('kaputt');
          return echt(id);
        };
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await freigabenNachziehen(deps)).toBe(1);
        log.mockRestore();
        expect(t.freigaben.karte.has(a.id)).toBe(false);
        expect(t.freigaben.karte.has(b.id)).toBe(true);
        t.onedrive.zustand.verbunden = false;
        t.freigaben.karte.clear();
        expect(await freigabenNachziehen(deps)).toBe(0);
      });
    });

    it('reports the precision of year and month folders', async () => {
      const t = makeApp();
      t.onedrive.hinzufuegen('2025_Archiv');
      t.onedrive.hinzufuegen('2025-07');
      const res = await t.app.request('/api/bilder/ordner', json('reader-token', 'GET'));
      const ordner = ((await res.json()) as { ordner: BilderOrdnerDto[] }).ordner;
      expect(ordner.map((o) => [o.name, o.genauigkeit])).toEqual([
        ['2025-07', 'monat'],
        ['2025_Archiv', 'jahr'],
      ]);
    });

    it('answers verbunden: false when OneDrive is not connected', async () => {
      const t = makeApp();
      t.onedrive.zustand.verbunden = false;
      const res = await t.app.request('/api/bilder/ordner', json('reader-token', 'GET'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        verbunden: false,
        ordner: [],
        stand: null,
        ausCache: false,
      });
    });

    it('requires authentication and answers 502 when OneDrive fails', async () => {
      const t = makeApp();
      expect((await t.app.request('/api/bilder/ordner')).status).toBe(401);
      t.onedrive.zustand.ausfall = true;
      const res = await t.app.request('/api/bilder/ordner', json('reader-token', 'GET'));
      expect(res.status).toBe(502);
    });
  });

  describe('Ordner anlegen', () => {
    it('creates a folder with the shortest date form for every member', async () => {
      const t = makeApp();
      const res = await t.app.request(
        '/api/bilder/ordner',
        json('reader-token', 'POST', {
          eventName: ' Sommerfest ',
          von: '2026-07-30',
          bis: '2026-08-02',
        }),
      );
      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({
        name: '2026-07-30-08-02_Sommerfest',
        von: '2026-07-30',
        bis: '2026-08-02',
        eventName: 'Sommerfest',
        eventId: null,
      });
      expect([...t.onedrive.ordner.values()].map((o) => o.name)).toEqual([
        '2026-07-30-08-02_Sommerfest',
      ]);
    });

    it('puts underscores between the words and caches the sharing link', async () => {
      const t = makeApp();
      const res = await t.app.request(
        '/api/bilder/ordner',
        json('reader-token', 'POST', { eventName: 'Erster Mai', von: '2026-05-01' }),
      );
      const dto = (await res.json()) as BilderOrdnerDto;
      expect(dto).toMatchObject({
        name: '2026-05-01_Erster_Mai',
        eventName: 'Erster Mai',
        freigabeUrl: `https://1drv.ms/f/${dto.id}`,
      });
      expect(t.freigaben.karte.get(dto.id)).toBe(dto.freigabeUrl);
    });

    it('answers 409 for an existing name, 503 when not connected and 400 for bad input', async () => {
      const t = makeApp();
      t.onedrive.hinzufuegen('2026-06-14_Sommerfest');
      const body = { eventName: 'Sommerfest', von: '2026-06-14' };
      const doppelt = await t.app.request('/api/bilder/ordner', json('reader-token', 'POST', body));
      expect(doppelt.status).toBe(409);
      expect(await doppelt.json()).toEqual({
        error: 'Einen Ordner „2026-06-14_Sommerfest“ gibt es schon.',
      });
      expect(
        (
          await t.app.request(
            '/api/bilder/ordner',
            json('reader-token', 'POST', { eventName: '', von: '2026-06-14' }),
          )
        ).status,
      ).toBe(400);
      t.onedrive.zustand.verbunden = false;
      const nicht = await t.app.request('/api/bilder/ordner', json('reader-token', 'POST', body));
      expect(nicht.status).toBe(503);
      expect(await nicht.json()).toEqual({ error: 'OneDrive ist nicht verbunden.' });
    });
  });

  describe('Freigabe', () => {
    it('creates, caches and returns the sharing link for every member', async () => {
      const t = makeApp();
      const o = t.onedrive.hinzufuegen('2025-06-14_A');
      await t.ordnerCache.schreiben([o], new Date());
      const res = await t.app.request(
        `/api/bilder/ordner/${o.id}/freigabe`,
        json('reader-token', 'POST'),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ url: `https://1drv.ms/f/${o.id}` });
      expect(t.freigaben.karte.get(o.id)).toBe(`https://1drv.ms/f/${o.id}`);
    });

    it('answers 401, 503 and 404', async () => {
      const t = makeApp();
      const o = t.onedrive.hinzufuegen('2025-06-14_A');
      await t.ordnerCache.schreiben([o], new Date());
      const url = `/api/bilder/ordner/${o.id}/freigabe`;
      expect((await t.app.request(url, { method: 'POST' })).status).toBe(401);
      expect(
        (
          await t.app.request(
            '/api/bilder/ordner/gibtsnicht/freigabe',
            json('reader-token', 'POST'),
          )
        ).status,
      ).toBe(404);
      t.onedrive.zustand.verbunden = false;
      expect((await t.app.request(url, json('reader-token', 'POST'))).status).toBe(503);
    });

    it('refuses ids of folders the app does not know', async () => {
      const t = makeApp();
      const bekannt = t.onedrive.hinzufuegen('2025-06-14_A');
      const fremd = t.onedrive.hinzufuegen('2025-06-15_Fremd');
      await t.ordnerCache.schreiben([bekannt], new Date());
      const res = await t.app.request(
        `/api/bilder/ordner/${fremd.id}/freigabe`,
        json('reader-token', 'POST'),
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Ordner nicht gefunden' });
      expect(t.onedrive.freigaben).toBe(0);
      // A folder with a stored sharing link is known as well.
      t.freigaben.karte.set(fremd.id, 'https://1drv.ms/f/alt');
      const ok = await t.app.request(
        `/api/bilder/ordner/${fremd.id}/freigabe`,
        json('reader-token', 'POST'),
      );
      expect(ok.status).toBe(200);
    });
  });

  describe('Verbindung', () => {
    it('is for admins only', async () => {
      const t = makeApp();
      for (const [url, method] of [
        ['/api/bilder/verbindung', 'GET'],
        ['/api/bilder/verbindung', 'PUT'],
        ['/api/bilder/verbindung/login', 'POST'],
        ['/api/bilder/verbindung/code', 'POST'],
        ['/api/bilder/verbindung', 'DELETE'],
      ] as const) {
        const body = method === 'PUT' || method === 'POST' ? {} : undefined;
        expect((await t.app.request(url, json('reader-token', method, body))).status, url).toBe(
          403,
        );
      }
    });

    it('shows the status, saves the settings, logs in and disconnects', async () => {
      const t = makeApp();
      const status = await t.app.request('/api/bilder/verbindung', json('admin-token', 'GET'));
      expect(await status.json()).toMatchObject({ verbunden: true, basisPfad: 'Cloud4/Bilder' });

      const put = await t.app.request(
        '/api/bilder/verbindung',
        json('admin-token', 'PUT', { clientId: 'abc', clientSecret: 'geheim', basisPfad: 'X/Y' }),
      );
      expect(put.status).toBe(200);
      expect(await put.json()).toMatchObject({ basisPfad: 'X/Y', clientIdGesetzt: true });
      expect(JSON.stringify(await t.onedrive.status())).not.toContain('geheim');

      const login = await t.app.request(
        '/api/bilder/verbindung/login',
        json('admin-token', 'POST', {
          redirectUri: 'http://localhost:5173/app/bilder/einrichtung',
          state: 'zufall1234',
        }),
      );
      expect(login.status).toBe(200);
      expect(((await login.json()) as { url: string }).url).toContain('state=zufall1234');

      const code = await t.app.request(
        '/api/bilder/verbindung/code',
        json('admin-token', 'POST', {
          code: 'c1',
          redirectUri: 'http://localhost:5173/app/bilder/einrichtung',
        }),
      );
      expect(code.status).toBe(200);
      expect(t.onedrive.codes).toEqual(['c1']);
      const schlecht = await t.app.request(
        '/api/bilder/verbindung/code',
        json('admin-token', 'POST', {
          code: 'ungueltig',
          redirectUri: 'http://localhost:5173/app/bilder/einrichtung',
        }),
      );
      expect(schlecht.status).toBe(400);

      const del = await t.app.request('/api/bilder/verbindung', json('admin-token', 'DELETE'));
      expect(await del.json()).toMatchObject({ verbunden: false });
    });

    it('accepts only redirect URIs of the app', async () => {
      const t = makeApp(async () => {}, 'https://www.c4-leipzig.de');
      const login = (redirectUri: string) =>
        t.app.request(
          '/api/bilder/verbindung/login',
          json('admin-token', 'POST', { redirectUri, state: 'zufall1234' }),
        );
      expect((await login('https://www.c4-leipzig.de/app/bilder/einrichtung')).status).toBe(200);
      expect((await login('http://localhost:5173/app/bilder/einrichtung')).status).toBe(200);
      expect((await login('https://boese.example/app/bilder/einrichtung')).status).toBe(400);
      expect((await login('https://www.c4-leipzig.de/app/anderes')).status).toBe(400);
      expect(
        (await login('https://www.c4-leipzig.de.evil.com/app/bilder/einrichtung')).status,
      ).toBe(400);
    });
  });

  describe('Events', () => {
    it('creates the folder when a new event asks for it', async () => {
      const t = makeApp();
      speichern(t, bilderEvent());
      const res = await t.app.request(
        '/api/kalender/events',
        json('admin-token', 'POST', { ...eventBody, bilderOrdner: true }),
      );
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ id: 'e1' });
      const ordner = [...t.onedrive.ordner.values()];
      expect(ordner.map((o) => o.name)).toEqual(['2026-06-14_Sommerfest']);
      expect(t.kalenderBilder.get('e1')).toEqual({ id: ordner[0]!.id, url: ordner[0]!.webUrl });
    });

    it('creates no folder without the flag', async () => {
      const t = makeApp();
      speichern(t, bilderEvent());
      await t.app.request('/api/kalender/events', json('admin-token', 'POST', eventBody));
      expect(t.onedrive.ordner.size).toBe(0);
    });

    it('creates a folder on update for an event without one, and uses the multi-day range', async () => {
      const t = makeApp();
      speichern(
        t,
        bilderEvent({
          dauer: 'ganztaegig',
          beginn: '2026-07-17T22:00:00.000Z',
          ende: '2026-07-20T22:00:00.000Z',
        }),
      );
      const res = await t.app.request(
        '/api/kalender/events/e1',
        json('admin-token', 'PUT', { ...eventBody, bilderOrdner: true }),
      );
      expect(await res.json()).toEqual({ ok: true });
      expect([...t.onedrive.ordner.values()].map((o) => o.name)).toEqual([
        '2026-07-18-20_Sommerfest',
      ]);
    });

    it('renames the folder when title or date change', async () => {
      const t = makeApp();
      const alt = t.onedrive.hinzufuegen('2026-06-14_Sommerfest');
      t.kalenderBilder.set('e1', { id: alt.id, url: alt.webUrl });
      speichern(
        t,
        bilderEvent({
          anzeigeTitel: 'Winterfest',
          beginn: '2026-12-05T18:00:00.000Z',
          ende: '2026-12-05T21:00:00.000Z',
        }),
      );
      const res = await t.app.request(
        '/api/kalender/events/e1',
        json('admin-token', 'PUT', eventBody),
      );
      expect(await res.json()).toEqual({ ok: true });
      expect(t.onedrive.ordner.get(alt.id)?.name).toBe('2026-12-05_Winterfest');
      expect(t.kalenderBilder.get('e1')?.url).toBe(t.onedrive.ordner.get(alt.id)?.webUrl);
    });

    it('leaves a folder alone whose name is already right', async () => {
      const t = makeApp();
      const alt = t.onedrive.hinzufuegen('2026-06-14_Sommerfest');
      t.kalenderBilder.set('e1', { id: alt.id, url: 'alt' });
      speichern(t, bilderEvent());
      await t.app.request('/api/kalender/events/e1', json('admin-token', 'PUT', eventBody));
      expect(t.kalenderBilder.get('e1')?.url).toBe('alt');
    });

    it('does not rename an underscore folder of an event with spaces in its title', async () => {
      const t = makeApp();
      const alt = t.onedrive.hinzufuegen('2026-06-14_Erster_Mai');
      t.kalenderBilder.set('e1', { id: alt.id, url: 'alt' });
      speichern(t, bilderEvent({ anzeigeTitel: 'Erster Mai' }));
      await t.app.request('/api/kalender/events/e1', json('admin-token', 'PUT', eventBody));
      expect(t.onedrive.ordner.get(alt.id)?.name).toBe('2026-06-14_Erster_Mai');
      expect(t.kalenderBilder.get('e1')?.url).toBe('alt');
    });

    it('drops the link when the folder is gone and hints on a name clash', async () => {
      const t = makeApp();
      t.kalenderBilder.set('e1', { id: 'weg', url: 'u' });
      speichern(t, bilderEvent());
      const res = await t.app.request(
        '/api/kalender/events/e1',
        json('admin-token', 'PUT', eventBody),
      );
      expect(await res.json()).toMatchObject({
        ok: true,
        bilderHinweis: expect.stringContaining('existiert'),
      });
      expect(t.kalenderBilder.has('e1')).toBe(false);

      const eigener = t.onedrive.hinzufuegen('2026-06-14_Alt');
      t.onedrive.hinzufuegen('2026-06-14_Sommerfest');
      t.kalenderBilder.set('e1', { id: eigener.id, url: 'u' });
      const konflikt = await t.app.request(
        '/api/kalender/events/e1',
        json('admin-token', 'PUT', eventBody),
      );
      expect(await konflikt.json()).toMatchObject({
        ok: true,
        bilderHinweis: expect.stringContaining('gibt es schon'),
      });
      expect(t.onedrive.ordner.get(eigener.id)?.name).toBe('2026-06-14_Alt');
      expect(t.kalenderBilder.get('e1')?.id).toBe(eigener.id);
    });

    it('never fails the event save but adds a hint when OneDrive is unavailable', async () => {
      const t = makeApp();
      speichern(t, bilderEvent());
      t.onedrive.zustand.verbunden = false;
      const nicht = await t.app.request(
        '/api/kalender/events',
        json('admin-token', 'POST', { ...eventBody, bilderOrdner: true }),
      );
      expect(nicht.status).toBe(201);
      expect(await nicht.json()).toEqual({
        id: 'e1',
        bilderHinweis: 'OneDrive ist nicht verbunden, der Bilder-Ordner wurde nicht angelegt.',
      });
      t.onedrive.zustand.verbunden = true;
      t.onedrive.zustand.ausfall = true;
      const netz = await t.app.request(
        '/api/kalender/events/e1',
        json('admin-token', 'PUT', { ...eventBody, bilderOrdner: true }),
      );
      expect(netz.status).toBe(200);
      expect(await netz.json()).toMatchObject({ ok: true, bilderHinweis: expect.any(String) });
      t.onedrive.zustand.ausfall = false;
      t.onedrive.hinzufuegen('2026-06-14_Sommerfest');
      const doppelt = await t.app.request(
        '/api/kalender/events',
        json('admin-token', 'POST', { ...eventBody, bilderOrdner: true }),
      );
      expect(await doppelt.json()).toMatchObject({
        bilderHinweis: expect.stringContaining('gibt es schon'),
      });
      expect(t.kalenderBilder.has('e1')).toBe(false);
    });

    it('deletes the folder of a deleted event only when it is empty', async () => {
      const t = makeApp();
      const leer = t.onedrive.hinzufuegen('2026-06-14_Leer');
      const voll = t.onedrive.hinzufuegen('2026-06-15_Voll', 3);
      t.kalenderBilder.set('e1', { id: leer.id, url: 'u' });
      t.kalenderBilder.set('e2', { id: voll.id, url: 'u' });
      t.freigaben.karte.set(leer.id, 'https://1drv.ms/f/leer');
      t.freigaben.karte.set(voll.id, 'https://1drv.ms/f/voll');
      t.kalender.eventLoeschen.mockImplementation(async (id) => {
        t.kalenderBilder.delete(id);
        return true;
      });
      expect(
        (await t.app.request('/api/kalender/events/e1', json('admin-token', 'DELETE'))).status,
      ).toBe(200);
      expect(t.onedrive.ordner.has(leer.id)).toBe(false);
      expect(t.freigaben.karte.has(leer.id)).toBe(false);
      expect(
        (await t.app.request('/api/kalender/events/e2', json('admin-token', 'DELETE'))).status,
      ).toBe(200);
      expect(t.onedrive.ordner.has(voll.id)).toBe(true);
      expect(t.freigaben.karte.has(voll.id)).toBe(true);
    });

    it('keeps folders when deleting fails and ignores OneDrive errors when deleting', async () => {
      const t = makeApp();
      const o = t.onedrive.hinzufuegen('2026-06-14_X');
      t.kalenderBilder.set('e1', { id: o.id, url: 'u' });
      t.kalender.eventLoeschen.mockRejectedValueOnce(
        new KalenderKonflikt('Das Event hat Dienste.'),
      );
      expect(
        (await t.app.request('/api/kalender/events/e1', json('admin-token', 'DELETE'))).status,
      ).toBe(409);
      expect(t.onedrive.ordner.has(o.id)).toBe(true);

      t.kalender.eventLoeschen.mockImplementationOnce(async (id) => {
        t.kalenderBilder.delete(id);
        return true;
      });
      t.onedrive.zustand.ausfall = true;
      expect(
        (await t.app.request('/api/kalender/events/e1', json('admin-token', 'DELETE'))).status,
      ).toBe(200);
    });

    it('cleans up the folders of events that a series change deletes', async () => {
      const t = makeApp();
      const o = t.onedrive.hinzufuegen('2026-06-14_Serie');
      t.kalenderBilder.set('e1', { id: o.id, url: 'u' });
      t.kalender.serieLoeschen.mockImplementationOnce(async () => {
        t.kalenderBilder.delete('e1');
        return true;
      });
      const res = await t.app.request(
        '/api/kalender/serien/s1?bestehende=anpassen',
        json('admin-token', 'DELETE'),
      );
      expect(res.status).toBe(200);
      expect(t.onedrive.ordner.has(o.id)).toBe(false);
    });

    it('lets every member create the folder of an existing event', async () => {
      const t = makeApp();
      speichern(t, bilderEvent());
      const res = await t.app.request(
        '/api/kalender/events/e1/bilder-ordner',
        json('reader-token', 'POST'),
      );
      expect(res.status).toBe(201);
      const ordner = [...t.onedrive.ordner.values()][0]!;
      expect(ordner.name).toBe('2026-06-14_Sommerfest');
      expect(await res.json()).toEqual({ bilderOrdnerUrl: `https://1drv.ms/f/${ordner.id}` });
      expect(t.freigaben.karte.get(ordner.id)).toBe(`https://1drv.ms/f/${ordner.id}`);
      expect(t.kalenderBilder.get('e1')?.id).toBe(ordner.id);

      const nochmal = await t.app.request(
        '/api/kalender/events/e1/bilder-ordner',
        json('reader-token', 'POST'),
      );
      expect(nochmal.status).toBe(409);
    });

    it('answers 404, 503 and 409 when creating the folder of an event goes wrong', async () => {
      const t = makeApp();
      expect(
        (
          await t.app.request(
            '/api/kalender/events/nope/bilder-ordner',
            json('reader-token', 'POST'),
          )
        ).status,
      ).toBe(404);
      speichern(t, bilderEvent());
      t.onedrive.hinzufuegen('2026-06-14_Sommerfest');
      expect(
        (await t.app.request('/api/kalender/events/e1/bilder-ordner', json('reader-token', 'POST')))
          .status,
      ).toBe(409);
      t.onedrive.zustand.verbunden = false;
      expect(
        (await t.app.request('/api/kalender/events/e1/bilder-ordner', json('reader-token', 'POST')))
          .status,
      ).toBe(503);
    });

    it('stores the Vorlage default for the folder', async () => {
      const t = makeApp();
      const vorlage = {
        titel: 'Plenum',
        beschreibung: null,
        kategorieId: 'k1',
        beginnZeit: '20:00',
        endeZeit: '22:00',
        teilnahmeStatus: null,
        schichten: [],
      };
      await t.app.request(
        '/api/kalender/vorlagen',
        json('admin-token', 'POST', { ...vorlage, bilderOrdner: true }),
      );
      expect(t.kalender.vorlageAnlegen).toHaveBeenLastCalledWith(
        expect.objectContaining({ bilderOrdner: true }),
      );
      await t.app.request('/api/kalender/vorlagen', json('admin-token', 'POST', vorlage));
      expect(t.kalender.vorlageAnlegen).toHaveBeenLastCalledWith(
        expect.objectContaining({ bilderOrdner: false }),
      );
    });
  });
});
