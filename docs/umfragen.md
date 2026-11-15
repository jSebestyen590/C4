# Umfragen

Jedes Mitglied kann Umfragen erstellen. Eine Umfrage hat eine oder mehrere Fragen, je Frage feste Antworten und/oder eine
eigene Antwort (Freitext), ein Ablaufdatum und zwei Personenkreise: wer abstimmen **muss** und wer abstimmen **darf**.
Seiten: `/umfragen` (Liste), `/umfragen/neu`, `/umfragen/:id`, `/umfragen/:id/bearbeiten`.

Die Liste gliedert sich in „Offen für dich“, „Laufend“ und „Beendet“. Auf dem Handy zeigt sie Kacheln, ab `sm` eine
Tabelle (Umfrage, Status, Läuft bis, Abgestimmt, Erstellt von). Die ganze Kachel bzw. Zeile öffnet die Umfrage. Laufende
Umfragen kommen auf einmal (`GET /api/umfragen`), beendete seitenweise zu je 20, neueste zuerst („Ältere laden“,
`GET /api/umfragen/beendet?nach=<Position>`, Antwort `{ umfragen, weiter }`). Weil die Sichtbarkeit erst in der API geprüft
wird, liest sie in Stapeln zu 50 weiter, bis die Seite voll ist; sortiert wird nach `erstellt_am`, `id` (Index Migration
`0091`). Der Erinnerungs-Job liest nur laufende Umfragen.

## Invarianten

- Die Kreise (Pflicht/Optional) werden bei jedem Zugriff **dynamisch** gegen aktuelle Mitglieder, Status und Posten-Besetzungen
  ausgewertet (`kreisVon`); Pflicht und Optional dürfen sich nicht überschneiden (400). Deaktivierte Mitglieder fallen aus den Kreisen,
  ihre abgegebenen Stimmen bleiben gezählt.
- Eine Stimme ist ein Stimmzettel für **alle** Fragen (`stimmzettelFehler`) und bis zum Ende änderbar; je Person und Umfrage genau eine
  Abgabe (`umfrage_abgaben`, Primärschlüssel).
