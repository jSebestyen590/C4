import { loadConfig } from '../config';
import { createDb, createPool } from './client';
import {
  appInfo,
  dienstformen,
  eventKategorien,
  eventVorlagen,
  vorlageBedarfe,
  vorlageSchichten,
} from './schema';

/** Fixed ids make the seed idempotent: re-running it never duplicates rows. */
const FORMEN = [
  { id: 'dienstform-bar', name: 'Bar' },
  { id: 'dienstform-technik', name: 'Technik' },
];

const pool = createPool(loadConfig());
try {
  const db = createDb(pool);
  await db
    .insert(appInfo)
    .values({ key: 'seeded', value: new Date().toISOString() })
    .onConflictDoNothing();

  // Kalender: Dienstformen, one Kategorie and a Vorlage for a regular opening.
  await db
    .insert(dienstformen)
    .values(FORMEN.map((f, reihenfolge) => ({ ...f, reihenfolge })))
    .onConflictDoNothing();
  await db
    .insert(eventKategorien)
    .values({ id: 'kategorie-offener-abend', name: 'Offener Abend', farbe: 'grape' })
    .onConflictDoNothing();
  await db
    .insert(eventVorlagen)
    .values({
      id: 'vorlage-offener-abend',
      titel: 'Offener Abend',
      beschreibung: null,
      kategorieId: 'kategorie-offener-abend',
      beginnZeit: '19:00',
      endeZeit: '02:00',
    })
    .onConflictDoNothing();
  // Aufbau/Putzen have a head count on the Schicht; the Betrieb needs Dienstformen.
  const schichtenSeed = [
    {
      id: 'vorlage-schicht-aufbau',
      art: 'aufbau',
      tagVersatz: 0,
      beginnZeit: '17:30',
      endeZeit: '19:00',
      minimum: 1,
      wunsch: 2,
    },
    {
      id: 'vorlage-schicht-betrieb',
      art: 'betrieb',
      tagVersatz: 0,
      beginnZeit: '19:00',
      endeZeit: '00:30',
      minimum: null,
      wunsch: null,
    },
    {
      id: 'vorlage-schicht-putzen',
      art: 'putzen',
      tagVersatz: 1,
      beginnZeit: '00:30',
      endeZeit: '01:30',
      minimum: 1,
      wunsch: 2,
    },
  ] as const;
  await db
    .insert(vorlageSchichten)
    .values(
      schichtenSeed.map((s, reihenfolge) => ({
        id: s.id,
        vorlageId: 'vorlage-offener-abend',
        art: s.art,
        tagVersatz: s.tagVersatz,
        beginnZeit: s.beginnZeit,
        endeZeit: s.endeZeit,
        reihenfolge,
        minimum: s.minimum,
        wunsch: s.wunsch,
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(vorlageBedarfe)
    .values([
      {
        vorlageSchichtId: 'vorlage-schicht-betrieb',
        dienstformId: 'dienstform-bar',
        minimum: 2,
        wunsch: 3,
      },
      {
        vorlageSchichtId: 'vorlage-schicht-betrieb',
        dienstformId: 'dienstform-technik',
        minimum: 1,
        wunsch: 1,
      },
    ])
    .onConflictDoNothing();
  console.log('Seed data written');
} finally {
  await pool.end();
}
