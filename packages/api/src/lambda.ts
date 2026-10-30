import { handle } from '@hono/aws-lambda';
import { createProduction } from './bootstrap';

const { app, pushJob } = createProduction();
const httpHandler = handle(app);

/**
 * Invoked by API Gateway (HTTP) and by the EventBridge schedule (`{ "c4": "push-job" }`, every
 * 5 minutes, see docs/benachrichtigungen.md).
 */
export const handler = async (event: unknown, context: unknown): Promise<unknown> => {
  if (
    typeof event === 'object' &&
    event !== null &&
    (event as { c4?: unknown }).c4 === 'push-job'
  ) {
    await pushJob(new Date());
    return { ok: true };
  }
  return (httpHandler as (e: unknown, c: unknown) => Promise<unknown>)(event, context);
};
