# Inventar

Dauerhaftes Betriebsvermögen des Clubs (Kabeltrommel, Beamer, Pavillons, Spanngurte, ...): **Gegenstände** in einem
Kategorienbaum, mit einer Soll-Anzahl auf einem oder mehreren **Plätzen** im Lagerort-Baum (siehe [waren.md](./waren.md)),
wahlweise in **Ifcos** (Euronormboxen, z. B. „Spanngurtkiste“). Gegenstände lassen sich **verleihen**. Fachlogik
(Schemas, Abweichung, Verliehen-Prüfungen) liegt in `packages/shared/src/inventar.ts`, Speicherung und Regeln in
`packages/api/src/inventar.ts`, Routen in `packages/api/src/app.ts` (Abschnitt `Inventar`). Fehlerklassen und Hilfen
(`WarenUngueltig` → 400, `WarenKonflikt` → 409) kommen aus `packages/api/src/waren.ts`.

## Rechte

- `inventar:lesen` und `inventar:umraeumen` haben alle Status. Umräumen umfasst Plätze ändern, Ifcos umstellen und befüllen sowie
  Verleihen, Zurücknehmen, Bearbeiten und Löschen von Ausleihen (Label „Inventar umräumen und verleihen“).
- `inventar:verwalten` (Stammdaten: Kategorien, Gegenstände, Ifcos anlegen, ändern, archivieren, löschen) haben Admins und die
  Vorstandsposten (Migration `0031`); es lässt sich über `POSTEN_RECHTE` auch weiteren Posten geben.

## Datenmodell

Migrationen `0025`–`0031`, jeweils ein Statement und eine Down-Datei (siehe [datenbank.md](./datenbank.md); Rollback-Ziel nur für
das Inventar: `0024_vorstandsposten_waren`).

| Tabelle               | Inhalt                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `inventar_kategorien` | Baum (`parent_id`, `name`, `archiviert`), wie `warengruppen`                                                             |
| `ifcos`               | `name`, `beschreibung`, `lagerort_id` (null = ohne Platz), `archiviert`; nicht verschachtelbar, höchstens ein Platz      |
| `gegenstaende`        | `name`, `beschreibung`, `kategorie_id`, `anzahl` (Soll-Gesamtzahl, Standard 1), `archiviert`                             |
| `gegenstand_plaetze`  | `gegenstand_id`, entweder `lagerort_id` oder `ifco_id` (CHECK), `anzahl` ≥ 1                                             |
| `ausleihen`           | `an` (Freitext), `ausgeliehen_am`, `rueckgabe_geplant`, `kommentar`, `erstellt_von` (Cognito-`sub` ohne Fremdschlüssel)  |
| `ausleihe_positionen` | `ausleihe_id`, `gegenstand_id`, Herkunft `lagerort_id` oder `ifco_id` (CHECK), `anzahl` ≥ 1, `zurueck_am` (null = offen) |

Die Herkunft einer Position ist ein Ort, keine Zuordnungs-Id; Umräumen zerstört so die Historie nicht.

## Regeln

- **Soll-Zustand:** Die Plätze sagen, wo etwas hingehört. Es gibt keine Buchungshistorie; Umräumen überschreibt. Die Summe der
  Plätze darf vom Soll abweichen (`inventarAbweichung`, `abweichungText`: „2 ohne Platz“, „1 mehr als Soll“).
- **Plätze:** `PUT …/plaetze` ersetzt alle Plätze eines Gegenstands, `PUT …/inhalt` alle Zuordnungen einer Ifco, in einer Transaktion.
  Je Gegenstand ist jeder Lagerort/jede Ifco nur einmal erlaubt, Anzahl ≥ 1. Ziele müssen existieren und dürfen nicht archiviert
  sein (400; bereits zugeordnete archivierte Ziele bleiben erlaubt). Ein archivierter Gegenstand behält seine Plätze, ist aber nicht
  mehr umräumbar (400). `PUT …/ifcos/:id/platz { lagerortId | null }` stellt die Ifco um.
