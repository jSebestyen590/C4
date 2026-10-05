import { serve } from '@hono/node-server';
import { createProductionApp } from './bootstrap';

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: createProductionApp().fetch, port }, () => {
  console.log(`API listening on http://localhost:${port}/api`);
});
