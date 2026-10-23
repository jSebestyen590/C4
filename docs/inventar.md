# Inventar

Dauerhaftes Betriebsvermögen des Clubs (Kabeltrommel, Beamer, Pavillons, Spanngurte, ...): **Gegenstände** in einem
Kategorienbaum, mit einer Soll-Anzahl auf einem oder mehreren **Plätzen** im Lagerort-Baum (siehe [waren.md](./waren.md)),
wahlweise in **IFCOs** (Euronormboxen, z. B. „Spanngurtkiste“). Gegenstände lassen sich **verleihen**. Fachlogik
(Schemas, Abweichung, Verliehen-Prüfungen) liegt in `packages/shared/src/inventar.ts`, Speicherung und Regeln in
`packages/api/src/inventar.ts`, Routen in `packages/api/src/app.ts` (Abschnitt `Inventar`). Fehlerklassen und Hilfen
(`WarenUngueltig` → 400, `WarenKonflikt` → 409) kommen aus `packages/api/src/waren.ts`.

## Rechte

- `inventar:lesen` und `inventar:umraeumen` haben alle Status. Umräumen umfasst Plätze ändern, IFCOs umstellen und befüllen sowie
  Verleihen, Zurücknehmen, Bearbeiten und Löschen von Ausleihen (Label „Inventar umräumen und verleihen“).
- `inventar:verwalten` (Stammdaten: Kategorien, Gegenstände, IFCOs anlegen, ändern, archivieren, löschen) haben Admins und die
  Vorstandsposten (Migration `0031`); es lässt sich über `POSTEN_RECHTE` auch weiteren Posten geben.

## Datenmodell

Migrationen `0025`–`0031` (IFCO-Typen und IFCO-Lagerplätze: `0033`–`0036`; ganze IFCO und Organisator: `0037`, `0038`), jeweils ein Statement und eine Down-Datei (siehe [datenbank.md](./datenbank.md); Rollback-Ziel nur für
das Inventar: `0024_vorstandsposten_waren`).

