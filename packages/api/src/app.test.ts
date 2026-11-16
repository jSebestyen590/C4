import { describe, expect, it, vi } from 'vitest';
import { UsernameTakenError, type Konto } from './admin';
import { CodeUngueltig, EmailVergeben, NeuAnmeldungNoetig } from './emailaenderung';
import { OEFFENTLICH } from './app';
import { makeApp, bearer } from './test/appTestHelfer';

describe('api', () => {
  it('health is public and does not touch the database', async () => {
    const pingDb = vi.fn(async () => {
      throw new Error('down');
    });
    const res = await makeApp(pingDb).app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(pingDb).not.toHaveBeenCalled();
  });

  it('denies every route without a token except the public allowlist', async () => {
    const { app } = makeApp();
    const routen = app.routes.filter((r) => r.method !== 'ALL');
    const gesperrt = routen.filter((r) => !OEFFENTLICH.some((p) => r.path.startsWith(p)));
    expect(routen.length - gesperrt.length).toBe(3);
    expect(gesperrt.length).toBeGreaterThan(100);
    for (const r of gesperrt) {
      const pfad = r.path.replace(/:[A-Za-z]+/g, 'x');
      const res = await app.request(pfad, { method: r.method });
      expect(res.status, `${r.method} ${r.path}`).toBe(401);
    }
    expect((await app.request('/api/gibt-es-nicht')).status).toBe(401);
  });

  it('authenticates once per request', async () => {
    const { app, mitglieder } = makeApp();
    const holen = vi.spyOn(mitglieder, 'holen');
    expect((await app.request('/api/me', { headers: bearer('reader-token') })).status).toBe(200);
    // Once in `authenticate`, once in the /me handler itself; a second auth run would make three.
    expect(holen).toHaveBeenCalledTimes(2);
  });

  it('maps database conflicts to 409 and unknown errors to 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app, userAdmin } = makeApp();
    const post = () =>
      app.request('/api/admin/users', {
        method: 'POST',
        headers: { ...bearer('admin-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'x@example.de', groups: ['admin'] }),
      });
    userAdmin.createUser.mockRejectedValueOnce(Object.assign(new Error('x'), { code: '40001' }));
    const konflikt = await post();
    expect(konflikt.status).toBe(409);
    expect(await konflikt.json()).toEqual({
      error: 'Jemand anderes hat gerade dasselbe geändert. Bitte versuch es noch einmal.',
    });
    userAdmin.createUser.mockRejectedValueOnce(
      new Error('Failed query', { cause: Object.assign(new Error('dup'), { code: '23505' }) }),
    );
    const doppelt = await post();
    expect(doppelt.status).toBe(409);
    expect(await doppelt.json()).toEqual({
      error:
        'Das passt nicht mehr zum aktuellen Stand. Bitte lade die Seite neu und versuch es noch einmal.',
    });
    userAdmin.createUser.mockRejectedValueOnce(new Error('boom'));
    expect((await post()).status).toBe(500);
    vi.restoreAllMocks();
  });

  it('rejects missing and invalid tokens', async () => {
    const { app } = makeApp();
    expect((await app.request('/api/me')).status).toBe(401);
    expect((await app.request('/api/me', { headers: bearer('nope') })).status).toBe(401);
  });

  it('returns identity and permissions', async () => {
    const res = await makeApp().app.request('/api/me', { headers: bearer('reader-token') });
    expect(await res.json()).toMatchObject({
      sub: 'r',
      permissions: [
        'content:read',
        'mitglieder:lesen',
        'profil:bearbeiten',
        'posten:lesen',
        'waren:lesen',
        'bestand:buchen',
        'inventar:lesen',
        'inventar:umraeumen',
        'kalender:lesen',
        'schluessel:lesen',
        'umfragen:lesen',
        'trichter:lesen',
        'bilder:lesen',
        'protokolle:lesen',
        'buch:lesen',
        'kasse:zaehlen',
        'belege:einreichen',
      ],
    });
  });

  it('forbids admin routes for readers', async () => {
    const res = await makeApp().app.request('/api/admin/mitglieder/x/rollen', {
      method: 'PUT',
      headers: { ...bearer('reader-token'), 'content-type': 'application/json' },
      body: JSON.stringify({ groups: [] }),
    });
    expect(res.status).toBe(403);
  });

  it('shows roles only to admins and lets them change roles', async () => {
    const { app, userAdmin } = makeApp();
    userAdmin.konten.mockResolvedValue(
      new Map<string, Konto>([
        ['m1', { sub: 'm1', kontoName: 'uuid-1', aktiviert: true, enabled: true }],
      ]),
    );
    userAdmin.rollen.mockResolvedValue(new Map([['m1', ['admin']]]));
    const liste = async (token: string) =>
      (await app.request('/api/mitglieder', { headers: bearer(token) })).json();
    expect(await liste('admin-token')).toMatchObject([{ sub: 'm1', rollen: ['admin'] }]);
    expect((await liste('reader-token'))[0]).not.toHaveProperty('rollen');

    const put = (sub: string, groups: string[]) =>
      app.request(`/api/admin/mitglieder/${sub}/rollen`, {
        method: 'PUT',
        headers: { ...bearer('admin-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ groups }),
      });
    expect((await put('m1', ['admin'])).status).toBe(200);
    expect(userAdmin.setGroups).toHaveBeenCalledWith('uuid-1', ['admin']);
    expect((await put('unbekannt', [])).status).toBe(404);
    expect((await put('a', [])).status).toBe(400);
  });

  it('lets admins create users and validates input', async () => {
    const { app, userAdmin } = makeApp();
    const post = (body: unknown) =>
      app.request('/api/admin/users', {
        method: 'POST',
        headers: { ...bearer('admin-token'), 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    expect((await post({ email: 'not-an-email' })).status).toBe(400);
    const ok = await post({ email: 'x@example.de', groups: ['admin'] });
    expect(ok.status).toBe(201);
    expect(userAdmin.createUser).toHaveBeenCalledWith('x@example.de', ['admin']);
  });

  it('lets users choose a username and reports conflicts', async () => {
    const { app, userAdmin } = makeApp();
    const put = (body: unknown) =>
      app.request('/api/me/username', {
        method: 'PUT',
        headers: { ...bearer('reader-token'), 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    expect((await put({ username: 'a@b.de' })).status).toBe(400);
    expect((await put({ username: '123e4567-e89b-12d3-a456-426614174000' })).status).toBe(400);
    expect((await put({ username: 'ab' })).status).toBe(400);
    expect((await put({ username: 'reader_one' })).status).toBe(200);
    expect(userAdmin.setPreferredUsername).toHaveBeenCalledWith('r', 'reader_one');
    userAdmin.setPreferredUsername.mockRejectedValueOnce(new UsernameTakenError('taken'));
    expect((await put({ username: 'taken' })).status).toBe(409);
  });

  it('exposes the chosen username on /me', async () => {
    const { app, userAdmin } = makeApp();
    userAdmin.getPreferredUsername.mockResolvedValueOnce('reader_one');
    const res = await app.request('/api/me', { headers: bearer('reader-token') });
    expect(await res.json()).toMatchObject({ preferredUsername: 'reader_one' });
  });

  describe('mitglieder', () => {
    const json = (token: string, method: string, body?: unknown) => ({
      method,
      headers: { ...bearer(token), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const gueltig = { vorname: 'Erika', nachname: 'Muster' };

    it('requires authentication', async () => {
      const { app } = makeApp();
      expect((await app.request('/api/mitglieder')).status).toBe(401);
      expect((await app.request('/api/me/mitglied')).status).toBe(401);
    });

    it('returns 404 until the member saved a profile', async () => {
      const res = await makeApp().app.request('/api/me/mitglied', json('reader-token', 'GET'));
      expect(res.status).toBe(404);
    });

    it('validates required names and trims optional fields', async () => {
      const { app, mitglieder } = makeApp();
      const put = (body: unknown) =>
        app.request('/api/me/mitglied', json('reader-token', 'PUT', body));
      expect((await put({ vorname: '', nachname: 'Muster' })).status).toBe(400);
      expect((await put({ vorname: 'Erika' })).status).toBe(400);
      expect((await put({ ...gueltig, anrede: 'x' })).status).toBe(400);
      expect((await put({ ...gueltig, kontaktkanaele: ['fax'] })).status).toBe(400);
      const ok = await put({
        ...gueltig,
        anrede: 'weiblich',
        kontaktkanaele: ['mail', 'discord'],
        discordName: ' erika#1 ',
        telefon: '  ',
        ueberMich: 'Hallo',
      });
      expect(ok.status).toBe(200);
      expect(mitglieder.speichern).toHaveBeenCalledWith('r', {
        ...gueltig,
        anrede: 'weiblich',
        kontaktkanaele: 'discord,mail',
        discordName: 'erika#1',
        adresse: null,
        telefon: null,
        ueberMich: 'Hallo',
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: true,
        wohnheim: false,
      });
    });

    it('requires a readable phone number when WhatsApp, Signal or Telegram is chosen', async () => {
      const { app, mitglieder } = makeApp();
      const put = (body: unknown) =>
        app.request('/api/me/mitglied', json('reader-token', 'PUT', body));
      expect((await put({ ...gueltig, kontaktkanaele: ['whatsapp'] })).status).toBe(400);
      expect(
        (await put({ ...gueltig, kontaktkanaele: ['telegram'], telefon: '1234' })).status,
      ).toBe(400);
      expect(mitglieder.speichern).not.toHaveBeenCalled();
      expect(
        (await put({ ...gueltig, kontaktkanaele: ['whatsapp'], telefon: '0171 1234567' })).status,
      ).toBe(200);
    });

    it('saves and returns the birthday fields and validates the date', async () => {
      const { app, mitglieder } = makeApp();
      const put = (body: unknown) =>
        app.request('/api/me/mitglied', json('reader-token', 'PUT', body));
      expect((await put({ ...gueltig, geburtsdatum: '1990-02-30' })).status).toBe(400);
      expect((await put({ ...gueltig, geburtsdatum: '1899-12-31' })).status).toBe(400);
      expect((await put({ ...gueltig, geburtsdatum: '2999-01-01' })).status).toBe(400);
      expect((await put({ ...gueltig, geburtsdatum: '17.05.1990' })).status).toBe(400);
      const res = await put({
        ...gueltig,
        geburtsdatum: '1990-05-17',
        geburtstagImKalender: false,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        geburtsdatum: '1990-05-17',
        geburtstagImKalender: false,
      });
      expect(mitglieder.speichern).toHaveBeenCalledWith(
        'r',
        expect.objectContaining({ geburtsdatum: '1990-05-17', geburtstagImKalender: false }),
      );
      // The own profile always shows the date, even when it is hidden from others.
      const eigenes = await app.request('/api/me/mitglied', json('reader-token', 'GET'));
      expect(await eigenes.json()).toMatchObject({ geburtsdatum: '1990-05-17' });
    });

    it("shows other members' birthday only when they show it in the calendar", async () => {
      const { app, mitglieder } = makeApp();
      const basis = {
        vorname: 'V',
        nachname: 'N',
        anrede: null,
        kontaktkanaele: null,
        discordName: null,
        adresse: null,
        telefon: null,
        ueberMich: null,
        profilbildKey: null,
      };
      await mitglieder.speichern('m1', {
        ...basis,
        geburtsdatum: '1990-05-17',
        geburtstagImKalender: null,
        wohnheim: null,
      });
      await mitglieder.speichern('m3', {
        ...basis,
        geburtsdatum: '1991-06-18',
        geburtstagImKalender: false,
        wohnheim: null,
      });
      await mitglieder.speichern('r', {
        ...basis,
        geburtsdatum: '1992-07-19',
        geburtstagImKalender: false,
        wohnheim: null,
      });
      const liste = (await (
        await app.request('/api/mitglieder', json('reader-token', 'GET'))
      ).json()) as { sub: string; geburtsdatum: string | null; geburtstagImKalender: boolean }[];
      const nach = (sub: string) => liste.find((m) => m.sub === sub);
      expect(nach('m1')).toMatchObject({ geburtsdatum: '1990-05-17', geburtstagImKalender: true });
      expect(nach('m3')).toMatchObject({ geburtsdatum: '1991-06-18', geburtstagImKalender: false });
      expect(nach('r')).toMatchObject({ geburtsdatum: '1992-07-19' });
      const einzeln = await app.request('/api/mitglieder/m3', json('reader-token', 'GET'));
      expect(await einzeln.json()).toMatchObject({ geburtsdatum: '1991-06-18' });
    });

    it("only saves to the caller's own row and rejects foreign picture keys", async () => {
      const { app, mitglieder } = makeApp();
      const put = (body: unknown) =>
        app.request('/api/me/mitglied', json('reader-token', 'PUT', body));
      expect((await put({ ...gueltig, profilbildKey: 'profilbilder/a/x.png' })).status).toBe(400);
      expect((await put({ ...gueltig, profilbildKey: 'profilbilder/r/x.png' })).status).toBe(200);
      expect(mitglieder.speichern).toHaveBeenCalledTimes(1);
      expect(mitglieder.speichern.mock.calls[0]?.[0]).toBe('r');
    });

    it('deletes the previous picture when it is replaced', async () => {
      const { app, profilbilder } = makeApp();
      const put = (body: unknown) =>
        app.request('/api/me/mitglied', json('reader-token', 'PUT', body));
      await put({ ...gueltig, profilbildKey: 'profilbilder/r/alt.png' });
      await put({ ...gueltig, profilbildKey: 'profilbilder/r/neu.png' });
      expect(profilbilder.loeschen).toHaveBeenCalledWith('profilbilder/r/alt.png');
    });

    it('issues upload URLs only for allowed types and sizes', async () => {
      const { app, profilbilder } = makeApp();
      const post = (body: unknown) =>
        app.request('/api/me/profilbild', json('reader-token', 'POST', body));
      expect(
        (await post({ contentType: 'image/gif', groesse: 100, kleinGroesse: 10 })).status,
      ).toBe(400);
      expect(
        (await post({ contentType: 'image/png', groesse: 21 * 1024 * 1024, kleinGroesse: 10 }))
          .status,
      ).toBe(400);
      expect((await post({ contentType: 'image/png', groesse: 1000 })).status).toBe(400);
      const ok = await post({ contentType: 'image/png', groesse: 1000, kleinGroesse: 200 });
      expect(ok.status).toBe(200);
      expect(profilbilder.uploadVorbereiten).toHaveBeenCalledWith('r', {
        contentType: 'image/png',
        groesse: 1000,
        kleinGroesse: 200,
      });
    });

    it('lists all members with picture URLs', async () => {
      const { app } = makeApp();
      await app.request(
        '/api/me/mitglied',
        json('reader-token', 'PUT', { ...gueltig, profilbildKey: 'profilbilder/r/a.png' }),
      );
      const res = await app.request('/api/mitglieder', json('admin-token', 'GET'));
      expect(await res.json()).toMatchObject([
        {
          sub: 'r',
          vorname: 'Erika',
          profilbildUrl: 'https://s3.example/profilbilder/r/a-klein.jpg',
          profilbildGrossUrl: 'https://s3.example/profilbilder/r/a.png',
        },
      ]);
    });

    it('merges Cognito accounts into the list, including users that are not activated', async () => {
      const { app, userAdmin } = makeApp();
      await app.request('/api/me/mitglied', json('reader-token', 'PUT', gueltig));
      userAdmin.konten.mockResolvedValue(
        new Map<string, Konto>([
          [
            'r',
            {
              sub: 'r',
              kontoName: 'ur',
              username: 'erika_m',
              email: 'e@example.de',
              aktiviert: true,
              enabled: true,
            },
          ],
          [
            'n',
            { sub: 'n', kontoName: 'un', email: 'neu@example.de', aktiviert: false, enabled: true },
          ],
          [
            'x',
            { sub: 'x', kontoName: 'ux', email: 'aus@example.de', aktiviert: true, enabled: false },
          ],
        ]),
      );
      const res = await app.request('/api/mitglieder', json('admin-token', 'GET'));
      expect(await res.json()).toMatchObject([
        { sub: 'r', username: 'erika_m', email: 'e@example.de', aktiviert: true },
        { sub: 'n', username: null, email: 'neu@example.de', aktiviert: false, vorname: '' },
      ]);
      const detail = await app.request('/api/mitglieder/n', json('admin-token', 'GET'));
      expect(detail.status).toBe(200);
      const nachName = await app.request('/api/mitglieder/Erika_M', json('admin-token', 'GET'));
      expect(await nachName.json()).toMatchObject({ sub: 'r', username: 'erika_m' });
      expect((await app.request('/api/mitglieder/x', json('admin-token', 'GET'))).status).toBe(404);
    });

    it('requests an email change with the caller token and maps errors', async () => {
      const { app, emailAenderung } = makeApp();
      const put = (body: unknown) =>
        app.request('/api/me/email', json('reader-token', 'PUT', body));
      expect((await put({ email: 'kein-mail' })).status).toBe(400);
      expect((await put({ email: ' Neu@Example.DE ' })).status).toBe(200);
      expect(emailAenderung.anfordern).toHaveBeenCalledWith('reader-token', 'neu@example.de');
      emailAenderung.anfordern.mockRejectedValueOnce(new EmailVergeben());
      expect((await put({ email: 'x@example.de' })).status).toBe(409);
      emailAenderung.anfordern.mockRejectedValueOnce(new NeuAnmeldungNoetig());
      expect((await put({ email: 'y@example.de' })).status).toBe(403);
      expect((await app.request('/api/me/email', json('', 'PUT', {}))).status).toBe(401);
    });

    it('confirms an email change with the code', async () => {
      const { app, emailAenderung } = makeApp();
      const post = (body: unknown) =>
        app.request('/api/me/email/bestaetigen', json('reader-token', 'POST', body));
      expect((await post({ code: '' })).status).toBe(400);
      expect((await post({ code: ' 123456 ' })).status).toBe(200);
      expect(emailAenderung.bestaetigen).toHaveBeenCalledWith('reader-token', '123456');
      emailAenderung.bestaetigen.mockRejectedValueOnce(new CodeUngueltig());
      expect((await post({ code: '000000' })).status).toBe(400);
    });

    it('lets only admins change the status, and never through the profile', async () => {
      const { app } = makeApp();
      await app.request('/api/me/mitglied', json('reader-token', 'PUT', gueltig));
      const setze = (token: string, sub: string, status: string) =>
        app.request(`/api/admin/mitglieder/${sub}/status`, json(token, 'PUT', { status }));
      expect((await setze('reader-token', 'r', 'em')).status).toBe(403);
      expect((await setze('admin-token', 'r', 'quatsch')).status).toBe(400);
      expect((await setze('admin-token', 'unbekannt', 'em')).status).toBe(404);
      expect((await setze('admin-token', 'r', 'mitglied')).status).toBe(200);
      const liste = await app.request('/api/mitglieder', json('admin-token', 'GET'));
      expect(await liste.json()).toMatchObject([{ sub: 'r', status: 'mitglied' }]);
      // a profile save by the member keeps the status, even when they send one
      await app.request(
        '/api/me/mitglied',
        json('reader-token', 'PUT', { ...gueltig, status: 'em' }),
      );
      const danach = await app.request('/api/me/mitglied', json('reader-token', 'GET'));
      expect(await danach.json()).toMatchObject({ status: 'mitglied' });
    });

    it('creates the member row right away when an admin invites', async () => {
      const { app, userAdmin, mitglieder } = makeApp();
      const einladen = (body: unknown, sub: string) => {
        userAdmin.createUser.mockResolvedValueOnce({
          username: 'u',
          email: 'x@example.de',
          sub,
          status: 'FORCE_CHANGE_PASSWORD',
          enabled: true,
          groups: [],
        });
        return app.request('/api/admin/users', json('admin-token', 'POST', body));
      };
      const mit = await einladen(
        { email: 'x@example.de', vorname: 'Max', nachname: 'Mustermann', status: 'em' },
        'sub-1',
      );
      expect(mit.status).toBe(201);
      expect(mitglieder.speichern).toHaveBeenLastCalledWith(
        'sub-1',
        expect.objectContaining({ vorname: 'Max', nachname: 'Mustermann' }),
        'em',
      );
      // without names: still a row, empty names, status defaults to Anwaerter
      const ohne = await einladen({ email: 'y@example.de' }, 'sub-2');
      expect(await ohne.json()).toMatchObject({ vorname: '', nachname: '', status: 'anwaerter' });
      expect(mitglieder.speichern).toHaveBeenLastCalledWith(
        'sub-2',
        expect.objectContaining({ vorname: '', nachname: '' }),
        'anwaerter',
      );
      expect((await einladen({ email: 'z@example.de', status: 'quatsch' }, 'sub-3')).status).toBe(
        400,
      );
    });
  });
});
