import { Hono } from 'hono';
import { type Health } from '@c4/shared';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

export const healthRoutes = (ctx: RoutenKontext) => {
  const { deps } = ctx;

  return new Hono<AuthEnv>().get('/health', async (c) => {
    let db: Health['db'] = 'ok';
    try {
      await deps.pingDb();
    } catch (err) {
      console.error('health: db check failed', err);
      db = 'error';
    }
    return c.json({ status: 'ok', db } satisfies Health, db === 'ok' ? 200 : 503);
  });
};
