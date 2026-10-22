# Inventar

Dauerhaftes Betriebsvermögen des Clubs (Kabeltrommel, Beamer, Pavillons, Spanngurte, ...): **Gegenstände** in einem
Kategorienbaum, mit einer Soll-Anzahl auf einem oder mehreren **Plätzen** im Lagerort-Baum (siehe [waren.md](./waren.md)),
wahlweise in **Ifcos** (Euronormboxen, z. B. „Spanngurtkiste“). Gegenstände lassen sich **verleihen**. Fachlogik
(Schemas, Abweichung, Verliehen-Prüfungen) liegt in `packages/shared/src/inventar.ts`, Speicherung und Regeln in
`packages/api/src/inventar.ts`, Routen in `packages/api/src/app.ts` (Abschnitt `Inventar`). Fehlerklassen und Hilfen
(`WarenUngueltig` → 400, `WarenKonflikt` → 409) kommen aus `packages/api/src/waren.ts`.

## Rechte

- `inventar:lesen` und `inventar:umraeumen` haben alle Status. Umräumen umfasst Plätze ändern, Ifcos umstellen und befüllen sowie
  Verleihen, Zurücknehmen, Bearbeiten und Löschen von Ausleihen (Label „Inventar umräumen und verleihen“).
- `inventar:verwalten` (Stammdaten: Kategorien, Gegenstände, Ifcos anlegen, ändern, archivieren, löschen) haben Admins und die
  Vorstandsposten (Migration `0031`); es lässt sich über `POSTEN_RECHTE` auch weiteren Posten geben.

## Datenmodell

Migrationen `0025`–`0031` (Ifco-Typen und Ifco-Lagerplätze: `0033`–`0036`), jeweils ein Statement und eine Down-Datei (siehe [datenbank.md](./datenbank.md); Rollback-Ziel nur für
das Inventar: `0024_vorstandsposten_waren`).

| Tabelle               | Inhalt                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `inventar_kategorien` | Baum (`parent_id`, `name`, `archiviert`), wie `warengruppen`                                                                   |
| `ifco_typen`          | `name` (z. B. „6410“), `grundflaeche` (`gross` 60×40 / `klein` 40×30), `hoehe_cm`, `archiviert`                                |
| `ifcos`               | `name`, `beschreibung`, `lagerort_id` (null = ohne Platz), `typ_id` (optional), `archiviert`; nicht verschachtelbar, ein Platz |
| `gegenstaende`        | `name`, `beschreibung`, `kategorie_id`, `anzahl` (Soll-Gesamtzahl, Standard 1), `archiviert`                                   |
| `gegenstand_plaetze`  | `gegenstand_id`, entweder `lagerort_id` oder `ifco_id` (CHECK), `anzahl` ≥ 1                                                   |
| `ausleihen`           | `an` (Freitext), `ausgeliehen_am`, `rueckgabe_geplant`, `kommentar`, `erstellt_von` (Cognito-`sub` ohne Fremdschlüssel)        |
| `ausleihe_positionen` | `ausleihe_id`, `gegenstand_id`, Herkunft `lagerort_id` oder `ifco_id` (CHECK), `anzahl` ≥ 1, `zurueck_am` (null = offen)       |

Die Herkunft einer Position ist ein Ort, keine Zuordnungs-Id; Umräumen zerstört so die Historie nicht.

## Ifco-Typen und Ifco-Lagerplätze

Ifcos sind Euronormboxen mit nur **zwei Grundflächen**: groß 60×40 und klein 40×30 (zwei kleine = eine große); die Höhe variiert
(10, 13, 16, 22 cm …). Ein **Ifco-Typ** (Stammdaten, Tab „Ifco-Typen“ unter `/inventar/stammdaten`) hält Name, Grundfläche und Höhe;
jede Ifco hat optional einen Typ (`typId`). Typ löschen nur ungenutzt (409, sonst archivieren); archivierte Typen sind nicht mehr wählbar.

Ein Lagerort kann **Ifco-Lagerplatz** sein (Felder und Regeln in [waren.md](./waren.md)): `ifcoHoeheCm` und `ifcoStellflaechen`.
Dort stehen Ifcos (und lose Gegenstände), aber keine Ware.

