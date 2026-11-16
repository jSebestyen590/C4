# Kalender

Events mit Schichten und Diensten **oder** mit Teilnahme (je nach Kategorie, siehe „Event-Art“). Rechte: `kalender:lesen` (ansehen, sich eintragen), `events:verwalten`
(Events anlegen, ändern, absagen), `kalender:einrichten` (Dienstformen, Kategorien, Vorlagen, Externe).

## Datenmodell

Migrationen `0037`–`0065` (`*_kalender_*`; Tabellen, Indizes, Standard-Erinnerungen, Rechte der Vorstandsposten; Push-Tabellen `0066`–`0070` siehe `benachrichtigungen.md`), Code in `packages/api/src/kalender.ts`, Logik in `packages/shared/src/kalender.ts`.

| Tabelle                                                  | Inhalt                                                                                                                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dienstformen`, `event_kategorien`                       | Stammdaten (Kategorie mit Mantine-Farbe, `art` `dienste`/`teilnahme`, Standard-Kreis `teilnahme_status`), archivierbar                                                                                                                           |
| `externe`                                                | Gastdienste: Name, Kontakt, Quelle (z. B. „Freund:in von X“, „StuK“)                                                                                                                                                                             |
| `events`                                                 | Titel, Beschreibung, Kategorie, Beginn, avisiertes Ende, `abgesagt`, `serie` (Id einer Serie, sonst null), `serie_angepasst`, `verantwortlich_sub` (optional), `angelegt_von` (null = System)                                                    |
| `schichten`, `schicht_bedarfe`                           | Schicht nur mit Zeit + Art `aufbau`/`betrieb`/`putzen` (kein Name, Anzeige per `schichtBezeichnung`, z. B. „Betrieb 20:00–04:00“). Betrieb: Bedarf je Dienstform mit Minimum und Wunsch. Aufbau/Putzen: `minimum`/`wunsch` direkt an der Schicht |
| `dienste`                                                | Eintrag: Mitglied **oder** Externe, Dienstform (nur Betrieb, sonst `null`), Kommentar, eingetragen von                                                                                                                                           |
| `event_vorlagen`, `vorlage_schichten`, `vorlage_bedarfe` | Vorlagen: Event mit Beginn-/End-Uhrzeit, Betrieb-Schichten nur mit Uhrzeiten, Aufbau/Putzen mit `tagVersatz` (ganze Tage relativ zum Event, auch negativ) + Uhrzeiten (`ausVorlage`, Europe/Berlin inkl. Sommerzeit)                             |
| `event_teilnahmen`, `kalender_event_abos`                | Teilnahme einzelner Personen (`antwort` leer/`teilnahme`/`absage`, `eingeladen`); bei Dienste-Events steht hier nur `absage` („nicht verfügbar“) und Events im eigenen Kalender-Abo                                                              |
| `kalender_serien`                                        | Serien: Name, Vorlage, Regel, Wochentage, Wochen, Start/Ende, `aktiv`; Id = Slug des ersten Namens                                                                                                                                               |
| `serien_termine`                                         | Jeder Tag, für den eine Serie schon ein Event erzeugt hat: `serie`, `datum`, `event_id` (ohne Fremdschlüssel), `erzeugt`                                                                                                                         |
| `kalender_fehlt_erinnerungen`                            | Globale Zeitpunkte (Minuten vor Beginn) für „Dienste fehlen“; Standard 1 Woche, 2 Tage, 1 Tag                                                                                                                                                    |

## Regeln

- **Titel:** Optional (Schema: leer/fehlend wird als `NULL` gespeichert, `''` zählt ebenfalls als „kein Titel“; `titel` in `events` und `event_vorlagen` ist nullable, das DTO liefert `''`). Ohne Titel gilt der
  Name der Kategorie, sonst „Event“ (`eventTitel(event, kategorie)` in Shared). `EventDto.anzeigeTitel` trägt das Ergebnis und gilt für Kalender,
  Event-Seite, Push, ICS (`SUMMARY`, Feed) und Vorlagenlisten (`vorlageTitel`); `titel` bleibt der eingegebene Wert fürs Formular
  („Titel (optional)“, Platzhalter = Kategoriename). Vorlagen: ebenso optional, daraus erzeugte Events behalten den leeren Titel. Die Kartenliste zeigt die
  Kategorie als Zusatzzeile nur bei vorhandenem Titel.
- **Zeitangabe in Listen:** Kalenderkarten zeigen „Sa, 01.11. 20:00 – 01:00“ (`zeitraumKurz`, ohne Jahr, Ende nur als Uhrzeit); die Event-Seite
  zeigt weiter das volle Datum.
- **Zeiten:** Schichten dauern höchstens 24 Stunden (Schema-Prüfung: Ende > Beginn, Dauer ≤ 24 h). Wie lange ein Event
  dauern darf, legt seine Kategorie fest (siehe „Dauer der Kategorie“); das Schema lässt höchstens 31 Tage zu
  (`MAX_EVENT_TAGE`), die API prüft die Kategorie (`eventDauerFehler`, 400).
  Bei eintägigen Events werden nur Uhrzeiten eingegeben (`zeitspanne(datum, beginnZeit, endeZeit)`, Europe/Berlin): liegt das Ende bei oder
  vor dem Beginn, gilt der nächste Tag (20:00–01:00 → nächster Tag, 20:00–20:00 = 24 h); die Formulare zeigen dann
  „(nächster Tag)“. `zeitenAus` ist die Umkehrung fürs Bearbeiten. Betrieb-Schichten haben bei eintägigen Events kein eigenes Datum: es ist das
  Event-Datum, bei einem Beginn vor dem Event-Beginn der nächste Tag (`betriebDatum`; Event 20:00, Schicht 00:00–02:00
  → nächster Tag). Aufbau/Putzen haben ein eigenes Datum (im Event) bzw. einen Tagesversatz (in der Vorlage). Bei
  mehrtägigen und ganztägigen Events hat jede Schicht ein eigenes Datum.

- **Dauer der Kategorie** (`event_kategorien.dauer`, Migration `0089`, `EVENT_DAUERN`, null = eintägig):
  - **Eintägig:** Datum mit Beginn und Ende, höchstens 24 Stunden (wie bisher).
  - **Mehrtägig:** Start- und Enddatum, jeweils mit Uhrzeit (`eventSpanne`), höchstens 31 Tage.
    Im Formular wählt man den Zeitraum in einem Feld (`ZeitraumFeld`: im Kalender erst erster, dann letzter Tag),
    darunter die Uhrzeiten für Beginn und Ende; bei ganztägig genauso, nur ohne Uhrzeiten.
  - **Ganztägig:** nur erster und letzter Tag; gespeichert von 00:00 des ersten bis 00:00 nach dem letzten Tag (Berlin),
    andere Zeiten lehnt die API ab. Anzeige ohne Uhrzeit („Fr, 10.07. – So, 12.07.“ bzw. „ganztägig“), im ICS-Abo als
    Ganztagstermin (`DTSTART;VALUE=DATE`).
  - Die Dauer lässt sich jederzeit ändern; bestehende Events behalten ihre Zeiten, erst beim Bearbeiten gelten die neuen
    Regeln. `EventDto.dauer` kommt aus der Kategorie.
  - Mehrtägige und ganztägige Events erscheinen im Monatsraster an jedem Tag (`eventTage`), in der Liste am ersten Tag
    (oder am Monatsanfang, wenn sie im Vormonat begonnen haben). Eintägige Events über Mitternacht bleiben am Starttag.
  - **Vorlagen** haben dafür `tage` (Migration `0090`, Standard 1): die Zahl der Tage; das Ende liegt auf dem letzten Tag.
    Ganztägige Vorlagen haben keine Uhrzeiten. `ausVorlage` berücksichtigt `tage` und die Dauer der Kategorie.

- **Bedarf je Art:** Betrieb braucht mindestens eine Dienstform, je Dienstform Minimum ≥ 1 und Wunsch ≥ Minimum.
  Aufbau/Putzen haben keine Dienstform, nur eine Anzahl (Minimum ≥ 0, Wunsch ≥ 1, Wunsch ≥ Minimum); die Dienstformen
  „Aufbau“/„Putzen“ gibt es nicht mehr. Die Validierung ist eine Discriminated Union nach `art` (`schichtEingabeSchema`,
  `vorlageSchichtSchema`); Fehler erscheinen im Editor direkt am Feld.
- Eintragen: bei Betrieb nur in Dienstformen mit Bedarf in der Schicht (Dienstform Pflicht, 400 sonst), bei
  Aufbau/Putzen ohne Dienstform (mit Dienstform 400); mehr als der Wunsch geht immer. Im Dialog entfällt das
  Dienstform-Feld bei Aufbau/Putzen und bei Betrieb mit genau einer Dienstform („Dienst: Bar“ als Text, vorbelegt). Ein Dienst je Person und
  Schicht (409). Überlappende Schichten sind nur ein Hinweis. Bei abgesagten Events kein Eintragen.
- Sich selbst ein-/austragen geht jederzeit (auch rückwirkend). **Jede:r mit `kalender:lesen` darf jedes Mitglied mit Profilzeile
  eintragen (Button „Mitglied eintragen“, Mitgliederliste per `GET /api/mitglieder`) und jedes Mitglied austragen** (400 ohne Profilzeile).
  Externe anlegen und eintragen darf jede:r; ihren Eintrag entfernen, wer ihn eingetragen hat oder `events:verwalten`.
  Wer ein anderes Mitglied ein- oder austrägt, löst einen Push an dieses Mitglied aus (siehe „Push-Benachrichtigungen“).
- **Ampel** (`schichtBewertung`): rot = eine Dienstform (bei Aufbau/Putzen: die Anzahl aller Einträge) unter Minimum oder Anwärter:in ohne Mitglied/EM in derselben
  Schicht (Externe zählen nicht als Begleitung, Anwärter:innen zählen zum Bedarf; Mitglieder mit dem Status Externe:r sind neutral: sie brauchen keine Begleitung und sind keine); gelb = Wunsch nicht erreicht;
  grün = alles erfüllt. Ein Event hat die schlechteste Farbe seiner Schichten, abgesagt = grau.
- Deaktivierte Mitglieder (siehe [members.md](./members.md)) fallen aus allen Kreisen und Push-Empfänger:innen heraus.
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
  `kalender.serien:<Datum>` in `push_versand`; der Tag wird erst nach erfolgreicher Arbeit markiert, ein Lambda-Timeout verliert
  ihn also nicht, und die Arbeit ist je Event idempotent) erzeugt für jede aktive Serie jeden fälligen Tag von max(heute, Start) bis
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
  entfernt man bewusst etwas, greift die 409-Bestätigung). Eine Teilnahme-Vorlage ersetzt nichts, beide Events bleiben. Die Frage erscheint auch bei „Ohne Vorlage“: „Ersetzen“ öffnet dann das Formular des Serien-Events mit leerem Titel und leerer Kategorie, den Zeiten und allen Schichten samt Einträgen (`serieEventNeutral`). Serien-Events mit Teilnahme werden nie ersetzt (keine Frage), im Formular sind beim Ersetzen nur Kategorien mit Diensten wählbar, und `PUT` mit `ersetzeSerie: true` antwortet bei einer Teilnahme-Kategorie (neu oder bisher) mit 400.

Events können auch aus einer Terminumfrage entstehen (siehe [umfragen.md](./umfragen.md#terminfindung)).

## Event-Art (Dienste oder Teilnahme)

Ein Event hat **entweder** Dienste (Schichten) **oder** Teilnahme, nie beides. Die Art legt die **Kategorie** fest, die für
Events und Vorlagen Pflicht ist (Schema und API, 400 sonst; `kategorie_id` ist `NOT NULL`).

- **Kategorie:** `art` (`dienste`/`teilnahme`, Pflicht, `NOT NULL` mit CHECK) und
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
- **Sitzung mit Protokoll:** Eine Teilnahme-Kategorie kann das Häkchen `protokoll` tragen (Spalte `event_kategorien.protokoll`,
  Badge „Protokoll“ in der Einrichtung; Dienste-Kategorien: 400). Zu Events dieser Kategorie lassen sich Protokolle schreiben,
  siehe [protokolle.md](./protokolle.md). Ein Event mit Protokoll lässt sich nicht löschen (409), und Serienänderungen
  löschen oder ersetzen es nie. Mit dem Häkchen wählt man die **Art** (`protokollArt`: Sitzung = mehr als die Hälfte, Mitgliederversammlung = mehr als zwei Drittel der Mitglieder beschlussfähig).

**Events aus Protokollen:** Neue Protokolle starten mit Bausteinen für die Events seit der letzten Sitzung und alle kommenden
(ohne Serien-Events und Sitzungen). Beim Abschließen legen Event-Bausteine ohne `eventId` Events an (`event.anlegen`) und
ändern Event-Bausteine, die vom Kalender abweichen, das Event (`event.aendern`), mit dem Recht `protokolle:schreiben` und ohne
`events:verwalten`. Würden dabei Dienste mit Eintragungen wegfallen, schlägt die Aktion fehl. Siehe
[protokolle.md](./protokolle.md#aktionen-beim-abschließen). Die Dienste eines Events im Vorlage-Format liefert
`schichtenAusEvent` (Umkehrung von `ausVorlage`).

## Teilnahme

Events mit einer Teilnahme-Kategorie haben Teilnehmende. Das ist **kein Dienst**, keine Schicht und zählt nicht im Dienstschwein.

- **Kreis** (`events.teilnahme_status`, Vorlagen: `event_vorlagen.teilnahme_status`, `ausVorlage`
  übernimmt ihn): `null` = keine Teilnahme (Dienste-Event), sonst kommaseparierte Status (`anwaerter,mitglied,em` = alle Mitglieder,
  leer = niemand vorab). Im Formular (und Vorlagen-Editor, Abschnitt „Teilnahme“, nur bei Teilnahme-Kategorie): Alle Mitglieder / Nach
  Status / Niemand vorab, dazu bei Events „Einzelne Personen einladen“ (`eingeladen: string[]` mit Subs).
- **Effektive Teilnahme** (`teilnahmeZustand` / `teilnehmend` in Shared): (Status im Kreis ODER eingeladen ODER eigene
  Antwort `teilnahme`) UND keine Antwort `absage`. Der Kreis wird bei jeder Abfrage **dynamisch** gegen die aktuellen
  Mitglieder ausgewertet, spätere Neumitglieder mit passendem Status sind bei künftigen Events automatisch dabei.
- **Selbst entscheiden:** `PUT /api/kalender/events/:id/teilnahme` `{ teilnahme: boolean }` (`kalender:lesen`, Profilzeile
  nötig, nur für sich selbst). 409 bei abgesagten Events und Events ohne Teilnahme. `teilnahme: false` speichert eine Absage,
  auch für Personen außerhalb des Kreises. Die Event-Seite kennt drei Zustände (`meineTeilnahme`): „Du nimmst teil“ + „Ich kann
  nicht“, „Du hast abgesagt“ + „Ich nehme doch teil“, „Du hast noch nicht geantwortet“ + beide Buttons.
- **Anzeige:** `EventDto` hat `teilnahmeStatus`, `teilnahmen` (alle Mitglieder mit Bezug: Person, Zustand
  `teilnahme`/`absage`, `eingeladen`), `ichNehmeTeil` (`null` ohne Teilnahme), `meineTeilnahme` (`teilnahme`/`absage`/`null`) und `imAbo`. Die Event-Seite zeigt eine Liste
  „Nehmen teil“ und „Abgesagt“ (für alle sichtbar), Kalender-Karten ein Badge „Du nimmst teil“/„Teilnahme“; „Nur meine“
  schließt Events mit eigener Teilnahme ein. `GET /kalender/events[/:id]` kennt dafür den Aufrufer.
- **Push:** Art `kalender.teilnahme_erinnerung` (Standard 60 Minuten vorher) für Teilnehmende nicht abgesagter Events;
  `kalender.aenderung` geht bei Verschiebung, Absage und Wiederaufnahme auch an Teilnehmende (nicht an die handelnde
  Person). Neu Eingeladene bekommen keine eigene Benachrichtigung.

## Absage (nicht verfügbar)

Bei Dienste-Events kann man sich für das **ganze Event** als nicht verfügbar melden. So ist dokumentiert, wer abgesagt hat.
Gespeichert wird das in `event_teilnahmen` mit `antwort = 'absage'` (`eingeladen = false`); „wieder verfügbar“ löscht die Zeile.

- **Route:** `PUT /api/kalender/events/:id/verfuegbarkeit` `{ verfuegbar: boolean, bestaetigt?: boolean }` (`kalender:lesen`,
  Profilzeile nötig, nur für sich selbst), Antwort `{ verfuegbar }`. 409 bei abgesagten Events und Teilnahme-Events (dafür gibt es
  `…/teilnahme`).
- **Bestätigung:** Hat man in dem Event eigene Dienste, antwortet die Route auf `verfuegbar: false` mit 409
  `{ error, dienste: n }`. Die Event-Seite zeigt den Text im Dialog („Austragen und absagen“) und sendet erneut mit
  `bestaetigt: true`; dann werden die eigenen Dienste gelöscht und die Absage gesetzt.
- **Eintragen hebt die Absage auf:** `POST /schichten/:id/dienste` löscht die Absage der eingetragenen Person (auch wenn andere
  sie eintragen) und antwortet `201 { id, absageAufgehoben }`. Der Eintragen-Dialog markiert Absagen in der Mitgliederauswahl mit
  „(nicht verfügbar)“, warnt bei der Auswahl und meldet „Deine Absage wurde aufgehoben.“
- **Anzeige:** `EventDto.nichtVerfuegbar` (Mitglieder, nur Dienste-Events), `ichBinNichtVerfuegbar`. Die Event-Seite zeigt unter den
  Schichten den Button „Ich bin nicht verfügbar“ / „Ich bin doch verfügbar“ und für alle die Liste „Nicht verfügbar (n)“; bei
  abgesagten Events nur die Liste.
- **Serien:** Absagen zählen bei Dienste-Events nicht als Eintrag, das Event bleibt „unverändert“ (nicht „angepasst“). Wird es von der
  Serie gelöscht, gehen seine Absagen mit.
- **Wechsel der Art:** Dienste → Teilnahme behält die Absagen als Teilnahme-Absagen (kein Eintrag in der 409-Liste); Teilnahme →
  Dienste entfernt Teilnahmen und Einladungen wie bisher, Absagen bleiben.
- **Push:** „Dienste fehlen“ geht nicht an Personen, die für das Event abgesagt haben (auch nicht an die verantwortliche Person).

## Bilder-Ordner

Ein Event kann einen Ordner in OneDrive (`Cloud4/Bilder/Datum_Event`) haben: Checkbox im Formular (Vorgabe aus der Vorlage,
`event_vorlagen.bilder_ordner`; Serien-Events nie automatisch) oder Button auf der Event-Seite. Umbenennen bei geänderten
Titel/Datum, Löschen nur wenn leer. Details in `bilder.md`.

## Verantwortliche:r

Ein Event hat optional **genau eine verantwortliche Person** (nur Mitglieder, keine Externen; nicht in Vorlagen und Serien).
Setzen und ändern mit `events:verwalten` im Event-Formular (Feld „Verantwortlich (optional)“, Select „username (Vorname Nachname)“,
leerbar); `events.verantwortlich_sub` ohne Fremdschlüssel, die API prüft ein vorhandenes Profil (sonst 400). Beim Aktualisieren
durch eine Serie bleibt der Wert unverändert (Eingabe ohne `verantwortlichSub`).

- **Anzeige:** `EventDto.verantwortlich` (Mitglied mit `username`, `status`, `anrede`, sonst `null`). Event-Seite „Verantwortlich:
  <Name>“, Kalender-Karten und Tagesübersicht eine kurze Zeile; „Nur meine“ schließt Events mit eigener Verantwortung ein.
- **Kalender-Abo:** Verantwortliche haben das Event automatisch im Feed (wie übernommene Events, nur einmal).
- **Push:** `kalender.aenderung` bei Verschiebung, Absage und Wiederaufnahme geht auch an die verantwortliche Person (nicht an
  die handelnde). Wer neu eingetragen wird (nicht durch sich selbst), bekommt „Du bist verantwortlich für …“. Die Hinweise
  „Fehlende Dienste“ gehen an sie **unabhängig** von ihrer Einstellung (ein Push-Gerät ist nötig), mit eigenem Schlüssel
  `kalender.fehlende_dienste:<eventId>:<beginn>:<m>:verantwortlich` (der Beginn gehört zum Schlüssel, nach einer Verschiebung kommt der Hinweis erneut); die allgemeine Sendung lässt sie aus.

## Seiten

| Seite                                  | Zweck                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/kalender`                            | Umschalter Liste (Karten) / Monat, Wahl wird je Gerät gemerkt. Der gezeigte Monat steht in der URL (`?monat=YYYY-MM`, ohne = aktueller Monat; Wechsel per `replace`, ohne History-Einträge), Zurück-Links der Event-Seiten führen zurück zur Vorseite, ohne Vorseite zum Monat des Events. Monat: auf dem Handy kompaktes Raster (Feld = Kategorie-Farbe, Balken unten = schlechteste Ampel des Tages, Tippen auf einen Tag öffnet die Tagesübersicht: Events des Tages als Karten (Filter gelten) und mit `events:verwalten` der Button „Event an diesem Tag anlegen“ (`/kalender/events/neu?datum=…`); leerer Tag springt dort direkt hin, ohne das Recht ist er nicht antippbar. Handy: Bottom-Drawer, ab `sm` Modal), ab `sm` Raster mit Event-Chips (Chip führt direkt zum Event, Klick auf die Zelle öffnet die Tagesübersicht); Geburtstage als grüne Punkte (siehe „Geburtstage“); Legende; Filter fehlend/meine; die Tagesübersicht zeigt je Dienste-Event pro Schicht die Eingetragenen und „Fehlen noch: n bis Minimum, m bis Wunsch“ bzw. „Voll besetzt“ (abgesagte ohne Zahlen) |
| `/kalender/events/:id`                 | Schichten, Bedarfe, Ein-/Austragen, Externe, Teilnahme, „In mein Kalender-Abo“                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/kalender/events/neu`, `…/bearbeiten` | Formular mit Vorlage + Datum (`?datum=YYYY-MM-DD` belegt es vor, sonst heute), Schicht-Editor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `/kalender/statistik`                  | **Dienstschwein**: Dienste je Person (inkl. Externe) und Dienstform pro Kalenderjahr, dazu die Spalten Aufbau und Putzen (`nachSpalte`: Dienstform-Id, `art:aufbau`, `art:putzen`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `/kalender/einrichtung`                | Dienstformen, Kategorien, Vorlagen, Serien, Externe (Zusammenführen), Erinnerungen (Tab: Zeitpunkte für „Dienste fehlen“ als „1 Woche vorher“ usw., hinzufügen mit Zahl + Einheit)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `/kalender/mein-kalender`              | Kalender-Abo (siehe unten)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Das Dienstschwein zählt jeden Eintrag einmal, nach dem Jahr des Schichtbeginns (Europe/Berlin); abgesagte Events
zählen nicht. Es ist für alle mit `kalender:lesen` sichtbar.

## API: Events und Dienste

Alle Routen unter `/api` in `routes/kalender.ts` (Fotos in `routes/bilder.ts`). Serien-Routen stehen unter [Terminserien](#terminserien).

| Route                                                                 | Recht                 | Hinweise                                                                                                                               |
| --------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /kalender/events?von=&bis=`                                      | `kalender:lesen`      | Events im Zeitraum, mit Schichten, Diensten und eigener Teilnahme; 400 bei `von > bis`                                                 |
| `GET /kalender/geburtstage?von=&bis=`                                 | `kalender:lesen`      | nur Mitglieder, die ihn im Kalender zeigen (siehe „Geburtstage“)                                                                       |
| `GET /kalender/events/:id`                                            | `kalender:lesen`      | ein Event; 404, wenn unbekannt                                                                                                         |
| `POST /kalender/events`                                               | `events:verwalten`    | 201 mit `id`; mit `bilderOrdner` legt es den OneDrive-Ordner an (`bilderHinweis` bei Problemen)                                        |
| `PUT /kalender/events/:id`                                            | `events:verwalten`    | 409 mit `betroffene`/`teilnahmen`, wenn Einträge durch die Änderung entfallen (`EntfernungBestaetigen`), bis das Formular bestätigt    |
| `PUT /kalender/events/:id/absage`                                     | `events:verwalten`    | `{ abgesagt }`                                                                                                                         |
| `DELETE /kalender/events/:id`                                         | `events:verwalten`    | 409, solange Dienste eingetragen sind (dann absagen) oder es ein Protokoll zur Sitzung gibt; räumt einen leeren Bilder-Ordner auf      |
| `PUT /kalender/events/:id/teilnahme`                                  | `kalender:lesen`      | `{ teilnahme }`, nur die eigene Antwort                                                                                                |
| `PUT /kalender/events/:id/verfuegbarkeit`                             | `kalender:lesen`      | `{ verfuegbar, bestaetigt? }`, nur die eigene; 409 mit `dienste`, wenn eigene Dienste entfallen würden, bis `bestaetigt`               |
| `PUT`/`DELETE /kalender/events/:id/abo`                               | `kalender:lesen`      | Event in den eigenen Kalender-Abo-Feed aufnehmen bzw. entfernen                                                                        |
| `POST /kalender/events/:id/bilder-ordner`                             | `bilder:lesen`        | legt den Ordner nachträglich an; 409, wenn schon einer existiert                                                                       |
| `POST /kalender/schichten/:id/dienste`                                | `kalender:lesen`      | Dienst eintragen (`mitgliedSub` oder Externe, Dienstform, Kommentar); jede:r darf jedes Mitglied eintragen, Meldung an die Person; 201 |
| `DELETE /kalender/dienste/:id`                                        | `kalender:lesen`      | Dienst eines Mitglieds darf jede:r entfernen; der einer Externen nur, wer ihn eingetragen hat, oder `events:verwalten` (sonst 403)     |
| `GET /kalender/externe`, `POST /kalender/externe`                     | `kalender:lesen`      | Externe auflisten bzw. anlegen (jede:r darf anlegen)                                                                                   |
| `PUT /kalender/externe/:id`, `POST /kalender/externe/zusammenfuehren` | `kalender:einrichten` | Externe bearbeiten bzw. zusammenführen                                                                                                 |
| `GET /kalender/statistik?jahr=`                                       | `kalender:lesen`      | Dienstschwein                                                                                                                          |

