# Waren (Mini-Warensystem)

Lagerorte (Baum), Warengruppen (Baum), Gebinde, Waren, Bestandsbuchungen und Inventur. Fachlogik
(Bestand, FIFO, Verlauf, Inventurabgleich) liegt in `packages/shared/src/waren.ts`, Speicherung und
Validierung in `packages/api/src/waren.ts`, Routen in `packages/api/src/app.ts`.

## Rechte

- `waren:lesen` und `bestand:buchen` haben alle Status. Buchen umfasst Einlagerung, Entnahme, Inventur
  (starten, zählen, abschließen, verwerfen) und das endgültige Löschen eines Vorgangs.
- `waren:verwalten` (Stammdaten: Lagerorte samt Reihenfolge und Warenliste, Warengruppen, Gebinde, Waren) haben Admins und
  die Vorstandsposten (Migration `0024`); es lässt sich über `POSTEN_RECHTE` auch weiteren Posten geben.

## Datenmodell

Migrationen `0010`–`0023` (`0012_gebinde.sql` wurde vor dem Merge für das neue Gebinde-Modell umgeschrieben). Bestand ist die Summe der `bestandsbuchungen.menge` je Ware, Lagerort, Gebinde und MHD;
ein `bestandsvorgang` (Einlagerung, Entnahme, Umlagerung, Inventur) hat viele Zeilen mit der Art `zugang`, `abgang`, `anbruch`, `umlagerung` oder `korrektur`. `erstellt_von` ist die Cognito-`sub` ohne
Fremdschlüssel. Entnahmen werden beim Buchen FIFO geplant (Bestand zum gewählten Zeitpunkt, Teilbaum des Lagerorts; die Sammel-Entnahme `/bestand/entnahmen` nur auf dem Platz selbst) und
nie neu berechnet; negativer Bestand ist erlaubt.

Stammdaten werden nur gelöscht, wenn nichts darauf verweist (sonst 409), ansonsten archiviert
(`PUT …/:id/archiv { archiviert }`). Ein Lagerort lässt sich nur archivieren, wenn der Bestand seines ganzen Teilbaums 0 ist und im Teilbaum kein Inventar
liegt (Ifcos, direkt zugeordnete Gegenstände) und nichts verliehen ist (409, siehe [inventar.md](./inventar.md)); dabei wird der Teilbaum
archiviert. Löschen prüft zusätzlich, ob Ifcos, Inventar-Plätze oder Ausleihen auf den Lagerort verweisen. Auf archivierte Einträge lässt sich nicht buchen oder sie auswählen (400); Listen
zeigen sie nur mit `?archiv=1`.

## Gebinde

Ein Gebinde hat keinen freien Namen; die Bezeichnung wird aus den Attributen gebildet
(`gebindeBezeichnung` in `packages/shared/src/waren.ts`). Feste Listen: `EINHEITEN` (l, kg, Stk) und
`VERPACKUNGSEINHEITEN` (Flasche, Dose, TetraPak, Kasten, Kolli, Fass, Packung), Labels in shared
(`EINHEIT_LABELS`, `VERPACKUNGSEINHEIT_LABELS`, von `i18n.ts` re-exportiert).

- **Basisgebinde:** `menge` (> 0, höchstens 3 Nachkommastellen), `einheit`, `verpackungseinheit`, optional `pfandCent`
  (`null` = kein Pfand). Bezeichnung `0,5l Flasche 0,08 €`, `0,33l Dose 0,25 €`, `1l Packung`, `6 Stk Packung`.
- **Obergebinde:** `unterGebindeId` + `unterAnzahl` (≥ 2), eigene `verpackungseinheit` und optional eigenes Pfand, keine
  Menge/Einheit. Bezeichnung `20 x 0,5l Flasche 3,10 €` (Pfand = eigenes + Anzahl × Pfand des Untergebindes, `null` zählt
  als 0; ohne jedes Pfand entfällt der Teil). Die eigene Verpackungseinheit steht nicht in der Bezeichnung.
