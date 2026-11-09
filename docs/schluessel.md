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

## Anfragen: Bedarf und Abgabe

Statt im Chat auszumachen, wer einen Schlüssel bekommt, gibt es zwei Arten von Anfragen (Seite `/schluessel`, Abschnitt
„Anfragen“; alle mit `schluessel:lesen`):

- **Bedarf** („Brauche einen Schlüssel“): ein bestimmter Schlüssel oder „irgendeiner“, dazu ein Zeitfenster. Gefragt werden
  der Halter und die vorgesehenen Halter (siehe Planung) des Schlüssels, bei „irgendeiner“ von allen Schlüsseln.
- **Abgabe** („Schlüssel abgeben“): nur für einen Schlüssel, den man hat oder bekommen soll (sonst 409). Gefragt werden alle
  Mitglieder mit dem Profilfeld **Wohnheim**.

Der Ersteller wird nie selbst gefragt. **Zeitfenster**: Tag (heute, morgen oder anderer Tag; nicht in der Vergangenheit),
optional `ab`/`bis` (`HH:MM`, beide leer = ganzer Tag) und eine Notiz; Anzeige mit `zeitfensterAnzeigen` („heute ab 18:00“,
„morgen im Laufe des Tages“, „Fr, 13.11. 16:00–18:00“). Eine Anfrage ist `offen`, `vergeben` oder `zurueckgezogen`; „abgelaufen“
wird beim Lesen berechnet (Tag vorbei). Die Liste zeigt alle offenen, aktuellen Anfragen plus die eigenen der letzten 3 Tage.

Jeder Gefragte hat **eine** Antwort, die er ändern kann: **Zusagen**, **Anderer Zeitpunkt** (Gegenvorschlag mit eigenem
Zeitfenster) oder **Ablehnen**. Die **erste Zusage gewinnt**: sie legt eine geplante Übergabe an (Bedarf: an den Ersteller, mit
dem Schlüssel des Antwortenden, bei „irgendeiner“ muss er ihn nennen; Abgabe: an den Antwortenden) und setzt die Anfrage auf
`vergeben`; spätere Antworten bekommen 409. Der Ersteller kann einen **Gegenvorschlag annehmen** (legt die Planung zum
vorgeschlagenen Zeitpunkt an) oder die Anfrage **zurückziehen**. Die Seite `/schluessel/anfragen/:id` zeigt Details und alle
Antworten.

## Geplante Übergaben

Pro Schlüssel eine Kette von Planungen, nach Zeit sortiert: „Jetzt: A → B (heute ab 18:00) → C (morgen)“. „Von“ ist implizit
der Vorgänger in der Kette bzw. der aktuelle Halter. Die **vorgesehenen Halter** eines Schlüssels sind die Empfänger seiner
Planungen; sie werden bei einem Bedarf mitgefragt und dürfen den Schlüssel abgeben. Jeder mit `schluessel:lesen` darf auf der
Detailseite („Geplante Übergaben“) Planungen anlegen, ändern und löschen. Eine Planung ändert den Halter **nicht**; das
passiert weiter über die echte Übergabe. Wird der Schlüssel an ein Mitglied übergeben, löscht das API in derselben
Transaktion dessen früheste Planung für diesen Schlüssel. Auf der Liste steht unter dem Halter „Danach: …“.

## Benachrichtigungen

Art `schluessel.uebergabe`, **nicht abschaltbar** (`abschaltbar: false`, siehe
[benachrichtigungen.md](./benachrichtigungen.md)). Benachrichtigt werden die Mitglieder unter „von“ und „an“ außer der
Person, die eingetragen hat:

| Wer trägt ein       | Nachricht an „an“                                     | Nachricht an „von“                                        |
| ------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| „von“ (weitergeben) | „X hat dir den Schlüssel übergeben.“                  | –                                                         |
| „an“ (bekommen)     | –                                                     | „X hat den Schlüssel von dir bekommen.“                   |
| Dritte / Verwaltung | „X hat eingetragen, dass du ihn von Y bekommen hast.“ | „X hat eingetragen, dass du ihn an Z weitergegeben hast.“ |

Weitere Arten (alle **nicht abschaltbar**, Push-URL `/app/schluessel/anfragen/:id` bzw. `/app/schluessel/:id`):

| Art                  | An                                                                 | Wann                                                                                      |
| -------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `schluessel.bedarf`  | Halter und vorgesehene Halter (Schlüssel bzw. alle Schlüssel)      | neuer Bedarf; stündlich wiederholt an alle, die noch nicht geantwortet haben              |
| `schluessel.abgabe`  | Mitglieder mit Wohnheim (ohne Ersteller)                           | neue Abgabe; stündlich wiederholt an alle, die noch nicht geantwortet haben               |
| `schluessel.antwort` | Ersteller; bei Zusage zusätzlich alle, die schon geantwortet haben | Zusage, Gegenvorschlag, Ablehnung; „hat sich erledigt“; „hat deinen Vorschlag angenommen“ |
| `schluessel.planung` | aktueller Halter, Vorgänger in der Kette, Empfänger (ohne Akteur)  | Planung manuell angelegt, geändert, gelöscht (Planungen aus Anfragen melden `antwort`)    |

Die Wiederholung (nicht zwischen 22 und 8 Uhr, nicht wenn alle abgelehnt haben oder der Tag vorbei ist) steht in
[benachrichtigungen.md](./benachrichtigungen.md).

