# Trichter

Wer trichtert, wird eingetragen. Aus den Einträgen entsteht eine Rangliste mit Trichterkönig:in für das laufende Jahr und
für alle Zeiten.

## Invarianten

- Volumen werden überall als ganze Milliliter gespeichert (`volumen_ml`); nur die Eingabe läuft in Litern (`literZuMl`).
- Ein Durchgang gilt geteilt: Jede teilnehmende Person bekommt `Volumen / Anzahl Teilnehmende` gutgeschrieben (bricht ggf. Nachkommastellen).
- Das Volumen eines Durchgangs darf das des Trichters nicht überschreiten, die Teilnehmenden nicht die Auslässe (400).
- Man trägt nie sich selbst ein (400); deaktivierte Mitglieder lassen sich nicht eintragen (400).
- Auf archivierte Trichter lassen sich keine neuen Durchgänge eintragen (400); ihre alten Durchgänge bleiben in jeder Wertung.
- Gewertet wird die Anzahl der Durchgänge, bei Gleichstand die Liter; Gleichauf-Liegende werden alle genannt.
- Löschen darf nur, wer den Durchgang eingetragen hat, oder die Verwaltung (403 sonst).

## Grenzen

Geprüft in `packages/shared/src/trichter.ts` (Schemas) und `POST /api/trichter/durchgaenge` in `routes/trichter.ts`; alle Verstöße geben 400:

- **Volumen** (Trichter und Durchgang): größer als 0 und höchstens **1000 l**, höchstens 2 Nachkommastellen.
- **Auslässe:** ganze Zahl von 1 bis `TRICHTER_AUSLAESSE_MAX` (20); **Teilnehmende** je Durchgang 1 bis 20, jede Person nur einmal.
- **Zeitpunkt:** nicht in der Zukunft (1 Minute Toleranz für eine vorgehende Handyuhr); ohne Angabe gilt jetzt.
- **Teilnehmende** müssen ein Profil haben oder ein aktiviertes Konto sein („Mitglied nicht gefunden.“) und dürfen **nicht deaktiviert**
  sein (`MITGLIED_DEAKTIVIERT`); die eintragende Person braucht ein eigenes Profil.
- **Abgeschlossene Jahre:** Ein Durchgang mit Zeitpunkt in einem Kalenderjahr (Berlin) vor dem aktuellen wird beim Anlegen mit 400 abgelehnt; ebenso das Löschen eines solchen Durchgangs (`TRICHTER_JAHR_ABGESCHLOSSEN`). Durchgänge lassen sich nicht ändern. Der Zeitpunkt-Picker beginnt am 1. Januar des laufenden Jahres.
- Der Trichter muss existieren und darf nicht archiviert sein.

## Dateien

| Bereich | Dateien                                                                                                                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API     | `packages/api/src/trichter.ts` (Store), `trichter.fake.ts`, Routen und Prüfungen in `routes/trichter.ts` (`/api/trichter…`)                                                                                                              |
| Shared  | `packages/shared/src/trichter.ts` (Schemas, Wertung, Könige)                                                                                                                                                                             |
| Web     | Seiten `pages/TrichterPage.tsx`, `TrichterDurchgangPage.tsx`, `TrichterVerwaltungPage.tsx`; `TrichterRangliste.tsx`, `TrichterDurchgangListe.tsx`, `TrichterKopf.tsx`, `TrichterFormular.tsx`, `trichterDaten.tsx`, `trichterAnzeige.ts` |
| Tests   | `packages/shared/src/trichter.test.ts`, `packages/web/src/trichterAnzeige.test.ts`                                                                                                                                                       |

## Trichter und Durchgänge

- Ein **Trichter** hat einen Namen, ein Volumen (ganze Milliliter, Eingabe in Litern mit höchstens 2 Nachkommastellen) und
  eine Anzahl **Auslässe** (1 bis `TRICHTER_AUSLAESSE_MAX` = 20). Die Verwaltung legt Trichter an, bearbeitet und
  archiviert sie. Archivierte Trichter lassen sich nicht mehr wählen; ihre Durchgänge bleiben in der Wertung.
- Ein **Durchgang** ist ein Eintrag: Trichter, Zeitpunkt (Standard: jetzt, einstellbar, nicht in der Zukunft), Volumen und
  Teilnehmende. Das Volumen darf höchstens das des Trichters sein, die Teilnehmenden höchstens so viele wie Auslässe.
