import { createCognitoUserAdmin } from './admin';
import { createApp } from './app';
import { createCognitoEmailAenderung } from './emailaenderung';
import { createCognitoVerifier } from './auth';
import { loadConfig } from './config';
import { createDb, createPool } from './db/client';
import { createMitgliederStore } from './mitglieder';
import { createPostenStore } from './posten';
import { createProfilbilder } from './profilbilder';

/** Wires the real AWS-backed dependencies. Shared by the Lambda and the local server. */
export function createProductionApp() {
  const config = loadConfig();
  const pool = createPool(config);
  const db = createDb(pool);
  return createApp({
    verifyToken: createCognitoVerifier(config),
    userAdmin: createCognitoUserAdmin(config.userPoolId, config.region),
    emailAenderung: createCognitoEmailAenderung(config.region),
    mitglieder: createMitgliederStore(db),
    posten: createPostenStore(db),
    profilbilder: createProfilbilder(config.profilbildBucket, config.region),
    pingDb: async () => {
      await pool.query('select 1');
    },
  });
}
