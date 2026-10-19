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
ein `bestandsvorgang` (Einlagerung, Entnahme, Inventur) hat viele Zeilen. `erstellt_von` ist die Cognito-`sub` ohne
Fremdschlüssel. Entnahmen werden beim Buchen FIFO geplant (Bestand zum gewählten Zeitpunkt, Teilbaum des Lagerorts) und
nie neu berechnet; negativer Bestand ist erlaubt.

Stammdaten werden nur gelöscht, wenn nichts darauf verweist (sonst 409), ansonsten archiviert
(`PUT …/:id/archiv { archiviert }`). Ein Lagerort lässt sich nur archivieren, wenn der Bestand seines ganzen Teilbaums 0 ist;
dabei wird der Teilbaum archiviert. Auf archivierte Einträge lässt sich nicht buchen oder sie auswählen (400); Listen
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
- **Kurzname** (`gebindeKurz`) ist die Verpackungseinheit („Flasche“, „Kasten“) und steht in Bestandszeilen
  (`5 × Kasten`) und Inventur-Spaltenköpfen; kommt derselbe Kurzname in einer Zeile mehrfach vor, steht dort stattdessen
  die volle Bezeichnung. Auswahlfelder, Buchungszeilen, Verlauf und die Gebinde-Liste zeigen immer die volle Bezeichnung.
- Regeln (`gebindeSchema`, `gebindeFehler`): vollständige Basis- oder Obergebinde-Kombination, nur eine Verschachtelungsebene.
  Identische Gebinde (alle Attribute inkl. Pfand, bei Obergebinden Untergebinde + Anzahl) gibt es nur einmal (409
  „Dieses Gebinde gibt es schon.“, `gebindeDoppelt`). Sortierung: erst Basis-, dann Obergebinde (`gebindeSortieren`).
- `GET /waren/:id/verlauf` liefert `gebinde: [{ id, bezeichnung, kurz }]`.

## Wartung

Hat sich das Waren-Schema ohne Migration für Bestandsdaten geändert (die Migrationen 0010–0024 werden dann umgeschrieben),
löscht `CONFIRM_WAREN_RESET=yes pnpm db:waren-neu` nur die Waren-Tabellen samt Migrationseinträgen (Mitglieder und Posten bleiben);
danach `pnpm db:migrate`. Alle Waren-Daten gehen verloren.

## API

| Route                                                                                                                                                                                | Recht             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `GET /api/lagerorte`, `/warengruppen`, `/gebinde`, `/waren`, `/waren/:id[/bestand\|verlauf\|vorgaenge]`, `/lagerorte/:id/waren`                                                      | `waren:lesen`     |
| `POST/PUT/DELETE` auf `/lagerorte`, `/warengruppen`, `/gebinde`, `/waren`; `PUT …/:id/archiv`; `PUT /lagerorte/:id/reihenfolge` (`root` = oberste Ebene); `PUT /lagerorte/:id/waren` | `waren:verwalten` |
| `POST /api/bestand/einlagerung`, `POST /api/bestand/entnahme`, `DELETE /api/bestand/vorgaenge/:id`                                                                                   | `bestand:buchen`  |
| `GET /api/inventuren[?status=offen]`, `GET /api/inventuren/:id`, `GET …/:id/zusammenfassung[?zeitpunkt=]`                                                                            | `waren:lesen`     |
| `POST /api/inventuren`, `PUT …/:id/knoten/:lid`, `POST …/:id/abschluss`, `DELETE …/:id`                                                                                              | `bestand:buchen`  |

Inventur: pro Lagerort höchstens eine offene (409). Der Entwurf liegt auf dem Server; beim Abschluss entsteht ein
Vorgang (`typ=inventur`, `quelle=inventur`) mit den Korrekturen gegenüber dem Soll zum gewählten Zeitpunkt. Nur
gespeicherte Zählwerte erzeugen Differenzen: ein Soll-Schlüssel (Platz, Ware, Gebinde, MHD) ohne Zählwert gilt als korrekt
(Ist = Soll), eine ausdrückliche 0 bedeutet „nichts da“. Die Tabelle `inventur_knoten` wird nicht mehr genutzt.

## Oberfläche

- `/lager` (`waren:lesen`): Lagerort-Baum als einklappbare Liste. Mit `waren:verwalten` gibt es je Knoten ein Menü
  (Unterebene anlegen, Bearbeiten, Nach oben/unten, Warenliste bearbeiten, Archivieren, Löschen; bei 409 wird
  stattdessen Archivieren angeboten). Mit `bestand:buchen` startet oder setzt man eine Inventur fort (`/lager/inventur/:id`);
  oberste Knoten zeigen die Schaltfläche direkt. Die Reihenfolge der Warenliste (per Drag & Drop am Griff links, auch per Touch und Tastatur) ist die Zählreihenfolge der Inventur.
- `/lager/stammdaten`: Tabs „Warengruppen“ (Baum, nach Name sortiert, verschiebbar über die übergeordnete Gruppe) und
  „Gebinde“ (Karten auf dem Handy, Tabelle ab `sm`; Bezeichnung, Verpackung, Pfand, Gesamtpfand; Formular mit Umschalter „Einzelgebinde“ / „Mit Untergebinde“ und Live-Vorschau der Bezeichnung).
- `WareFelder.tsx`: wiederverwendbares Formular für Waren (Name, Warengruppe, MHD-Art, Gebinde, Aliase).
- `/waren` (`waren:lesen`): Karten aller Waren mit Suche (Name, Aliase), Warengruppenfilter (inkl. Untergruppen), Archiv-Schalter,
  aktuellem Bestand und frühestem MHD. Mit `waren:verwalten` legt „Ware anlegen“ (`WareFormular.tsx`) neue Waren an.
- `/waren/:id`: Stammdaten (Menü: Bearbeiten, Archivieren, Löschen), Schaltflächen „Einlagern“/„Entnehmen“ (`bestand:buchen`,
  `BuchungModal.tsx`; Entnahme zeigt danach die FIFO-Zeilen), Bestand je Lagerort (`WareBestand.tsx`), Bestandsverlauf als
  Stufendiagramm je Basisgebinde, umschaltbar Gesamt / Je Lager (`WareVerlauf.tsx`; `GET /waren/:id/verlauf` liefert dazu
  neben `zeilen` in Basiseinheiten auch `punkte` mit den Mengen je Lager und Gebinde für den Tooltip) sowie die Vorgänge,
  neueste zuerst, mit Löschen (`WareHistorie.tsx`). Beim Löschen eines Vorgangs werden spätere FIFO-Aufteilungen nicht neu berechnet.
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
