import type {
  Anrede,
  BuchungsArt,
  Kontaktkanal,
  MhdArt,
  EventBewertung,
  MitgliedStatus,
  Permission,
  Quelle,
  Role,
  EventArt,
  SchichtArt,
  VorgangTyp,
} from '@c4/shared';

// The whole UI is German. Fixed values coming from the backend get their German label here.

// Gebinde units; the labels live in shared because the Gebinde names are formatted there too.
export { EINHEIT_LABELS, VERPACKUNGSEINHEIT_LABELS } from '@c4/shared';

// Footprints of an IFCO (groß 60×40 / klein 40×30); the labels live in shared next to the capacity rules.
export { IFCO_GRUNDFLAECHE_LABELS, IFCO_MASSE } from '@c4/shared';

// Kinds of Lagerort (Lagerort / Regal / Regalboden); the labels live in shared next to the rules.
export { LAGERORT_ART_LABELS } from '@c4/shared';

/** Labels that name a person: one form per way of addressing them (male, female, neutral). */
export type Gegendert = Record<Anrede, string>;

export const ROLE_LABELS: Record<Role, Gegendert> = {
  admin: { maennlich: 'Administrator', weiblich: 'Administratorin', neutral: 'Administrator:in' },
};

export const KONTAKTKANAL_LABELS: Record<Kontaktkanal, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  signal: 'Signal',
  discord: 'Discord',
  mail: 'E-Mail',
};

export const ANREDE_LABELS: Gegendert = {
  maennlich: 'Männlich',
  weiblich: 'Weiblich',
  neutral: 'Neutral (z. B. Anwärter:in)',
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  'users:manage': 'Benutzer verwalten',
  'content:read': 'Inhalte lesen',
  'mitglieder:lesen': 'Mitglieder ansehen',
  'profil:bearbeiten': 'Eigenes Profil bearbeiten',
  'posten:lesen': 'Posten ansehen',
  'posten:bearbeiten': 'Posten bearbeiten',
  'waren:lesen': 'Waren ansehen',
  'bestand:buchen': 'Bestand buchen',
  'waren:verwalten': 'Waren verwalten',
  'inventar:lesen': 'Inventar ansehen',
  'inventar:umraeumen': 'Inventar umräumen und verleihen',
  'inventar:verwalten': 'Inventar verwalten',
  'kalender:lesen': 'Kalender ansehen',
  'events:verwalten': 'Events verwalten',
  'kalender:einrichten': 'Kalender einrichten',
};

export const MITGLIED_STATUS_LABELS: Record<MitgliedStatus, Gegendert> = {
  anwaerter: { maennlich: 'Anwärter', weiblich: 'Anwärterin', neutral: 'Anwärter:in' },
  mitglied: { maennlich: 'Mitglied', weiblich: 'Mitglied', neutral: 'Mitglied' },
  em: { maennlich: 'EM', weiblich: 'EM', neutral: 'EM' },
};

/** Kind of an event Kategorie: events have either Dienste (Schichten) or participants. */
export const EVENT_ART_LABELS: Record<EventArt, string> = {
  dienste: 'Dienste',
  teilnahme: 'Teilnahme',
};

export const SCHICHT_ART_LABELS: Record<SchichtArt, string> = {
  aufbau: 'Aufbau',
  betrieb: 'Betrieb',
  putzen: 'Putzen',
};

/** Feature areas of the notification settings (key = `bereich` in BENACHRICHTIGUNGS_ARTEN). */
export const BENACHRICHTIGUNG_BEREICH_LABELS: Record<string, string> = {
  kalender: 'Kalender',
  geburtstag: 'Geburtstage',
};

