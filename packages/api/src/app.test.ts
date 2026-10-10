import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@c4/shared';
import { createApp } from './app';
import { UsernameTakenError } from './admin';
import type { AuthUser } from './auth';
import type { MitgliedRow } from './db/schema';
import type { MitgliedDaten } from './mitglieder';

const users: Record<string, AuthUser> = {
  'admin-token': { sub: 'a', groups: ['admin'] },
  'reader-token': { sub: 'r', groups: ['reader'] },
};

function makeApp(pingDb = async () => {}) {
  const userAdmin = {
    listUsers: vi.fn(async () => []),
    getPreferredUsername: vi.fn(async (): Promise<string | undefined> => undefined),
    setPreferredUsername: vi.fn<(username: string, preferred: string) => Promise<void>>(
      async () => {},
    ),
    createUser: vi.fn(async (email: string, groups: string[]): Promise<AdminUser> => ({
      username: 'generated-uuid',
      email,
      status: 'FORCE_CHANGE_PASSWORD',
      enabled: true,
      groups,
    })),
    setGroups: vi.fn(async (_u: string, groups: string[]) => groups),
  };
  const zeilen = new Map<string, MitgliedRow>();
  const mitglieder = {
    holen: vi.fn(async (sub: string) => zeilen.get(sub)),
    alle: vi.fn(async () => [...zeilen.values()]),
    speichern: vi.fn(async (sub: string, daten: MitgliedDaten) => {
      zeilen.set(sub, { sub, ...daten, aktualisiertAm: new Date() });
    }),
  };
  const profilbilder = {
    uploadVorbereiten: vi.fn(async (sub: string) => ({
      uploadUrl: 'https://s3.example/upload',
      key: `profilbilder/${sub}/neu.png`,
    })),
    anzeigeUrl: vi.fn(async (key: string) => `https://s3.example/${key}`),
    loeschen: vi.fn<(key: string) => Promise<void>>(async () => {}),
  };
  const app = createApp({
    verifyToken: async (token) => {
      const user = users[token];
      if (!user) throw new Error('bad token');
      return user;
    },
    userAdmin,
    mitglieder,
    profilbilder,
    pingDb,
  });
  return { app, userAdmin, mitglieder, profilbilder };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('api', () => {
  it('health is public and reports db status', async () => {
    const ok = await makeApp().app.request('/api/health');
    expect(await ok.json()).toEqual({ status: 'ok', db: 'ok' });
    const failing = makeApp(async () => {
      throw new Error('down');
    });
    const res = await failing.app.request('/api/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'ok', db: 'error' });
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
      permissions: ['content:read', 'mitglieder:lesen', 'profil:bearbeiten'],
    });
  });

  it('forbids admin routes for readers', async () => {
    const res = await makeApp().app.request('/api/admin/users', {
      headers: bearer('reader-token'),
    });
    expect(res.status).toBe(403);
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
    const ok = await post({ email: 'x@example.de', groups: ['reader'] });
    expect(ok.status).toBe(201);
    expect(userAdmin.createUser).toHaveBeenCalledWith('x@example.de', ['reader']);
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
      const ok = await put({ ...gueltig, telefon: '  ', ueberMich: 'Hallo', spitzname: ' Eri ' });
      expect(ok.status).toBe(200);
      expect(mitglieder.speichern).toHaveBeenCalledWith('r', {
        ...gueltig,
        spitzname: 'Eri',
        adresse: null,
        telefon: null,
        ueberMich: 'Hallo',
        profilbildKey: null,
      });
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
      expect((await post({ contentType: 'image/gif', groesse: 100 })).status).toBe(400);
      expect((await post({ contentType: 'image/png', groesse: 6 * 1024 * 1024 })).status).toBe(400);
      const ok = await post({ contentType: 'image/png', groesse: 1000 });
      expect(ok.status).toBe(200);
      expect(profilbilder.uploadVorbereiten).toHaveBeenCalledWith('r', {
        contentType: 'image/png',
        groesse: 1000,
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
        { sub: 'r', vorname: 'Erika', profilbildUrl: 'https://s3.example/profilbilder/r/a.png' },
      ]);
    });

    it('creates the member row when an admin invites with names', async () => {
      const { app, userAdmin, mitglieder } = makeApp();
      userAdmin.createUser.mockResolvedValueOnce({
        username: 'u',
        email: 'x@example.de',
        sub: 'sub-1',
        status: 'FORCE_CHANGE_PASSWORD',
        enabled: true,
        groups: [],
      });
      const res = await app.request(
        '/api/admin/users',
        json('admin-token', 'POST', {
          email: 'x@example.de',
          vorname: 'Max',
          nachname: 'Mustermann',
        }),
      );
      expect(res.status).toBe(201);
      expect(mitglieder.speichern).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({ vorname: 'Max', nachname: 'Mustermann' }),
      );
    });
  });
});