Ohne vorherigen Halter heißt es „X hat dir den Schlüssel zugewiesen.“, bei „an niemand“ „… dass du den Schlüssel
abgegeben hast.“ Code: `packages/api/src/schluesselBenachrichtigungen.ts`. Push muss auf dem Gerät aktiviert sein.

## Rechte

- `schluessel:lesen` (alle Status): Liste und Verlauf ansehen, Übergaben eintragen.
- `schluessel:verwalten` (Gruppe `admin`, Vorstandsposten per Migration `0076`, wählbar in `POSTEN_RECHTE`): Schlüssel
  anlegen, bearbeiten, archivieren/reaktivieren, Archiv ansehen, Halter „niemand“ setzen.

## Datenmodell

Migrationen `0073`–`0076` (Schlüssel) und `0130`–`0136` (Anfragen), Code in `packages/api/src/schluessel.ts` und
`schluesselAnfragen.ts`, Schemas in `packages/shared/src/schluessel.ts`.

| Tabelle                 | Inhalt                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schluessel`            | `id`, `name`, `beschreibung`, `halter_sub` → `mitglieder` oder `halter_name` (höchstens eins), `halter_seit`, `archiviert`                                                      |
| `schluessel_anfragen`   | `art` (`bedarf`/`abgabe`), `ersteller_sub`, `schluessel_id` (bei Bedarf optional), `datum`, `ab`/`bis` (`HH:MM`), `notiz`, `status`, `erstellt`, `erinnert`                     |
| `schluessel_antworten`  | `anfrage_id`, `sub`, `art` (`zusage`/`ablehnung`/`gegenvorschlag`), Zeitfenster des Gegenvorschlags, `schluessel_id` (angebotener Schlüssel); eindeutig je `anfrage_id` + `sub` |
| `schluessel_planungen`  | `schluessel_id`, `an_sub`, `datum`/`ab`/`bis`/`notiz`, `anfrage_id` (Herkunft), `erstellt_von` (sub ohne FK)                                                                    |
| `schluessel_uebergaben` | `schluessel_id`, `von_sub`/`von_name`, `an_sub`/`an_name`, `eingetragen_von` (sub ohne FK), `zeitpunkt`                                                                         |

## Seiten und API

| Seite                      | Zweck                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/schluessel`              | Handy: Karten; ab `sm` Tabelle (Name, bei, seit, Beschreibung, Aktionen; ganze Zeile klickbar). „Deine Schlüssel“ oben, dann alle anderen; Verwaltung: Anlegen, Archiv |
| `/schluessel/anfragen/:id` | Anfrage mit allen Antworten; Ersteller: Vorschlag annehmen, zurückziehen                                                                                               |
| `/schluessel/:id`          | „Zurück zur Liste“, Halter, Aktionen, Verlauf der letzten 10 Übergaben; Verwaltung: Bearbeiten, Archivieren                                                            |

Ein neuer Schlüssel ist zuerst bei niemandem; den ersten Halter trägt die Verwaltung über „Übergabe eintragen“ ein.

| Route                                                             | Recht     | Hinweise                                                                                                           |
| ----------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /api/schluessel`                                             | lesen     | `?archiv=1` nur mit verwalten                                                                                      |
| `GET /api/schluessel/:id`                                         | lesen     | mit Verlauf und Planungen; archivierte nur mit verwalten                                                                         |
| `POST /api/schluessel/:id/uebergaben`                             | lesen     | `{ von, an }`; `an: null` nur mit verwalten; 409 wenn `von` nicht mehr stimmt                                      |
| `POST /api/schluessel`                                            | verwalten | `{ name, beschreibung?, halter? }`                                                                                 |
| `GET /api/schluessel/anfragen`                                    | lesen     | offene, aktuelle Anfragen + eigene der letzten 3 Tage; `darfAntworten` je Anfrage                                  |
| `GET /api/schluessel/anfragen/:id`                                | lesen     | mit allen Antworten                                                                                                |
| `POST /api/schluessel/anfragen`                                   | lesen     | `{ art, schluesselId?, datum, ab?, bis?, notiz? }`; Abgabe nur mit eigenem/vorgesehenem Schlüssel (409)            |
| `PUT /api/schluessel/anfragen/:id/antwort`                        | lesen     | `{ art, schluesselId?, datum?, ab?, bis?, notiz? }`; 403 für Ersteller und nicht Gefragte, 409 wenn schon vergeben |
| `PUT /api/schluessel/anfragen/:id/rueckzug`                       | lesen     | nur Ersteller                                                                                                      |
| `POST /api/schluessel/anfragen/:id/antworten/:antwortId/annehmen` | lesen     | nur Ersteller, nur Gegenvorschläge                                                                                 |
| `POST /api/schluessel/:id/planungen`                              | lesen     | `{ anSub, datum, ab?, bis?, notiz? }`                                                                              |
| `PUT /api/schluessel/planungen/:id`                               | lesen     | wie oben                                                                                                           |
| `DELETE /api/schluessel/planungen/:id`                            | lesen     |                                                                                                                    |
| `PUT /api/schluessel/:id`                                         | verwalten | `{ name, beschreibung? }`                                                                                          |
| `PUT /api/schluessel/:id/archiv`                                  | verwalten | `{ archiviert }`                                                                                                   |
