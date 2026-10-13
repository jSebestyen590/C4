# Posten

Ein Posten ist eine Verantwortlichkeit im Verein (z. B. Kassenwart). Er hat einen Namen, eine
Beschreibung und beliebig viele **Besetzungen**: ein Mitglied mit Startdatum und optionalem Enddatum.

## Datenmodell

Migrationen `0006`–`0008`, Code in `packages/api/src/posten.ts`.

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

**Aktuell besetzt** heißt: Posten nicht archiviert, `start_datum` ≤ heute und `end_datum` leer oder
≥ heute. „Heute“ ist der Kalendertag in Europe/Berlin (`heuteBerlin`).

## Rechte

- `posten:lesen` haben alle Status (`STATUS_PERMISSIONS`).
- `posten:bearbeiten` gewährt ein Posten über `posten_rechte`. Wer den Posten aktuell innehat, erhält
  das Recht (`rechteVon` in `auth.ts`, bei jedem Request). Archivieren, Enddatum in der Vergangenheit
  oder ein Startdatum in der Zukunft entziehen es.
- Admins (Cognito-Gruppe `admin`) haben `posten:bearbeiten` immer und können so Posten anlegen, bearbeiten,
  archivieren und besetzen, auch ohne selbst einen Posten zu halten.
- Welche Rechte ein Posten gewährt, ändern nur Admins (`users:manage`) auf der Detailseite. Zur Wahl
  stehen die Rechte aus `POSTEN_RECHTE` (`packages/shared/src/roles.ts`); weitere Rechte trägt man dort ein.
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

Mitglieder werden überall fett und in der Farbe ihres Status genannt (`StatusName` in `packages/web/src/StatusAnzeige.tsx`).

Die Besetzung in Kacheln und Tabelle lautet „<Name> ist seit <dd.MM.yyyy> <Bezeichnung>“ (Bezeichnung nach der `anrede` des Mitglieds, Datum = Start der Besetzung, hält die Person den Posten mehrfach zugleich, zählt die zuletzt begonnene Besetzung). In der Tabelle ist die ganze Zeile klickbar.
