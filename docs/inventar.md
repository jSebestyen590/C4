# Inventar

Dauerhaftes Betriebsvermögen des Clubs (Kabeltrommel, Beamer, Pavillons, Spanngurte, ...): **Gegenstände** in einem
Kategorienbaum, mit einer Anzahl (aus dem Verlauf der Zugänge und Abgänge) auf einem oder mehreren **Plätzen** im Lagerort-Baum (siehe [waren.md](./waren.md)),
wahlweise in **IFCOs** (Euronormboxen, z. B. „Spanngurtkiste“). Gegenstände lassen sich **verleihen** und können aus **Teilen** bestehen (siehe unten). Fachlogik
(Schemas, Abweichung, Verliehen-Prüfungen) liegt in `packages/shared/src/inventar.ts`, Speicherung und Regeln in
`packages/api/src/inventar.ts`, Routen in `packages/api/src/app.ts` (Abschnitt `Inventar`). Fehlerklassen und Hilfen
(`WarenUngueltig` → 400, `WarenKonflikt` → 409) kommen aus `packages/api/src/waren.ts`.

## Invarianten

- `gegenstaende.anzahl` ist die Summe des Verlaufs (`gegenstand_bewegungen`) und ändert sich nur über Zugänge und Abgänge (Anlegen bucht
  den ersten Zugang). Bestand 0 ist erlaubt.
- Plätze plus fest verbaute Stück dürfen die Anzahl **unterschreiten** („ohne Platz“), aber nie **überschreiten**
  (`zuVielVerteiltFehler`, 400); ein gelöschter Zugang darf das nicht verursachen (409, `sollZuKleinFehler`).
- Gelöscht wird nur, was nirgends verwendet wird (409), sonst archivieren. Ein archivierter Gegenstand ist nicht mehr umräumbar
  und nicht verleihbar.
- Teile haben nur eine Ebene und übernehmen die Kategorie des übergeordneten Gegenstands; virtuelle Gegenstände haben nie Plätze,
  fest verbaute Stück oder eigene Ausleihen.
- Umräumen (Platz entfernen, Anzahl senken, IFCO-Inhalt, Archivieren) darf nie unter das Verliehene und Vorgemerkte fallen (409,
  `verliehenFehler`).
- Eine Ausleihe belegt ihre Stück an den Tagen [Starttag, Rückgabetag); `rueckgabeGeplant` ist Pflicht, und die Belegung am selben
  Platz überschreitet nie die Zuordnung (`ausleihFehler`, 400).
