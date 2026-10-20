import type {
  Anrede,
  BuchungsArt,
  Kontaktkanal,
  MhdArt,
  MitgliedStatus,
  Permission,
  Quelle,
  Role,
  VorgangTyp,
} from '@c4/shared';

// The whole UI is German. Fixed values coming from the backend get their German label here.

// Gebinde units; the labels live in shared because the Gebinde names are formatted there too.
export { EINHEIT_LABELS, VERPACKUNGSEINHEIT_LABELS } from '@c4/shared';

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
};

export const MITGLIED_STATUS_LABELS: Record<MitgliedStatus, Gegendert> = {
  anwaerter: { maennlich: 'Anwärter', weiblich: 'Anwärterin', neutral: 'Anwärter:in' },
  mitglied: { maennlich: 'Mitglied', weiblich: 'Mitglied', neutral: 'Mitglied' },
  em: { maennlich: 'EM', weiblich: 'EM', neutral: 'EM' },
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