/** Notification types (key = `art` in BENACHRICHTIGUNGS_ARTEN): title and one-line explanation. */
export const BENACHRICHTIGUNG_ART_LABELS: Record<string, { titel: string; beschreibung: string }> =
  {
    'kalender.erinnerung': {
      titel: 'Erinnerung vor meinem Dienst',
      beschreibung: 'Eine Nachricht kurz vor dem Beginn deiner Schicht.',
    },
    'kalender.fehlende_dienste': {
      titel: 'Fehlende Dienste',
      beschreibung: 'Wenn bei einem Event kurz vorher noch Dienste fehlen.',
    },
    'kalender.aenderung': {
      titel: 'Änderungen an meinen Diensten',
      beschreibung:
        'Wenn ein Event verschoben oder abgesagt wird oder dein Dienst geändert oder entfernt wird.',
    },
    'kalender.teilnahme_erinnerung': {
      titel: 'Erinnerung vor einem Event, an dem ich teilnehme',
      beschreibung: 'Eine Nachricht kurz vor dem Beginn eines Events, bei dem du dabei bist.',
    },
    'geburtstag.erinnerung': {
      titel: 'Geburtstage von Mitgliedern',
      beschreibung:
        'Eine Nachricht, wenn ein Mitglied Geburtstag hat. Nur für Mitglieder, die ihren Geburtstag im Kalender zeigen.',
    },
  };

/** "Am Tag selbst", "15 Minuten vorher", "1 Stunde vorher", "1 Tag vorher". */
export function minutenVorherLabel(minuten: number): string {
  if (minuten === 0) return 'Am Tag selbst';
  if (minuten % 1440 === 0)
    return minuten === 1440 ? '1 Tag vorher' : `${minuten / 1440} Tage vorher`;
  if (minuten % 60 === 0)
    return minuten === 60 ? '1 Stunde vorher' : `${minuten / 60} Stunden vorher`;
  return `${minuten} Minuten vorher`;
}

/** Traffic light of a Schicht or event (a cancelled event is gray). */
export const AMPEL_LABELS: Record<EventBewertung, string> = {
  rot: 'Dienste fehlen',
  gelb: 'Wunsch nicht erreicht',
  gruen: 'Voll besetzt',
  abgesagt: 'Abgesagt',
};

export const MHD_ART_LABELS: Record<MhdArt, string> = {
  keins: 'Kein MHD',
  tag: 'Tagesgenau',
  monat: 'Monatsgenau',
};

export const BUCHUNGS_ART_LABELS: Record<BuchungsArt, string> = {
  zugang: 'Zugang',
  abgang: 'Abgang',
  anbruch: 'Anbruch',
  korrektur: 'Korrektur',
  umlagerung: 'Umlagerung',
};

export const VORGANG_TYP_LABELS: Record<VorgangTyp, string> = {
  einlagerung: 'Einlagerung',
  entnahme: 'Entnahme',
  umlagerung: 'Umlagerung',
  inventur: 'Inventur',
};

export const QUELLE_LABELS: Record<Quelle, string> = {
  manuell: 'Manuell',
  inventur: 'Inventur',
};

/** Reasons of a Zugang or Abgang of a Gegenstand (`gegenstand_bewegungen.grund`). */
export const GRUND_LABELS: Record<string, string> = {
  gekauft: 'gekauft',
  ersatz: 'Ersatz beschafft',
  geschenkt: 'geschenkt bekommen',
  gefunden: 'gefunden',
  bestand: 'Bestand übernommen',
  verloren: 'verloren',
  geklaut: 'geklaut',
  kaputt: 'kaputt',
  verkauft: 'verkauft',
  entsorgt: 'entsorgt',
  verschenkt: 'verschenkt',
  sonstiges: 'sonstiges',
};

/** Cognito user statuses. */
export const USER_STATUS_LABELS: Record<string, string> = {
  UNCONFIRMED: 'Unbestätigt',
  CONFIRMED: 'Bestätigt',
  ARCHIVED: 'Archiviert',
  COMPROMISED: 'Kompromittiert',
  UNKNOWN: 'Unbekannt',
  RESET_REQUIRED: 'Zurücksetzen erforderlich',
  FORCE_CHANGE_PASSWORD: 'Passwortänderung erforderlich',
  EXTERNAL_PROVIDER: 'Externer Anbieter',
};

/** Falls back to the raw value for anything not translated yet. */
export const label = (labels: Record<string, string>, value: string): string =>
  labels[value] ?? value;

/** Like `label`, for texts that name a person: picks the form matching how they want to be addressed. */
export const labelFuer = (
  labels: Record<string, Gegendert>,
  value: string,
  anrede: Anrede,
): string => labels[value]?.[anrede] ?? value;