Dienstformen, Kategorien und Vorlagen (`GET /kalender/dienstformen|kategorien|vorlagen` mit `kalender:lesen`; `POST`, `PUT /:id`
und `DELETE /kalender/vorlagen/:id` mit `kalender:einrichten`) sowie `GET`/`PUT /kalender/erinnerungen` (Schreiben mit
`kalender:einrichten`) bilden die Einrichtung. Der ICS-Feed (`GET /kalender/feed/:token`, öffentlich) und der Token
(`/me/kalender-token`) stehen unter „Mein Kalender“.

## Geburtstage

Mitglieder mit Geburtsdatum erscheinen im Kalender (`GET /api/kalender/geburtstage?von&bis`, `kalender:lesen`, höchstens 400 Tage,
Antwort `GeburtstagDto[]`: `datum`, `alter`, Mitglied mit `username`, `status`, `anrede`). Ein 29.2. fällt in Nicht-Schaltjahren auf den 28.2.

- **Sichtbarkeit:** nur Mitglieder mit gesetztem Geburtsdatum und `geburtstag_im_kalender` an (siehe `docs/members.md`).
- **Monat:** je Tag mit Geburtstag ein kleiner grüner Punkt (Handy und Raster ab `sm`), abgesetzt von Event-Farbe, Ampel-Balken und grauem
  Teilnahme-Streifen; Legende „Geburtstag“. Geladen wird der sichtbare Rasterbereich inkl. Nachbartage.