**Kapazitätsmodell** (`packages/shared/src/ifco.ts`, `ifcosPassen`): Der Boden besteht aus `2 × Stellflächen` Halbspalten, jede
`ifcoHoeheCm` hoch. Eine kleine Ifco belegt eine Halbspalte mit ihrer Höhe, eine große zwei beliebige Halbspalten (Reihenfolge und
Lage egal) mit ihrer Höhe in jeder. Es passt, wenn sich alle Ifcos so zuordnen lassen, dass keine Halbspalte ihre Höhe überschreitet
(exakte Suche mit Backtracking: hohe und große zuerst, gleiche Restkapazitäten nur einmal, gescheiterte Zustände gemerkt; höchstens 30
Ifcos, mehr passen nie; gerechnet in Zehntel-cm). Eine große Ifco darf also auf zwei Halbspalten **unterschiedlicher Höhe** ruhen – eine
bewusste Vereinfachung. `nochPlatzFuer` liefert je nicht archiviertem Typ, wie viele weitere noch passen. Archivierte Ifcos belegen
keinen Platz (sie sind leer).

Regeln (alle 400 mit deutscher Meldung, die den Platz, was dort steht und was nicht passt nennt: „Passt nicht auf „HR11“ (20 cm hoch,
1 Stellfläche): dort stehen Spanngurtkiste (6410, 10 cm), …; „Strom-Ifco“ (6416, 16 cm) hat keinen Platz mehr.“):
Ifco anlegen/ändern/umstellen (`PUT /ifcos/:id/platz`) auf einen Ifco-Lagerplatz, Typ einer dort stehenden Ifco ändern, Wiederherstellen
einer archivierten Ifco, Grundfläche/Höhe eines Typs ändern (jeder Ifco-Lagerplatz mit Ifcos dieses Typs muss danach noch passen),
Maße eines Ifco-Lagerplatzes ändern (nicht unter den Inhalt) oder ihn markieren. Ifcos ohne Typ dürfen nicht auf einen Ifco-Lagerplatz.
Das Aufheben der Markierung ist immer erlaubt. Normale Lagerorte sind für Ifcos unbeschränkt. Die Prüfung steht in
`packages/api/src/ifcoPlatz.ts` und läuft in den Transaktionen der Stores.

## Regeln

- **Soll-Zustand:** Die Plätze sagen, wo etwas hingehört. Es gibt keine Buchungshistorie; Umräumen überschreibt. Die Summe der
  Plätze darf vom Soll abweichen (`inventarAbweichung`, `abweichungText`: „2 ohne Platz“, „1 mehr als Soll“).
- **Plätze:** `PUT …/plaetze` ersetzt alle Plätze eines Gegenstands, `PUT …/inhalt` alle Zuordnungen einer Ifco, in einer Transaktion.
  Je Gegenstand ist jeder Lagerort/jede Ifco nur einmal erlaubt, Anzahl ≥ 1. Ziele müssen existieren und dürfen nicht archiviert
  sein (400; bereits zugeordnete archivierte Ziele bleiben erlaubt). Ein archivierter Gegenstand behält seine Plätze, ist aber nicht
  mehr umräumbar (400). `PUT …/ifcos/:id/platz { lagerortId | null }` stellt die Ifco um.
- **Löschen** geht nur, wenn nichts verweist (409, sonst archivieren): Kategorie (Unterkategorien, Gegenstände), Gegenstand
  (Plätze, Ausleihen), Ifco (Inhalt, Ausleihen). **Archivieren:** Kategorie archiviert den Teilbaum (Wiederherstellen braucht
  eine nicht archivierte Eltern-Kategorie); Ifco nur leer und ohne offene Ausleihe.
- **Lagerorte:** Löschen prüft zusätzlich Ifcos, Plätze und Ausleihen. Archivieren ist mit Ifcos oder direkt zugeordneten Gegenständen
  im Teilbaum nicht möglich („Im Lagerort liegt noch Inventar. Räume es zuerst um.“) und nicht, solange von dort etwas verliehen ist.
- **Ausleihe:** Eine Position nennt Gegenstand, Herkunft (Lagerort oder Ifco) und Anzahl. Die Herkunft muss eine bestehende
  Zuordnung des Gegenstands sein, die Anzahl höchstens zugeordnet minus alle offenen Positionen (verliehen und vorgemerkt,
  `ausleihFehler`, 400 mit Gegenstand und Platz); archivierte Gegenstände sind nicht verleihbar. Die Plätze bleiben beim Verleihen
  unverändert. Gegenstand und Herkunft sind je Ausleihe eindeutig.
- **Vorgemerkt:** Eine offene Position einer Ausleihe mit `ausgeliehenAm` in der Zukunft ist **vorgemerkt**, nicht verliehen; ab
  `ausgeliehenAm <= jetzt` ist sie **verliehen** („gerade weg“). Vorgemerktes bleibt **reserviert**: Verfügbarkeit, Umräumen und
  Archivieren zählen verliehen und vorgemerkt zusammen. „Jetzt“ ist die Serverzeit der Anfrage. Aufteilung und Status:
  `offenAufteilen`, `ausleiheStatus` in `packages/shared/src/inventar.ts`.
