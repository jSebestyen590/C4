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

export const ausnahmen: Ausnahme[] = [];

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
