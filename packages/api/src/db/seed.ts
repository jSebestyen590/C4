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
  { id: 'dienstform-aufbau', name: 'Aufbau' },
  { id: 'dienstform-putzen', name: 'Putzen' },
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
      endeTagVersatz: 1,
      endeZeit: '02:00',
      fehltHinweisStunden: 48,
    })
    .onConflictDoNothing();
  const schichtenSeed = [
    {
      id: 'vorlage-schicht-aufbau',
      art: 'aufbau',
      tagVersatz: 0,
      beginnZeit: '17:30',
      endeTagVersatz: 0,
      endeZeit: '19:00',
      form: 'dienstform-aufbau',
      minimum: 2,
      wunsch: 3,
    },
    {
      id: 'vorlage-schicht-betrieb',
      art: 'betrieb',
      tagVersatz: 0,
      beginnZeit: '19:00',
      endeTagVersatz: 1,
      endeZeit: '00:30',
      form: 'dienstform-bar',
      minimum: 2,
      wunsch: 3,
    },
    {
      id: 'vorlage-schicht-putzen',
      art: 'putzen',
      tagVersatz: 1,
      beginnZeit: '00:30',
      endeTagVersatz: 1,
      endeZeit: '01:30',
      form: 'dienstform-putzen',
      minimum: 2,
      wunsch: 3,
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
        endeTagVersatz: s.endeTagVersatz,
        endeZeit: s.endeZeit,
        reihenfolge,
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(vorlageBedarfe)
    .values([
      ...schichtenSeed.map((s) => ({
        vorlageSchichtId: s.id,
        dienstformId: s.form,
        minimum: s.minimum,
        wunsch: s.wunsch,
      })),
      // The Betrieb needs Technik as well.
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