- **Wer blockiert:** Scheitert eine Prüfung an Verliehenem oder Vorgemerktem (`ausleihFehler`, `verliehenFehler`, Ifco-/Lagerort-Archivieren),
  nennt die Meldung die Ausleihen mit Person und Datum („…nur noch 1 verfügbar: 3 an Feuerwehr verliehen (seit 20.10.2026), 2 an
  Jugendgruppe vorgemerkt (ab 25.10.2026).“; `blockierungen`/`blockierungText`, Datum dd.MM.yyyy, Europe/Berlin). Auf `AusleihePage` bleiben auch vollständig verliehene/vorgemerkte Plätze sichtbar (Feld gesperrt, „Verfügbar: 0“), damit man sieht, an wen; ebenso bei „Ganze Ifco verleihen“. Dort steht dieselbe
  Aufstellung (Personen verlinkt) als Hinweis unter dem Mengenfeld, sobald am Platz etwas verliehen oder vorgemerkt ist, und bei Überschreitung
  in der orangen Warnung.
- **Rückgabe** je Position (Teilrückgaben möglich), nur für offene Positionen dieser Ausleihe und nicht vor dem Ausleihzeitpunkt (400).
  Eine Ausleihe ist `erledigt`, wenn alle Positionen zurück sind. `DELETE` entfernt eine Ausleihe samt Positionen (Fehleintrag).
- **Umräumen unter Verliehenes** (Platz entfernen oder Anzahl senken, `verliehenFehler`) wird abgelehnt (409 „Davon sind noch 3 verliehen oder vorgemerkt.“).
- `erstellt_von` einer Ausleihe ist die `sub` der anfragenden Person.

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
Menge, die jetzt weg ist, `vorgemerkt` = offene Menge zukünftiger Ausleihen von dieser Herkunft) und `verliehen` / `vorgemerkt` gesamt; `GET /ifcos[/:id]` liefert `inhalt: [{ gegenstandId, anzahl }]`; eine
Ausleihe liefert `erledigt`, `status` (`geplant` = beginnt in der Zukunft, `verliehen`, `erledigt`) und `positionen` (mit `zurueckAm`);
`?status=offen` liefert geplante und verliehene. So rechnet der Client die Lager-Ansicht selbst aus. Unbekannte
Ids sind 404, ungültige Eingaben und verletzte Fachregeln 400, Konflikte 409. `PUT /ausleihen/:id` ändert nur `an`,
`ausgeliehenAm`, `rueckgabeGeplant` und `kommentar`.

## Oberfläche

Mobile first; Navigationseintrag „Inventar“ (`inventar:lesen`). Die Seiten lesen die Listen über `useInventar()`
(`inventarDaten.ts`, Query-Keys `['inventar', 'kategorien' | 'gegenstaende' | 'ifcos']`, Archiviertes inklusive, Filter im Client);
jede Änderung macht `['inventar']` ungültig.

- `/inventar`: Umschalter „Gegenstände“ / „Ifcos“ / „Verliehen“ (`?ansicht=ifcos|verliehen`), Suche (bei
  Gegenständen Name, Beschreibung, Ifco und Lagerort-Pfad der Plätze; bei Ifcos Name, Platz, Inhalt), Kategoriefilter inkl.
  Unterkategorien (nur bei Gegenständen), Archiv-Schalter. Karten zeigen Plätze mit Pfad („6× · 3 verliehen · 2 vorgemerkt“) und ein oranges Badge
  bei Abweichung (`inventarAbweichung`/`abweichungText`). Mit `inventar:verwalten`: „Gegenstand anlegen“ / „Ifco anlegen“ und „Kategorien“.
- `/inventar/gegenstaende/:id`: Stammdaten, Soll gegen zugeordnet, Plätze mit Pfad und Anzahl (Ifcos verlinkt). „Plätze ändern“
  (`inventar:umraeumen`, `GegenstandPlaetzeModal`): je Zeile durchsuchbares Ziel (gruppiert „Plätze“ / „Ifcos“, bereits gewählte
  gesperrt) und Anzahl, Live-Summe gegen Soll. Menü Bearbeiten, Archivieren, Löschen (`inventar:verwalten`; 409 bietet Archivieren an).
- `/inventar/ifcos/:id`: Platz mit „Umstellen“ (`IfcoUmstellenModal`, auch „ohne Platz“), Inhalt als Liste, „Inhalt bearbeiten“
  (`IfcoInhaltModal`, `inventar:umraeumen`), Menü wie beim Gegenstand.
