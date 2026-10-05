import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  createUserSchema,
  permissionsFor,
  setGroupsSchema,
  setUsernameSchema,
  type Health,
  type Me,
} from '@c4/shared';
import { UsernameTakenError, type UserAdmin } from './admin';
import { authenticate, requirePermission, type AuthEnv, type TokenVerifier } from './auth';

export interface AppDeps {
  verifyToken: TokenVerifier;
  userAdmin: UserAdmin;
  /** Resolves when the database answers `select 1`. */
  pingDb: () => Promise<void>;
}

export function createApp(deps: AppDeps) {
  const auth = authenticate(deps.verifyToken);
  const adminOnly = requirePermission('users:manage');

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
    .get('/admin/users', auth, adminOnly, async (c) => c.json(await deps.userAdmin.listUsers()))
    .post('/admin/users', auth, adminOnly, zValidator('json', createUserSchema), async (c) => {
      const { email, groups } = c.req.valid('json');
      return c.json(await deps.userAdmin.createUser(email, groups), 201);
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
