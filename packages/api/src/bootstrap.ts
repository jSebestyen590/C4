import { createCognitoUserAdmin } from './admin';
import { createApp } from './app';
import { createCognitoEmailAenderung } from './emailaenderung';
import { createCognitoVerifier } from './auth';
import { loadConfig } from './config';
import { createDb, createPool } from './db/client';
import { createMitgliederStore } from './mitglieder';
import { createPostenStore } from './posten';
import { createInventarStore } from './inventar';
import {
  createBenachrichtigungen,
  createBenachrichtigungenStore,
  createWebPushSender,
} from './benachrichtigungen';
import { createKalenderStore } from './kalender';
import { registriereKalenderAufgaben } from './kalenderBenachrichtigungen';
import { registriereGeburtstagAufgaben } from './geburtstagBenachrichtigungen';
import { registriereKalenderSerien } from './kalenderSerien';
import { createSchluesselStore } from './schluessel';
import { createWarenStore } from './waren';
import { createProfilbilder } from './profilbilder';

/** Wires the real AWS-backed dependencies. Shared by the Lambda and the local server. */
export function createProduction() {
  const config = loadConfig();
  const pool = createPool(config);
  const db = createDb(pool);
  const kalender = createKalenderStore(db);
  const pushStore = createBenachrichtigungenStore(db);
  const benachrichtigungen = createBenachrichtigungen({
    store: pushStore,
    // VAPID subject: the app's address (a mailto: or https: URL is required by the push services).
    sender: createWebPushSender(pushStore, config.appUrl ?? 'https://www.c4-leipzig.de'),
  });
  // Features register their job tasks here (see docs/benachrichtigungen.md).
  registriereKalenderAufgaben(benachrichtigungen, kalender);
  registriereKalenderSerien(benachrichtigungen, kalender);
  const userAdmin = createCognitoUserAdmin(config.userPoolId, config.region);
  const mitglieder = createMitgliederStore(db);
  registriereGeburtstagAufgaben(benachrichtigungen, mitglieder, userAdmin);
  const app = createApp({
    verifyToken: createCognitoVerifier(config),
    userAdmin,
    emailAenderung: createCognitoEmailAenderung(config.region),
    mitglieder,
    posten: createPostenStore(db),
    waren: createWarenStore(db),
    inventar: createInventarStore(db),
    kalender,
    schluessel: createSchluesselStore(db),
    benachrichtigungen,
    ...(config.appUrl && { appUrl: config.appUrl }),
    profilbilder: createProfilbilder(config.profilbildBucket, config.region),
    pingDb: async () => {
      await pool.query('select 1');
    },
  });
  return { app, pushJob: (jetzt: Date) => benachrichtigungen.pushJob(jetzt) };
}

export const createProductionApp = () => createProduction().app;