- `/inventar/stammdaten`: Tab „Kategorien“ (Baum) und Tab „Ifco-Typen“ (`IfcoTypenTab`, Karten mit Name und „60×40 · 10 cm“;
  `IfcoTypFormular` mit Umschalter Grundfläche groß/klein und Höhe in cm). Bearbeiten nur mit `inventar:verwalten`.
- Ifcos: `IfcoFormular` hat ein durchsuchbares Typ-Feld („6410 · 60×40 · 10 cm“); Karten und Detailseite zeigen den Typ. In
  `IfcoFormular` und `IfcoUmstellenModal` zeigen Ifco-Lagerplätze „passt“ bzw. sind mit „passt nicht“ / „Typ nötig“ gesperrt (dieselbe
  Funktion wie die API, `ifcoPlatz.ts`).
- Lager-Seite: Ifco-Lagerplätze tragen ein Kisten-Symbol und zeigen „2 Ifcos“; Karte und Drawer nennen „20 cm hoch · 1 Stellfläche“, die
  stehenden Ifcos mit Typ und „Passt noch: 1× 6410 oder 2× 4310“ bzw. „Voll“ (`passtNochText`). `LagerortFormular` hat den Schalter
  „Ifco-Lagerplatz“ mit Höhe und Stellflächen (gesperrt mit Hinweis bei Unterebenen), beim Regal und im Dialog „Böden hinzufügen“ den
  Schalter „Als Ifco-Lagerplätze anlegen“ (`IfcoPlatzFelder`).
- Wiederverwendbar: `BaumVerwaltung`/`BaumKnotenFormular` (Baum aus Name und Eltern; Texte, API-Aufrufe, Query-Keys und Recht als
  `BaumKonfiguration`) tragen `WarengruppenTab` und `KategorienTab`. `inventarAnzeige.ts` bündelt Select-Optionen und Anzeigetexte.

- Ansicht „Verliehen“ (`VerlieheneAnsicht`): offene Ausleihen als Karten, verliehene zuerst, dann vorgemerkte nach Beginn (`AusleiheKarte`: an wen, „Seit …“ bzw. bei Vorgemerkten Badge „Vorgemerkt“ und „Ab …“, geplante Rückgabe – überfällig
  rot –, Positionen „3× Kabeltrommel aus Lager › Regal“), Schalter „Auch erledigte anzeigen“, Suche, Button „Verleihen“
  (`inventar:umraeumen`). Daten über `useAusleihen(nurOffen)` / `useAusleihe(id)` (Keys `['inventar','ausleihen',…]`); jede Änderung macht
  `['inventar']` ungültig, damit auch `verliehen` an Gegenständen und Ifcos nachzieht.
- `/inventar/ausleihen/neu` (`AusleihePage`, `inventar:umraeumen`): An wen, Zeitpunkt (jetzt, änderbar), geplante Rückgabe (optional),
  Kommentar; Gegenstand per Suche hinzufügen, je Platz mit Verfügbarem (zugeordnet minus verliehen und vorgemerkt, `verfuegbarePlaetze`) ein Zahlenfeld
  (Platzhalter = verfügbar; mehr als verfügbar: orange mit Fehler, Absenden gesperrt). „Ganze Ifco verleihen“ übernimmt den verfügbaren Inhalt
  einer Ifco. Vorbelegung über `?gegenstand=<id>` und `?ifco=<id>` (Buttons „Verleihen“ auf den Detailseiten). Bestätigungsdialog mit allen
  Positionen, danach Weiterleitung zur neuen Ausleihe.
- `/inventar/ausleihen/:id` (`AusleiheDetailPage`): Kopf, Positionen mit Häkchen und „Zurückgeben“ (Zeitpunkt, Standard jetzt; Teilrückgabe
  möglich), zurückgegebene Positionen mit Datum. Bei vorgemerkten Ausleihen gibt es keine Rückgabe, nur Bearbeiten und Löschen. Menü „Bearbeiten“ (`AusleiheBearbeitenModal`: an, Zeitpunkt, geplante Rückgabe, Kommentar)
  und „Löschen“ (`inventar:umraeumen`).
- Gegenstand-Detailseite: je Platz „verliehen: 3 (an …)“ und „vorgemerkt: 2 ab 25.10.2026 10:00 (an …)“ mit Link, Liste der Ausleihen des Gegenstands (offene zuerst), Button „Verleihen“
  (nicht archiviert, nur solange etwas verfügbar ist). Ifco-Detailseite: „Ganze Ifco verleihen“.
- Lager-Seite: zeigt das Inventar je Knoten (in Karten und im Drawer von Stellplatz-Kacheln; bei Kacheln zählen Ifcos und direkt zugeordnete
  Gegenstände im Zähler, eine offene Inventur trägt ein Symbol), siehe [waren.md](./waren.md).