- **Löschen** geht nur, wenn nichts verweist (409, sonst archivieren): Kategorie (Unterkategorien, Gegenstände), Gegenstand
  (Plätze, Ausleihen), Ifco (Inhalt, Ausleihen). **Archivieren:** Kategorie archiviert den Teilbaum (Wiederherstellen braucht
  eine nicht archivierte Eltern-Kategorie); Ifco nur leer und ohne offene Ausleihe.
- **Lagerorte:** Löschen prüft zusätzlich Ifcos, Plätze und Ausleihen. Archivieren ist mit Ifcos oder direkt zugeordneten Gegenständen
  im Teilbaum nicht möglich („Im Lagerort liegt noch Inventar. Räume es zuerst um.“) und nicht, solange von dort etwas verliehen ist.
- **Ausleihe:** Eine Position nennt Gegenstand, Herkunft (Lagerort oder Ifco) und Anzahl. Die Herkunft muss eine bestehende
  Zuordnung des Gegenstands sein, die Anzahl höchstens zugeordnet minus offen verliehen (`ausleihFehler`, 400 mit Gegenstand und
  Platz); archivierte Gegenstände sind nicht verleihbar. Die Plätze bleiben beim Verleihen unverändert, die verliehene Menge gilt als
  „gerade weg“ (`verliehen` je Platz und gesamt). Gegenstand und Herkunft sind je Ausleihe eindeutig.
- **Rückgabe** je Position (Teilrückgaben möglich), nur für offene Positionen dieser Ausleihe und nicht vor dem Ausleihzeitpunkt (400).
  Eine Ausleihe ist `erledigt`, wenn alle Positionen zurück sind. `DELETE` entfernt eine Ausleihe samt Positionen (Fehleintrag).
- **Umräumen unter Verliehenes** (Platz entfernen oder Anzahl senken, `verliehenFehler`) wird abgelehnt (409 „Davon sind noch 3 verliehen.“).
- `erstellt_von` einer Ausleihe ist die `sub` der anfragenden Person.

## API

| Route                                                                                                                                                         | Recht                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `GET /api/inventar/kategorien`, `/gegenstaende`, `/gegenstaende/:id`, `/ifcos`, `/ifcos/:id` (Listen mit `?archiv=1`)                                         | `inventar:lesen`     |
| `GET /api/inventar/ausleihen[?status=offen]`, `GET /api/inventar/ausleihen/:id`                                                                               | `inventar:lesen`     |
| `POST/PUT/DELETE` auf `/api/inventar/kategorien`, `/gegenstaende`, `/ifcos`; `PUT …/:id/archiv { archiviert }`                                                | `inventar:verwalten` |
| `PUT /api/inventar/gegenstaende/:id/plaetze { plaetze: [{ lagerortId?, ifcoId?, anzahl }] }`                                                                  | `inventar:umraeumen` |
| `PUT /api/inventar/ifcos/:id/platz { lagerortId \| null }`, `PUT /api/inventar/ifcos/:id/inhalt { positionen: [{ gegenstandId, anzahl }] }`                   | `inventar:umraeumen` |
| `POST /api/inventar/ausleihen` (→ `201 { id }`), `POST …/ausleihen/:id/rueckgabe { positionIds, zurueckAm }`, `PUT …/ausleihen/:id`, `DELETE …/ausleihen/:id` | `inventar:umraeumen` |

Antworten: `GET /gegenstaende[/:id]` liefert je Gegenstand `plaetze: [{ id, lagerortId, ifcoId, anzahl, verliehen }]` (`verliehen` =
offene Menge von dieser Herkunft) und `verliehen` gesamt; `GET /ifcos[/:id]` liefert `inhalt: [{ gegenstandId, anzahl }]`; eine
Ausleihe liefert `erledigt` und `positionen` (mit `zurueckAm`). So rechnet der Client die Lager-Ansicht selbst aus. Unbekannte
Ids sind 404, ungültige Eingaben und verletzte Fachregeln 400, Konflikte 409. `PUT /ausleihen/:id` ändert nur `an`,
`ausgeliehenAm`, `rueckgabeGeplant` und `kommentar`.

## Oberfläche

Folgt.