- **Kurzname** (`gebindeKurz(g, menge?)`) ist die Verpackungseinheit und steht in Bestandszeilen
  (`9 Kästen, 13 Flaschen`) und Tabellen-Spaltenköpfen. **Pluralregel:** `VERPACKUNGSEINHEIT_LABELS` hat je Einheit
  `{ einzahl, mehrzahl }` (Flasche/Flaschen, Dose/Dosen, TetraPak/TetraPaks, Kasten/Kästen, Kolli/Kollis, Fass/Fässer,
  Packung/Packungen). Bei Menge ±1 steht die Einzahl, sonst die Mehrzahl (auch bei 0); ohne Menge die Einzahl (Auswahlfelder,
  Bezeichnungen). Spaltenköpfe nutzen `gebindeKurzMehrzahl`. Kommt derselbe Kurzname in einer Zeile mehrfach vor, steht dort
  stattdessen `2 × <volle Bezeichnung>`. Auswahlfelder, Buchungszeilen, Verlauf und die Gebinde-Liste zeigen immer die volle Bezeichnung.
- Regeln (`gebindeSchema`, `gebindeFehler`): vollständige Basis- oder Obergebinde-Kombination, nur eine Verschachtelungsebene.
  Identische Gebinde (alle Attribute inkl. Pfand, bei Obergebinden Untergebinde + Anzahl) gibt es nur einmal (409
  „Dieses Gebinde gibt es schon.“, `gebindeDoppelt`). Sortierung: erst Basis-, dann Obergebinde (`gebindeSortieren`).
- `GET /waren/:id/verlauf` liefert `gebinde: [{ id, bezeichnung, kurz }]`.

## Wartung

Ändert sich eine Waren-Migration (0010–0024) nachträglich, nimmt
`CONFIRM_DB_ROLLBACK=yes pnpm db:rollback --to 0009_vorstandsposten` alle Waren-Migrationen zurück (Mitglieder und Posten
bleiben, siehe [datenbank.md](./datenbank.md)); danach `pnpm db:migrate`. Alle Waren-Daten gehen verloren.

## API

| Route                                                                                                                                                                                                       | Recht             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `GET /api/lagerorte`, `/warengruppen`, `/gebinde`, `/waren`, `/waren/:id[/bestand\|verlauf\|vorgaenge]`, `/lagerorte/:id/waren`                                                                             | `waren:lesen`     |
| `POST/PUT/DELETE` auf `/lagerorte`, `/warengruppen`, `/gebinde`, `/waren`; `PUT …/:id/archiv`; `PUT /lagerorte/:id/reihenfolge` (`root` = oberste Ebene); `PUT /lagerorte/:id/waren`                        | `waren:verwalten` |
| `POST /api/bestand/einlagerung`, `POST /api/bestand/entnahme`, `POST /api/bestand/einlagerungen`, `POST /api/bestand/entnahmen`, `POST /api/bestand/umlagerungen`, `DELETE /api/bestand/vorgaenge/:id`      | `bestand:buchen`  |
| `GET /api/lagerorte/bestand` (Bestand aller Plätze: `[{ lagerortId, wareId, gebindeId, menge, fruehestesMhd }]`, über MHD summiert, ohne 0), `GET /api/lagerorte/warenlisten` (`[{ lagerortId, wareIds }]`) | `waren:lesen`     |
| `GET /api/inventuren[?status=offen]`, `GET /api/inventuren/:id`, `GET …/:id/zusammenfassung[?zeitpunkt=]`                                                                                                   | `waren:lesen`     |
| `POST /api/inventuren`, `PUT …/:id/knoten/:lid`, `POST …/:id/abschluss`, `DELETE …/:id`                                                                                                                     | `bestand:buchen`  |

Sammelbuchungen (je ein Request, eine Transaktion, `zeitpunkt`, optional `kommentar`, `positionen` nicht leer, `anzahl` ganze Zahl ≥ 1):

- `POST /bestand/einlagerungen` `{ positionen: [{ wareId, lagerortId, gebindeId, mhd?, anzahl }] }` -> `201 { id }`, ein Vorgang
  `einlagerung` mit einer `zugang`-Zeile je Position (Prüfung wie bei der Einzel-Einlagerung).
- `POST /bestand/entnahmen` `{ positionen: [{ wareId, lagerortId, gebindeId, anzahl }], nachfuellen: [{ lagerortId, quelleId }] }`
  -> `201 { entnahmeId, umlagerungId | null }`. FIFO je Position nur auf dem Platz selbst (nicht im Teilbaum); mehrere Positionen
  derselben Ware sehen einander. Mit `nachfuellen` entsteht danach ein zweiter Vorgang `umlagerung`, der je Platz, Ware und
  Gebinde die entnommene Menge aus `quelleId` nachstellt (FIFO an der Quelle, bei Bedarf Anbruch). `quelleId` darf nicht der Platz selbst sein.
