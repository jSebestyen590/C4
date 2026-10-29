# Kalender

Events mit Schichten und Diensten **oder** mit Teilnahme (je nach Kategorie, siehe „Event-Art“). Rechte: `kalender:lesen` (ansehen, sich eintragen), `events:verwalten`
(Events anlegen, ändern, absagen), `kalender:einrichten` (Dienstformen, Kategorien, Vorlagen, Externe).

## Datenmodell

Migrationen `0037`–`0054`, `0062`–`0063`, `0069`–`0080`, Code in `packages/api/src/kalender.ts`, Logik in `packages/shared/src/kalender.ts`.

| Tabelle                                                  | Inhalt                                                                                                                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dienstformen`, `event_kategorien`                       | Stammdaten (Kategorie mit Mantine-Farbe, `art` `dienste`/`teilnahme`, Standard-Kreis `teilnahme_status`; `0076`–`0078`), archivierbar                                                                                                            |
| `externe`                                                | Gastdienste: Name, Kontakt, Quelle (z. B. „Freund:in von X“, „StuK“)                                                                                                                                                                             |
| `events`                                                 | Titel, Beschreibung, Kategorie, Beginn, avisiertes Ende, `abgesagt`, `serie` (Id einer Serie, sonst null), `serie_angepasst`, `angelegt_von` (null = System)                                                                                     |
| `schichten`, `schicht_bedarfe`                           | Schicht nur mit Zeit + Art `aufbau`/`betrieb`/`putzen` (kein Name, Anzeige per `schichtBezeichnung`, z. B. „Betrieb 20:00–04:00“). Betrieb: Bedarf je Dienstform mit Minimum und Wunsch. Aufbau/Putzen: `minimum`/`wunsch` direkt an der Schicht |
| `dienste`                                                | Eintrag: Mitglied **oder** Externe, Dienstform (nur Betrieb, sonst `null`), Kommentar, eingetragen von                                                                                                                                           |
| `event_vorlagen`, `vorlage_schichten`, `vorlage_bedarfe` | Vorlagen: Event mit Beginn-/End-Uhrzeit, Betrieb-Schichten nur mit Uhrzeiten, Aufbau/Putzen mit `tagVersatz` (ganze Tage relativ zum Event, auch negativ) + Uhrzeiten (`ausVorlage`, Europe/Berlin inkl. Sommerzeit)                             |
| `event_teilnahmen`, `kalender_event_abos`                | Teilnahme einzelner Personen (`antwort` leer/`teilnahme`/`absage`, `eingeladen`) und Events im eigenen Kalender-Abo (Migrationen `0072`–`0075`)                                                                                                  |
| `kalender_serien`                                        | Serien: Name, Vorlage, Regel, Wochentage, Wochen, Start/Ende, `aktiv`; Id = Slug des ersten Namens (`0079`)                                                                                                                                      |
| `serien_termine`                                         | Jeder Tag, für den eine Serie schon ein Event erzeugt hat: `serie`, `datum`, `event_id` (ohne Fremdschlüssel), `erzeugt`; Migration `0069`                                                                                                       |
| `kalender_fehlt_erinnerungen`                            | Globale Zeitpunkte (Minuten vor Beginn) für „Dienste fehlen“; Standard 1 Woche, 2 Tage, 1 Tag (Migration `0063`)                                                                                                                                 |     |

## Regeln

- **Zeiten:** Events und Schichten dauern höchstens 24 Stunden (Schema-Prüfung: Ende > Beginn, Dauer ≤ 24 h).
  Eingegeben werden nur Uhrzeiten (`zeitspanne(datum, beginnZeit, endeZeit)`, Europe/Berlin): liegt das Ende bei oder
  vor dem Beginn, gilt der nächste Tag (20:00–01:00 → nächster Tag, 20:00–20:00 = 24 h); die Formulare zeigen dann
  „(nächster Tag)“. `zeitenAus` ist die Umkehrung fürs Bearbeiten. Betrieb-Schichten haben kein eigenes Datum: es ist das
  Event-Datum, bei einem Beginn vor dem Event-Beginn der nächste Tag (`betriebDatum`; Event 20:00, Schicht 00:00–02:00
  → nächster Tag). Aufbau/Putzen haben ein eigenes Datum (im Event) bzw. einen Tagesversatz (in der Vorlage).

- **Bedarf je Art:** Betrieb braucht mindestens eine Dienstform, je Dienstform Minimum ≥ 1 und Wunsch ≥ Minimum.
  Aufbau/Putzen haben keine Dienstform, nur eine Anzahl (Minimum ≥ 0, Wunsch ≥ 1, Wunsch ≥ Minimum); die Dienstformen
  „Aufbau“/„Putzen“ gibt es nicht mehr. Die Validierung ist eine Discriminated Union nach `art` (`schichtEingabeSchema`,
  `vorlageSchichtSchema`); Fehler erscheinen im Editor direkt am Feld.
- Eintragen: bei Betrieb nur in Dienstformen mit Bedarf in der Schicht (Dienstform Pflicht, 400 sonst), bei
  Aufbau/Putzen ohne Dienstform (mit Dienstform 400); mehr als der Wunsch geht immer. Im Dialog entfällt das
  Dienstform-Feld bei Aufbau/Putzen und bei Betrieb mit genau einer Dienstform („Dienst: Bar“ als Text, vorbelegt). Ein Dienst je Person und
  Schicht (409). Überlappende Schichten sind nur ein Hinweis. Bei abgesagten Events kein Eintragen.
- Sich selbst ein-/austragen geht jederzeit (auch rückwirkend). Externe anlegen und eintragen darf jede:r; ihren
  Eintrag entfernen, wer ihn eingetragen hat oder `events:verwalten`. Andere Mitglieder nur mit `events:verwalten`.
- **Ampel** (`schichtBewertung`): rot = eine Dienstform (bei Aufbau/Putzen: die Anzahl aller Einträge) unter Minimum oder Anwärter:in ohne Mitglied/EM in derselben
  Schicht (Externe zählen nicht als Begleitung, Anwärter:innen zählen zum Bedarf); gelb = Wunsch nicht erreicht;
  grün = alles erfüllt. Ein Event hat die schlechteste Farbe seiner Schichten, abgesagt = grau.
- Ändern eines Events behält die Einträge; entfernt es Schichten oder Bedarfe mit Einträgen, antwortet das API mit 409
  und der Liste der Betroffenen, bis `bestaetigt: true` mitkommt. Wechselt die Art einer Schicht mit Einträgen von
  Betrieb zu Aufbau/Putzen, bleiben die Einträge (ihre Dienstform wird geleert); von Aufbau/Putzen zu Betrieb passen sie
  keiner Dienstform und zählen als entfernt (409 bis zur Bestätigung). Löschen nur ohne Einträge, sonst absagen.

## Terminserien

Serien erzeugen Events aus einer Vorlage nach einer Regel, z. B. ein Barabend montags, mittwochs und sonntags oder ein
Plenum am 1. Dienstag im Monat. Sie werden in der Einrichtung (Tab „Serien“, auf dem Handy per Auswahlfeld) angelegt;
nichts davon ist im Code oder in Migrationen festgelegt (Kategorien, Vorlagen und Serien legt man selbst an).

- **Regel:** `woechentlich` (Wochentage) oder `monatlich` (Wochentage × Wochen 1., 2., 3., 4. oder letzte), dazu Start und
  optional Ende. Reine Funktion `serienTage(serie, von, bis)` in Shared (Kalendertage, Sommerzeit egal). Vorlauf fest 12 Monate.
- **Id:** Slug des Namens beim Anlegen (`Barabend` → `barabend`, bei Kollision `-2`, `-3`); bleibt beim Umbenennen gleich.
  `events.serie` und `serien_termine.serie` tragen diese Id. Legt man eine Serie mit dem Namen einer gelöschten Serie an,
  übernimmt sie deren Events und Tage.
- **Job:** Die Aufgabe `kalender.serien` (im Push-Job, höchstens einmal pro Berlin-Tag über den Dedupe-Schlüssel
  `kalender.serien:<Datum>` in `push_versand`) erzeugt für jede aktive Serie jeden fälligen Tag von max(heute, Start) bis
  min(heute + 12 Monate, Ende), der noch keinen `serien_termine`-Eintrag hat, ein Event aus der Vorlage (mit der Kategorie
  der Vorlage, `angelegt_von` leer). Eintrag und Event entstehen in einer Transaktion (`ON CONFLICT DO NOTHING`). Pro Lauf
  höchstens 30 Events. Vergangene Tage werden nie nachgeholt; fehlt die Vorlage oder ist sie archiviert, entsteht nichts
  (Log). Nach Anlegen oder Ändern einer Serie wird der Tages-Schlüssel freigegeben, der Rest kommt mit dem nächsten Lauf.
  **Sofort beim Speichern:** POST, PUT und PUT `/aktiv` (mit `aktiv=true`) erzeugen die fälligen Events der Serie direkt in der
  Anfrage (`serieSofortErzeugen`, gleiche Logik wie der Job), höchstens die nächsten 40 fälligen Tage bzw. ca. 10 s. Ein Fehler dabei
  wird nur geloggt, das Speichern gelingt trotzdem. Die Antwort enthält `erzeugt`, die Einrichtung zeigt „n Termine angelegt“.
- **Gelöscht bleibt gelöscht:** Der Eintrag in `serien_termine` bleibt, auch wenn das Event gelöscht, verschoben oder
  umbenannt wird. Der Tag kommt nie wieder (außer die Serie räumt ihn selbst ab, s. u.).
- **Unverändert:** Ein künftiges Serien-Event gilt als unverändert, wenn `serie_angepasst` nicht gesetzt ist (wird beim
  Bearbeiten von Hand und beim Absagen/Wiederaufnehmen gesetzt) und es keine Dienste und keine Teilnahme-Einträge hat.
- **Routen** (Lesen `kalender:lesen`, Schreiben `kalender:einrichten`): `GET /api/kalender/serien` (mit `kuenftig` und
  `unveraendert`), `POST`, `PUT /serien/:id`, `PUT /serien/:id/aktiv` `{ aktiv, bestehende? }`, `DELETE /serien/:id?bestehende=`.
  Ändert sich die Regel (Vorlage, Regel, Tage, Start, Ende), wird die Serie ausgeschaltet oder gelöscht und es gibt künftige
  Events, antwortet die API mit 409 `{ error, unveraendert, angepasst }`, bis `bestehende` kommt: `anpassen` löscht die
  unveränderten künftigen Events, die nach der neuen Regel nicht mehr vorkommen (samt `serien_termine`-Eintrag), und
  überschreibt die übrigen aus der Vorlage (beim Ausschalten/Löschen werden alle unveränderten gelöscht); `behalten` lässt alles
  Bestehende, nur neue Tage folgen der neuen Regel. Angepasste Events, Events mit Einträgen und vergangene Events bleiben immer.
  Eine Vorlage, die eine Serie benutzt, lässt sich nicht löschen (409).
- **Ersetzen:** Im Formular „Event anlegen“ fragt ein Dialog nach Vorlage und Datum, wenn an dem Tag ein nicht abgesagtes
  Serien-Event liegt: „<Serienname> ersetzen?“ mit „Ersetzen“ / „Zusätzlich anlegen“ / „Abbrechen“. Ersetzen bearbeitet das
  bestehende Event mit den Daten der Vorlage (`serieEventErsetzen` in Shared): die erste Betriebs-Schicht der Vorlage übernimmt
  die Id der bisherigen Betriebs-Schicht, Dienstformen mit Einträgen, die der Vorlage fehlen, kommen mit ihren Minimum/Wunsch-Werten
  in den Bedarf, weitere Schichten mit Einträgen bleiben; hat die Vorlage keine Betriebs-Schicht, bleibt die alte als zusätzliche
  Schicht. Gespeichert wird per `PUT` mit `ersetzeSerie: true`, das `events.serie` auf null setzt (die Einträge bleiben dran;
  entfernt man bewusst etwas, greift die 409-Bestätigung). Eine Teilnahme-Vorlage ersetzt nichts, beide Events bleiben.

## Event-Art (Dienste oder Teilnahme)

Ein Event hat **entweder** Dienste (Schichten) **oder** Teilnahme, nie beides. Die Art legt die **Kategorie** fest, die für
Events und Vorlagen Pflicht ist (Schema und API, 400 sonst; die Spalte bleibt wegen DSQL nullable, `null` und Bestand ohne
Kategorie gelten als Dienste).

- **Kategorie:** `art` (`dienste`/`teilnahme`, Pflicht; vorhandene Kategorien sind Dienste, Migration `0077`) und
  bei Teilnahme der Standard-Kreis `teilnahmeStatus` (Pflicht, `[]` = niemand vorab). Die Art lässt sich nur ändern, solange
  kein Event die Kategorie benutzt (`benutzt` im DTO; sonst 409 „Die Kategorie wird von Events benutzt.“).
- **API-Prüfung:** Dienste-Kategorie: kein Kreis, keine Eingeladenen (400). Teilnahme-Kategorie: keine Schichten (400); ohne
  `teilnahmeStatus` gilt der Standard der Kategorie. Dienste eintragen bei Teilnahme-Events und Teilnahme setzen bei Dienste-Events: 409.
- **Wechsel der Art** am Event (andere Kategorie): Würden Dienste (Schichten fallen weg) oder Teilnahmen (Antworten, Einladungen)
  gelöscht, antwortet `PUT` mit 409 `{ error, betroffene, teilnahmen }`, bis `bestaetigt: true` mitkommt. Dann werden sie gelöscht.
- **Vorlagen:** `ausVorlage(vorlage, datum, kategorie)` erzeugt bei Teilnahme keine Schichten und nimmt den Kreis der Vorlage,
  sonst den der Kategorie. Das Serien-Ersetzen bietet nur Dienste-Vorlagen an; bei einer Teilnahme-Vorlage an einem
  Serien-Tag bleiben beide Events.
- **Anzeige:** Teilnahme-Events haben keine Ampel und keine Schichten und werden vom Job „Dienste fehlen“ übersprungen. Statt der
  Ampel steht „x nehmen teil“, im Monatsraster ein grauer Streifen (Legende: „Teilnahme“). Formular und Vorlagen-Editor zeigen
  je nach Art der gewählten Kategorie den Schicht-Editor oder den Abschnitt Teilnahme (vorbelegt mit dem Standard-Kreis).

## Teilnahme

Events mit einer Teilnahme-Kategorie haben Teilnehmende. Das ist **kein Dienst**, keine Schicht und zählt nicht im Dienstschwein.

- **Kreis** (`events.teilnahme_status`, Migration `0070`; Vorlagen: `event_vorlagen.teilnahme_status`, `0071`, `ausVorlage`
  übernimmt ihn): `null` = keine Teilnahme (Dienste-Event), sonst kommaseparierte Status (`anwaerter,mitglied,em` = alle Mitglieder,
  leer = niemand vorab). Im Formular (und Vorlagen-Editor, Abschnitt „Teilnahme“, nur bei Teilnahme-Kategorie): Alle Mitglieder / Nach
  Status / Niemand vorab, dazu bei Events „Einzelne Personen einladen“ (`eingeladen: string[]` mit Subs).
- **Effektive Teilnahme** (`teilnahmeZustand` / `teilnehmend` in Shared): (Status im Kreis ODER eingeladen ODER eigene
  Antwort `teilnahme`) UND keine Antwort `absage`. Der Kreis wird bei jeder Abfrage **dynamisch** gegen die aktuellen
  Mitglieder ausgewertet, spätere Neumitglieder mit passendem Status sind bei künftigen Events automatisch dabei.
- **Selbst entscheiden:** `PUT /api/kalender/events/:id/teilnahme` `{ teilnahme: boolean }` (`kalender:lesen`, Profilzeile
  nötig, nur für sich selbst). 409 bei abgesagten Events und Events ohne Teilnahme. Wer im Kreis ist, trägt sich aus („Ich
  nehme nicht teil“), alle anderen tragen sich ein („Ich nehme teil“).
- **Anzeige:** `EventDto` hat `teilnahmeStatus`, `teilnahmen` (alle Mitglieder mit Bezug: Person, Zustand
  `teilnahme`/`absage`, `eingeladen`), `ichNehmeTeil` (`null` ohne Teilnahme) und `imAbo`. Die Event-Seite zeigt eine Liste
  „Nehmen teil“ und „Abgesagt“ (für alle sichtbar), Kalender-Karten ein Badge „Du nimmst teil“/„Teilnahme“; „Nur meine“
  schließt Events mit eigener Teilnahme ein. `GET /kalender/events[/:id]` kennt dafür den Aufrufer.
- **Push:** Art `kalender.teilnahme_erinnerung` (Standard 60 Minuten vorher) für Teilnehmende nicht abgesagter Events;
  `kalender.aenderung` geht bei Verschiebung, Absage und Wiederaufnahme auch an Teilnehmende (nicht an die handelnde
  Person). Neu Eingeladene bekommen keine eigene Benachrichtigung.

## Seiten

| Seite                                  | Zweck                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/kalender`                            | Umschalter Liste (Karten) / Monat, Wahl wird je Gerät gemerkt. Der gezeigte Monat steht in der URL (`?monat=YYYY-MM`, ohne = aktueller Monat; Wechsel per `replace`, ohne History-Einträge), Zurück-Links der Event-Seiten führen zum Monat des Events. Monat: auf dem Handy kompaktes Raster (Feld = Kategorie-Farbe, Balken unten = schlechteste Ampel des Tages, Tippen auf einen Tag öffnet die Tagesübersicht: Events des Tages als Karten (Filter gelten) und mit `events:verwalten` der Button „Event an diesem Tag anlegen“ (`/kalender/events/neu?datum=…`); leerer Tag springt dort direkt hin, ohne das Recht ist er nicht antippbar. Handy: Bottom-Drawer, ab `sm` Modal), ab `sm` Raster mit Event-Chips (Chip führt direkt zum Event, Klick auf die Zelle öffnet die Tagesübersicht); Legende; Filter fehlend/meine |
| `/kalender/events/:id`                 | Schichten, Bedarfe, Ein-/Austragen, Externe, Teilnahme, „In mein Kalender-Abo“                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `/kalender/events/neu`, `…/bearbeiten` | Formular mit Vorlage + Datum (`?datum=YYYY-MM-DD` belegt es vor, sonst heute), Schicht-Editor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/kalender/statistik`                  | **Dienstschwein**: Dienste je Person (inkl. Externe) und Dienstform pro Kalenderjahr, dazu die Spalten Aufbau und Putzen (`nachSpalte`: Dienstform-Id, `art:aufbau`, `art:putzen`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `/kalender/einrichtung`                | Dienstformen, Kategorien, Vorlagen, Serien, Externe (Zusammenführen), Erinnerungen (Tab: Zeitpunkte für „Dienste fehlen“ als „1 Woche vorher“ usw., hinzufügen mit Zahl + Einheit)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `/kalender/mein-kalender`              | Kalender-Abo (siehe unten)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Das Dienstschwein zählt jeden Eintrag einmal, nach dem Jahr des Schichtbeginns (Europe/Berlin); abgesagte Events
zählen nicht. Es ist für alle mit `kalender:lesen` sichtbar.

## Mein Kalender (ICS-Abo)

- Seite `/kalender/mein-kalender`. Jede:r hat einen geheimen Feed-Token (Tabelle `kalender_tokens`, nur der
  sha256-Hash wird gespeichert). Der Klartext-Token wird nur direkt nach dem Erzeugen angezeigt; ein neuer Link
  ersetzt den alten (der alte Link geht dann nicht mehr).
- `GET /api/me/kalender-token` (`{ vorhanden }`), `POST /api/me/kalender-token` (`{ token }`).
- `GET /api/kalender/feed/:token(.ics)` ist öffentlich (kein Bearer-Token, in API Gateway eine eigene Route ohne
  Authorizer). Er enthält die eigenen Dienste ab 90 Tage zurück, `text/calendar`, `no-store`. Titel
  „Dienstform · Event“ (bei Aufbau/Putzen „Aufbau · Event“), abgesagte Events als `STATUS:CANCELLED`. Links zum Event nur, wenn die Lambda-Variable
  `PUBLIC_URL` gesetzt ist (Terraform: nur mit eigener Domain).
- Neben den eigenen Diensten enthält der Feed **Events mit der Gesamtzeit des Events** (UID `event-<id>@c4-leipzig.de`,
  Titel = Eventtitel, abgesagte als `STATUS:CANCELLED`): alle mit effektiver Teilnahme und alle, die man auf der Event-Seite
  mit „In mein Kalender-Abo“ übernommen hat. Ein Event steht nur einmal im Feed, auch wenn beides zutrifft. Eigene Dienste
  bleiben eigene Termine. Keine Erinnerungen (`VALARM`) im Feed, dafür gibt es Push.
- Event-Abo: `PUT`/`DELETE /api/kalender/events/:id/abo` (`kalender:lesen`, Tabelle `kalender_event_abos`).
- Einmalige `.ics`-Downloads (Mein Kalender, Event-Seite) und `GET /api/me/dienste` gibt es nicht mehr; das Abo reicht.
- Google aktualisiert abonnierte Kalender nur alle paar Stunden.

## Globale Erinnerungen (Dienste fehlen)

`GET /api/kalender/erinnerungen` (`kalender:lesen`) → `{ minutenVorher }` absteigend sortiert;
`PUT /api/kalender/erinnerungen` (`kalender:einrichten`) ersetzt die Liste (1–20 Einträge, je 15 Minuten bis 30 Tage,
eindeutig). Pro Event gibt es keine eigene Einstellung mehr.

## Push-Benachrichtigungen

Das allgemeine Modul ist in [benachrichtigungen.md](./benachrichtigungen.md) beschrieben; der Kalender nutzt vier Arten:
`kalender.erinnerung` (vor der eigenen Schicht, einstellbar; Titel „Bar-Dienst in 30 Minuten“, bei Aufbau/Putzen „Aufbau in 30 Minuten“), `kalender.fehlende_dienste` (zu den globalen Zeitpunkten
vor Beginn, solange das Event rot ist; je Event und Zeitpunkt einmal, nur der kleinste bereits erreichte, nie rückwirkend; für EM standardmäßig aus) und `kalender.aenderung` (Event verschoben,
abgesagt/wieder aktiv, eigene Schicht geändert oder entfernt, von anderen ausgetragen; die handelnde Person bekommt
nichts) und `kalender.teilnahme_erinnerung` (vor einem Event, an dem man teilnimmt, einstellbar, Standard 60 Minuten). Einstellungen: Seite „Benachrichtigungen“ (`/benachrichtigungen`); „Mein Kalender“ verlinkt dorthin. Die Job-Aufgaben
stehen in `kalenderBenachrichtigungen.ts`. Auf iPhone/iPad nur über „Zum Home-Bildschirm“ (iOS 16.4+).