- Eine beendete Umfrage (abgelaufen oder vorzeitig) lässt sich weder bearbeiten noch wieder öffnen.
- `anonym` lässt sich nach der ersten Stimme nicht mehr ändern (400); Terminumfragen sind nie anonym (das Schema lehnt `anonym: true` dafür ab, auch bei freier Terminfindung). Was „anonym“ bedeutet, steht
  unter [Regeln](#regeln).
- Eine Änderung, die Stimmen ungültig macht, braucht die Bestätigung des Bearbeitenden (409, bis `bestaetigt: true`); die Betroffenen
  müssen erneut abstimmen (`umfrage_abgaben.erneut_noetig`) und zählen bis dahin nicht als abgestimmt.
- Aus einer Terminumfrage entsteht höchstens ein Event (409, außer das erste wurde gelöscht), und erst nach dem Ende der Umfrage.
- Löschen darf nur die Verwaltung (`umfragen:verwalten`), Bearbeiten und Beenden zusätzlich die erstellende Person (und bei einer
  Privatparty-Umfrage die Inhaber:innen von `privatpartys:verwalten`).

## Dateien

| Bereich | Dateien                                                                                                                                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API     | `packages/api/src/umfragen.ts` (Store), `umfrageAnsicht.ts` (DTOs, Sichtbarkeit, Anonymität), `umfrageSpeichern.ts` (Speichern, Termin-Vorbereitung), `umfrageBenachrichtigungen.ts`, `umfragen.fake.ts`, Routen in `app.ts` |
| Shared  | `packages/shared/src/umfragen.ts` (Schemas, Kreise, Ergebnis-Sichtbarkeit, Terminregeln, `ungueltigNachAenderung`)                                                                                                           |
| Web     | Seiten `pages/UmfragenPage.tsx`, `UmfragePage.tsx`, `UmfrageFormularPage.tsx`; `UmfrageTerminFelder.tsx`, `umfrageDaten.tsx`, `SortierbareListe.tsx`, `ZeitraumFeld.tsx`                                                     |
| Tests   | `packages/shared/src/umfragen.test.ts`, `packages/api/src/umfrageBenachrichtigungen.test.ts`, `packages/web/src/SortierbareListe.test.ts`                                                                                    |

## Formular

Das Formular „Umfrage erstellen“ ist zweistufig: zuerst wählt man den Typ, danach erscheint das passende Formular
(„Anderen Typ wählen“ führt zurück). Beim Bearbeiten steht der Typ fest. Antworten lassen sich am Griff per Drag-and-drop
umsortieren (`SortierbareListe`); Termine sortiert die App selbst. Bei der Terminfindung mit Event
steht die Kategorie bzw. Vorlage ganz oben im Formular (`TerminQuelleFelder`), weil sie die übrigen Felder bestimmt.

| Typ                       | Inhalt                                                                            |
| ------------------------- | --------------------------------------------------------------------------------- |
| Frage oder Fragen         | Eigene Fragen mit Antworten, Freitext und Anzahl wählbarer Antworten              |
| Terminfindung             | Termine als Daten, das Event entsteht aus einer Kategorie (siehe „Terminfindung“) |
| Terminfindung aus Vorlage | Termine als Starttage, das Event entsteht aus einer Vorlage                       |
| Terminfindung ohne Event  | Termine als Datum mit optionaler Uhrzeit (`terminFrei`), nie ein Event            |

Die freie Terminfindung hat genau eine Frage, beliebig viele Termine sind wählbar, „An keinem der Termine“ geht wie bei
der Terminfindung, der Titel ist Pflicht. Jeder Termin ist ein Tag (`umfrage_option_termine`, ohne `bis`) mit optionalem
Beginn und Ende (beide oder keins, `freieTerminFehler`) und optionalem Namen; den Antworttext erzeugt `terminText`. `POST /api/umfragen/:id/event` antwortet mit 400.

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
- Deaktivierte Mitglieder fallen aus den Kreisen heraus (und bekommen keine Pushes); bereits abgegebene Stimmen bleiben gezählt.
- **Sehen** darf eine Umfrage, wer in einem Kreis ist, schon abgestimmt hat, sie erstellt hat oder `umfragen:verwalten` hat.
  Allen anderen antwortet das API mit 404. **Abstimmen** darf nur, wer in einem Kreis ist.
- **Stimme**: ein Stimmzettel für alle Fragen (`PUT /api/umfragen/:id/stimme`), jede Frage muss beantwortet sein
  (`stimmzettelFehler`). Bis zum Ende änderbar.
- **Anonym** (`anonym`): Anonymität gilt **in der App, nicht in der Datenbank**. Die API gibt nie heraus, wer abgestimmt hat oder was:
  Ergebnisse zeigen nur Zahlen (`personen: null`) und Freitexte ohne Namen (`person: null`, nach Text sortiert statt nach Abgabe-Reihenfolge), die Liste „Noch offen / Abgestimmt“
  (`teilnehmende`) entfällt, und das gilt auch für die Person, die die Umfrage erstellt hat, und die Verwaltung (`umfrageAnsicht.ts`).
  Nur die eigenen Antworten (`meineAntworten`) sieht man selbst. In der Datenbank steht dagegen weiterhin, wer wie abgestimmt hat:
  `umfrage_stimmen.mitglied_sub` je Antwort und `umfrage_abgaben` mit `mitglied_sub` und `abgegeben_am` (der Zeitstempel liegt in
  `umfrage_abgaben`, nicht in `umfrage_stimmen`). Das braucht die App für „eine Stimme je Person“ und die Erinnerungen. Wer Zugriff auf die
  Datenbank hat, kann Stimmen also Personen zuordnen. Nach der ersten Stimme lässt sich `anonym` nicht mehr ändern (400). Öffentliche
  Umfragen zeigen die Namen je Antwort und die Liste „Noch offen / Abgestimmt“.
- **Ergebnisse** (`ergebnisse`): `sofort`, `nach_abstimmung` (wer abgestimmt hat) oder `nach_ende`. Wer die Umfrage
  erstellt hat und die Verwaltung sehen sie immer, nach dem Ende alle (`ergebnisseSichtbar`).
  Bei der Umfrage einer Privatparty gilt das auch für Inhaber:innen von `privatpartys:verwalten`: Sie zählen wie die Verwaltung als
  „verwaltet“ (`darfBearbeiten` in `umfrageAnsicht.ts`, gesetzt über `aufruferFuerUmfrage` in `app.ts`) und sehen die Ergebnisse jederzeit.
  Dieses Recht gilt nur für diese Umfrage: Auch außerhalb des Kreises sehen sie sie (Liste, beendete Umfragen, Detail; sonst 404) und
  dürfen abstimmen (`darfAbstimmen`, DTO-Feld `darfAbstimmen`; `meinKreis` bleibt `null`). Die Ids aller Privatparty-Umfragen lädt
  `aufruferMitParty` einmal je Request (`PrivatpartysStore.umfrageIds`). `kreisGroesse` zählt Abstimmende außerhalb des Kreises mit.
  Abstimmen braucht wie immer ein Profil.

## Terminfindung

Eine Umfrage mit `termin` (Schalter „Terminfindung“ im Formular, `umfrageTerminSchema`) sucht einen Termin für ein Event.

- **Aufbau**: genau eine Frage, ihre Antworten sind Termine (`umfrage_option_termine`). Den Antworttext erzeugt die API
  (`terminText`, z. B. „Di, 11.11.2026“, „Di, 11.11.2026, 19:00–21:00“ oder „Fr, 10.07.2026 – So, 12.07.2026“), die
  Termine werden sortiert. Jeder Termin kann einen optionalen **Namen** haben (`name`, höchstens 60 Zeichen, Spalte
  `name`), der hinter dem Datum steht: „Sa, 07.11.2026 · StuK“. Dasselbe Datum darf mit verschiedenen Namen mehrfach
  vorkommen. Man kreuzt alle passenden Termine an (beliebig viele, kein Freitext) oder **„An keinem der
  Termine“**: eine Stimme ohne Antwort (`leerErlaubt`), sie zählt als abgestimmt (keine Erinnerungen) und erscheint im
  Ergebnis als „An keinem der Termine“ (`keiner`, mit Namen bei öffentlichen Umfragen). Ohne Frage gilt „Welche Termine
  passen dir?“. Terminumfragen sind nie anonym.
- **Titel**: optional. Leer übernimmt die API den Titel der Vorlage, sonst den Namen der Kategorie. Ein so übernommener
  Titel bleibt im Event leer (bzw. der der Vorlage), damit es der Kategorie folgt.
- **Quelle**: entweder eine **Kategorie** (`kategorieId`) oder eine **Vorlage** (`vorlageId`; ihre Kategorie
  wird gespeichert). `terminNormalisieren` verwirft, was Kategorie oder Vorlage selbst festlegen, `terminDauerFehler`
  prüft den Rest (400).
- **Uhrzeit und Dauer** (ohne Vorlage, nach der Dauer der Kategorie):
  - eintägig: eine Uhrzeit für alle Termine (`beginn`/`ende`) oder je Termin (`jeTermin`); Ende vor Beginn = nächster Tag.
  - mehrtägig: jede Antwort ist ein Zeitraum (`bis`) mit Uhrzeiten wie oben. Im Formular wählt man
    den Zeitraum in einem Feld (`ZeitraumFeld`, `@mantine/dates`): im Kalender erst den ersten, dann den letzten Tag.
  - ganztägig: jede Antwort ist ein Zeitraum ohne Uhrzeiten.
  - Mit Vorlage sind die Antworten nur Starttage; Uhrzeiten, Anzahl der Tage, Schichten und Bedarf kommen aus der Vorlage.
- **Kategorie ohne Vorlage**: bei Teilnahme werden die Zustimmenden eingeladen (Kreis „niemand vorab“). Bei Diensten ist ein
  `bedarf` Pflicht (Dienstform, Minimum, Wunsch): das Event bekommt eine Betrieb-Schicht ab Beginn (höchstens 24 Stunden)
  mit diesem Bedarf.
- **Vorlage**: das Event entsteht mit `ausVorlage` (alle Schichten); Titel und Beschreibung der Umfrage gehen vor. Bei
  Teilnahme werden die Zustimmenden eingeladen. Bei Diensten zeigt die Umfrage den Bedarf aller Dienstformen zusammen
  (`bedarfZusammen`, z. B. „mindestens 2, am liebsten 3 (Tresen, Kasse)“, `terminBedarf` im DTO); die Zustimmenden wählen
  keine Dienstform, sondern werden beim Anlegen der Reihe nach auf die Plätze aller Betrieb-Schichten verteilt
  (`dienstVerteilung`: erst bis zu jedem Minimum, dann bis zu jedem Wunsch, der Rest reihum).
- Fehlen danach Dienste, erinnert der Kalender wie bei jedem Event („Dienste fehlen“).
- **Event anlegen**: `POST /api/umfragen/:id/event` `{ optionId }`, erst wenn die Umfrage beendet ist (abgelaufen oder
  vorzeitig, sonst 409). Darf die Person, die die Umfrage erstellt hat, und wer `umfragen:verwalten` hat, **auch ohne
  `events:verwalten`**. Gewählt werden kann jeder Termin, nicht nur der mit den meisten Stimmen. Eingetragen wird, wer
  diesen Termin mit gültiger Stimme angekreuzt hat. `event_id` und `option_id` in `umfrage_termine` halten fest, was
  entstanden ist; ein zweites Event gibt es nicht (409), außer das erste wurde gelöscht.
- **Nachricht** `umfrage.termin` an beide Kreise (außer der handelnden Person): „„Sitzung“: Di, 11.11.2026. Du bist
  eingetragen.“ bzw. ohne den letzten Satz; ein Tipp öffnet das Event.

- **Privatparty**: Die Umfrage einer Privatparty (siehe [privatpartys.md](./privatpartys.md)) ist eine Terminumfrage mit
  Vorlage, die die API selbst anlegt (`POST /api/privatpartys/:id/umfrage`). Die Antworten sind die Wunschtermine; ihr Name
  trägt Zeit und Stufe („19:00–02:00 · Bevorzugt“), daran erkennt die API beim Anlegen des Events den Wunschtermin
  wieder. Dasselbe Erkennen (Datum und Name) nutzt `privatpartyUmfrageNachziehen`, wenn sich die Wunschtermine ändern (neue Antworten hinzu, entfernte samt Stimmen weg; Pushes über `meldeTermineGeaendert`, siehe [benachrichtigungen.md](./benachrichtigungen.md)). Titel immer „Privatparty: Terminabstimmung“. Ist eine Umfrage mit einer Privatparty verknüpft (`privatpartys.umfrage_id`), dürfen auch Inhaber:innen von
  `privatpartys:verwalten` sie beenden und das Event daraus anlegen (`Aufrufer.privatpartys`), ohne `umfragen:verwalten`. Das Event nimmt dann
  die Wunschzeiten (`ausVorlageZuZeit`), trägt nur den Titel der Vorlage (bzw. „Privatparty“) und setzt die Privatparty auf
  „Zugesagt“. Alle anderen Umfragen verhalten sich unverändert. `umfrageSpeichern` und `terminVorbereiten` liegen dafür in
  `packages/api/src/umfrageSpeichern.ts`.

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
| `umfrage.termin`           | Aus einer Terminumfrage wurde ein Event angelegt                                       |

- Die Erinnerungstage wählt man je Kreis aus 0 (letzter Tag), 1, 2, 3, 5, 7 und 14 Tagen vorher (Standard: Pflicht 7, 3
  und 1, optional 3). Erinnerungen am oder vor dem Tag der Erstellung entfallen (`erinnerungHeute`), verpasste Tage werden
  nicht nachgeholt.
- Für den Pflicht-Kreis kommen Erinnerungen unabhängig von der Einstellung (`ohneEinstellung`), für Optionale nur, wenn
  `umfrage.erinnerung` an ist.
- Dedupe-Schlüssel `umfrage.erinnerung:<id>:<endetAm>:<tage>:<sub>`; wird das Ende verschoben, greifen die Tage neu.
- Aktions-Buttons in der Nachricht gibt es nicht (iOS und Firefox zeigen sie nicht an). Ein Tipp öffnet die Umfrage.

## Datenmodell

Migrationen `0077`–`0091` (Tabellen `0077`–`0082`, Indizes `0083`–`0085` und `0091`, Rechte der Vorstandsposten: `0086`, Terminfindung: `0087`–`0088`, Dauer der Kategorien und Tage der Vorlagen: `0089`–`0090`), Store in `packages/api/src/umfragen.ts`, DTOs in `packages/api/src/umfrageAnsicht.ts`, Regeln
in `packages/shared/src/umfragen.ts`.

| Tabelle                  | Inhalt                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `umfragen`               | Titel, Beschreibung, `ersteller_sub`, `endet_am`, `beendet_am`, `anonym`, `ergebnisse`, Status der Kreise (kommasepariert) und Erinnerungstage (kommasepariert) |
| `umfrage_kreis`          | Posten (`art` posten, `ref` = Posten-ID) und Personen (`art` person, `ref` = Sub) je Kreis (`pflicht`)                                                          |
| `umfrage_fragen`         | `position`, `text`, `freitext`, `max_antworten`                                                                                                                 |
| `umfrage_optionen`       | Feste Antworten einer Frage (`position`, `text`)                                                                                                                |
| `umfrage_abgaben`        | Wer abgestimmt hat: `mitglied_sub`, `abgegeben_am`, `erneut_noetig` (auch bei anonymen Umfragen)                                                                |
| `umfrage_termine`        | Terminfindung: Kategorie, Uhrzeiten, Bedarf, entstandenes Event (`event_id`, `option_id`)                                                                       |
| `umfrage_option_termine` | Datum (ggf. Uhrzeit und Name) einer Antwort                                                                                                                     |
| `umfrage_stimmen`        | Einzelne Antworten: `mitglied_sub`, `frage_id`, `option_id` oder `freitext` (kein Zeitstempel; auch bei anonymen Umfragen)                                      |

## Rechte

- `umfragen:lesen` (alle Status): Umfragen sehen, erstellen und abstimmen.
- `umfragen:verwalten` (Admins und Vorstandsposten per Migration `0086`, über Posten vergebbar): alle Umfragen bearbeiten, beenden und löschen, alle sehen.

## API

`GET /api/umfragen` (laufende, `UmfrageListeDto[]`), `GET /api/umfragen/beendet` (seitenweise), `GET /api/umfragen/:id` (`UmfrageDetailDto`), `POST /api/umfragen`,
`PUT /api/umfragen/:id`, `POST /api/umfragen/:id/beenden`, `POST /api/umfragen/:id/event`, `DELETE /api/umfragen/:id`, `PUT /api/umfragen/:id/stimme`.