- `POST /bestand/umlagerungen` `{ positionen: [{ wareId, gebindeId, anzahl, vonId, nachId }] }` -> `201 { id }`; `vonId` ≠ `nachId`.

**Umlagerung** (`umlagerungPlanen` in shared): FIFO am Quellplatz (nur dort, kein Teilbaum); die Abgänge werden zu negativen
`umlagerung`-Zeilen an der Quelle, dazu kommen gespiegelte positive Zeilen am Ziel mit gleichem Gebinde und MHD. Anbruch bleibt an
der Quelle; fehlender Bestand geht an der Quelle ins Minus (MHD leer) und wird am Ziel gespiegelt. `postenFortschreiben` wendet
geplante Zeilen auf Bestandsposten an, damit mehrere Positionen nacheinander geplant werden können.

`GET /waren/:id/vorgaenge` liefert je Vorgang `weitereZeilen` (Zeilen anderer Waren im selben Vorgang).

Inventur: pro Lagerort höchstens eine offene (409). Der Entwurf liegt auf dem Server; beim Abschluss entsteht ein
Vorgang (`typ=inventur`, `quelle=inventur`) mit den Korrekturen gegenüber dem Soll zum gewählten Zeitpunkt. Nur
gespeicherte Zählwerte erzeugen Differenzen: ein Soll-Schlüssel (Platz, Ware, Gebinde, MHD) ohne Zählwert gilt als korrekt
(Ist = Soll), eine ausdrückliche 0 bedeutet „nichts da“. Die Tabelle `inventur_knoten` wird nicht mehr genutzt.

## Oberfläche

- `/lager` (`waren:lesen`): Lagerort-Baum als einklappbare Liste. Mit `waren:verwalten` gibt es je Knoten ein Menü
  (Unterebene anlegen, Bearbeiten, Nach oben/unten, Warenliste bearbeiten, Archivieren, Löschen; bei 409 wird
  stattdessen Archivieren angeboten). Die Reihenfolge der Warenliste (per Drag & Drop am Griff links, auch per Touch und Tastatur)
  ist die Zählreihenfolge der Inventur und die Reihenfolge der Bestandsanzeige.
  - **Bestand je Platz:** Der Schalter „Bestand anzeigen“ (standardmäßig an, Wahl im `localStorage`) zeigt unter jedem Knoten
    seinen eigenen Bestand: `Krosti: 9 Kästen, 13 Flaschen · MHD 03.2027` (`bestandAnzeigen`, frühestes MHD klein). Reihenfolge:
    Waren der Warenliste des Knotens, danach weitere alphabetisch; leere Plätze zeigen nichts. Daten: `GET /lagerorte/bestand`
    und `GET /lagerorte/warenlisten` (alle Warenlisten in einer Anfrage, `[{ lagerortId, wareIds }]`), Query-Keys
    `['lagerorte','bestand']` und `['lagerort-waren','alle']`.
  - **Inventar je Platz** (nur mit `inventar:lesen`, siehe [inventar.md](./inventar.md)): Der Schalter „Inventar anzeigen“ (standardmäßig an,
    eigene Wahl im `localStorage`, Schlüssel `lager.inventarAnzeigen`) zeigt unter jedem Knoten die dort stehenden Ifcos (`Spanngurtkiste · 12 Teile`)
    und direkt zugeordnete Gegenstände (`Kabeltrommel 6× · 3 verliehen`) als Links zu den Detailseiten. Berechnung im Client
    (`inventarJeLagerort`, `lagerInventar.ts`) aus den Listen von `useGegenstaendeUndIfcos()`; archivierte Gegenstände und Ifcos fehlen.
  - **Karten und Kacheln:** Knoten mit sichtbaren Unterknoten sind Karten (rekursiv). Blätter unterhalb der obersten Ebene (Stellplätze)
    erscheinen nach den Karten ihres Elternknotens als Kachelraster (4 / 6 / 8 Spalten ab Handy / `sm` / `md`); oberste Knoten bleiben
    immer Karten. Eine Kachel zeigt den Namen (max. 2 Zeilen) und einen Zähler: Anzahl der Waren mit Bestand (bei „Bestand anzeigen“)
    plus Ifcos und direkt zugeordnete Gegenstände (bei „Inventar anzeigen“), „–“ wenn leer (grau, gestrichelt); archivierte Kacheln
    sind abgedunkelt, eine offene Inventur zeigt ein kleines Symbol. Tippen öffnet ein Bottom-Drawer mit dem vollen Pfad als Titel,
    Bestand und Inventar wie in der Karte und den Aktionen des Knotenmenüs als volle Buttons (eine gemeinsame Definition,
    `lagerAktionen.tsx`, gleiche Rechte- und Archiv-Regeln; Entnehmen, Einlagern, Umlagern, Inventur stehen oben). Reine Logik:
    `lagerAnsicht.ts` (Karten/Kachel-Aufteilung, Zähler, „belegt“, Aufklapp-Standard).
  - **Auf-/Zuklappen:** Standard: oberste Knoten aufgeklappt, tiefere zugeklappt. Eigene Wahl wird je Knoten im `localStorage`
    gemerkt (Schlüssel `lager.aufgeklappt`, Map Id → aufgeklappt); „Alle aufklappen“ / „Alle zuklappen“ setzen alle Knoten mit
    Unterknoten. Ohne Storage funktioniert die Seite, die Wahl wird dann nicht gemerkt.
  - **„Nur belegte Plätze“** (aus, Schlüssel `lager.nurBelegte`): blendet Knoten ohne Bestand/Inventar aus, wenn auch ihr Teilbaum leer ist
    (belegt zählt nur, was durch „Bestand“ / „Inventar anzeigen“ gerade sichtbar ist; sind beide aus oder noch nicht geladen, wirkt der
    Schalter nicht). Wirkt auch bei „Archivierte Lagerorte anzeigen“: leere archivierte Knoten verschwinden dann ebenfalls. Nach oben/unten
    tauscht mit dem sichtbaren Geschwister, die Anzeige (Karten vor Kacheln) kann davon abweichen.
  - **Aktionen (`bestand:buchen`, nicht archiviert):** Das Knotenmenü bietet Entnehmen, Einlagern, Umlagern und Inventur
    starten/fortsetzen. Oberste Knoten zeigen „Entnehmen“ und „Einlagern“ als Buttons in einer Zeile, darunter „Inventur“.
