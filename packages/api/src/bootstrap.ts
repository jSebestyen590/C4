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
import {
  createFreigabenStore,
  createOneDrive,
  createOneDriveStore,
  registriereOneDriveAufgaben,
} from './onedrive';
import { registriereKalenderAufgaben } from './kalenderBenachrichtigungen';
import { registriereGeburtstagAufgaben } from './geburtstagBenachrichtigungen';
import { registriereKalenderSerien } from './kalenderSerien';
import { createSchluesselStore } from './schluessel';
import { ladeKontext } from './umfrageAnsicht';
import { registriereUmfrageAufgaben } from './umfrageBenachrichtigungen';
import { createTrichterStore } from './trichter';
import { createUmfragenStore } from './umfragen';
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
  const posten = createPostenStore(db);
  const umfragen = createUmfragenStore(db);
  registriereUmfrageAufgaben(benachrichtigungen, umfragen, (jetzt) =>
    ladeKontext({ mitglieder, userAdmin, posten }, jetzt),
  );
  const onedrive = createOneDrive({ store: createOneDriveStore(db) });
  registriereOneDriveAufgaben(benachrichtigungen, onedrive);
  const app = createApp({
    verifyToken: createCognitoVerifier(config),
    userAdmin,
    emailAenderung: createCognitoEmailAenderung(config.region),
    mitglieder,
    posten,
    waren: createWarenStore(db),
    inventar: createInventarStore(db),
    kalender,
    schluessel: createSchluesselStore(db),
    umfragen,
    trichter: createTrichterStore(db),
    benachrichtigungen,
    onedrive,
    freigaben: createFreigabenStore(db),
    ...(config.appUrl && { appUrl: config.appUrl }),
    profilbilder: createProfilbilder(config.profilbildBucket, config.region),
    pingDb: async () => {
      await pool.query('select 1');
    },
  });
  return { app, pushJob: (jetzt: Date) => benachrichtigungen.pushJob(jetzt) };
}

export const createProductionApp = () => createProduction().app;
