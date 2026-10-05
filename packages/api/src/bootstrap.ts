import { createCognitoUserAdmin } from './admin';
import { createApp } from './app';
import { createCognitoVerifier } from './auth';
import { loadConfig } from './config';
import { createPool } from './db/client';

/** Wires the real AWS-backed dependencies. Shared by the Lambda and the local server. */
export function createProductionApp() {
  const config = loadConfig();
  const pool = createPool(config);
  return createApp({
    verifyToken: createCognitoVerifier(config),
    userAdmin: createCognitoUserAdmin(config.userPoolId, config.region),
    pingDb: async () => {
      await pool.query('select 1');
    },
  });
}
