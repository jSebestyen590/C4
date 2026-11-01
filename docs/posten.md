# Posten

Ein Posten ist eine Verantwortlichkeit im Verein (z. B. Kassenwart). Er hat einen Namen, eine
Beschreibung und beliebig viele **Besetzungen**: ein Mitglied mit Startdatum und optionalem Enddatum.

## Datenmodell

Migrationen `0006`–`0008` (Tabellen) und `0009` (Vorstandsposten), Code in `packages/api/src/posten.ts`.

| Tabelle              | Inhalt                                                                               |
| -------------------- | ------------------------------------------------------------------------------------ |
| `posten`             | `id`, `name`, `beschreibung`, `bezeichnung_maennlich/weiblich/neutral`, `archiviert` |
| `posten_rechte`      | Rechte, die der Posten gewährt (`posten_id` → `posten`, `recht`)                     |
| `posten_besetzungen` | `posten_id` → `posten`, `mitglied_sub` → `mitglieder`, `start_datum`, `end_datum`    |

Weil `mitglied_sub` ein Fremdschlüssel ist, kann nur zugewiesen werden, wer schon eine Profilzeile
hat (sonst antwortet das API mit 400). Eingeladene Mitglieder bekommen ihre Zeile sofort.

**Bezeichnung:** Optional trägt ein Posten die Bezeichnung der Person, die ihn innehat, in drei Formen
(z. B. Chef / Chefin / Chef:in), nur alle drei oder keine. Mitgliederliste, Mitgliederseiten und
Profil zeigen statt des Postennamens die Form passend zur `anrede` des Mitglieds
(`bezeichnungFuer` in `packages/shared/src/posten.ts`); ohne Bezeichnung gilt der Name.

**Übergangszeit:** Die Rechte eines Postens gelten für jede Besetzung immer einen Monat vor dem Start bis einen Monat
nach dem Ende (`rechteZeitraum` in `packages/shared/src/datum.ts`, `rechteAktiv` in `posten.ts`), bei offenem Ende
unbefristet. Beispiel: Besetzung 01.01.–31.12.2026, Rechte 01.12.2025–31.01.2027. Ist der Zieltag im Zielmonat nicht
vorhanden, gilt der letzte Tag des Monats. Die Anzeige („aktuell besetzt“) und die Überschneidungsprüfung richten
sich allein nach Start und Ende; die Detailseite nennt den Rechtezeitraum je Besetzung.

**Aktuell besetzt** heißt: Posten nicht archiviert, `start_datum` ≤ heute und `end_datum` leer oder
≥ heute. „Heute“ ist der Kalendertag in Europe/Berlin (`heuteBerlin`).

## Rechte

- `posten:lesen` haben alle Status (`STATUS_PERMISSIONS`).
- `posten:bearbeiten` gewährt ein Posten über `posten_rechte`. Wer den Posten innerhalb der Übergangszeit seiner Besetzung innehat, erhält
  das Recht (`rechteVon` in `auth.ts`, bei jedem Request). Archivieren oder eine abgelaufene Übergangszeit entziehen es.
- Admins (Cognito-Gruppe `admin`) haben `posten:bearbeiten` immer und können so Posten anlegen, bearbeiten,
  archivieren und besetzen, auch ohne selbst einen Posten zu halten.
- Welche Rechte ein Posten gewährt, ändern nur Admins (`users:manage`) auf der Detailseite. Zur Wahl
  stehen die Rechte aus `POSTEN_RECHTE` (`packages/shared/src/roles.ts`: `users:manage`, `posten:bearbeiten`,
  `waren:verwalten`, `inventar:verwalten`, `events:verwalten`, `kalender:einrichten`, `schluessel:verwalten`, `umfragen:verwalten`); weitere Rechte
  trägt man dort ein.
- Es gibt keine eigene Vorstandsrolle: Archivierte Posten sehen und reaktivieren alle mit `posten:bearbeiten`.

## Seiten und API

| Seite          | Wer            | Zweck                                                                                                                  |
| -------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `/posten`      | `posten:lesen` | Kacheln (Handy) bzw. Tabelle (ab `sm`) mit Name und aktuellen Besetzern (Username); Editoren: Anlegen, Archiv-Schalter |
| `/posten/<id>` | `posten:lesen` | Detail; Editoren bearbeiten, archivieren, besetzen; Admins setzen die Rechte                                           |

