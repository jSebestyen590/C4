import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  createUserSchema,
  mitgliedAktualisierenSchema,
  permissionsFor,
  profilbildAnfrageSchema,
  setGroupsSchema,
  setUsernameSchema,
  type Health,
  type Me,
  type Mitglied,
} from '@c4/shared';
import { UsernameTakenError, type Konto, type UserAdmin } from './admin';
import type { MitgliedRow } from './db/schema';
import type { MitgliederStore } from './mitglieder';
import { profilbildPrefix, type Profilbilder } from './profilbilder';
import { authenticate, requirePermission, type AuthEnv, type TokenVerifier } from './auth';

export interface AppDeps {
  verifyToken: TokenVerifier;
  userAdmin: UserAdmin;
  mitglieder: MitgliederStore;
  profilbilder: Profilbilder;
  /** Resolves when the database answers `select 1`. */
  pingDb: () => Promise<void>;
}

export function createApp(deps: AppDeps) {
  const auth = authenticate(deps.verifyToken);
  const adminOnly = requirePermission('users:manage');
  const mitgliederLesen = requirePermission('mitglieder:lesen');
  const profilBearbeiten = requirePermission('profil:bearbeiten');

  /** Merges the profile row with the Cognito account; either side may be missing. */
  const alsMitglied = async (
    sub: string,
    row: MitgliedRow | undefined,
    konto: Konto | undefined,
  ): Promise<Mitglied> => ({
    sub,
    vorname: row?.vorname ?? '',
    nachname: row?.nachname ?? '',
    username: konto?.username ?? null,
    email: konto?.email ?? null,
    aktiviert: konto?.aktiviert ?? true,
    adresse: row?.adresse ?? null,
    telefon: row?.telefon ?? null,
    ueberMich: row?.ueberMich ?? null,
    profilbildKey: row?.profilbildKey ?? null,
    profilbildUrl: row?.profilbildKey
      ? await deps.profilbilder.anzeigeUrl(row.profilbildKey)
      : null,
  });

  /** All members: every profile row plus every enabled account that has no profile yet. */
  const alleMitglieder = async (): Promise<Mitglied[]> => {
    const [rows, konten] = await Promise.all([deps.mitglieder.alle(), deps.userAdmin.konten()]);
    const nachSub = new Map(rows.map((r) => [r.sub, r]));
    const subs = [
      ...rows.map((r) => r.sub),
      ...[...konten.values()].filter((k) => k.enabled && !nachSub.has(k.sub)).map((k) => k.sub),
    ];
    const liste = await Promise.all(subs.map((s) => alsMitglied(s, nachSub.get(s), konten.get(s))));
    const sortKey = (m: Mitglied) =>
      `${m.nachname || '\uffff'} ${m.vorname} ${m.username ?? m.email ?? ''}`.toLowerCase();
    return liste.sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'de'));
  };

  return new Hono<AuthEnv>()
    .basePath('/api')
    .get('/health', async (c) => {
      let db: Health['db'] = 'ok';
      try {
        await deps.pingDb();
      } catch (err) {
        console.error('health: db check failed', err);
        db = 'error';
      }
      return c.json({ status: 'ok', db } satisfies Health, db === 'ok' ? 200 : 503);
    })
    .get('/me', auth, async (c) => {
      const user = c.get('user');
      const me: Me = {
        sub: user.sub,
        preferredUsername: await deps.userAdmin.getPreferredUsername(user.username ?? user.sub),
        groups: user.groups,
        permissions: permissionsFor(user.groups),
      };
      return c.json(me);
    })
    .put('/me/username', auth, zValidator('json', setUsernameSchema), async (c) => {
      const user = c.get('user');
      const { username } = c.req.valid('json');
      try {
        await deps.userAdmin.setPreferredUsername(user.username ?? user.sub, username);
      } catch (err) {
        if (err instanceof UsernameTakenError) {
          throw new HTTPException(409, { message: 'Username already taken' });
        }
        throw err;
      }
      return c.json({ username });
    })
    .get('/me/mitglied', auth, profilBearbeiten, async (c) => {
      const row = await deps.mitglieder.holen(c.get('user').sub);
      if (!row) throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
      return c.json(await alsMitglied(row.sub, row, (await deps.userAdmin.konten()).get(row.sub)));
    })
    .put(
      '/me/mitglied',
      auth,
      profilBearbeiten,
      zValidator('json', mitgliedAktualisierenSchema),
      async (c) => {
        const { sub } = c.get('user');
        const { profilbildKey, ...daten } = c.req.valid('json');
        if (profilbildKey && !profilbildKey.startsWith(profilbildPrefix(sub))) {
          throw new HTTPException(400, { message: 'Ungültiges Profilbild' });
        }
        const vorher = await deps.mitglieder.holen(sub);
        await deps.mitglieder.speichern(sub, { ...daten, profilbildKey });
        if (vorher?.profilbildKey && vorher.profilbildKey !== profilbildKey) {
          await deps.profilbilder.loeschen(vorher.profilbildKey).catch((err) => {
            console.error('profilbild: delete failed', err);
          });
        }
        const row = await deps.mitglieder.holen(sub);
        if (!row) throw new Error('Mitglied nach dem Speichern nicht gefunden');
        return c.json(await alsMitglied(sub, row, (await deps.userAdmin.konten()).get(sub)));
      },
    )
    .post(
      '/me/profilbild',
      auth,
      profilBearbeiten,
      zValidator('json', profilbildAnfrageSchema),
      async (c) =>
        c.json(await deps.profilbilder.uploadVorbereiten(c.get('user').sub, c.req.valid('json'))),
    )
    .get('/mitglieder', auth, mitgliederLesen, async (c) => c.json(await alleMitglieder()))
    .get('/mitglieder/:sub', auth, mitgliederLesen, async (c) => {
      const mitglied = (await alleMitglieder()).find((m) => m.sub === c.req.param('sub'));
      if (!mitglied) throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
      return c.json(mitglied);
    })
    .get('/admin/users', auth, adminOnly, async (c) => {
      const [users, rows] = await Promise.all([deps.userAdmin.listUsers(), deps.mitglieder.alle()]);
      const nachSub = new Map(rows.map((r) => [r.sub, r]));
      return c.json(
        users.map((u) => {
          const m = u.sub ? nachSub.get(u.sub) : undefined;
          return { ...u, vorname: m?.vorname, nachname: m?.nachname };
        }),
      );
    })
    .post('/admin/users', auth, adminOnly, zValidator('json', createUserSchema), async (c) => {
      const { email, groups, vorname, nachname } = c.req.valid('json');
      const user = await deps.userAdmin.createUser(email, groups);
      if (user.sub && vorname && nachname) {
        await deps.mitglieder.speichern(user.sub, {
          vorname,
          nachname,
          adresse: null,
          telefon: null,
          ueberMich: null,
          profilbildKey: null,
        });
        return c.json({ ...user, vorname, nachname }, 201);
      }
      return c.json(user, 201);
    })
    .put(
      '/admin/users/:username/groups',
      auth,
      adminOnly,
      zValidator('json', setGroupsSchema),
      async (c) => {
        const groups = await deps.userAdmin.setGroups(
          c.req.param('username'),
          c.req.valid('json').groups,
        );
        return c.json({ groups });
      },
    )
    .onError((err, c) => {
      if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
      console.error(err);
      return c.json({ error: 'Internal server error' }, 500);
    });
}
export type AppType = ReturnType<typeof createApp>;