- Das Volumen ist **geteilt**: Jede teilnehmende Person bekommt `Volumen / Anzahl Teilnehmende` gutgeschrieben (kann
  gebrochen sein, Anzeige in Litern mit Komma, höchstens 2 Nachkommastellen).
- **Selbsteintrag ist nicht möglich**: Man trägt andere ein, nicht sich selbst (das API antwortet mit 400).
- Löschen darf, wer den Durchgang eingetragen hat, und die Verwaltung.

## Königswertung

- Gewertet wird erst die **Anzahl** der Durchgänge, bei Gleichstand die **Liter**. Wer auch dann gleichauf liegt, wird
  jeweils genannt (eine Zeile je Person).
- **Laufendes Jahr**: Kalenderjahr in Berlin-Zeit (`jahrBerlin`). **Ewig**: alle Einträge.
- Die Seite zeigt oben immer beide Könige, unabhängig vom Filter der Rangliste. Die Zeilen sind nach `anrede` gegendert
  („Trichterkönig“ / „Trichterkönigin“ / „Trichterkönig:in“, ewig: „ewiger“ / „ewige“ / „ewige:r“).
- Die Rangliste filtert nach „Alle Einträge“ oder einem Jahr (Jahre mit Einträgen plus das laufende). Der Platz folgt der
  Standardreihenfolge (Anzahl, dann Liter), nicht der gewählten Sortierung.

## Rechte

- `trichter:lesen` (alle Status): Rangliste und Durchgänge ansehen, Durchgänge eintragen.
- `trichter:verwalten` (Gruppe `admin`, wählbar in `POSTEN_RECHTE`; die Vorstandsposten haben es nicht automatisch): Trichter anlegen,
  bearbeiten, archivieren/reaktivieren, fremde Durchgänge löschen.

## Datenmodell

Migrationen `0092`–`0096`, Code in `packages/api/src/trichter.ts`, Schemas und Wertung in `packages/shared/src/trichter.ts`.

| Tabelle                | Inhalt                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `trichter`             | `id`, `name`, `volumen_ml`, `auslaesse`, `archiviert`                                                      |
| `trichter_durchgaenge` | `trichter_id`, `volumen_ml` (gesamt), `zeitpunkt`, `eingetragen_von` (sub ohne FK), `eingetragen_am`       |
| `trichter_teilnahmen`  | `durchgang_id`, `mitglied_sub` (ohne Fremdschlüssel, auch Konten ohne Profil; zusammengesetzter Schlüssel) |

0095 und 0096 sind Indizes (`zeitpunkt, id` bzw. `mitglied_sub`); ihre Down-Dateien löschen sie wieder, die der Tabellen
löschen die Tabellen.

## Seiten und API

| Seite                  | Zweck                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/trichter`            | Könige oben, „Trichtern eintragen“, Rangliste (Handy: Karten mit „Sortieren nach“; ab `sm` Tabelle mit sortierbaren Spalten), „Letzte Durchgänge“ mit „Mehr laden“ |
| `/trichter/neu`        | Trichter, Teilnehmende (ohne einen selbst), Volumen, optional anderer Zeitpunkt                                                                                    |
| `/trichter/verwaltung` | Verwaltung: Trichter anlegen/bearbeiten/archivieren, Schalter „Archivierte anzeigen“                                                                               |

| Route                                  | Recht     | Hinweise                                                              |
| -------------------------------------- | --------- | --------------------------------------------------------------------- |
| `GET /api/trichter`                    | lesen     | `?archiviert=1` auch archivierte                                      |
| `POST /api/trichter`                   | verwalten | `{ name, volumenL, auslaesse }`                                       |
| `PUT /api/trichter/:id`                | verwalten | beliebige Felder, `archiviert` archiviert/reaktiviert                 |
| `GET /api/trichter/uebersicht`         | lesen     | `?jahr=2026` oder `alle`: Könige, Rangliste, Jahre                    |
| `GET /api/trichter/durchgaenge`        | lesen     | seitenweise, `?vor=<weiter>`                                          |
| `POST /api/trichter/durchgaenge`       | lesen     | `{ trichterId, volumenL, teilnehmende, zeitpunkt? }`; 400 bei Verstoß |
| `DELETE /api/trichter/durchgaenge/:id` | lesen     | nur eigene Einträge, mit verwalten alle                               |