- Die IFCOs auf einem IFCO-Lagerplatz müssen immer passen (`ifcosPassen`), IFCOs ohne Typ dürfen nicht darauf; Ware und IFCOs
  teilen sich keinen Platz (siehe [waren.md](./waren.md#ifco-lagerplätze)).
- Es läuft höchstens eine Aufräumaktion gleichzeitig (409 beim Starten einer zweiten).

## Dateien

| Bereich | Dateien                                                                                                                                                                                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API     | `packages/api/src/inventar.ts` (Stores und Regeln), `ifcoPlatz.ts` (IFCO-Kapazität auf Lagerplätzen), Routen in `app.ts` (Abschnitt `Inventar`)                                                                                                                            |
| Shared  | `packages/shared/src/inventar.ts` (Schemas, Abweichung, Verliehen- und Ausleih-Prüfungen), `inventarZeitraum.ts` (Belegung nach Tagen), `ifco.ts` (Kapazitätsmodell)                                                                                                       |
| Web     | Seiten `pages/InventarPage.tsx`, `GegenstandDetailPage.tsx`, `IfcoDetailPage.tsx`, `AusleihePage.tsx`, `AusleiheDetailPage.tsx`, `InventarStammdatenPage.tsx`; `inventarDaten.ts`, `inventarAnzeige.ts`, `IfcoFormular.tsx`, `IfcoInhaltModal.tsx`, `IfcoInhaltFelder.tsx` |
| Tests   | `packages/shared/src/inventar.test.ts`, `inventarZeitraum.test.ts`, `ifco.test.ts`; `packages/api/src/inventar.test.ts`, `ifcoPlatz.test.ts`                                                                                                                               |

## Rechte

- `inventar:lesen` und `inventar:umraeumen` haben alle Status. Umräumen umfasst Plätze ändern, IFCOs umstellen und befüllen sowie
  Verleihen, Zurücknehmen, Bearbeiten und Löschen von Ausleihen (Label „Inventar umräumen und verleihen“).
- `inventar:verwalten` (Stammdaten: Kategorien, Gegenstände, IFCOs anlegen, ändern, archivieren, löschen; Zugänge und Abgänge buchen und löschen) haben Admins und die
  Vorstandsposten (Migration `0024`); es lässt sich über `POSTEN_RECHTE` auch weiteren Posten geben.

## Datenmodell

Migrationen `0025`–`0036` (Aufräumen: `0032`, `0033`; fest verbaut: `0034`; Verlauf: `0035`, Startbuchungen `0036`; die Rechte der Vorstandsposten in `0024`), jeweils ein Statement und
eine Down-Datei (siehe [datenbank.md](./datenbank.md); Rollback-Ziel nur für das Inventar: `0024_vorstandsposten_rechte`). Teile: `0101`–`0103`
(Spalten per `ALTER`, Down-Dateien leeren nur die Werte; Rollback-Ziel: `0100_mitglied_status_verlauf_bestand`).

| Tabelle                 | Inhalt                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `inventar_kategorien`   | Baum (`parent_id`, `name`, `archiviert`), wie `warengruppen`                                                                                                                                                                                                                         |
| `ifco_typen`            | `name` (z. B. „6410“), `grundflaeche` (`gross` 60×40 / `klein` 40×30), `hoehe_cm`, `archiviert`                                                                                                                                                                                      |
| `ifcos`                 | `name`, `beschreibung`, `lagerort_id` (null = ohne Platz), `typ_id` (optional), `archiviert`; nicht verschachtelbar, ein Platz                                                                                                                                                       |
| `gegenstaende`          | `name`, `beschreibung`, `kategorie_id`, `anzahl` (Gesamtzahl = Summe des Verlaufs, von der API mitgeführt), `archiviert`; `teil_von` (Id des übergeordneten Gegenstands, ohne Fremdschlüssel), `virtuell` (null = nein), `anzahl_je` (Stück je übergeordnetem Stück, nur bei Teilen) |
| `gegenstand_bewegungen` | Verlauf: `art` (`zugang`/`abgang`), `grund`, `anzahl` ≥ 1, `datum`, `kommentar`, `ort` (Anzeige-Schnappschuss des Platzes, kein Fremdschlüssel), `erstellt_von` (Cognito-`sub`), `erstellt_am`                                                                                       |
| `gegenstand_plaetze`    | `gegenstand_id`, entweder `lagerort_id` oder `ifco_id` (CHECK), `anzahl` ≥ 1                                                                                                                                                                                                         |
| `gegenstand_verbaut`    | `gegenstand_id`, `ort` (Freitext, z. B. „unter der Bar“), `anzahl` ≥ 1: fest verbaute Stück, an keinem Platz, nicht verleihbar                                                                                                                                                       |
| `ausleihen`             | `an` (Freitext), `ausgeliehen_am`, `rueckgabe_geplant`, `kommentar`, `erstellt_von`, `organisiert_von` (Cognito-`sub` ohne Fremdschlüssel)                                                                                                                                           |
| `ausleihe_positionen`   | `ausleihe_id`, `gegenstand_id`, Herkunft `lagerort_id` oder `ifco_id` (CHECK), `anzahl` ≥ 1, `zurueck_am` (null = offen), `ganze_ifco` (true = Teil einer ganz verliehenen IFCO)                                                                                                     |

Die Herkunft einer Position ist ein Ort, keine Zuordnungs-Id; Umräumen zerstört so die Historie nicht.

## Teile

Ein Gegenstand kann aus **Teilen** bestehen (Pavillon → Plane, 4 Seitenteile, Gestänge, 12 Winkel). Teile sind normale Gegenstände
mit eigener Anzahl, eigenem Verlauf, eigenen Plätzen (auch in IFCOs) und Ausleihen; `teilVon` nennt den übergeordneten Gegenstand.

- **Eine Ebene:** Ein Teil hat keine Teile, gehört zu genau einem Gegenstand und kann nicht Teil von sich selbst sein; ein Gegenstand
  mit Teilen kann kein Teil werden; der übergeordnete muss existieren und darf nicht archiviert sein (alles 400).
- **Anzahl je Stück:** Jedes Teil trägt `anzahlJe` (Pflicht). Soll des Teils = Anzahl des übergeordneten × `anzahlJe` (3 Pavillons ×
  12 Winkel = 36, `teilSoll`, `teilAbweichung` in shared); eine Abweichung wird nur angezeigt, nichts wird automatisch gebucht.
- **Virtuell:** Ein virtueller Gegenstand hat Anzahl und Verlauf, aber nie Plätze oder fest verbaute Stück und lässt sich nicht selbst
  verleihen. Abgelehnt werden (400) Plätze, IFCO-Inhalt, Zugang mit Platz, Abgang von Platz oder verbaut, Anlegen mit Platz und
  Ausleihe-Positionen. Ein Teil kann nicht virtuell sein. Umstellen auf virtuell geht nur ohne Plätze, verbaute Stück und offene
  Ausleihen (409). Ein nicht virtueller übergeordneter Gegenstand zählt selbst als Bestandteil (je 1).
- **Gekoppelt:** Ein Teil hat keine eigene Kategorie: Es übernimmt die des übergeordneten Gegenstands, auch beim späteren
  Zuordnen, und ändert sich mit ihr. Beim Anlegen eines Teils übernimmt der erste Zugang Grund und Datum vom ältesten Zugang des
  übergeordneten Gegenstands (sonst „gekauft“, heute). Seine Anzahl ist beim Anlegen Anzahl des übergeordneten × `anzahlJe`;
  danach hat das Teil eigene Zugänge und Abgänge, Anzahl und `anzahlJe` hängen nicht mehr zusammen.
- **Mit Teilen anlegen:** `POST /gegenstaende` nimmt `teile: [{ name, anzahlJe, platz? }]` (nicht bei einem Teil; doppelte Namen
  400). Jedes Teil bekommt Anzahl = Anzahl × `anzahlJe`, Kategorie, Grund und Datum des Gegenstands und den angegebenen Platz,
  sonst den Platz des Gegenstands, sonst keinen; alles in einer Transaktion.
- **Löschen** mit Teilen: 409. **Archivieren** archiviert die Teile mit; ein Teil lässt sich nur wiederherstellen, wenn sein
  übergeordneter Gegenstand nicht archiviert ist (409). Nach dem Löschen eines Teils landet man auf der Seite des übergeordneten
  Gegenstands.
- **Status** (`teileStatus` in shared): komplette Sätze = Minimum über die Bestandteile von ⌊verliehen / je⌋. „Verliehen“, wenn
  alle Sätze komplett verliehen sind und nichts übrig ist, sonst „Teilweise verliehen“, sobald irgendein Teil verliehen ist; ebenso
  „Vorgemerkt“ / „Teilweise vorgemerkt“. `saetzeVerfuegbar` liefert die im Zeitraum verfügbaren kompletten Sätze.

## IFCO-Typen und IFCO-Lagerplätze

IFCOs sind Euronormboxen mit nur **zwei Grundflächen**: groß 60×40 und klein 40×30 (zwei kleine = eine große); die Höhe variiert
(10, 13, 16, 22 cm …). Ein **IFCO-Typ** (Stammdaten, Tab „IFCO-Typen“ unter `/inventar/stammdaten`) hält Name, Grundfläche und Höhe;
jede IFCO hat optional einen Typ (`typId`). Typ löschen nur ungenutzt (409, sonst archivieren); archivierte Typen sind nicht mehr wählbar.

Ein Lagerort kann **IFCO-Lagerplatz** sein (`ifcoHoeheCm`, `ifcoStellflaechen`). Markierung, API-Felder und die Regel „Ware und IFCOs
teilen sich keinen Platz“ stehen nur in [waren.md](./waren.md#ifco-lagerplätze); hier folgt, was auf einen Platz passt.

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
Maße eines IFCO-Lagerplatzes ändern (nicht unter den Inhalt) oder ihn markieren. Zusätzlich gilt die Warenregel aus [waren.md](./waren.md#ifco-lagerplätze) (Platz mit Warenbestand ≠ 0: 400). IFCOs ohne Typ dürfen nicht auf einen IFCO-Lagerplatz.
Das Aufheben der Markierung ist immer erlaubt. Normale Lagerorte sind für IFCOs unbeschränkt. Die Prüfung steht in
`packages/api/src/ifcoPlatz.ts` und läuft in den Transaktionen der Stores.

## Aufräumen

Nach großen Veranstaltungen liegt vieles nicht mehr im Lager oder in der falschen IFCO. Eine **Aufräumaktion** gilt für alle:
Jede:r mit `inventar:umraeumen` kann sie starten und beenden; es läuft höchstens eine (`aufraeumaktionen`: `gestartet_am`,
`gestartet_von`, `beendet_am`, `beendet_von`; die `*_von` sind Cognito-`sub`s ohne Fremdschlüssel). Während sie läuft, hakt man
IFCOs als **fertig** ab (Inhalt richtig sortiert, Platz stimmt), `aufraeum_ifcos` (`aktion_id`, `ifco_id`, `fertig_am`,
`fertig_von`); „Wieder öffnen“ löscht die Zeile. Abhaken prüft nichts, korrigiert wird wie sonst über „Inhalt bearbeiten“ und
„Umstellen“. Archivierte IFCOs zählen nicht mit und lassen sich nicht abhaken. Nur IFCOs gehören dazu, keine losen Gegenstände.
Beim Löschen einer IFCO fallen ihre Häkchen mit weg.

## Regeln

- **Plätze:** Sie sagen, wo etwas hingehört. Umräumen überschreibt sie ohne eigene Historie; einen Verlauf haben nur die
  Zugänge und Abgänge (siehe unten).
- **Fest verbaut:** Stück, die dauerhaft eingebaut sind (z. B. 3 von 12 Dreierverteilern „am Drucker“, „unter der Bar“), stehen
  mit Freitext-Ort und Anzahl in `gegenstand_verbaut`. Sie liegen an keinem Platz und lassen sich nicht verleihen. Auf Plätze
  verteilbar ist nur die Anzahl minus die verbauten (`verteilbar`), im Beispiel 9.
- **Nicht mehr als vorhanden:** Plätze plus fest verbaute dürfen die Anzahl unterschreiten („2 ohne Platz“, `inventarAbweichung`,
  `abweichungText`), aber nicht überschreiten: `…/plaetze`, `…/inhalt` und Anlegen mit Platz lehnen das ab (400,
  `zuVielVerteiltFehler`, mit Hinweis auf die verbauten; die Formulare prüfen vorab). Ein schon überverteilter Gegenstand lässt
  sich weiter umräumen, solange die Summe nicht wächst.
- **Verlauf (Zugänge und Abgänge):** Die Anzahl ändert sich nur über Buchungen, z. B. „+7 gekauft“, „−3 verloren“, „−1 kaputt“,
  „+1 Ersatz beschafft“. Gründe sind fest: Zugang `gekauft`, `ersatz`, `geschenkt`, `gefunden`, `sonstiges`; Abgang `verloren`, `geklaut`,
  `kaputt`, `verkauft`, `entsorgt`, `verschenkt`, `sonstiges` (`ZUGANG_GRUENDE`, `ABGANG_GRUENDE`, Labels in `GRUND_LABELS`),
  dazu Datum (nicht in der Zukunft) und optional ein Kommentar. `bestand` („Bestand übernommen“) schreibt nur Migration `0036`
  für Gegenstände, die es schon gab. Anlegen bucht den ersten Zugang. Ein **Zugang** kann gleich auf einen Platz gehen. Ein
  **Abgang** nennt, von wo die Stück weggehen: ohne Platz (nur so viele, wie ohne Platz sind, `ohnePlatz`), ein Platz (nicht
  unter das dort Verliehene, 409) oder eine fest verbaute Stelle; der Platz verliert die Stück in derselben Transaktion. Bestand 0
  ist erlaubt. **Löschen** einer Fehlbuchung ändert nur die Anzahl: Ein gelöschter Abgang bringt die Stück ohne Platz zurück,
  ein gelöschter Zugang geht nur, wenn danach nicht mehr Stück an Plätzen oder verbaut sind als vorhanden (409,
  `sollZuKleinFehler`). Beim Löschen eines Gegenstands geht sein Verlauf mit.
- **Plätze:** `PUT …/plaetze` ersetzt alle Plätze eines Gegenstands, `PUT …/inhalt` alle Zuordnungen einer IFCO, in einer Transaktion.
  Je Gegenstand ist jeder Lagerort/jede IFCO nur einmal erlaubt, Anzahl ≥ 1. Ziele müssen existieren und dürfen nicht archiviert
  sein (400; bereits zugeordnete archivierte Ziele bleiben erlaubt). Ein archivierter Gegenstand behält seine Plätze, ist aber nicht
  mehr umräumbar (400). `PUT …/ifcos/:id/platz { lagerortId | null }` stellt die IFCO um.
- **Löschen** geht nur, wenn nichts verweist (409, sonst archivieren): Kategorie (Unterkategorien, Gegenstände), Gegenstand
  (Plätze, fest verbaute, Ausleihen), IFCO (Inhalt, Ausleihen). **Archivieren:** Kategorie archiviert den Teilbaum (Wiederherstellen braucht
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
- **Beendet:** Eine Ausleihe, deren Positionen alle zurück sind, geht nicht wieder auf: `PUT` mit `positionen` ist dann 409 „Die Ausleihe ist beendet. Leg eine neue Ausleihe an.“ (`beendetPruefen`). Der Kopf (Wer, Zeiten, Kommentar) bleibt änderbar; die Seite „Ausleihe bearbeiten“ zeigt für beendete Ausleihen nur diesen Hinweis.
- **Rückgabe** je Position (Teilrückgaben möglich), nur für offene Positionen dieser Ausleihe und nicht vor dem Ausleihzeitpunkt und nicht an einem Berliner Tag in der Zukunft (je 400, „Das Datum darf nicht in der Zukunft liegen.“).
  Eine Ausleihe ist `erledigt`, wenn alle Positionen zurück sind. `DELETE` entfernt eine Ausleihe samt Positionen (Fehleintrag).
- **Umräumen unter Verliehenes** (Platz entfernen oder Anzahl senken, `verliehenFehler`, ebenso IFCO-Inhalt und Archivieren von IFCO/Lagerort) wird
  abgelehnt, wenn die Zuordnung unter die höchste gleichzeitige Belegung ab heute fällt (alle offenen Positionen, offene ohne Rückgabedatum zählen
  für immer; 409 „Davon sind noch 3 verliehen oder vorgemerkt: …“ mit den blockierenden Ausleihen).
- `erstellt_von` einer Ausleihe ist die `sub` der anfragenden Person; wer sie organisiert hat, steht in `organisiert_von`.

## API

| Route                                                                                                                                                                                                                                             | Recht                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `GET /api/inventar/kategorien`, `/gegenstaende`, `/gegenstaende/:id`, `/ifcos`, `/ifcos/:id`, `/ifco-typen` (Listen mit `?archiv=1`)                                                                                                              | `inventar:lesen`     |
| `GET /api/inventar/ausleihen[?status=offen]`, `GET /api/inventar/ausleihen/:id`                                                                                                                                                                   | `inventar:lesen`     |
| `POST/PUT/DELETE` auf `/api/inventar/kategorien`, `/gegenstaende`, `/ifcos`, `/ifco-typen`; `PUT …/:id/archiv { archiviert }`                                                                                                                     | `inventar:verwalten` |
| `GET /api/inventar/gegenstaende/:id/bewegungen` (Verlauf, neueste zuerst, `ersteller` mit `username`)                                                                                                                                             | `inventar:lesen`     |
| `POST /api/inventar/gegenstaende/:id/bewegungen` (`{ art: 'zugang', grund, anzahl, datum, kommentar?, nach? }` oder `{ art: 'abgang', …, von: { art: 'ohnePlatz' \| 'platz' \| 'verbaut' } }`, → `201 { id }`), `DELETE …/bewegungen/:bewegungId` | `inventar:verwalten` |
| `PUT /api/inventar/gegenstaende/:id/plaetze { plaetze: [{ lagerortId?, ifcoId?, anzahl }], verbaut?: [{ ort, anzahl }] }` (`verbaut` fehlend = unverändert)                                                                                       | `inventar:umraeumen` |
| `PUT /api/inventar/ifcos/:id/platz { lagerortId \| null }`, `PUT /api/inventar/ifcos/:id/inhalt { positionen: [{ gegenstandId, anzahl, andere?: [{ lagerortId?, ifcoId?, anzahl }] }] }`                                                          | `inventar:umraeumen` |
| `GET /api/inventar/aufraeumen` (→ `{ aktion: { id, gestartetAm, gestartetVon, fertig: [{ ifcoId, fertigAm, von }] } \| null }`, Mitglieder mit `username`)                                                                                        | `inventar:lesen`     |
| `POST /api/inventar/aufraeumen` (starten, `201`; 409 wenn schon eine läuft), `POST …/aufraeumen/beenden` (404 ohne laufende), `PUT …/aufraeumen/ifcos/:id { fertig }` (409 ohne laufende)                                                         | `inventar:umraeumen` |
| `POST /api/inventar/ausleihen` (→ `201 { id }`), `POST …/ausleihen/:id/rueckgabe { positionIds, zurueckAm }`, `PUT …/ausleihen/:id`, `DELETE …/ausleihen/:id`                                                                                     | `inventar:umraeumen` |

Antworten: `GET /gegenstaende[/:id]` liefert je Gegenstand `plaetze: [{ id, lagerortId, ifcoId, anzahl, verliehen }]` (`verliehen` =
Menge, die jetzt weg ist, `vorgemerkt` = offene Menge zukünftiger Ausleihen von dieser Herkunft) und `verliehen` / `vorgemerkt` gesamt; `GET /ifcos[/:id]` liefert `inhalt: [{ gegenstandId, anzahl }]` und `ausleihe: { id, an, status, ausgeliehenAm } | null` (offene Ausleihe der ganzen IFCO, `status` `geplant` oder `verliehen`); eine
Ausleihe liefert `erledigt`, `status` (`geplant` = beginnt in der Zukunft, `verliehen`, `erledigt`), `positionen` (mit `zurueckAm`, `ganzeIfco`) und
`gefaehrdetDurch: [{ id, an }]` und `organisator: { sub, username, vorname, nachname, status, anrede } | null` (`username` aus Cognito, null ohne);
`?status=offen` liefert geplante und verliehene. So rechnet der Client die Lager-Ansicht selbst aus. Unbekannte
Ids sind 404, ungültige Eingaben und verletzte Fachregeln 400, Konflikte 409. `PUT /ausleihen/:id` ändert `an`, `organisiertVon`,
`ausgeliehenAm`, `rueckgabeGeplant` (Pflicht) und `kommentar` und prüft den neuen Zeitraum gegen andere Ausleihen. Mit `positionen`
ersetzt es zusätzlich alle offenen Positionen (gleiche Prüfungen wie beim Anlegen, die eigenen offenen Positionen zählen nicht);
zurückgegebene bleiben unverändert, eine leere Liste geht nur, wenn es zurückgegebene gibt. Die Liste enthält je Ausleihe `ausgeliehenAm`,
`rueckgabeGeplant` und die Positionen; der Client rechnet damit die Verfügbarkeit im gewählten Zeitraum selbst (`verfuegbarImZeitraum`).

## Oberfläche (Details)

Mobile first; Navigationseintrag „Inventar“ (`inventar:lesen`). Die Seiten lesen die Listen über `useInventar()`
(`inventarDaten.ts`, Query-Keys `['inventar', 'kategorien' | 'gegenstaende' | 'ifcos']`, Archiviertes inklusive, Filter im Client);
jede Änderung macht `['inventar']` ungültig.

- `/inventar`: Umschalter „Gegenstände“ / „IFCOs“ / „Verliehen“ (`?ansicht=ifcos|verliehen`), Suche (bei
  Gegenständen Name, Beschreibung, IFCO und Lagerort-Pfad der Plätze; bei IFCOs Name, Platz, Inhalt), Kategoriefilter inkl.
  Unterkategorien (nur bei Gegenständen), Archiv-Schalter. Sortierung (Select „Sortieren nach“, Standard Name): Name, Kategorie (Pfad, dann Name), Anzahl (absteigend), Platz (erster Platz, ohne Platz zuletzt), deutsch verglichen (`gegenstaendeSortieren` in `inventarAnzeige.ts`); in der Tabelle sortieren auch die Spaltenköpfe, ein zweiter Klick kehrt um. Auf dem Handy sind es Karten, ab `sm` eine Tabelle (Name mit Beschreibung, Kategorie, Anzahl, Plätze mit „3 verliehen“ in Lila und „2 vorgemerkt“ in Cyan, Status mit Abweichung/Archiviert); die ganze Zeile öffnet den Gegenstand. Karten zeigen Plätze mit Pfad („6×“ im Kopf, am Platz „Lager › Regal · 3 verliehen · 2 vorgemerkt“; die Verleih-Hinweise stehen nur an den Plätzen) und ein oranges Badge
  bei Abweichung (`inventarAbweichung`/`abweichungText`). IFCOs: auf dem Handy Karten, ab `sm` eine Tabelle (Name mit Typ, Standort,
  Inhalt, Status; beim Aufräumen eine Spalte mit „Fertig“), sortierbar nach Name (Zahlen der Reihe nach) und Standort (Pfad, ohne
  Platz zuletzt) über „Sortieren nach“ oder die Spaltenköpfe (`ifcosSortieren`). Mit `inventar:verwalten`: „Gegenstand anlegen“ / „IFCO anlegen“ und „Kategorien“.
  „Gegenstand anlegen“ fragt Anzahl, Grund (Standard „gekauft“) und Datum (Standard heute) des ersten Zugangs ab und optional
  gleich einen Platz (Lagerort oder IFCO, `POST /gegenstaende` mit `anzahl`, `grund`, `datum`, `platz { lagerortId | ifcoId, anzahl }`,
  im selben Schritt geprüft und gespeichert); die Anzahl am Platz ist standardmäßig die ganze Anzahl und folgt ihr, bis man sie
  ändert (bei 1 ohne Feld). Danach bleibt man auf der Übersicht. „Bearbeiten“ ändert nur Name, Kategorie und Beschreibung.
- `/inventar/gegenstaende/:id`: Stammdaten, zugeordnet gegen Anzahl (nicht bei Anzahl 1), Abschnitt **„Verlauf“** (`BewegungVerlauf`, neueste Buchung
  oben: „+7 gekauft“ grün / „−3 verloren“ rot, Datum, „aus …“ / „nach …“, wer gebucht hat, Kommentar; mit `inventar:verwalten`
  die Knöpfe „Zugang“ / „Abgang“ (`BewegungModal`: Anzahl, Grund, Datum, Kommentar, beim Zugang optional ein Platz, beim
  Abgang „Von“ mit „Ohne Platz (n)“, den Plätzen und den fest verbauten, vorgewählt „ohne Platz“ bzw. der größte Platz) und
  Löschen je Buchung mit Bestätigung), Plätze mit Pfad und Anzahl (IFCOs verlinkt). „Plätze ändern“
  (`inventar:umraeumen`, `GegenstandPlaetzeModal`): je Zeile durchsuchbares Ziel (gruppiert „Plätze“ / „IFCOs“, bereits gewählte
  gesperrt) und Anzahl, Live-Summe gegen die Anzahl. Darunter der Abschnitt „Fest verbaut“ (Ort als Freitext, Anzahl, „Fest verbaut hinzufügen“), die Summe zählt beides. Bei Anzahl 1
  heißt es „Platz“ / „Platz ändern“ ohne „1 von 1 zugeordnet“, und der Dialog hat nur ein Feld „Platz“ (leerbar = „Kein Platz“) oder mit Häkchen „Fest verbaut“ ein Feld „Ort“. Die Detailseite listet
  fest verbaute Stück nach den Plätzen; Karten und Tabelle der Übersicht zeigen „fest verbaut: unter der Bar“, die Suche findet
  auch den Ort. Menü Bearbeiten, Archivieren bzw. Wiederherstellen, Löschen (`inventar:verwalten`; 409 bietet Archivieren an).
- `/inventar/ifcos/:id`: Platz mit „Umstellen“ (`IfcoUmstellenModal`, auch „ohne Platz“), Inhalt als Liste (rechts nur die Anzahl, darunter wie beim Gegenstand je Ausleihe „verliehen: 9 (an …)“ / „vorgemerkt: 10 ab … (an …)“, `PlatzAusleihHinweise`), „Inhalt bearbeiten“
  (`IfcoInhaltModal`, `inventar:umraeumen`; Gegenstände mit Anzahl 1 ohne Mengenfeld), Menü wie beim Gegenstand.
- **Inhalt mit Umräumen** (`IfcoInhaltFelder`, `useIfcoInhalt` in `IfcoInhaltModal.tsx`; in „Inhalt bearbeiten“ und „IFCO anlegen“): Jede Zeile ist ein Gegenstand-Feld ohne
  Überschrift; die Anzahl erscheint erst, wenn ein Gegenstand gewählt ist. Ein neu gewählter
  Gegenstand kommt standardmäßig ganz in die IFCO (Anzahl = verteilbar). Liegt er schon an anderen Plätzen, steht darunter
  „Bisher zugeordnet“ mit einem Zähler je Platz („Bisher 5“). Bei einem neu gewählten Gegenstand stehen sie auf 0, bei
  vorhandenem Inhalt auf dem bisherigen Wert. Darunter „Verteilt 10 von 10“ (orange „… ohne Platz“ für Stück, die schon vorher
  keinen Platz hatten; rot „… fehlen“ oder „… zu viel“). Beim Speichern bekommen die anderen Plätze die neuen Werte, 0 nimmt den
  Gegenstand dort heraus. **Hier wird nur umverteilt** (`platzVerlustFehler`, 400 in der API): Kein Stück darf seinen Platz
  verlieren, auch nicht durch Entfernen einer Zeile; dazukommen dürfen nur Stück, die bisher keinen Platz hatten. Herausnehmen
  ohne neuen Platz (z. B. etwas ist kaputt) geht nur über „Plätze ändern“ beim Gegenstand, damit danach ein Abgang
  gebucht werden kann. Einen eigenen Bestätigungsschritt gibt es nicht. Ein Gegenstand mit Anzahl 1
  hat kein Mengenfeld; die Zeile sagt „Kommt von „…“ hierher.“ Die API (`positionen[].andere`, `ifcoInhaltAnwenden`) setzt die
  Plätze in derselben Transaktion; jeder genannte Platz muss ein anderer Platz des Gegenstands sein (400), Verliehenes muss
  bleiben (409).
- **IFCO anlegen** (`IfcoFormular`) fragt optional gleich den Inhalt ab (`POST /ifcos` mit `inhalt`, gleiche Regeln wie
  `PUT …/inhalt`); danach bleibt man auf der Übersicht.
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
- **Anzahl 1 wird nicht angezeigt:** Die meisten Gegenstände gibt es nur einmal, deshalb steht „1×“ nirgends (Karten, Plätze,
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
  – bei einem Platz mit zugeordneter Anzahl 1 stattdessen ein Schalter „Verleihen aus <Pfad>“ (≥ 42 px, `standardMenge`): hat der Gegenstand nur
  diesen einen Platz und ist er frei, ist er mit dem Hinzufügen schon gewählt; sonst gesperrt mit Hinweis, wer ihn hat. Ganze IFCOs übernehmen als
  Standard das Verfügbare (Platzhalter = verfügbar; mehr als verfügbar: orange mit Fehler, Absenden gesperrt). „Ganze IFCO verleihen“ übernimmt den verfügbaren Inhalt
  einer IFCO; sie wird als **ganze IFCO** verliehen, solange der volle verfügbare Inhalt eingetragen bleibt (der Bestätigungsdialog zeigt dann „Spanngurtkiste (ganze IFCO)“, sonst werden die Teile einzeln verliehen). Vorbelegung über `?gegenstand=<id>` und `?ifco=<id>` (Buttons „Verleihen“ auf den Detailseiten). Bestätigungsdialog mit dem Zeitraum („Vom 25.10.2026 09:00 bis 27.10.2026“ bzw. „Seit … bis …“) und allen
  Positionen, danach Weiterleitung zur neuen Ausleihe.
- Aufräumen (`Aufraeumen.tsx`, `useAufraeumen`, alle 15 s neu geladen, solange eine Aktion läuft): In der IFCO-Ansicht
  „Aufräumen starten“ (mit Bestätigung) bzw. während der Aktion ein Kasten mit „12 von 40 fertig“, Fortschrittsbalken, seit wann
  und von wem gestartet, Schalter „Nur offene IFCOs“ und „Aufräumen beenden“ (Bestätigung nennt die noch offenen). Offene IFCOs
  stehen oben, fertige darunter abgeblendet mit grünem Badge „Fertig · username“; jede Karte hat unten „Fertig“ / „Wieder öffnen“.
  Die Ansichten „Gegenstände“ und „Verliehen“ zeigen einen Hinweis mit Link zu den IFCOs, die IFCO-Detailseite einen Kasten mit
  Status und Knopf.
- `/inventar/ausleihen/:id` (`AusleiheDetailPage`): Kopf, Positionen mit Häkchen und „Zurückgeben“ (Zeitpunkt, Standard jetzt; Teilrückgabe
  möglich), zurückgegebene Positionen mit Datum. Die ganze Karte einer Position ist anklickbar (öffnet den Gegenstand, per Tastatur erreichbar); das Häkchen
  (42 px Trefferfläche) wählt unabhängig davon. Ganz verliehene IFCOs erscheinen als eine Karte „Spanngurtkiste (ganze IFCO)“ (öffnet die IFCO) mit
  Gruppen-Häkchen für alle offenen Positionen und den Inhalten als Unterliste, einzeln wählbar. Unter der Überschrift steht „Organisiert von <Username>“
  (Username, ohne Username „Vorname Nachname“; fett in der Statusfarbe, auf der Detailseite zum Mitglied verlinkt; im Auswahlfeld „username (Vorname Nachname)“); ebenso auf `AusleiheKarte`, die ganze IFCOs als eine Zeile mit kompaktem Inhalt zeigt. Bei vorgemerkten Ausleihen gibt es keine Rückgabe, nur Bearbeiten und Löschen. Menü „Bearbeiten“: bei nicht erledigten Ausleihen die Seite `/inventar/ausleihen/:id/bearbeiten` (`AusleihePage` im Bearbeiten-Modus: Kopf und offene Positionen vorbelegt, eigene Positionen blockieren sich nicht, zurückgegebene stehen read-only unter „Bereits zurückgegeben“, Bestätigung „Änderungen speichern“), bei erledigten `AusleiheBearbeitenModal` (an, Organisator, Zeitpunkt, geplante Rückgabe (Pflicht), Kommentar)
  und „Löschen“ (`inventar:umraeumen`).
- Gegenstand-Detailseite: je Platz „verliehen: 3 (an …)“ und „vorgemerkt: 2 ab 25.10.2026 10:00 (an …)“ mit Link, Liste der Ausleihen des Gegenstands (offene zuerst), Button „Verleihen“
  (nicht archiviert, nur solange etwas verfügbar ist). IFCO-Detailseite: „Ganze IFCO verleihen“, bei einer ganz verliehenen IFCO ein Badge „Verliehen an <an> seit …“ bzw. „Vorgemerkt für <an> ab …“ (verlinkt); IFCO-Karten tragen „Verliehen an …“, die Lager-Seite „Spanngurtkiste · … · verliehen an Feuerwehr“. Am Gegenstand steht beim Platz „(…, mit der ganzen IFCO)“.
- **Teile in der Oberfläche:**
  - `GegenstandFormular` hat den Schalter „Nur virtuell“ (blendet den Platz aus). Ein Teil entsteht nur über den
    übergeordneten Gegenstand („Teil anlegen“ auf der Detailseite oder die Teile-Zeilen beim Anlegen); das Formular hat
    kein Feld „Teil von“, bei einem Teil aber „Anzahl je <Name>“. „Teil hinzufügen“ setzt den Fokus in das neue Namensfeld.
  - `/inventar` hat den Schalter „Teile anzeigen“ (Standard aus). Ist er aus, fehlen Teile in der Liste; die Suche findet über ein
    Teil (Name, Beschreibung, Platz, verbaut) den übergeordneten Gegenstand. Übergeordnete zeigen „Virtuell · 5 Teile“ bzw.
    „5 Teile“ und `TeileStatusBadges`: „Verliehen“ / „Teilweise verliehen“, „Vorgemerkt“ / „Teilweise vorgemerkt“, bei Anzahl > 1
    „2 von 3 verliehen“. Teile tragen „Teil von Pavillon“.
  - Die Detailseite eines übergeordneten Gegenstands hat den Abschnitt „Teile“: Karten mit „12 je Pavillon · 34 von 36 · 2 fehlen“
    (orange bei Abweichung), Plätzen und Verleih-Hinweisen, dazu „Teil anlegen“. Virtuelle haben keine Plätze; `BewegungModal`
    bietet dort keinen Platz an. Die Ausleihen-Liste enthält auch die der Teile. Ein Teil zeigt „Teil von <Pavillon> · 12 je
    Pavillon“.
  - Auf `AusleihePage` steht ein übergeordneter Gegenstand als „Pavillon (5 Teile)“ in der Suche. Er kommt als Gruppe mit allen
    verfügbaren Bestandteilen hinzu (je 1 Satz, `mengeVerteilen` in `inventarTeile.ts`: größter verfügbarer Platz zuerst), bei
    Anzahl > 1 mit Feld „Anzahl Pavillon“. Jedes Teil bleibt einzeln änderbar oder entfernbar (teilweise verleihen).
  - Bestätigung, `AusleiheKarte` und `AusleiheDetailPage` gruppieren Positionen von Teilen unter „Pavillon (komplett)“ /
    „2× Pavillon (komplett)“ / „Pavillon (teilweise)“ (`teileGruppieren`), die Detailseite mit Gruppen-Häkchen. Ganze IFCOs haben
    Vorrang.
  - Beim Anlegen (kein Teil) gibt es den Abschnitt „Teile (optional)“: je Zeile Name, „Anzahl je <Name>“, optional Platz
    (Standard: Platz des Gegenstands) und „Gesamt: N“. Ein Teil zeigt statt der Kategorie die des übergeordneten Gegenstands
    und fragt beim Anlegen („Teil anlegen“) weder Grund noch Datum noch eine eigene Anzahl: nur „Anzahl je …“ mit „Gesamt: N“
    darunter; die Anzahl am Platz folgt dem Gesamt.
  - Lager-Seite: Teile erscheinen an ihren Plätzen mit „· Teil von Pavillon“.
- Bei Gesamtanzahl 1 steht „verliehen“ / „vorgemerkt“ ohne Zahl (Übersicht, Detailseite, `PlatzAusleihHinweise`, Lager).
- Lager-Seite: zeigt das Inventar je Knoten (in Karten und im Drawer von Stellplatz-Kacheln; bei Kacheln zählen IFCOs und direkt zugeordnete
  Gegenstände im Zähler, eine offene Inventur trägt ein Symbol), siehe [waren.md](./waren.md).