- `/lager/:id/entnehmen`, `/lager/:id/einlagern`, `/lager/:id/umlagern` (`bestand:buchen`): Tabellen für den Knoten samt
  Teilbaum, Handy zuerst; die Bausteine teilt sich die Inventur (`BestandZeile`, `BestandAbschnitt`, `InventurLeiste`,
  `useEnterWeiter`). Je Platz (Tiefensuche, nicht archivierte) ein Abschnitt, Zahlenfelder mit Zahlentastatur, Enter springt zum
  nächsten Feld (auch über Plätze), unten Zeitpunkt (jetzt, änderbar), Kommentar und die Leiste mit dem Buchen-Button. Nach dem
  Buchen: Hinweis, `['waren']` und `['lagerorte','bestand']` neu laden, zurück zu `/lager`.
  - **Entnehmen** (`EntnahmePage.tsx`): nur Plätze und Waren mit Bestand, eine Zeile je Ware (Warenlisten-Reihenfolge, dann
    alphabetisch), kein MHD-Feld (FIFO nach MHD je Platz). Je Gebinde ein Feld, wenn es auf dem Platz Bestand hat oder sein
    Obergebinde (Flaschen aus dem Kasten); Spaltenkopf in der Mehrzahl, grauer Platzhalter = Bestand des Gebindes auf dem Platz.
    Mehr als verfügbar (Untergebinde: lose + `unterAnzahl` × Obergebinde-Bestand, abzüglich der in der Zeile entnommenen
    Obergebinde) färbt das Feld orange mit „mehr als Bestand“; Buchen geht trotzdem. **Nachfüllen:** je Platz ein Schalter
    „Nachfüllen aus“ mit einem beliebigen anderen nicht archivierten Platz; beim Buchen entsteht per `nachfuellen` eine
    Umlagerung derselben Mengen aus der Quelle (Plätze ohne Menge werden ignoriert). Vor dem Buchen listet ein Dialog die
    Mengen je Platz und das Nachfüllen. `POST /bestand/entnahmen`.
  - **Einlagern** (`EinlagerungPage.tsx`): Abschnitte für alle nicht archivierten Plätze, Zeilen je Ware der Warenliste, ohne
    Platzhalter. MHD-Waren: MHD Pflicht, sobald eine Menge steht (Fehlermeldung vor dem Absenden, Feld rot); „+ MHD“ und
    „+ Ware“ (ohne „dauerhaft in die Liste“, das braucht `waren:verwalten`). `POST /bestand/einlagerungen`.
  - **Umlagern** (`UmlagerungPage.tsx`): wie Entnehmen, dazu je Abschnitt ein Pflichtfeld „Nach“ (anderer nicht archivierter
    Platz). `POST /bestand/umlagerungen`.
