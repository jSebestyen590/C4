# Umfragen

Jedes Mitglied kann Umfragen erstellen. Eine Umfrage hat eine oder mehrere Fragen, je Frage feste Antworten und/oder eine
eigene Antwort (Freitext), ein Ablaufdatum und zwei Personenkreise: wer abstimmen **muss** und wer abstimmen **darf**.
Seiten: `/umfragen` (Liste), `/umfragen/neu`, `/umfragen/:id`, `/umfragen/:id/bearbeiten`.

## Regeln

- **Laufzeit**: bis zum Ende von `endet_am` (Europe/Berlin, `umfrageLaeuft`). Das Datum darf nicht in der Vergangenheit
  liegen. Die Person, die die Umfrage erstellt hat, kann sie **vorzeitig beenden** (`beendet_am`). Beendete Umfragen lassen
  sich nicht mehr bearbeiten und nicht wieder öffnen.
- **Titel und Frage**: Hat eine Umfrage genau eine Frage, reicht Titel oder Frage; das Leere wird aus dem anderen übernommen
  (Titel höchstens 200 Zeichen, eine längere Frage wird als Titel mit „…“ gekürzt). Die Seite zeigt eine Frage, die dem Titel
  gleicht, nicht noch einmal. Bei mehreren Fragen sind Titel und alle Fragen Pflicht.
- **Fragen**: höchstens 20, je Frage höchstens 30 Antworten. `freitext` erlaubt eine eigene Antwort, sie zählt als eine
  Antwort. `maxAntworten` (1 bis Anzahl Antworten, `null` = beliebig viele) begrenzt die Auswahl je Person.
- **Kreise** (`UmfrageKreis`): Status, Posten (wer ihn gerade innehat) und einzelne Personen, je für „Pflicht“ und
  „Optional“. Derselbe Status, Posten oder dieselbe Person darf nicht in beiden Kreisen stehen (400, im Formular nicht
  wählbar). Ausgewertet wird **dynamisch** gegen die aktuellen Mitglieder und Besetzungen (`kreisVon`); wer in beiden
  Kreisen landet (z. B. über einen Posten und den Status), gilt als Pflicht.
- **Sehen** darf eine Umfrage, wer in einem Kreis ist, schon abgestimmt hat, sie erstellt hat oder `umfragen:verwalten` hat.
  Allen anderen antwortet das API mit 404. **Abstimmen** darf nur, wer in einem Kreis ist.
- **Stimme**: ein Stimmzettel für alle Fragen (`PUT /api/umfragen/:id/stimme`), jede Frage muss beantwortet sein
  (`stimmzettelFehler`). Bis zum Ende änderbar.
- **Anonym** (`anonym`): das API gibt nie heraus, wer abgestimmt hat oder was, auch nicht an die Person, die die Umfrage
  erstellt hat. Sichtbar sind nur Zahlen und Freitexte ohne Namen. Intern bleibt die Sub gespeichert (eine Stimme je
  Person, Erinnerungen). Nach der ersten Stimme lässt sich `anonym` nicht mehr ändern (400). Öffentliche Umfragen zeigen
  die Namen je Antwort und die Liste „Noch offen / Abgestimmt“.
- **Ergebnisse** (`ergebnisse`): `sofort`, `nach_abstimmung` (wer abgestimmt hat) oder `nach_ende`. Wer die Umfrage
  erstellt hat und die Verwaltung sehen sie immer, nach dem Ende alle (`ergebnisseSichtbar`).

## Bearbeiten

Bearbeiten und vorzeitig beenden darf die Person, die die Umfrage erstellt hat, und wer `umfragen:verwalten` hat. Löschen
(mit allen Stimmen) darf nur die Verwaltung.

Fragen und Antworten behalten beim Bearbeiten ihre IDs. `ungueltigNachAenderung` bestimmt, was mit den Stimmen passiert:

- Antworten auf entfernte Fragen werden still gelöscht.
- Wer eine entfernte Antwort gewählt hat, eine nicht mehr erlaubte eigene Antwort gegeben hat, mehr Antworten hat als das neue
  Maximum oder eine neue Frage noch nicht beantwortet hat, muss **erneut abstimmen**: die ungültigen Antworten werden gelöscht,
  `umfrage_abgaben.erneut_noetig` wird gesetzt, die Stimme zählt nicht mehr, und es gibt Erinnerungen wie für Offene.
- Sind davon Personen neu betroffen, antwortet `PUT` mit 409 `{ error, betroffene }`, bis `bestaetigt: true` mitkommt. Die
  Betroffenen (außer der handelnden Person) bekommen `umfrage.erneut_abstimmen`.
- Wer durch die Änderung neu in einen Kreis kommt, bekommt `umfrage.neu`.

## Benachrichtigungen

Siehe [benachrichtigungen.md](./benachrichtigungen.md), Code in `packages/api/src/umfrageBenachrichtigungen.ts`.

| Art                        | Wann                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `umfrage.neu`              | Direkt beim Erstellen an beide Kreise, außer an die Person, die sie erstellt           |
| `umfrage.erinnerung`       | Ab 9 Uhr (Berlin) an den gewählten Tagen vor dem Ende, nur an alle ohne gültige Stimme |
| `umfrage.erneut_abstimmen` | Nach einer Änderung, die die eigene Stimme ungültig macht (nicht abschaltbar)          |

- Die Erinnerungstage wählt man je Kreis aus 0 (letzter Tag), 1, 2, 3, 5, 7 und 14 Tagen vorher (Standard: Pflicht 7, 3
  und 1, optional 3). Erinnerungen am oder vor dem Tag der Erstellung entfallen (`erinnerungHeute`), verpasste Tage werden
  nicht nachgeholt.
- Für den Pflicht-Kreis kommen Erinnerungen unabhängig von der Einstellung (`ohneEinstellung`), für Optionale nur, wenn
  `umfrage.erinnerung` an ist.
- Dedupe-Schlüssel `umfrage.erinnerung:<id>:<endetAm>:<tage>:<sub>`; wird das Ende verschoben, greifen die Tage neu.
- Aktions-Buttons in der Nachricht gibt es nicht (iOS und Firefox zeigen sie nicht an). Ein Tipp öffnet die Umfrage.

## Datenmodell

Migrationen `0077`–`0085` (Rechte der Vorstandsposten: `0086`), Store in `packages/api/src/umfragen.ts`, DTOs in `packages/api/src/umfrageAnsicht.ts`, Regeln
in `packages/shared/src/umfragen.ts`.

| Tabelle            | Inhalt                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `umfragen`         | Titel, Beschreibung, `ersteller_sub`, `endet_am`, `beendet_am`, `anonym`, `ergebnisse`, Status der Kreise (kommasepariert) und Erinnerungstage (kommasepariert) |
| `umfrage_kreis`    | Posten (`art` posten, `ref` = Posten-ID) und Personen (`art` person, `ref` = Sub) je Kreis (`pflicht`)                                                          |
| `umfrage_fragen`   | `position`, `text`, `freitext`, `max_antworten`                                                                                                                 |
| `umfrage_optionen` | Feste Antworten einer Frage (`position`, `text`)                                                                                                                |
| `umfrage_abgaben`  | Wer abgestimmt hat (`abgegeben_am`, `erneut_noetig`)                                                                                                            |
| `umfrage_stimmen`  | Einzelne Antworten: `option_id` oder `freitext`                                                                                                                 |

## Rechte

- `umfragen:lesen` (alle Status): Umfragen sehen, erstellen und abstimmen.
- `umfragen:verwalten` (Admins und Vorstandsposten per Migration `0086`, über Posten vergebbar): alle Umfragen bearbeiten, beenden und löschen, alle sehen.

## API

`GET /api/umfragen` (`UmfrageListeDto[]`), `GET /api/umfragen/:id` (`UmfrageDetailDto`), `POST /api/umfragen`,
`PUT /api/umfragen/:id`, `POST /api/umfragen/:id/beenden`, `DELETE /api/umfragen/:id`, `PUT /api/umfragen/:id/stimme`.