| Route                                                | Wer                 | Hinweise                                              |
| ---------------------------------------------------- | ------------------- | ----------------------------------------------------- |
| `GET /api/posten`, `GET /api/posten/:id`             | `posten:lesen`      | Archivierte nur mit `posten:bearbeiten` (`?archiv=1`) |
| `POST /api/posten`, `PUT /api/posten/:id`            | `posten:bearbeiten` |                                                       |
| `PUT /api/posten/:id/archiv`                         | `posten:bearbeiten` | `{ archiviert }`                                      |
| `POST/PUT/DELETE /api/posten/:id/besetzungen[/:bid]` | `posten:bearbeiten` | Ende darf nicht vor dem Start liegen                  |
| `PUT /api/admin/posten/:id/rechte`                   | Admin               | `{ rechte }`                                          |

Mitgliederliste und -detail führen die aktuellen Posten eines Mitglieds als Links auf (Feld `posten`
in `GET /api/mitglieder`).

Datumswerte erscheinen überall als `dd.MM.yyyy` (`datumAnzeigen` in `packages/shared/src/datum.ts`).

Mitglieder werden überall mit ihrem Username (ohne Username „Vorname Nachname“), fett und in der Farbe ihres Status genannt (`StatusName` in `packages/web/src/StatusAnzeige.tsx`). Auf der Postenübersicht und im Übernahme-Dialog sind die Namen nicht verlinkt (dort ist die Zeile bzw. das Feld selbst bedienbar); auf der Detailseite führen die Besetzungen zum Mitglied. Im Auswahlfeld „Mitglied“ steht „username (Vorname Nachname)“.

Die Besetzung in Kacheln und Tabelle lautet „<Name> ist seit <dd.MM.yyyy> <Bezeichnung>“ (Bezeichnung nach der `anrede` des Mitglieds, Datum = Start der Besetzung), eine Zeile pro aktueller Besetzung. In der Tabelle ist die ganze Zeile klickbar.

## Vorstandsposten

Migration `0009_vorstandsposten.sql` legt Vorstandsvorsitz (Chef / Chefin / Chef:in), Stellvertretender
Vorstandsvorsitz (Vize / Vize / Vize) und Buchhaltung (Finanzer / Finanzerin / Finanzer:in) an. Sie haben
dieselben Rechte wie die Gruppe `admin` (`users:manage`, `posten:bearbeiten`, dazu `waren:verwalten` und
`inventar:verwalten` per Migration `0024`, `events:verwalten` und `kalender:einrichten` per Migration `0065`,
`schluessel:verwalten` per Migration `0076`, `umfragen:verwalten` per Migration `0086`); wer sie besetzt, kann
also auch Mitglieder einladen sowie Status und Rollen ändern. Die Ids sind fest
(`vorstandsvorsitz`, `stellvertretender-vorstandsvorsitz`, `buchhaltung`), die Migration ist idempotent.

Beim Setzen des Startdatums einer Besetzung wird das Ende automatisch auf den 31.12. desselben Jahres gesetzt; es lässt sich danach ändern oder leeren.

Beim Zuweisen erscheint eine Auswahl „Übernimmt die Person den Posten?“, sobald der Posten aktuelle Besetzungen
ohne Ende hat (bei mehreren sind alle wählbar). Gewählte Besetzungen enden am Tag vor dem Start der neuen
(`ablosung` in `POST /api/posten/:id/besetzungen`, in einer Transaktion). Der Start der neuen muss nach dem
Start der abgelösten liegen.

Dieselbe Person darf einen Posten nie zweimal zugleich innehaben: Zeiträume derselben Person auf demselben
Posten dürfen sich nicht überschneiden (beide Enden inklusive, kein Ende = offen). Aufeinanderfolgende,
getrennte Zeiträume (z. B. 01.01.2020–31.12.2020 und 01.01.2024–31.12.2025) sind erlaubt. Das API prüft das beim
Anlegen und Ändern in der Transaktion (`ueberschneiden` in `posten.ts`) und antwortet sonst mit 409.
