/** The part of a Zod `safeParse` result needed here (keeps the helper independent of the Zod version). */
type PruefErgebnis =
  | { success: true }
  | {
      success: false;
      error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
    };

/**
 * Field errors of one or more `safeParse` results: the first message per top-level path
 * (`path[0]`); successful results contribute nothing. Issues without a path are ignored.
 */
export function zodFeldFehler(...ergebnisse: PruefErgebnis[]): Record<string, string> {
  const fehler: Record<string, string> = {};
  for (const ergebnis of ergebnisse) {
    if (ergebnis.success) continue;
    for (const issue of ergebnis.error.issues) {
      const feld = issue.path[0];
      if (feld !== undefined) fehler[String(feld)] ??= issue.message;
    }
  }
  return fehler;
}
