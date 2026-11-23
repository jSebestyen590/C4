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
  registriereVerlaufAufraeumen,
} from './benachrichtigungen';
import { createKalenderStore } from './kalender';
import {
  createFreigabenStore,
  createOneDrive,
  createOneDriveStore,
  createOrdnerCacheStore,
  registriereOneDriveAufgaben,
} from './onedrive';
import { registriereKalenderAufgaben } from './kalenderBenachrichtigungen';
import { registriereGeburtstagAufgaben } from './geburtstagBenachrichtigungen';
import { registriereKalenderSerien } from './kalenderSerien';
import { createSecretStore } from './secrets';
import { createPartyMail } from './partymail';
import { mailJob as mailJobAusfuehren } from './privatpartyMail';
import { createPrivatpartysStore } from './privatpartys';
import { createSchluesselStore } from './schluessel';
import { createSchluesselAnfragenStore } from './schluesselAnfragen';
import { registriereSchluesselAufgaben } from './schluesselBenachrichtigungen';
import { createTodosStore } from './todos';
import { registriereTodoAufgaben } from './todoBenachrichtigungen';
import { ladeKontext } from './umfrageAnsicht';
import { registriereUmfrageAufgaben } from './umfrageBenachrichtigungen';
import { createProtokolleStore } from './protokolle';
import { createTrichterStore } from './trichter';
import { createLagerAbgleichStore } from './lagerAbgleich';
import { finanzExport } from './finanzExport';
import { datenexportMitBelegdateien } from './finanzenDatenexportJob';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { DatenexportAuftrag } from '@c4/shared';
import { createFinanzenStore } from './finanzen';
import { createBuchStore } from './buch';
import { createUmfragenStore } from './umfragen';
import { createWarenStore } from './waren';
import { createProfilbilder } from './profilbilder';
import { createFinanzarchiv, finanzarchivNichtEingerichtet } from './finanzarchiv';
import { createProtokollbilder } from './protokollbilder';

/** Wires the real AWS-backed dependencies. Shared by the Lambda and the local server. */
export function createProduction() {
  const config = loadConfig();
  const pool = createPool(config);
  const db = createDb(pool);
  const kalender = createKalenderStore(db);
  const secrets = createSecretStore({
    region: config.region,
    arns: {
      ...(config.onedriveSecretArn && { onedrive: config.onedriveSecretArn }),
      ...(config.vapidSecretArn && { vapid: config.vapidSecretArn }),
    },
  });
  const pushStore = createBenachrichtigungenStore(db, secrets);
  const benachrichtigungen = createBenachrichtigungen({
    store: pushStore,
    // VAPID subject: the app's address (a mailto: or https: URL is required by the push services).
    sender: createWebPushSender(pushStore, config.appUrl ?? 'https://www.c4-leipzig.de'),
  });
  // Features register their job tasks here (see docs/benachrichtigungen.md).
  registriereVerlaufAufraeumen(benachrichtigungen);
  registriereKalenderAufgaben(benachrichtigungen, kalender);
  registriereKalenderSerien(benachrichtigungen, kalender);
  const userAdmin = createCognitoUserAdmin(config.userPoolId, config.region);
  const mitglieder = createMitgliederStore(db);
  registriereGeburtstagAufgaben(benachrichtigungen, mitglieder, userAdmin);
  const schluessel = createSchluesselStore(db);
  const schluesselAnfragen = createSchluesselAnfragenStore(db);
  registriereSchluesselAufgaben(benachrichtigungen, {
    schluessel,
    anfragen: schluesselAnfragen,
    mitglieder,
    userAdmin,
  });
  const posten = createPostenStore(db);
  const todos = createTodosStore(db);
  registriereTodoAufgaben(benachrichtigungen, todos);
  const umfragen = createUmfragenStore(db);
  registriereUmfrageAufgaben(benachrichtigungen, umfragen, (jetzt) =>
    ladeKontext({ mitglieder, userAdmin, posten }, jetzt),
  );
  const onedrive = createOneDrive({ store: createOneDriveStore(db, secrets) });
  const freigaben = createFreigabenStore(db);
  const ordnerCache = createOrdnerCacheStore(db);
  registriereOneDriveAufgaben(benachrichtigungen, onedrive, { onedrive, ordnerCache, freigaben });
  const partymail = createPartyMail({
    region: config.region,
    ...(config.partymailSecretArn && { secretArn: config.partymailSecretArn }),
  });
  const privatpartys = createPrivatpartysStore(db);
  const pingDb = async () => {
    await pool.query('select 1');
  };
  const finanzen = createFinanzenStore(db);
  const finanzarchiv = config.finanzarchivBucket
    ? createFinanzarchiv(config.finanzarchivBucket, config.region)
    : finanzarchivNichtEingerichtet;
  /** Display name of a member for texts in exports. */
  const erstellerName = async (sub: string) => {
    const [rows, konten] = await Promise.all([mitglieder.alle(), userAdmin.konten()]);
    const zeile = rows.find((r) => r.sub === sub);
    return konten.get(sub)?.username ?? (zeile ? `${zeile.vorname} ${zeile.nachname}` : sub);
  };
  const datenexportJob = (auftrag: DatenexportAuftrag) =>
    datenexportMitBelegdateien(
      { store: finanzen, archiv: finanzarchiv, benachrichtigungen, erstellerName },
      auftrag,
      new Date(),
    );
  const lambdaName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  const lambdaClient = lambdaName ? new LambdaClient({ region: config.region }) : undefined;
  /**
   * In Lambda: asynchronous self-invoke (`Event`, no retries), the job runs in its own invocation
   * (see `lambda.ts`). Locally (no Lambda environment): the job runs in the background of this process.
   */
  const datenexportStarten = async (auftrag: DatenexportAuftrag) => {
    if (!lambdaClient) {
      void datenexportJob(auftrag);
      return;
    }
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: lambdaName,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify(auftrag)),
      }),
    );
  };
  const app = createApp({
    verifyToken: createCognitoVerifier(config),
    userAdmin,
    emailAenderung: createCognitoEmailAenderung(config.region),
    mitglieder,
    posten,
    waren: createWarenStore(db),
    inventar: createInventarStore(db),
    kalender,
    schluessel,
    schluesselAnfragen,
    todos,
    umfragen,
    trichter: createTrichterStore(db),
    lagerAbgleich: createLagerAbgleichStore(db),
    finanzen,
    buch: createBuchStore(db),
    protokolle: createProtokolleStore(db),
    privatpartys,
    partymail,
    benachrichtigungen,
    onedrive,
    freigaben,
    ordnerCache,
    ...(config.appUrl && { appUrl: config.appUrl }),
    profilbilder: createProfilbilder(config.profilbildBucket, config.region),
    protokollbilder: createProtokollbilder(config.profilbildBucket, config.region),
    finanzarchiv,
    datenexportStarten,
    pingDb,
  });
  return {
    app,
    pingDb,
    finanzExportJob: (jetzt: Date) =>
      finanzExport(
        { store: finanzen, archiv: finanzarchiv, benachrichtigungen, posten, userAdmin },
        jetzt,
      ),
    datenexportJob,
    pushJob: (jetzt: Date) => benachrichtigungen.pushJob(jetzt),
    mailJob: (jetzt: Date) =>
      mailJobAusfuehren({ partymail, privatpartys, benachrichtigungen, posten, userAdmin }, jetzt),
  };
}

export const createProductionApp = () => createProduction().app;
