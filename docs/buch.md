# Buch

Das Buch ist die digitale Strichliste des Vereins (Scheibe 2 der [Finanzen](./finanzen.md), Plan in
[plans/finanzen.md](./plans/finanzen.md)). Es ist ein **Nebenbuch**: keine Journalbuchungen, keine Konten in
`fin_konten`, kein Teil des Bargeldbestands. Das Geld der Abzahlungen liegt in einer Barkasse und wird mit deren
Abrechnung (spätere Scheibe) als Bareinnahme gebucht.

## Konzept

- Eine **Seite** (`buch_seiten`) gehört einem Mitglied oder einem externen Namen (genau eins von beiden), hat eine
  **Nummer** und kann archiviert werden. Die Nummer ist unter aktiven Seiten eindeutig und wird beim Archivieren frei;
  ein Mitglied hat höchstens eine aktive Seite. Beides prüft die API in der Transaktion mit `sperreBeruehren`
  (Schlüssel `buchseite:nummer:<n>` und `buchseite:mitglied:<sub>`), Verstöße antworten mit 409.
- **Nummern-Verlauf** (`buch_seiten_verlauf`, nur INSERT): Anlegen, Umnummerieren, Archivieren und Reaktivieren schreiben in
  derselben Transaktion eine Zeile (`angelegt`, `nummer`, `archiviert`, `reaktiviert`; Nummer außer bei `archiviert`, dazu
  Person und Zeit). `buch_seiten.nummer` bleibt die aktuelle Nummer. **Umnummerieren** (aktive Seite) und **Reaktivieren**
  (archivierte Seite, Nummer wird neu gewählt) prüfen wie das Anlegen: Nummer unter aktiven Seiten frei (409), beim
  Reaktivieren hat das Mitglied keine andere aktive Seite (409); dieselbe Nummer beim Umnummerieren ist 400, falscher
  Zustand (Umnummerieren einer archivierten, Reaktivieren einer aktiven Seite) 409.
- Ein **Eintrag** (`buch_eintraege`) hat Striche, Strichwert, Bar und Abzahlung. Wirkung auf den Saldo:
  `Abzahlung − Striche × Strichwert − Bar` (`betrag_cent`). Ein negativer Saldo sind Schulden. **Bar** ist ein Euro-Betrag,
  der aufs Buch geschrieben wird (angeschrieben), keine Zahlung.
- Der **Strichwert** kommt aus dem **Tarif** (`buch_tarife`): je Mitglieds-Status Strichwert und maximaler Überzug, mit
  „gültig ab“. Es gilt der Tarif mit dem spätesten `gueltig_ab` bis zum Tag des Eintragens (Gleichstand: der später
  angelegte). Maßgeblich ist der Zeitpunkt des Eintragens in der App (`erstellt_am`, Berlin). Seiten mit externem Namen
  nutzen den Tarif des Status `extern`, Mitglieder-Seiten den **aktuellen** Status des Mitglieds. Der Strichwert wird im
  Eintrag gespeichert und ändert sich später nicht. Ohne Tarif sind Striche nicht möglich (400 mit Hinweis), Bar und
  Abzahlung schon.
- Alles ist **nur INSERT** (`buch_tarife`, `buch_abrechnungen`, `buch_eintraege`; Guard: `finanzenNurInsert.test.ts`).
  Einzig `buch_seiten.archiviert_am` wird gesetzt. Korrektur = **Storno**: ein neuer Eintrag mit umgekehrten Werten
  (gleicher Strichwert), `storno_von`, Pflicht-Begründung. Ein Eintrag lässt sich nur einmal stornieren (409), ein Storno
  nicht.
- Eine **Abrechnung** (`buch_abrechnungen`; die Oberfläche sendet eine je Seite) erzeugt in einer Transaktion je Zeile mit Werten einen Eintrag. Leere Zeilen
  (alles 0) werden ignoriert, eine ganz leere Abrechnung ist 400. Idempotenz über `idempotenzSchluessel` (UUID je
  Erfassung): derselbe Schlüssel liefert die vorhandene Abrechnung mit 200 statt 201. Stornos haben ihren eigenen
  Schlüssel.
- **Saldo-Farben und Überzug**: Das Buch hält nur fest, was im Papierbuch steht; es gibt kein Richtig oder Falsch und
  keine Warnung, die bestätigt werden müsste. Jeder Saldo wird nach `buchSaldoStufe(saldo, max_ueberzug)` eingefärbt:
  grün ab 0 €, gelb im Minus innerhalb des Überzugs, rot darunter (ohne Tarif gilt der Überzug 0). Nach dem Speichern
  einer Abrechnung bekommt jedes Mitglied mit rotem Saldo einen Push `buch.ueberzug` („Du bist mit 30,50 € in der
  Barzahlung“, siehe [benachrichtigungen.md](./benachrichtigungen.md)); bei einer wiederholten Abrechnung (gleicher
  Schlüssel) nicht erneut. Externe Seiten bekommen keinen Push.
- **Rangliste** (gesamt oder je Kalenderjahr, Berlin): sortiert nach Umsatz in Euro = Σ (Striche × Strichwert + Bar),
  Abzahlungen zählen nicht, Stornos ziehen ab. Zusätzlich die Striche. Sie zeigt nie einen Saldo.

## Rechte

