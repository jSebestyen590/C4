# Schlüssel

Der Club hat eine feste Anzahl Schlüssel, die von Person zu Person weitergereicht werden. Die App hält fest, wo jeder
Schlüssel gerade ist, und behält die letzten 10 Übergaben je Schlüssel.

## Halter

Ein Schlüssel ist immer bei genau einem von:

- einem **Mitglied** (mit Profilzeile),
- einer **Person ohne App** (Freitext-Name, z. B. ein EM, das die App nicht nutzt; bekommt keine Nachrichten),
- **niemandem** (neuer Schlüssel, hinterlegt, verloren). Nur die Verwaltung kann einen Schlüssel auf „niemand“ setzen.

## Übergaben

Eine Übergabe gilt **sofort**; die Gegenseite wird nur informiert. Ein Fehler wird durch eine weitere Übergabe korrigiert.
Alle Mitglieder können Übergaben eintragen:

- **Weitergeben**: der aktuelle Halter gibt den Schlüssel an ein Mitglied oder eine Person ohne App.
- **Habe ich bekommen**: ein Mitglied trägt ein, dass es den Schlüssel vom aktuellen Halter bekommen hat.
- **Übergabe eintragen**: jemand Drittes notiert, dass der Schlüssel vom aktuellen Halter zu jemand anderem gewandert ist.

„Von“ ist immer der aktuelle Halter. Der Client schickt den Halter mit, den er gesehen hat; hat sich der Schlüssel
inzwischen bewegt (oder ist archiviert), antwortet das API mit 409 und die Seite lädt neu. Nach jeder Übergabe löscht das
API alle Übergaben des Schlüssels außer den neuesten 10 (`SCHLUESSEL_VERLAUF_MAX`).

## Benachrichtigungen

Art `schluessel.uebergabe`, **nicht abschaltbar** (`abschaltbar: false`, siehe
[benachrichtigungen.md](./benachrichtigungen.md)). Benachrichtigt werden die Mitglieder unter „von“ und „an“ außer der
Person, die eingetragen hat:

| Wer trägt ein       | Nachricht an „an“                                     | Nachricht an „von“                                        |
| ------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| „von“ (weitergeben) | „X hat dir den Schlüssel übergeben.“                  | –                                                         |
| „an“ (bekommen)     | –                                                     | „X hat den Schlüssel von dir bekommen.“                   |
| Dritte / Verwaltung | „X hat eingetragen, dass du ihn von Y bekommen hast.“ | „X hat eingetragen, dass du ihn an Z weitergegeben hast.“ |

Ohne vorherigen Halter heißt es „X hat dir den Schlüssel zugewiesen.“, bei „an niemand“ „… dass du den Schlüssel
abgegeben hast.“ Code: `packages/api/src/schluesselBenachrichtigungen.ts`. Push muss auf dem Gerät aktiviert sein.

## Rechte

- `schluessel:lesen` (alle Status): Liste und Verlauf ansehen, Übergaben eintragen.
- `schluessel:verwalten` (Gruppe `admin`, Vorstandsposten per Migration `0076`, wählbar in `POSTEN_RECHTE`): Schlüssel
  anlegen, bearbeiten, archivieren/reaktivieren, Archiv ansehen, Halter „niemand“ setzen.

## Datenmodell

Migrationen `0073`–`0076`, Code in `packages/api/src/schluessel.ts`, Schemas in `packages/shared/src/schluessel.ts`.

| Tabelle                 | Inhalt                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `schluessel`            | `id`, `name`, `beschreibung`, `halter_sub` → `mitglieder` oder `halter_name` (höchstens eins), `halter_seit`, `archiviert` |
| `schluessel_uebergaben` | `schluessel_id`, `von_sub`/`von_name`, `an_sub`/`an_name`, `eingetragen_von` (sub ohne FK), `zeitpunkt`                    |

## Seiten und API

| Seite             | Zweck                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `/schluessel`     | Karten: „Deine Schlüssel“ oben, dann alle anderen mit Halter und Aktionen; Verwaltung: Anlegen, Archiv |
| `/schluessel/:id` | Halter, Aktionen, Verlauf der letzten 10 Übergaben; Verwaltung: Bearbeiten, Archivieren                |

Ein neuer Schlüssel ist zuerst bei niemandem; den ersten Halter trägt die Verwaltung über „Übergabe eintragen“ ein.

| Route                                 | Recht     | Hinweise                                                                      |
| ------------------------------------- | --------- | ----------------------------------------------------------------------------- |
| `GET /api/schluessel`                 | lesen     | `?archiv=1` nur mit verwalten                                                 |
| `GET /api/schluessel/:id`             | lesen     | mit Verlauf; archivierte nur mit verwalten                                    |
| `POST /api/schluessel/:id/uebergaben` | lesen     | `{ von, an }`; `an: null` nur mit verwalten; 409 wenn `von` nicht mehr stimmt |
| `POST /api/schluessel`                | verwalten | `{ name, beschreibung?, halter? }`                                            |
| `PUT /api/schluessel/:id`             | verwalten | `{ name, beschreibung? }`                                                     |
| `PUT /api/schluessel/:id/archiv`      | verwalten | `{ archiviert }`                                                              |
