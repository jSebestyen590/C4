import { handle } from '@hono/aws-lambda';
import type { DatenexportAuftrag } from '@c4/shared';
import { createProduction } from './bootstrap';

const { app, pushJob, mailJob, finanzExportJob, datenexportJob, sumupJob, pingDb } =
  createProduction();
const httpHandler = handle(app);

/**
 * Invoked by API Gateway (HTTP) and by the EventBridge schedule (`{ "c4": "push-job" }`, every
 * 5 minutes, see docs/benachrichtigungen.md) and `{ "c4": "mail-job" }` (every 2 minutes, Party-Mail) and `{ "c4": "finanz-export" }` (daily, Finanzarchiv) and `{ "c4": "sumup-job" }` (hourly, SumUp transactions and payouts).
 * `{ "c4": "datenexport", id, von, bis, sub }` is the asynchronous Datenexport with Beleg files (self-invoke from the API).
 * `{ "c4": "health" }` checks the database (deploy smoke test, `aws lambda invoke`); it throws when the DB is down.
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
  if (
    typeof event === 'object' &&
    event !== null &&
    (event as { c4?: unknown }).c4 === 'mail-job'
  ) {
    return { ok: true, ...(await mailJob(new Date())) };
  }
  if (
    typeof event === 'object' &&
    event !== null &&
    (event as { c4?: unknown }).c4 === 'finanz-export'
  ) {
    return { ok: true, ...(await finanzExportJob(new Date())) };
  }
  if (
    typeof event === 'object' &&
    event !== null &&
    (event as { c4?: unknown }).c4 === 'sumup-job'
  ) {
    return { ok: true, ...(await sumupJob(new Date())) };
  }
  if (
    typeof event === 'object' &&
    event !== null &&
    (event as { c4?: unknown }).c4 === 'datenexport'
  ) {
    return await datenexportJob(event as DatenexportAuftrag);
  }
  if (typeof event === 'object' && event !== null && (event as { c4?: unknown }).c4 === 'health') {
    await pingDb();
    return { ok: true };
  }
  return (httpHandler as (e: unknown, c: unknown) => Promise<unknown>)(event, context);
};
