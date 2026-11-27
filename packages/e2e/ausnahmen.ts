/**
 * Erlaubte Verstöße der Smoke-Prüfungen. `treffer` wird gegen die Verstoß-Zeile geprüft (Selektor-Hinweis bzw.
 * Console-Text). Jeder Eintrag braucht einen `grund`; Einträge für offene Mängel verweisen auf `docs/refactoring.md`.
 */
export interface Ausnahme {
  route: string | RegExp;
  pruefung: 'touch' | 'schrift' | 'scroll' | 'console';
  treffer: string | RegExp;
  grund: string;
}

/**
 * Touch-Ziele, die für alle Routen ausgenommen sind: CSS-Selektor des Elements, Grund. Sekundäre Ziele in Listen
 * und Fließtext dürfen nach WCAG 2.5.8 (Ausnahme "Abstand") klein sein, solange sie mindestens 24 px haben.
 */
export const touchAusnahmeSelektoren: { selektor: string; grund: string }[] = [
  {
    selektor: 'a:has(.status-name)',
    grund: 'Mitgliedsname (StatusName) in Zeilen und Listen; 42 px würden jede Liste aufblähen.',
  },
  {
    selektor: 'a[href*="/kalender/events/"][title]',
    grund: 'Termin-Eintrag in der Monatsansicht; Zelle und Eintrag sind bewusst kompakt.',
  },
  { selektor: 'a[href^="mailto:"]', grund: 'E-Mail-Adresse als Link in Detailansichten.' },
  {
    selektor: '.mantine-Pill-root button',
    grund: 'Entfernen-Knopf eines Pills in einer Mehrfachauswahl (Feld selbst ist 42 px hoch).',
  },
];

export const ausnahmen: Ausnahme[] = [
  {
    route: '/protokolle/:id',
    pruefung: 'console',
    treffer: /status of 409.*\/sperre$/,
    grund:
      'Erwartetes Verhalten: Ein Protokoll-Entwurf hat eine Bearbeitungssperre je Tab (docs/protokolle.md, Bearbeitungssperre). ' +
      'Phone- und Desktop-Projekt öffnen denselben Entwurf mit demselben Konto, der zweite Tab bekommt 409 auf POST /sperre ' +
      'und zeigt den Sperrhinweis. Der Browser meldet die abgelehnte Anfrage als Console-Fehler.',
  },
];

function passt(muster: string | RegExp, text: string, exakt: boolean): boolean {
  if (typeof muster === 'string') return exakt ? muster === text : text.includes(muster);
  return muster.test(text);
}

/** Entfernt Zeilen, die eine Ausnahme für diese Route und Prüfung abdeckt. */
export function ohneAusnahmen(
  route: string,
  pruefung: Ausnahme['pruefung'],
  zeilen: string[],
): string[] {
  return zeilen.filter(
    (zeile) =>
      !ausnahmen.some(
        (a) =>
          a.pruefung === pruefung && passt(a.route, route, true) && passt(a.treffer, zeile, false),
      ),
  );
}
