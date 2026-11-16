import { Hono } from 'hono';
import { type Health } from '@c4/shared';
import { type AuthEnv } from '../auth';

/** Public and without database access: reachability only. The DB check is the Lambda event `{ c4: "health" }`. */
export const healthRoutes = () =>
  new Hono<AuthEnv>().get('/health', (c) => c.json({ ok: true } satisfies Health));
