/**
 * Alle Routen der App (Quelle: `packages/web/src/App.tsx` und `routes/*Routen.tsx`, ohne `/auth/callback` und `*`).
 * `routen-vollstaendig.spec.ts` meldet Pfade, die hier fehlen. Die IDs für Pfade mit Parametern liefert das
 * Setup (`setup/idQuellen.ts` -> `.auth/ids.json`, Schlüssel ist der Router-Pfad).
 */
export type Art = 'mobil' | 'finanzen-arbeit';

export interface Route {
  /** Pfad wie im Router, z. B. `/finanzen/journal/:id`. */
  pfad: string;
  art: Art;
  /** Begründung, z. B. Seite legt beim Öffnen Daten an. */
  ueberspringen?: string;
}

const pfade: string[] = [
  '/',
  '/belege',
  '/belege/:id',
  '/belege/einreichen',
  '/benachrichtigungen',
  '/benachrichtigungen/verlauf',
  '/bilder',
  '/bilder/einrichtung',
  '/buch',
  '/finanzen',
  '/finanzen/artikel',
  '/finanzen/auslagen',
  '/finanzen/bargeld',
  '/finanzen/bargeld/umbuchen',
  '/finanzen/bargeld/wechseln',
  '/finanzen/bargeld/zaehlen',
  '/finanzen/bargeld/zaehlungen',
  '/finanzen/bargeld/zaehlungen/:id',
  '/finanzen/belege',
  '/finanzen/belege/:id',
  '/finanzen/belege/entwurf/:id',
  '/finanzen/belege/neu',
  '/finanzen/buch',
  '/finanzen/buch/abrechnen',
  '/finanzen/buch/seiten/:id',
  '/finanzen/buch/tarife',
  '/finanzen/buchen',
  '/finanzen/datenexport',
  '/finanzen/festschreibung',
  '/finanzen/journal',
  '/finanzen/journal/:id',
  '/finanzen/kassen',
  '/finanzen/kassen/:kontoId/abrechnen',
  '/finanzen/kassen/abrechnungen',
  '/finanzen/kassen/abrechnungen/:id',
  '/finanzen/kette',
  '/finanzen/konten',
  '/finanzen/lager-abgleich',
  '/finanzen/lager-abgleich/:wareId',
  '/finanzen/rechnungen',
  '/finanzen/rechnungen/:id',
  '/finanzen/rechnungen/einstellungen',
  '/finanzen/rechnungen/entwurf/:id',
  '/finanzen/rechnungen/neu',
  '/finanzen/rechnungsempfaenger',
  '/finanzen/rechnungssteller',
  '/finanzen/steuersaetze',
  '/finanzen/warengruppen-kategorien',
  '/historie',
  '/inventar',
  '/inventar/ausleihen/:id',
  '/inventar/ausleihen/:id/bearbeiten',
  '/inventar/ausleihen/neu',
  '/inventar/gegenstaende/:id',
  '/inventar/ifcos/:id',
  '/inventar/stammdaten',
  '/kalender',
  '/kalender/einrichtung',
  '/kalender/events/:id',
  '/kalender/events/:id/bearbeiten',
  '/kalender/events/neu',
  '/kalender/mein-kalender',
  '/kalender/statistik',
  '/lager',
  '/lager/:id/einlagern',
  '/lager/:id/entnehmen',
  '/lager/:id/umlagern',
  '/lager/inventur/:id',
  '/lager/stammdaten',
  '/mitglieder',
  '/mitglieder/:kennung',
  '/posten',
  '/posten/:id',
  '/privatpartys',
  '/privatpartys/:id',
  '/privatpartys/:id/bearbeiten',
  '/privatpartys/neu',
  '/privatpartys/personen',
  '/privatpartys/personen/:id',
  '/profil',
  '/protokolle',
  '/protokolle/:id',
  '/protokolle/neu',
  '/schluessel',
  '/schluessel/:id',
  '/schluessel/anfragen/:id',
  '/todos',
  '/trichter',
  '/trichter/neu',
  '/trichter/verwaltung',
  '/umfragen',
  '/umfragen/:id',
  '/umfragen/:id/bearbeiten',
  '/umfragen/neu',
  '/waren',
  '/waren/:id',
];

// Geprüft: Weder die `…/neu`- noch die `…/entwurf/…`-Seiten legen beim Öffnen Daten an. Die Beleg- und
// Rechnungsentwürfe speichern erst nach einer Eingabe (`hatInhalt`) bzw. beim Verlassen mit ungespeichertem
// Stand. Kein Eintrag braucht daher `ueberspringen`; neue Fälle hier mit Begründung eintragen.
const ueberspringen: Record<string, string> = {};

export const routen: Route[] = pfade.map((pfad) => ({
  pfad,
  art: pfad.startsWith('/finanzen') ? 'finanzen-arbeit' : 'mobil',
  ...(ueberspringen[pfad] ? { ueberspringen: ueberspringen[pfad] } : {}),
}));
