import type { MitgliedStatus, Permission, Role } from '@c4/shared';

// The whole UI is German. Fixed values coming from the backend get their German label here.

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  reader: 'Lesender Zugriff',
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  'users:manage': 'Benutzer verwalten',
  'content:read': 'Inhalte lesen',
  'mitglieder:lesen': 'Mitglieder ansehen',
  'profil:bearbeiten': 'Eigenes Profil bearbeiten',
};

export const MITGLIED_STATUS_LABELS: Record<MitgliedStatus, string> = {
  anwaerter: 'Anwärter',
  mitglied: 'Mitglied',
  em: 'EM',
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
