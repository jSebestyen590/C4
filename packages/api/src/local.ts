import { serve } from '@hono/node-server';
import { createProductionApp } from './bootstrap';

const port = Number(process.env.API_PORT ?? 3000);
serve({ fetch: createProductionApp().fetch, port, hostname: '127.0.0.1' }, () => {
  console.log(`API listening on http://127.0.0.1:${port}/api`);
});