| Recht                | Wofür                                                          |
| -------------------- | -------------------------------------------------------------- |
| `buch:lesen`         | eigene Seite (`/buch`) und Rangliste; alle Status              |
| `finanzen:lesen`     | alle Seiten, Verläufe und Tarife lesen                         |
| `finanzen:buchen`    | Seiten anlegen und archivieren, abrechnen, Einträge stornieren |
| `finanzen:verwalten` | Tarife anlegen                                                 |

## Routen (`routes/buch.ts`)

| Route                                    | Recht                                   | Zweck                                                      |
| ---------------------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| `GET /api/buch/meine`                    | `buch:lesen`                            | eigene aktive Seite(n) mit Saldo, Tarif, Überzug, Verlauf  |
| `GET /api/buch/rangliste?jahr=`          | `buch:lesen`                            | Rangliste (`alle` oder Jahr)                               |
| `GET /api/buch/seiten?archiviert=true`   | `finanzen:lesen`                        | aktive bzw. archivierte Seiten mit Saldo                   |
| `GET /api/buch/seiten/:id`               | `finanzen:lesen`                        | Seite mit Verlauf                                          |
| `POST /api/buch/seiten`                  | `finanzen:buchen`                       | Seite anlegen (`nummer`, `mitgliedSub` oder `externName`)  |
| `POST /api/buch/seiten/:id/archivieren`  | `finanzen:buchen`                       | archivieren (der Saldo bleibt offen)                       |
| `POST /api/buch/seiten/:id/nummer`       | `finanzen:buchen`                       | Nummer ändern (`nummer`)                                   |
| `POST /api/buch/seiten/:id/reaktivieren` | `finanzen:buchen`                       | archivierte Seite mit neuer Nummer reaktivieren (`nummer`) |
| `GET/POST /api/buch/tarife`              | `finanzen:lesen` / `finanzen:verwalten` | Tarife lesen / anlegen                                     |
| `POST /api/buch/abrechnungen`            | `finanzen:buchen`                       | Abrechnung (`idempotenzSchluessel`, `zeilen`)              |
| `POST /api/buch/eintraege/:id/storno`    | `finanzen:buchen`                       | Storno (`text`, `idempotenzSchluessel`)                    |

Es gibt bewusst keine Update- oder Delete-Routen. Die Deaktivieren-Vorschau der Mitglieder listet offene Buch-Salden.

## Oberfläche

- `/buch` (mobile first, Menüpunkt „Buch“): eigener Saldo groß (nach Stufe grün/gelb/rot), Überzugs-Hinweis, Tarif, Verlauf als Karten,
  darunter die Rangliste mit Jahresauswahl.
- `/finanzen/buch` (desktop first): Seitenliste (Nummer, Mitglied/Extern, Saldo), „Seite anlegen“, „Abrechnen“,
  „Tarife“, Umschalter Aktiv/Archiviert.
- `/finanzen/buch/abrechnen`: Abrechnung **seitenweise**, wie das Papierbuch (Striche zählen und durchstreichen, Bar,
  Abzahlung, Seite abschließen, neuen Saldo ins Buch schreiben). Tabelle aller aktiven Seiten nach Nummer mit Striche, Bar,
  Abzahlung; Enter springt zeilenweise zum nächsten Feld, Enter in „Abzahlung“ (oder „Seite abschließen“) öffnet die
  Bestätigung nur dieser Seite (Striche × Strichwert, Bar, Abzahlung, Saldo vorher → danach; der Bestätigen-Knopf ist immer aktiv und hat den Fokus).
  Das Speichern sendet eine Abrechnung mit einer Zeile (`POST /api/buch/abrechnungen`, eigener Idempotenz-Schlüssel je Seite
  und Inhalt, Push je Seite wie sonst). Danach ist die Zeile gesperrt („Abgeschlossen“, groß: „Ins Buch eintragen: −8,50 €“)
  und der Fokus springt ins Striche-Feld der nächsten offenen Zeile. Leere Zeilen werden übersprungen. Oben steht „x von y
  Seiten abgeschlossen“ mit den Summen des Durchlaufs; ein Fehler beim Speichern erscheint in der Zeile, die Werte bleiben.
  Nur nicht abgeschlossene Zeilen mit Werten lösen die Warnung beim Verlassen aus. Auf dem Handy Karten mit denselben Feldern
  und „Seite abschließen“. Storno gibt es hier nicht (Seitenansicht). Die API nimmt weiterhin mehrere Zeilen je Abrechnung an.
- `/finanzen/buch/seiten/:id`: Seite, Verlauf mit Storno (Begründung) und Archivieren (mit Bestätigung, bei Saldo ≠ 0 eigene
  Bestätigung). „Nummer ändern“ (aktive Seite) und „Reaktivieren“ (archivierte Seite, die letzte Nummer ist vorbelegt) öffnen
  einen Dialog mit Nummernfeld, Inline-Fehler bei vergebener Nummer und Bestätigungsschritt; darunter der „Nummern-Verlauf“.
- `/finanzen/buch/tarife`: aktueller Tarif je Status, Verlauf, Formular für neue Tarife.
- Hilfetexte stehen in `finanzenHilfe.ts` (`HILFE.buch`).

## Tabellen

`buch_seiten`, `buch_seiten_verlauf`, `buch_tarife`, `buch_abrechnungen`, `buch_eintraege` (Migrationen `0169`–`0179`, siehe
[datenbank.md](./datenbank.md)). Die Schicht liegt in `packages/api/src/buch.ts` (+ `buch.fake.ts`), die reine Logik
(Tarifwahl, Wirkung, Rangliste, Schemas, DTOs) in `packages/shared/src/buch.ts`.