- `/lager/stammdaten`: Tabs „Warengruppen“ (Baum, nach Name sortiert, verschiebbar über die übergeordnete Gruppe) und
  „Gebinde“ (Karten auf dem Handy, Tabelle ab `sm`; Bezeichnung, Verpackung, Pfand, Gesamtpfand; Formular mit Umschalter „Einzelgebinde“ / „Mit Untergebinde“ und Live-Vorschau der Bezeichnung).
- `WareFelder.tsx`: wiederverwendbares Formular für Waren (Name, Warengruppe, MHD-Art, Gebinde, Aliase).
- `/waren` (`waren:lesen`): Karten aller Waren mit Suche (Name, Aliase), Warengruppenfilter (inkl. Untergruppen), Archiv-Schalter,
  aktuellem Bestand und frühestem MHD. Mit `waren:verwalten` legt „Ware anlegen“ (`WareFormular.tsx`) neue Waren an.
- `/waren/:id`: Stammdaten (Menü: Bearbeiten, Archivieren, Löschen), Schaltflächen „Einlagern“/„Entnehmen“ (`bestand:buchen`,
  `BuchungModal.tsx`; Entnahme zeigt danach die FIFO-Zeilen), Bestand je Lagerort (`WareBestand.tsx`), Bestandsverlauf als
  Stufendiagramm je Basisgebinde, umschaltbar Gesamt / Je Lager (`WareVerlauf.tsx`; `GET /waren/:id/verlauf` liefert dazu
  neben `zeilen` in Basiseinheiten auch `punkte` mit den Mengen je Lager und Gebinde für den Tooltip) sowie die Vorgänge,
  neueste zuerst, mit Löschen (`WareHistorie.tsx`). Beim Löschen eines Vorgangs werden spätere FIFO-Aufteilungen nicht neu berechnet; enthält er Zeilen anderer Waren (`weitereZeilen`, Sammelbuchung), nennt die Bestätigung deren Anzahl, denn sie werden mitgelöscht.
- `/lager/inventur/:id` (`bestand:buchen`): Inventur als eine kompakte, direkt bearbeitbare Tabelle für das ganze Lager,
  Handy zuerst (`InventurPage.tsx`, `InventurAbschnitt.tsx`, `InventurZeile.tsx`). Je Platz (Tiefensuche) eine Überschrift
  mit dem Pfad, darunter eine Zeile je Ware und MHD: vorbelegt aus dem Soll (eine Zeile je vorhandenem MHD, Anzeige „Name ·
  MM.yyyy“) und der Warenliste (in Listenreihenfolge, Waren nur mit Soll danach). MHD-Waren ohne Soll bekommen eine Zeile mit
  MHD-Eingabe, „+ MHD“ fügt eine weitere hinzu; Waren ohne MHD haben genau eine Zeile. Pro Gebinde ein kleines Zahlenfeld
  (Obergebinde zuerst, kurze Einheit darüber). **Leere Felder übernehmen den erwarteten Bestand** (grauer Platzhalter),
  eine eingetippte 0 heißt „nichts da“. „+ Ware“ je Platz ergänzt eine Ware ad hoc, optional dauerhaft in die Liste
  (`inListeAufnehmen`).
- Speichern: automatisch beim Verlassen eines Feldes und ca. 0,8 s nach dem Tippen (`useInventurSpeichern.ts`,
  `PUT …/knoten/:lid`, nur nicht leere Felder werden Zählwerte); der lokale Eingabestand bleibt maßgeblich, der Status
  („Speichert…“, „Gespeichert“) steht im Kopf. Zeilen mit Zahlen, aber ohne MHD werden nicht gespeichert („MHD fehlt“).
- Tastatur: numerisches Tastaturlayout, Eingaben nur Ziffern, Schriftgröße 16px. Enter springt zum nächsten Zahlen- oder
  MHD-Feld (über Plätze hinweg), im letzten Feld auf „Zur Zusammenfassung“.
- Die Zusammenfassung (`InventurZusammenfassung.tsx`) speichert zuvor alles Ausstehende, zeigt Soll → Ist je Platz und Ware
  (nur Abweichungen, optional alle) und bucht mit frei wählbarem Zeitpunkt nach Bestätigung. „Inventur verwerfen“ liegt im
  Menü. Abgeschlossene Inventuren sind nur ein Hinweis.