| Tabelle               | Inhalt                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventar_kategorien` | Baum (`parent_id`, `name`, `archiviert`), wie `warengruppen`                                                                                                                     |
| `ifco_typen`          | `name` (z. B. „6410“), `grundflaeche` (`gross` 60×40 / `klein` 40×30), `hoehe_cm`, `archiviert`                                                                                  |
| `ifcos`               | `name`, `beschreibung`, `lagerort_id` (null = ohne Platz), `typ_id` (optional), `archiviert`; nicht verschachtelbar, ein Platz                                                   |
| `gegenstaende`        | `name`, `beschreibung`, `kategorie_id`, `anzahl` (Soll-Gesamtzahl, Standard 1), `archiviert`                                                                                     |
| `gegenstand_plaetze`  | `gegenstand_id`, entweder `lagerort_id` oder `ifco_id` (CHECK), `anzahl` ≥ 1                                                                                                     |
| `ausleihen`           | `an` (Freitext), `ausgeliehen_am`, `rueckgabe_geplant`, `kommentar`, `erstellt_von`, `organisiert_von` (Cognito-`sub` ohne Fremdschlüssel)                                       |
| `ausleihe_positionen` | `ausleihe_id`, `gegenstand_id`, Herkunft `lagerort_id` oder `ifco_id` (CHECK), `anzahl` ≥ 1, `zurueck_am` (null = offen), `ganze_ifco` (true = Teil einer ganz verliehenen IFCO) |

Die Herkunft einer Position ist ein Ort, keine Zuordnungs-Id; Umräumen zerstört so die Historie nicht.

## IFCO-Typen und IFCO-Lagerplätze

IFCOs sind Euronormboxen mit nur **zwei Grundflächen**: groß 60×40 und klein 40×30 (zwei kleine = eine große); die Höhe variiert
(10, 13, 16, 22 cm …). Ein **IFCO-Typ** (Stammdaten, Tab „IFCO-Typen“ unter `/inventar/stammdaten`) hält Name, Grundfläche und Höhe;
jede IFCO hat optional einen Typ (`typId`). Typ löschen nur ungenutzt (409, sonst archivieren); archivierte Typen sind nicht mehr wählbar.

Ein Lagerort kann **IFCO-Lagerplatz** sein (Felder und Regeln in [waren.md](./waren.md)): `ifcoHoeheCm` und `ifcoStellflaechen`.
Dort stehen IFCOs und lose Gegenstände; Ware kann dort nur liegen, solange keine IFCO dort steht (und umgekehrt, siehe waren.md).

**Kapazitätsmodell** (`packages/shared/src/ifco.ts`, `ifcosPassen`): Der Boden besteht aus `2 × Stellflächen` Halbspalten, jede
`ifcoHoeheCm` hoch. Eine kleine IFCO belegt eine Halbspalte mit ihrer Höhe, eine große zwei beliebige Halbspalten (Reihenfolge und
Lage egal) mit ihrer Höhe in jeder. Es passt, wenn sich alle IFCOs so zuordnen lassen, dass keine Halbspalte ihre Höhe überschreitet
(exakte Suche mit Backtracking: hohe und große zuerst, gleiche Restkapazitäten nur einmal, gescheiterte Zustände gemerkt; höchstens 30
IFCOs, mehr passen nie; gerechnet in Zehntel-cm). Eine große IFCO darf also auf zwei Halbspalten **unterschiedlicher Höhe** ruhen – eine
bewusste Vereinfachung. `nochPlatzFuer` liefert je nicht archiviertem Typ, wie viele weitere noch passen. Archivierte IFCOs belegen
keinen Platz (sie sind leer).

Regeln (alle 400 mit deutscher Meldung, die den Platz, was dort steht und was nicht passt nennt: „Passt nicht auf „HR11“ (20 cm hoch,
1 Stellfläche): dort stehen Spanngurtkiste (6410, 10 cm), …; „Strom-IFCO“ (6416, 16 cm) hat keinen Platz mehr.“):
IFCO anlegen/ändern/umstellen (`PUT /ifcos/:id/platz`) auf einen IFCO-Lagerplatz, Typ einer dort stehenden IFCO ändern, Wiederherstellen
einer archivierten IFCO, Grundfläche/Höhe eines Typs ändern (jeder IFCO-Lagerplatz mit IFCOs dieses Typs muss danach noch passen),
Maße eines IFCO-Lagerplatzes ändern (nicht unter den Inhalt) oder ihn markieren. Zusätzlich ist jede IFCO auf einem IFCO-Lagerplatz mit Warenbestand ≠ 0 400 „Auf „HR11“ liegt Ware; dort kann keine IFCO stehen.“ IFCOs ohne Typ dürfen nicht auf einen IFCO-Lagerplatz.
Das Aufheben der Markierung ist immer erlaubt. Normale Lagerorte sind für IFCOs unbeschränkt. Die Prüfung steht in
`packages/api/src/ifcoPlatz.ts` und läuft in den Transaktionen der Stores.

## Regeln

- **Soll-Zustand:** Die Plätze sagen, wo etwas hingehört. Es gibt keine Buchungshistorie; Umräumen überschreibt. Die Summe der
  Plätze darf vom Soll abweichen (`inventarAbweichung`, `abweichungText`: „2 ohne Platz“, „1 mehr als Soll“).
- **Plätze:** `PUT …/plaetze` ersetzt alle Plätze eines Gegenstands, `PUT …/inhalt` alle Zuordnungen einer IFCO, in einer Transaktion.
  Je Gegenstand ist jeder Lagerort/jede IFCO nur einmal erlaubt, Anzahl ≥ 1. Ziele müssen existieren und dürfen nicht archiviert
  sein (400; bereits zugeordnete archivierte Ziele bleiben erlaubt). Ein archivierter Gegenstand behält seine Plätze, ist aber nicht
  mehr umräumbar (400). `PUT …/ifcos/:id/platz { lagerortId | null }` stellt die IFCO um.
- **Löschen** geht nur, wenn nichts verweist (409, sonst archivieren): Kategorie (Unterkategorien, Gegenstände), Gegenstand
  (Plätze, Ausleihen), IFCO (Inhalt, Ausleihen). **Archivieren:** Kategorie archiviert den Teilbaum (Wiederherstellen braucht
  eine nicht archivierte Eltern-Kategorie); IFCO nur leer und ohne offene Ausleihe.
- **Lagerorte:** Löschen prüft zusätzlich IFCOs, Plätze und Ausleihen. Archivieren ist mit IFCOs oder direkt zugeordneten Gegenständen
  im Teilbaum nicht möglich („Im Lagerort liegt noch Inventar. Räume es zuerst um.“) und nicht, solange von dort etwas verliehen ist.
- **Ausleihe:** Eine Position nennt Gegenstand, Herkunft (Lagerort oder IFCO) und Anzahl. Die Herkunft muss eine bestehende
  Zuordnung des Gegenstands sein, die Anzahl höchstens **zugeordnet minus die höchste gleichzeitige Belegung** durch andere offene
  Positionen am selben Platz im gewünschten Zeitraum (`ausleihFehler`, 400 mit Gegenstand und Platz); archivierte Gegenstände sind
  nicht verleihbar. Die Plätze bleiben beim Verleihen unverändert. Gegenstand und Herkunft sind je Ausleihe eindeutig.
- **Zeitraum (ganze Tage, Europe/Berlin):** `rueckgabeGeplant` (Datum) ist **Pflicht** beim Anlegen und bei `PUT` („Bitte gib an, wann es
  zurückkommt.“) und darf nicht vor dem Starttag (Berliner Tag von `ausgeliehenAm`) liegen. Eine Ausleihe belegt ihre Teile an den Tagen
  **[Starttag, Rückgabetag)**: der Rückgabetag ist wieder frei, eine neue Ausleihe darf dort beginnen. Rückgabe am Starttag belegt genau
  diesen einen Tag. Zurückgegebene Positionen (`zurueckAm`) belegen nichts mehr. Ältere Ausleihen ohne Rückgabedatum sind offen: sie
  belegen, bis tatsächlich zurückgegeben wird. **Überfällig** (offen, Rückgabetag ≤ heute) belegt weiter bis einschließlich heute
  (Ende = max(Rückgabetag, heute + 1)); als „überfällig“ angezeigt wird sie ab Rückgabetag < heute.
  Reine Funktionen in `packages/shared/src/inventarZeitraum.ts` (`ausleiheTage`, `belegteTage`, `maximaleBelegung` als Sweep über Tagesintervalle,
  `zeitraumText`, `seitAbText`-Grundlage `beginnText`); `freiImZeitraum` und die Prüfungen in `inventar.ts` nutzen sie, ebenso der Client.
  Beim Ändern der Daten per `PUT` werden die eigenen offenen Positionen erneut gegen alle anderen geprüft (die Ausleihe selbst zählt nicht).
- **Gefährdet:** Eine noch nicht begonnene Ausleihe ist „gefährdet“, wenn am selben Gegenstand und Platz eine überfällige offene Ausleihe
  hängt und sie nicht mehr passen würde, falls deren Teile nie zurückkämen (die überfälligen zählen dann für ihren ganzen Zeitraum;
  `gefaehrdungen` in shared). Die Antwort trägt `gefaehrdetDurch: [{ id, an }]`; Anzeige als Badge „Gefährdet: <an> ist überfällig“.
- **Ganze IFCO:** Positionen mit `ganzeIfco: true` (nur mit `ifcoId`) gehören zu einer ganz verliehenen IFCO. Dann müssen alle Positionen dieser
  IFCO in der Ausleihe so markiert sein und je Gegenstand genau das im Zeitraum Verfügbare nehmen (zugeordnet minus höchste gleichzeitige
  Belegung, `ganzeIfcoFehler`; sonst 400, auch wenn nichts verfügbar ist). Die Markierung bleibt an den Positionen; Teilrückgaben einzelner
  Positionen sind weiter möglich. Eine IFCO mit offener markierter Position gilt als verliehen bzw. vorgemerkt (`ausleihe` an der IFCO, der
  aktuell verliehenen Ausleihe zuerst). Gruppierung für die Anzeige: `positionenGruppieren` (shared).
- **Organisator:** Jede Ausleihe hat `organisiertVon` (Pflicht beim Anlegen und Bearbeiten; muss ein bestehendes Mitglied sein, sonst 400).
  Ältere Ausleihen ohne Wert nutzen `erstellt_von` als Ersatz.
- **Vorgemerkt:** Eine offene Position einer Ausleihe mit `ausgeliehenAm` in der Zukunft ist **vorgemerkt**, nicht verliehen; ab
  `ausgeliehenAm <= jetzt` ist sie **verliehen** („gerade weg“). Vorgemerktes bleibt **reserviert**: Umräumen und
  Archivieren zählen verliehen und vorgemerkt zusammen; für die Verfügbarkeit zählt der Zeitraum (siehe oben). Die Anzeige von
  `verliehen` (jetzt weg) und `vorgemerkt` (beginnt später) bleibt unverändert. „Jetzt“ ist die Serverzeit der Anfrage. Aufteilung und Status:
  `offenAufteilen`, `ausleiheStatus` in `packages/shared/src/inventar.ts`.
- **Wer blockiert:** Scheitert eine Prüfung an Verliehenem oder Vorgemerktem, nennt die Meldung nur die Ausleihen, die den angefragten
  Zeitraum überschneiden, mit Person und Zeitraum („…nur noch 1 verfügbar: 3 an Feuerwehr verliehen (20.10.–27.10.2026), 2 an
  Jugendgruppe vorgemerkt (25.10.–26.10.2026).“; überfällig: „… verliehen (überfällig seit 27.10.2026)“; ohne Rückgabedatum „(seit
  20.10.2026)“ bzw. „(ab 25.10.2026)“; `blockierungen`/`blockierungText`). Auf `AusleihePage` bleiben auch im Zeitraum vollständig belegte
  Plätze sichtbar (Feld gesperrt, „Verfügbar: 0“); dort steht dieselbe Aufstellung (Personen verlinkt) als Hinweis und bei Überschreitung
  in der orangen Warnung.
- **Seit / ab:** Texte zum Beginn einer Ausleihe laufen über einen Helfer (`beginnText` in shared, `seitAbText` im Web): Beginn in der
  Zukunft „ab …“, sonst „seit …“ (Karten, Detail, Gegenstand-Notizen, IFCO-Badges, Blockierer-Hinweise).
- **Rückgabe** je Position (Teilrückgaben möglich), nur für offene Positionen dieser Ausleihe und nicht vor dem Ausleihzeitpunkt (400).
  Eine Ausleihe ist `erledigt`, wenn alle Positionen zurück sind. `DELETE` entfernt eine Ausleihe samt Positionen (Fehleintrag).
- **Umräumen unter Verliehenes** (Platz entfernen oder Anzahl senken, `verliehenFehler`, ebenso IFCO-Inhalt und Archivieren von IFCO/Lagerort) wird
  abgelehnt, wenn die Zuordnung unter die höchste gleichzeitige Belegung ab heute fällt (alle offenen Positionen, offene ohne Rückgabedatum zählen
  für immer; 409 „Davon sind noch 3 verliehen oder vorgemerkt: …“ mit den blockierenden Ausleihen).
- `erstellt_von` einer Ausleihe ist die `sub` der anfragenden Person; wer sie organisiert hat, steht in `organisiert_von`.

## API

| Route                                                                                                                                                         | Recht                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `GET /api/inventar/kategorien`, `/gegenstaende`, `/gegenstaende/:id`, `/ifcos`, `/ifcos/:id`, `/ifco-typen` (Listen mit `?archiv=1`)                          | `inventar:lesen`     |
| `GET /api/inventar/ausleihen[?status=offen]`, `GET /api/inventar/ausleihen/:id`                                                                               | `inventar:lesen`     |
| `POST/PUT/DELETE` auf `/api/inventar/kategorien`, `/gegenstaende`, `/ifcos`, `/ifco-typen`; `PUT …/:id/archiv { archiviert }`                                 | `inventar:verwalten` |
| `PUT /api/inventar/gegenstaende/:id/plaetze { plaetze: [{ lagerortId?, ifcoId?, anzahl }] }`                                                                  | `inventar:umraeumen` |
| `PUT /api/inventar/ifcos/:id/platz { lagerortId \| null }`, `PUT /api/inventar/ifcos/:id/inhalt { positionen: [{ gegenstandId, anzahl }] }`                   | `inventar:umraeumen` |
| `POST /api/inventar/ausleihen` (→ `201 { id }`), `POST …/ausleihen/:id/rueckgabe { positionIds, zurueckAm }`, `PUT …/ausleihen/:id`, `DELETE …/ausleihen/:id` | `inventar:umraeumen` |

Antworten: `GET /gegenstaende[/:id]` liefert je Gegenstand `plaetze: [{ id, lagerortId, ifcoId, anzahl, verliehen }]` (`verliehen` =
Menge, die jetzt weg ist, `vorgemerkt` = offene Menge zukünftiger Ausleihen von dieser Herkunft) und `verliehen` / `vorgemerkt` gesamt; `GET /ifcos[/:id]` liefert `inhalt: [{ gegenstandId, anzahl }]` und `ausleihe: { id, an, status, ausgeliehenAm } | null` (offene Ausleihe der ganzen IFCO, `status` `geplant` oder `verliehen`); eine
Ausleihe liefert `erledigt`, `status` (`geplant` = beginnt in der Zukunft, `verliehen`, `erledigt`), `positionen` (mit `zurueckAm`, `ganzeIfco`) und
`gefaehrdetDurch: [{ id, an }]` und `organisator: { sub, username, vorname, nachname, status, anrede } | null` (`username` aus Cognito, null ohne);
`?status=offen` liefert geplante und verliehene. So rechnet der Client die Lager-Ansicht selbst aus. Unbekannte
Ids sind 404, ungültige Eingaben und verletzte Fachregeln 400, Konflikte 409. `PUT /ausleihen/:id` ändert nur `an`, `organisiertVon`,
`ausgeliehenAm`, `rueckgabeGeplant` (Pflicht) und `kommentar` und prüft den neuen Zeitraum gegen andere Ausleihen. Die Liste enthält je Ausleihe `ausgeliehenAm`,
`rueckgabeGeplant` und die Positionen; der Client rechnet damit die Verfügbarkeit im gewählten Zeitraum selbst (`verfuegbarImZeitraum`).

## Oberfläche

Mobile first; Navigationseintrag „Inventar“ (`inventar:lesen`). Die Seiten lesen die Listen über `useInventar()`
(`inventarDaten.ts`, Query-Keys `['inventar', 'kategorien' | 'gegenstaende' | 'ifcos']`, Archiviertes inklusive, Filter im Client);
jede Änderung macht `['inventar']` ungültig.

- `/inventar`: Umschalter „Gegenstände“ / „IFCOs“ / „Verliehen“ (`?ansicht=ifcos|verliehen`), Suche (bei
  Gegenständen Name, Beschreibung, IFCO und Lagerort-Pfad der Plätze; bei IFCOs Name, Platz, Inhalt), Kategoriefilter inkl.
  Unterkategorien (nur bei Gegenständen), Archiv-Schalter. Sortierung (Select „Sortieren nach“, Standard Name): Name, Kategorie (Pfad, dann Name), Anzahl (absteigend), Platz (erster Platz, ohne Platz zuletzt), deutsch verglichen (`gegenstaendeSortieren` in `inventarAnzeige.ts`); in der Tabelle sortieren auch die Spaltenköpfe, ein zweiter Klick kehrt um. Auf dem Handy sind es Karten, ab `sm` eine Tabelle (Name mit Beschreibung, Kategorie, Anzahl, Plätze mit „3 verliehen“ in Lila und „2 vorgemerkt“ in Cyan, Status mit Abweichung/Archiviert); die ganze Zeile öffnet den Gegenstand. Karten zeigen Plätze mit Pfad („6×“ im Kopf, am Platz „Lager › Regal · 3 verliehen · 2 vorgemerkt“; die Verleih-Hinweise stehen nur an den Plätzen) und ein oranges Badge
  bei Abweichung (`inventarAbweichung`/`abweichungText`). Mit `inventar:verwalten`: „Gegenstand anlegen“ / „IFCO anlegen“ und „Kategorien“.
  „Gegenstand anlegen“ fragt optional gleich einen Platz ab (Lagerort oder IFCO, `POST /gegenstaende` mit
  `platz { lagerortId | ifcoId, anzahl }`, im selben Schritt geprüft und gespeichert); die Anzahl dort ist standardmäßig die ganze
  Soll-Anzahl und folgt ihr, bis man sie ändert (bei Soll 1 ohne Feld). Danach bleibt man auf der Übersicht.
- `/inventar/gegenstaende/:id`: Stammdaten, Soll gegen zugeordnet, Plätze mit Pfad und Anzahl (IFCOs verlinkt). „Plätze ändern“
  (`inventar:umraeumen`, `GegenstandPlaetzeModal`): je Zeile durchsuchbares Ziel (gruppiert „Plätze“ / „IFCOs“, bereits gewählte
  gesperrt) und Anzahl, Live-Summe gegen Soll. Bei Soll 1 gibt es nur ein Feld „Platz“ (leerbar = „Kein Platz“), ohne Anzahl, Nummerierung, „Platz hinzufügen“ und Summe. Menü Bearbeiten, Archivieren, Löschen (`inventar:verwalten`; 409 bietet Archivieren an).
- `/inventar/ifcos/:id`: Platz mit „Umstellen“ (`IfcoUmstellenModal`, auch „ohne Platz“), Inhalt als Liste (rechts nur die Anzahl, darunter wie beim Gegenstand je Ausleihe „verliehen: 9 (an …)“ / „vorgemerkt: 10 ab … (an …)“, `PlatzAusleihHinweise`), „Inhalt bearbeiten“
  (`IfcoInhaltModal`, `inventar:umraeumen`; Gegenstände mit Soll 1 ohne Mengenfeld), Menü wie beim Gegenstand.
- `/inventar/stammdaten`: Tab „Kategorien“ (Baum) und Tab „IFCO-Typen“ (`IfcoTypenTab`, Karten mit Name und „60×40 · 10 cm“;
  `IfcoTypFormular` mit Umschalter Grundfläche groß/klein und Höhe in cm). Bearbeiten nur mit `inventar:verwalten`.
- IFCOs: `IfcoFormular` hat ein durchsuchbares Typ-Feld („6410 · 60×40 · 10 cm“); Karten und Detailseite zeigen den Typ. In
  `IfcoFormular` und `IfcoUmstellenModal` zeigen IFCO-Lagerplätze „passt“ bzw. sind mit „passt nicht“ / „Typ nötig“ gesperrt (dieselbe
  Funktion wie die API, `ifcoPlatz.ts`).
- Kacheln normaler Böden nennen bei genau einem Eintrag (eine Ware mit Bestand, eine IFCO oder ein direkt zugeordneter Gegenstand, je nach
  Schaltern) dessen Namen statt des Zählers (`kachelInhalt` in `lagerAnsicht.ts`); ab zwei Einträgen bleibt der Zähler.
- Lager-Seite: IFCO-Lagerplätze tragen ein Kisten-Symbol und listen, wenn dort nur IFCOs stehen, alle IFCO-Namen untereinander (alphabetisch, je Zeile gekürzt, ab vier IFCOs zwei Namen und „+N“, alle Namen im Titel); liegen dort auch lose Gegenstände oder Ware, gilt die normale Regel (ein Eintrag mit Namen, sonst Zähler); Karte und Drawer nennen „20 cm hoch · 1 Stellfläche“, die
  stehenden IFCOs mit Typ und „Passt noch: 1× 6410 oder 2× 4310“ bzw. „Voll“ (`passtNochText`). `LagerortFormular` hat den Schalter
  „IFCO-Lagerplatz“ mit Höhe und Stellflächen (gesperrt mit Hinweis bei Unterebenen), beim Regal und im Dialog „Böden hinzufügen“ den
  Schalter „Als IFCO-Lagerplätze anlegen“ (`IfcoPlatzFelder`).
- **Anzahl 1 wird nicht angezeigt:** Die meisten Gegenstände gibt es nur einmal, deshalb steht „1×“ nirgends (Karten, Kopf-Badge „Soll“, Plätze,
  IFCO-Inhalt, Ausleihe-Positionen, Bestätigungsdialog, Lager-Seite); ab 2 bleibt es („6× Spanngurt 6m“). Zentral in `inventarAnzeige.ts`
  (`anzahlText`, `mengeName`, `mengeText`, `positionText`). Zahlenfelder bleiben unverändert.
- Wiederverwendbar: `BaumVerwaltung`/`BaumKnotenFormular` (Baum aus Name und Eltern; Texte, API-Aufrufe, Query-Keys und Recht als
  `BaumKonfiguration`) tragen `WarengruppenTab` und `KategorienTab`. `inventarAnzeige.ts` bündelt Select-Optionen und Anzeigetexte.

- Ansicht „Verliehen“ (`VerlieheneAnsicht`): offene Ausleihen als Karten, verliehene zuerst, dann vorgemerkte nach Beginn (`AusleiheKarte`: an wen mit Badge „Verliehen“ / „Vorgemerkt“, darunter kompakt der Zeitraum „25.10.2026 09:00 – 27.10.2026“ (`ZeitraumKurz`;
  überfällig rot mit „· überfällig“; ohne geplante Rückgabe „Seit …“ / „Ab …“), in der nächsten Zeile der Organisator, Badge „Gefährdet: <an> ist überfällig“, Positionen „3× Kabeltrommel aus Lager › Regal“), Schalter „Auch erledigte anzeigen“, Suche, Button „Verleihen“
  (`inventar:umraeumen`). Daten über `useAusleihen(nurOffen)` / `useAusleihe(id)` (Keys `['inventar','ausleihen',…]`); jede Änderung macht
  `['inventar']` ungültig, damit auch `verliehen` an Gegenständen und IFCOs nachzieht.
- `/inventar/ausleihen/neu` (`AusleihePage`, `inventar:umraeumen`): An wen, „Organisiert von“ (durchsuchbare Mitgliederliste, vorbelegt mit dir selbst), Zeitpunkt (jetzt, änderbar), geplante Rückgabe (Pflicht, mit Sternchen),
  Kommentar; Gegenstand per Suche hinzufügen, je Platz das im gewählten Zeitraum Verfügbare (ändert sich mit Zeitpunkt und Rückgabe; ohne Rückgabedatum rechnet die Seite offen) als Zahlenfeld
  – bei einem Platz mit zugeordneter Anzahl 1 stattdessen ein Schalter „Verleihen aus <Pfad>“ (≥ 44 px, `standardMenge`): hat der Gegenstand nur
  diesen einen Platz und ist er frei, ist er mit dem Hinzufügen schon gewählt; sonst gesperrt mit Hinweis, wer ihn hat. Ganze IFCOs übernehmen als
  Standard das Verfügbare (Platzhalter = verfügbar; mehr als verfügbar: orange mit Fehler, Absenden gesperrt). „Ganze IFCO verleihen“ übernimmt den verfügbaren Inhalt
  einer IFCO; sie wird als **ganze IFCO** verliehen, solange der volle verfügbare Inhalt eingetragen bleibt (der Bestätigungsdialog zeigt dann „Spanngurtkiste (ganze IFCO)“, sonst werden die Teile einzeln verliehen). Vorbelegung über `?gegenstand=<id>` und `?ifco=<id>` (Buttons „Verleihen“ auf den Detailseiten). Bestätigungsdialog mit dem Zeitraum („Vom 25.10.2026 09:00 bis 27.10.2026“ bzw. „Seit … bis …“) und allen
  Positionen, danach Weiterleitung zur neuen Ausleihe.
- `/inventar/ausleihen/:id` (`AusleiheDetailPage`): Kopf, Positionen mit Häkchen und „Zurückgeben“ (Zeitpunkt, Standard jetzt; Teilrückgabe
  möglich), zurückgegebene Positionen mit Datum. Die ganze Karte einer Position ist anklickbar (öffnet den Gegenstand, per Tastatur erreichbar); das Häkchen
  (44 px Trefferfläche) wählt unabhängig davon. Ganz verliehene IFCOs erscheinen als eine Karte „Spanngurtkiste (ganze IFCO)“ (öffnet die IFCO) mit
  Gruppen-Häkchen für alle offenen Positionen und den Inhalten als Unterliste, einzeln wählbar. Unter der Überschrift steht „Organisiert von <Username>“
  (Username, ohne Username „Vorname Nachname“; fett in der Statusfarbe, auf der Detailseite zum Mitglied verlinkt; im Auswahlfeld „username (Vorname Nachname)“); ebenso auf `AusleiheKarte`, die ganze IFCOs als eine Zeile mit kompaktem Inhalt zeigt. Bei vorgemerkten Ausleihen gibt es keine Rückgabe, nur Bearbeiten und Löschen. Menü „Bearbeiten“ (`AusleiheBearbeitenModal`: an, Organisator, Zeitpunkt, geplante Rückgabe (Pflicht), Kommentar)
  und „Löschen“ (`inventar:umraeumen`).
- Gegenstand-Detailseite: je Platz „verliehen: 3 (an …)“ und „vorgemerkt: 2 ab 25.10.2026 10:00 (an …)“ mit Link, Liste der Ausleihen des Gegenstands (offene zuerst), Button „Verleihen“
  (nicht archiviert, nur solange etwas verfügbar ist). IFCO-Detailseite: „Ganze IFCO verleihen“, bei einer ganz verliehenen IFCO ein Badge „Verliehen an <an> seit …“ bzw. „Vorgemerkt für <an> ab …“ (verlinkt); IFCO-Karten tragen „Verliehen an …“, die Lager-Seite „Spanngurtkiste · … · verliehen an Feuerwehr“. Am Gegenstand steht beim Platz „(…, mit der ganzen IFCO)“.
- Lager-Seite: zeigt das Inventar je Knoten (in Karten und im Drawer von Stellplatz-Kacheln; bei Kacheln zählen IFCOs und direkt zugeordnete
  Gegenstände im Zähler, eine offene Inventur trägt ein Symbol), siehe [waren.md](./waren.md).