- **Tagesübersicht:** ein Tag nur mit Geburtstagen ist auch ohne `events:verwalten` antippbar. Oben je Geburtstag eine grüne Zeile
  „🎂 <Name> wird 30 Jahre alt“ (Name als `StatusName`, verlinkt), danach die Events; „Event an diesem Tag anlegen“ bleibt mit Recht sichtbar.
- **Liste:** Geburtstage des Monats erscheinen in Datumsreihenfolge zwischen den Event-Karten als kompakte grüne Zeile mit Datum, am selben
  Tag vor den Events. „Nur mit fehlenden Diensten“ blendet sie aus, „Nur meine“ lässt sie stehen.
- Alter: „1 Jahr“, sonst „n Jahre“. Erinnerungen per Push: `docs/benachrichtigungen.md`.

## Mein Kalender (ICS-Abo)

- Seite `/kalender/mein-kalender`. Jede:r hat einen geheimen Feed-Token (Tabelle `kalender_tokens`, nur der
  sha256-Hash wird gespeichert). Der Klartext-Token wird nur direkt nach dem Erzeugen angezeigt; ein neuer Link
  ersetzt den alten (der alte Link geht dann nicht mehr).
- `GET /api/me/kalender-token` (`{ vorhanden }`), `POST /api/me/kalender-token` (`{ token }`).
- `GET /api/kalender/feed/:token(.ics)` ist öffentlich (kein Bearer-Token, in API Gateway eine eigene Route ohne
  Authorizer). Er antwortet mit 404 „Kalender nicht gefunden“, wenn das Mitglied des Tokens deaktiviert ist oder
  `kalender:lesen` nicht (mehr) hat. Er enthält die eigenen Dienste ab 90 Tage zurück, `text/calendar`, `no-store`. Titel
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
vor Beginn, solange das Event rot ist; je Event und Zeitpunkt einmal, nur der kleinste bereits erreichte, nie rückwirkend; für EM standardmäßig aus; nicht an Personen, die für das Event nicht verfügbar sind) und `kalender.aenderung` (Event verschoben,
abgesagt/wieder aktiv, eigene Schicht geändert oder entfernt, von anderen ein- oder ausgetragen; die handelnde Person bekommt
nichts). Ein- und Austragen durch andere: „Leonard hat dich für die 20-Uhr-Schicht bei „Barabend“ am 01.11. eingetragen.“ bzw. „… aus der 20-Uhr-Schicht … ausgetragen.“
(Betrieb: „die/der 20-Uhr-Schicht“, Aufbau: „den/dem Aufbau“, Putzen: „das/dem Putzen“; die handelnde Person als Benutzername, sonst Vorname; Titel „Du wurdest eingetragen/ausgetragen“; Link zum Event) und `kalender.teilnahme_erinnerung` (vor einem Event, an dem man teilnimmt, einstellbar, Standard 60 Minuten). Einstellungen: Seite „Benachrichtigungen“ (`/benachrichtigungen`); „Mein Kalender“ verlinkt dorthin. Die Job-Aufgaben
stehen in `kalenderBenachrichtigungen.ts`. Auf iPhone/iPad nur über „Zum Home-Bildschirm“ (iOS 16.4+).
