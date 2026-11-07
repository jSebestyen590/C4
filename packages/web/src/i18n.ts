import type {
  Anrede,
  BuchungsArt,
  Kontaktkanal,
  MhdArt,
  EventBewertung,
  MitgliedStatus,
  Permission,
  ProtokollArt,
  ProtokollStatus,
  ProtokollTeilnahmeWert,
  Quelle,
  Role,
  EventArt,
  EventDauer,
  SchichtArt,
  UmfrageErgebnisse,
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
  'schluessel:lesen': 'Schlüssel ansehen und übergeben',
  'schluessel:verwalten': 'Schlüssel verwalten',
  'umfragen:lesen': 'Umfragen ansehen, erstellen und abstimmen',
  'umfragen:verwalten': 'Alle Umfragen verwalten',
  'trichter:lesen': 'Trichter sehen und Durchgänge eintragen',
  'trichter:verwalten': 'Trichter verwalten',
  'bilder:lesen': 'Bilder ansehen und Ordner anlegen',
  'protokolle:lesen': 'Protokolle lesen',
  'protokolle:schreiben': 'Protokolle schreiben',
};

export const MITGLIED_STATUS_LABELS: Record<MitgliedStatus, Gegendert> = {
  anwaerter: { maennlich: 'Anwärter', weiblich: 'Anwärterin', neutral: 'Anwärter:in' },
  mitglied: { maennlich: 'Mitglied', weiblich: 'Mitglied', neutral: 'Mitglied' },
  em: { maennlich: 'EM', weiblich: 'EM', neutral: 'EM' },
  extern: { maennlich: 'Externer', weiblich: 'Externe', neutral: 'Externe:r' },
};

/** Plural of each status, used for counts („3 Anwärter:innen“). */
export const MITGLIED_STATUS_MEHRZAHL: Record<MitgliedStatus, string> = {
  anwaerter: 'Anwärter:innen',
  mitglied: 'Mitglieder',
  em: 'EMs',
  extern: 'Externe',
};

/** Kind of an event Kategorie: events have either Dienste (Schichten) or participants. */
export const EVENT_ART_LABELS: Record<EventArt, string> = {
  dienste: 'Dienste',
  teilnahme: 'Teilnahme',
};

/** How long the events of a Kategorie last. */
export const EVENT_DAUER_LABELS: Record<EventDauer, { titel: string; beschreibung: string }> = {
  eintaegig: {
    titel: 'Eintägig',
    beschreibung: 'Datum mit Beginn und Ende, höchstens 24 Stunden.',
  },
  mehrtaegig: {
    titel: 'Mehrtägig',
    beschreibung: 'Start- und Enddatum, jeweils mit Uhrzeit (z. B. ein Wochenende).',
  },
  ganztaegig: {
    titel: 'Ganztägig',
    beschreibung: 'Nur Start- und Enddatum, ohne Uhrzeiten (z. B. eine Fahrt).',
  },
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
  schluessel: 'Schlüssel',
  umfrage: 'Umfragen',
  todo: 'Todos',
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
    'schluessel.uebergabe': {
      titel: 'Schlüsselübergaben',
      beschreibung: 'Wenn jemand eine Übergabe eines Schlüssels an dich oder von dir einträgt.',
    },
    'umfrage.neu': {
      titel: 'Neue Umfragen',
      beschreibung: 'Wenn jemand eine Umfrage erstellt, bei der du abstimmen sollst oder kannst.',
    },
    'umfrage.erinnerung': {
      titel: 'Erinnerungen an Umfragen',
      beschreibung:
        'Morgens vor dem Ende einer Umfrage, solange du nicht abgestimmt hast. Bei Umfragen, bei denen du abstimmen musst, kommen sie immer.',
    },
    'umfrage.termin': {
      titel: 'Termin steht fest',
      beschreibung:
        'Wenn aus einer Terminumfrage ein Event angelegt wurde, und ob du dort eingetragen bist.',
    },
    'umfrage.erneut_abstimmen': {
      titel: 'Erneut abstimmen',
      beschreibung: 'Wenn eine Umfrage so geändert wurde, dass deine Stimme nicht mehr zählt.',
    },
    'todo.frist': {
      titel: 'Todo bald fällig',
      beschreibung: 'Erinnerung zwei Tage vor der Deadline eines offenen Todos.',
    },
  };

/** When the voters see the results of a poll. */
export const UMFRAGE_ERGEBNISSE_LABELS: Record<
  UmfrageErgebnisse,
  { titel: string; beschreibung: string }
> = {
  sofort: { titel: 'Sofort', beschreibung: 'Alle sehen den Zwischenstand jederzeit.' },
  nach_abstimmung: {
    titel: 'Nach der eigenen Stimme',
    beschreibung: 'Den Zwischenstand sieht, wer schon abgestimmt hat.',
  },
  nach_ende: {
    titel: 'Erst nach dem Ende',
    beschreibung: 'Bis dahin sieht nur, wer die Umfrage verwaltet, die Ergebnisse.',
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

// Trichterkönig:in: the lines of the Trichter header, one per way of addressing the king.
export const TRICHTER_KOENIG_JAHR_LABELS: Gegendert = {
  maennlich: 'ist im laufenden Jahr Trichterkönig',
  weiblich: 'ist im laufenden Jahr Trichterkönigin',
  neutral: 'ist im laufenden Jahr Trichterkönig:in',
};

export const TRICHTER_KOENIG_EWIG_LABELS: Gegendert = {
  maennlich: 'ist ewiger Trichterkönig',
  weiblich: 'ist ewige Trichterkönigin',
  neutral: 'ist ewige:r Trichterkönig:in',
};

// Protokolle: attendance in full words (legend, summary) and in short words (segmented control).
export const PROTOKOLL_TEILNAHME_LABELS: Record<ProtokollTeilnahmeWert, string> = {
  anwesend: 'anwesend',
  verspaetet: 'anwesend', // legacy value, counts as anwesend
  entschuldigt: 'entschuldigt',
  unentschuldigt: 'unentschuldigt',
};

export const PROTOKOLL_TEILNAHME_KURZ: Record<ProtokollTeilnahmeWert, string> = {
  anwesend: 'da',
  verspaetet: 'da', // legacy value, counts as anwesend
  entschuldigt: 'entsch.',
  unentschuldigt: 'fehlt',
};

/** Kind of Sitzung (quorum rule). */
export const PROTOKOLL_ART_LABELS: Record<ProtokollArt, string> = {
  sitzung: 'Sitzung',
  mitgliederversammlung: 'Mitgliederversammlung',
};

/** Short explanation of the quorum rule of each kind. */
export const PROTOKOLL_ART_BESCHREIBUNG: Record<ProtokollArt, string> = {
  sitzung: 'Beschlussfähig mit mehr als der Hälfte der Mitglieder.',
  mitgliederversammlung: 'Beschlussfähig mit mehr als zwei Dritteln der Mitglieder.',
};

export const PROTOKOLL_STATUS_LABELS: Record<ProtokollStatus, string> = {
  entwurf: 'Entwurf',
  abgeschlossen: 'Abgeschlossen',
};
