# Waren (Mini-Warensystem)

Lagerorte (Baum), Warengruppen (Baum), Gebinde, Waren, Bestandsbuchungen und Inventur. Fachlogik
(Bestand, FIFO, Verlauf, Inventurabgleich) liegt in `packages/shared/src/waren.ts`, Speicherung und
Validierung in `packages/api/src/waren.ts`, Routen in `packages/api/src/routes/waren.ts`.

## Überblick

Mini-Warensystem: Lagerorte (Baum), Warengruppen (Baum), Gebinde, Waren, Bestandsbuchungen und Inventur. Der Bestand ist nie gespeichert, sondern die Summe von `bestandsbuchungen.menge` je Ware, Lagerort, Gebinde und MHD; gebucht wird nur über Vorgänge, und der Bestand darf negativ werden. Fachlogik liegt in `packages/shared/src/waren.ts`, Speicherung in `packages/api/src/waren.ts`, Routen in `packages/api/src/routes/waren.ts`.

Abschnitte: Invarianten, Dateien, Rechte, Datenmodell, IFCO-Lagerplätze, Regale und Regalböden, Gebinde, FIFO-Entnahme, Wartung, API, Oberfläche (Details)

## Invarianten

- Bestand ist nie gespeichert, sondern die Summe von `bestandsbuchungen.menge` je Ware, Lagerort, Gebinde und MHD (`bestandZu`);
  Posten mit Summe 0 entfallen. Gebucht wird nur über Vorgänge (`bestandsvorgang`); ein Vorgang wird gelöscht, nicht bearbeitet.
- **Bestand darf negativ werden:** Eine Entnahme über den Bestand hinaus bucht den Rest ins Minus am gewählten Lagerort (MHD leer),
  siehe [FIFO-Entnahme](#fifo-entnahme). Es gibt keine Bestandsprüfung beim Entnehmen.
- **Kein Zukunftsdatum:** Der `zeitpunkt` einer Buchung (Einlagerung, Entnahme, Umlagerung, Inventur-Abschluss) darf nicht in der
  Zukunft liegen (400, `buchungsZeitpunktSchema`; 5 Minuten Toleranz für eine vorgehende Handyuhr). Rückdatieren bleibt erlaubt. So
  weichen angezeigter Bestand und entnehmbarer Bestand („jetzt“) nicht auseinander. Die Formulare setzen `max` und zeigen den Fehler.
- Entnahmen werden beim Buchen FIFO geplant und danach **nie neu berechnet**; auch das Löschen eines früheren Vorgangs ändert
  spätere Aufteilungen nicht.
- Das MHD hängt an der Ware (`mhdArt`: `keins`/`tag`/`monat`); Monats-MHDs werden als Erster des Monats gespeichert, MHD-Waren brauchen
  beim Einlagern ein MHD (`mhdNormalisieren`, `einlagerungMhd`).
- Stammdaten lassen sich nur löschen, wenn nichts darauf verweist (409), sonst archivieren; auf archivierte Einträge lässt sich nicht
  buchen (400).
- Gebinde sind eindeutig über alle Attribute (409 `gebindeDoppelt`) und kennen nur eine Verschachtelungsebene.
- Hat ein Gebinde Buchungen, lassen sich Menge, Einheit und Untergebinde (`unterGebindeId`, `unterAnzahl`) nicht mehr ändern (409,
  neues Gebinde anlegen); Umbenennen, Pfand und Verpackungseinheit bleiben änderbar. Ebenso lässt sich die `mhdArt` einer Ware mit Buchungen nicht
  mehr ändern (409).
- Archivierte IFCOs belegen keinen Lagerort: Sie blockieren weder das Archivieren noch das Löschen des Lagerorts. Beim Löschen wird ihr
  `lagerort_id` geleert; wird eine solche IFCO wiederhergestellt, steht sie ohne Platz da.
- Pro Lagerort höchstens eine offene Inventur (409); ein Soll-Schlüssel ohne gespeicherten Zählwert gilt als korrekt (Ist = Soll),
  eine ausdrückliche 0 heißt „nichts da“.
- Ein IFCO-Lagerplatz nimmt nie gleichzeitig IFCOs und Ware auf (siehe [IFCO-Lagerplätze](#ifco-lagerplätze)).

## Dateien

| Bereich | Dateien                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API     | `packages/api/src/waren.ts` (Stores, Planung der Sammelbuchungen, Inventur), `ifcoPlatz.ts` (IFCO-Kapazitätsprüfung), Routen in `routes/waren.ts`                                                                                                                                                                                                                                             |
| Shared  | `packages/shared/src/waren.ts` (Schemas, Gebinde, Bestand, FIFO, Verlauf, Inventurabgleich, Regale)                                                                                                                                                                                                                                                                                           |
| Web     | Seiten `pages/LagerPage.tsx`, `EntnahmePage.tsx`, `EinlagerungPage.tsx`, `UmlagerungPage.tsx`, `InventurPage.tsx`, `StammdatenPage.tsx`, `WarenPage.tsx`, `WareDetailPage.tsx`; Komponenten `LagerBaum.tsx`, `LagerKachel.tsx`, `BestandAbschnitt.tsx`, `BestandZeile.tsx`, `BuchungModal.tsx`, `InventurZusammenfassung.tsx`; Logik `lagerAnsicht.ts`, `lagerBestand.ts`, `inventurDaten.ts` |
| Tests   | `packages/shared/src/waren.test.ts`, `packages/api/src/waren.test.ts`, `packages/web/src/lagerAnsicht.test.ts`, `lagerBestand.test.ts`                                                                                                                                                                                                                                                        |

## Rechte

- `waren:lesen` und `bestand:buchen` haben alle Status. Buchen umfasst Einlagerung, Entnahme, Inventur
  (starten, zählen, abschließen, verwerfen) und das endgültige Löschen eines Vorgangs.
- `waren:verwalten` (Stammdaten: Lagerorte samt Reihenfolge und Warenliste, Warengruppen, Gebinde, Waren) haben Admins und
  die Vorstandsposten (Migration `0024`); es lässt sich über `POSTEN_RECHTE` auch weiteren Posten geben.

## Datenmodell

Migrationen `0010`–`0023` (`0012_gebinde.sql` wurde vor dem Merge für das neue Gebinde-Modell umgeschrieben). Bestand ist die Summe der `bestandsbuchungen.menge` je Ware, Lagerort, Gebinde und MHD;
ein `bestandsvorgang` (Einlagerung, Entnahme, Umlagerung, Inventur; `quelle` u. a. `inventur` und `beleg`) hat viele Zeilen mit der Art `zugang`, `abgang`, `anbruch`, `umlagerung` oder `korrektur`. `erstellt_von` ist die Cognito-`sub` ohne
Fremdschlüssel. Entnahmen werden beim Buchen FIFO geplant (Bestand zum gewählten Zeitpunkt, Teilbaum des Lagerorts; die Sammel-Entnahme `/bestand/entnahmen` nur auf dem Platz selbst) und
nie neu berechnet; negativer Bestand ist erlaubt.

**Quelle `beleg`:** Ein Einkaufsbeleg mit Lager-Posten und Schalter „Einlagern“ erzeugt beim Buchen einen Einlagerungs-Vorgang mit `quelle = beleg`
(Kommentar „Beleg B-JJJJ-NNNN“, `fin_belege.bestandsvorgang_id`); siehe [finanzen.md](./finanzen.md), „Belege“. **Warengruppe → Kategorie:**
`warengruppen.kategorie_id` (Aufwandskonto, nullable, an Untergruppen vererbt) schlägt die Kategorie für Ware-Posten vor; gepflegt auf
`/finanzen/warengruppen-kategorien`.

Stammdaten werden nur gelöscht, wenn nichts darauf verweist (sonst 409), ansonsten archiviert
(`PUT …/:id/archiv { archiviert }`). Ein Lagerort lässt sich nur archivieren, wenn der Bestand seines ganzen Teilbaums 0 ist und im Teilbaum kein Inventar
liegt (IFCOs, direkt zugeordnete Gegenstände) und nichts verliehen oder vorgemerkt ist (409, siehe [inventar.md](./inventar.md)); dabei wird der Teilbaum
archiviert. Löschen prüft zusätzlich, ob IFCOs, Inventar-Plätze oder Ausleihen auf den Lagerort verweisen. Auf archivierte Einträge lässt sich nicht buchen oder sie auswählen (400); Listen
zeigen sie nur mit `?archiv=1`.

## IFCO-Lagerplätze

Ein Lagerort **ohne Unterebenen** (normales Blatt oder Regalboden, kein Regal) lässt sich als **IFCO-Lagerplatz** markieren:
`lagerorte.ifco_hoehe_cm` (> 0, eine Nachkommastelle) und `ifco_stellflaechen` (≥ 0,5 in 0,5er-Schritten; 1 = eine Fläche 60×40) sind
beide gesetzt, sonst beide `NULL`. In der API: `ifcoPlatz: { hoeheCm, stellflaechen } | null` bei
`POST`/`PUT /lagerorte` (beim `PUT` heißt fehlend „unverändert“, `null` hebt die Markierung auf), `boedenIfcoPlatz` beim Anlegen eines
Regals und `ifcoPlatz` bei `POST /lagerorte/:id/boeden` machen die neuen Böden zu IFCO-Lagerplätzen: ein Objekt gilt für alle, ein Array
(`boeden`/`namen` gleich lang, gleiche Reihenfolge, sonst 400) gibt jedem Boden eigene Maße (Höhe je Reihe). Die Antworten enthalten
`ifcoHoeheCm` und `ifcoStellflaechen`. Was auf einen IFCO-Lagerplatz passt, steht in [inventar.md](./inventar.md).

- Ein IFCO-Lagerplatz kann keine Unterebenen haben (Anlegen oder Verschieben darunter: 400); ein Regal ist selbst keiner.
- **Ware und IFCOs teilen sich keinen Platz:** Ein IFCO-Lagerplatz legt nur die Kapazität für IFCOs fest und verbietet sonst nichts. Solange
  **keine** IFCO dort steht, gilt er für Ware wie ein normaler Lagerort (Einlagern, Umlagern-Ziel, Sammelbuchungen, Inventur, Warenliste;
  Gegenstände sind immer erlaubt). Steht mindestens eine nicht archivierte IFCO dort, sind Buchungen auf den Platz (Einlagern, Umlagern-Ziel,
  Nachfüllen-Ziel, Inventur starten) 400 „Auf „HR11“ stehen IFCOs; dort kann gerade keine Ware liegen.“; Inventuren überspringen solche
  Plätze im Teilbaum (`inventurKnotenIds`). Entnehmen und Umlagern-Quelle bleiben möglich. Umgekehrt ist eine IFCO auf einen IFCO-Lagerplatz
  mit Bestand ≠ 0 zu stellen 400 „Auf „HR11“ liegt Ware; dort kann keine IFCO stehen.“ (siehe [inventar.md](./inventar.md)).
- Markieren ist auch bei Bestand oder Warenliste erlaubt; es prüft nur, dass die stehenden IFCOs passen (400).
- Oberfläche: Die Warenseiten (Einlagern, Umlagern-Ziel, `BuchungModal`) und die Buchungsaktionen der Lager-Seite lassen nur Plätze weg, auf
  denen IFCOs stehen (`useOrteMitIfcos`, auf der Lager-Seite aus der IFCO-Liste).

## Regale und Regalböden

Lagerorte haben eine Art (`lagerorte.art`): `null` = normaler Lagerort, `regal` oder `regalboden`
(`LAGERORT_ARTEN`, Labels Lagerort / Regal / Regalboden in `LAGERORT_ART_LABELS`, über `i18n.ts` verfügbar). Regeln
(`lagerortArtFehler`, `lagerortArtAenderungFehler`, `kinderArtNach` in shared; Verstöße sind 400 mit deutscher Meldung):

- Unter einem Regal liegen nur Regalböden; ein Regalboden braucht ein Regal als Eltern und hat keine Unterebenen.
- Ein Regal liegt auf der obersten Ebene oder unter einem normalen Lagerort (nicht unter Regal/Regalboden). Verschieben (`parentId`) prüft dasselbe.
- Art ändern (`PUT`, fehlendes `art` = unverändert): normal -> Regal nur, wenn keine Unterebene eigene Unterebenen hat
  (die Unterebenen werden in derselben Transaktion zu Regalböden); Regal -> normal macht die Böden zu normalen Lagerorten;
  die Art eines Regalbodens lässt sich nicht ändern.
- Namen der Böden eines Regals sind eindeutig (ohne Groß-/Kleinschreibung), auch beim Umbenennen eines Bodens.
- `POST /api/lagerorte` mit `art: 'regal'` und `boeden: string[]` (1–50, getrimmt, nicht leer, eindeutig) legt Regal und Böden in
  einer Transaktion an (Positionen in Reihenfolge) -> `201 { id, boedenIds }`. `POST /api/lagerorte/:id/boeden { namen }`
  (`waren:verwalten`) hängt Böden an ein Regal an -> `201 { boedenIds }`.
- Namensvorschlag (`bodenNamen`, zeilenweise): `{r}` = Reihe, `{p}` = Platz in der Reihe, `{n}` = laufende Nummer ab Startnummer;
  `HR{r}{p}` ergibt HR11, HR12, …, HR21, …. Ohne Platzhalter wird ` {n}` angehängt.

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

## FIFO-Entnahme

`entnahmePlanen` (`packages/shared/src/waren.ts`) plant eine Entnahme (`anzahl` eines Gebindes einer Ware). Der Aufrufer
(`entnahmeZeilen`, `entnahmenZeilen` in `packages/api/src/waren.ts`) übergibt den Bestand der Ware zum gewählten Zeitpunkt
(Rückdatieren erlaubt), eingeschränkt auf den Teilbaum des gewählten Lagerorts (Sammel-Entnahme: nur der Platz selbst). Es zählen
nur Posten mit Menge > 0; bereits negativer Bestand wird nicht ausgeglichen.

1. **Reihenfolge der Posten** (`fifoVergleich`): MHD aufsteigend (Posten ohne MHD zuletzt), dann `ersterZugang` (frühester positiver
   Zugang des Postens), dann Lagerort-Id, dann Gebinde-Id. Die letzten beiden Schlüssel sind nur für eine feste Reihenfolge da, sie
   sortieren nicht nach Namen.
2. **Lose Einheiten zuerst:** In dieser Reihenfolge werden zuerst alle Posten **des angefragten Gebindes** aufgebraucht
   (`abgang`), auch wenn ein Obergebinde ein früheres MHD hat.
3. **Anbruch:** Reicht das nicht, öffnet sie Obergebinde, deren Untergebinde das angefragte Gebinde ist, wieder in der Reihenfolge
   aus 1. Je geöffnetem Obergebinde am selben Lagerort und MHD: −1 Obergebinde (`anbruch`), +`unterAnzahl` lose (`anbruch`), davon
   −min(`unterAnzahl`, Rest) (`abgang`). Übrige lose Einheiten bleiben als Bestand liegen. Es wird nur eine Ebene geöffnet.
4. **Rest ohne Deckung:** Bleibt danach ein Rest, wird er als `abgang` am gewählten Lagerort mit MHD `null` gebucht; der Bestand
   dort wird negativ (kein Fehler).
5. Zeilen gleicher Art, Lagerort, Gebinde und MHD werden zusammengefasst, Zeilen mit Menge 0 entfallen.

Beispiel (Ware mit Monats-MHD, Gebinde „Flasche“ und „Kasten“ = 20 Flaschen): Bestand 5 Flaschen (MHD 03.2027) und 2 Kästen
(MHD 01.2027) am Platz. Entnahme von 8 Flaschen: 5 lose Flaschen (03.2027, obwohl die Kästen früher ablaufen), dann ein Kasten
01.2027 öffnen (−1 Kasten, +20 Flaschen) und 3 Flaschen entnehmen; es bleiben 17 lose Flaschen und 1 Kasten (beide 01.2027).
Entnahme von 50 Flaschen: 5 + 20 + 20 aus den Beständen (beide Kästen geöffnet) und 5 Flaschen ohne MHD im Minus (−5).

**MHD-Speicherung:** `mhdArt` der Ware (`keins`, `tag`, `monat`) bestimmt, was gespeichert wird (`mhdNormalisieren`): `keins` immer
`null`, `tag` das Datum, `monat` den **Ersten des Monats** (`2027-03-01`). Angezeigt wird `dd.MM.yyyy` bzw. `MM.yyyy`
(`mhdAnzeigen`). Da das MHD als ISO-Text sortiert wird, ordnet der Erste des Monats Monats-MHDs richtig ein. Beim Einlagern ist ein
MHD Pflicht, wenn `mhdArt` nicht `keins` ist (400 „Bitte gib ein MHD an.“).

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

Inventur: pro Lagerort höchstens eine offene (409); auch auf einem über- oder untergeordneten Lagerort darf keine offene
laufen (409 „Für einen übergeordneten oder untergeordneten Lagerort läuft schon eine Inventur.“). Der Entwurf liegt auf dem Server; beim Abschluss entsteht ein
Vorgang (`typ=inventur`, `quelle=inventur`) mit den Korrekturen gegenüber dem Soll zum gewählten Zeitpunkt. Nur
gespeicherte Zählwerte erzeugen Differenzen: ein Soll-Schlüssel (Platz, Ware, Gebinde, MHD) ohne Zählwert gilt als korrekt
(Ist = Soll), eine ausdrückliche 0 bedeutet „nichts da“. Die Tabelle `inventur_knoten` wird nicht mehr genutzt und nicht mehr abgefragt (sie bleibt im Schema).

## Oberfläche (Details)

- `/lager` (`waren:lesen`): Lagerort-Baum als einklappbare Liste. Mit `waren:verwalten` gibt es je Knoten ein Menü
  (Unterebene anlegen bzw. bei Regalen „Böden hinzufügen“, Bearbeiten, Nach oben/unten (nicht bei Regalböden), Warenliste bearbeiten, Archivieren bzw. Wiederherstellen, Löschen; bei 409 wird
  stattdessen Archivieren angeboten). Die Reihenfolge der Warenliste (per Drag & Drop am Griff links, auch per Touch und Tastatur)
  ist die Zählreihenfolge der Inventur und die Reihenfolge der Bestandsanzeige.
  - **Bestand je Platz:** Der Schalter „Bestand anzeigen“ (standardmäßig an, Wahl im `localStorage`) zeigt unter jedem Knoten
    seinen eigenen Bestand: `Krosti: 9 Kästen, 13 Flaschen · MHD 03.2027` (`bestandAnzeigen`, frühestes MHD klein). Reihenfolge:
    Waren der Warenliste des Knotens, danach weitere alphabetisch; leere Plätze zeigen nichts. Daten: `GET /lagerorte/bestand`
    und `GET /lagerorte/warenlisten` (alle Warenlisten in einer Anfrage, `[{ lagerortId, wareIds }]`), Query-Keys
    `['lagerorte','bestand']` und `['lagerort-waren','alle']`.
  - **Inventar je Platz** (nur mit `inventar:lesen`, siehe [inventar.md](./inventar.md)): Der Schalter „Inventar anzeigen“ (standardmäßig an,
    eigene Wahl im `localStorage`, Schlüssel `lager.inventarAnzeigen`) zeigt unter jedem Knoten die dort stehenden IFCOs (`Spanngurtkiste · 12 Teile`)
    und direkt zugeordnete Gegenstände (`Kabeltrommel 6× · 3 verliehen · 2 vorgemerkt`) als Links zu den Detailseiten. Berechnung im Client
    (`inventarJeLagerort`, `lagerInventar.ts`) aus den Listen von `useGegenstaendeUndIfcos()`; archivierte Gegenstände und IFCOs fehlen.
  - **Karten und Kacheln:** Jeder Knoten ist eine Karte (rekursiv, auch Blätter); Regale tragen ein „Regal“-Abzeichen. Nur die
    Regalböden eines Regals erscheinen als Kachelraster (4 / 6 / 8 Spalten ab Handy / `sm` / `md`). Beginnen alle Namen eines Rasters mit demselben Wort (`Stellplatz 1` … `Stellplatz 16`), steht es einmal klein über dem
    Raster und die Kacheln zeigen nur den Rest (`kachelBeschriftung`). Eine Kachel zeigt den Namen (max. 2 Zeilen) und einen Zähler: Anzahl der Waren mit Bestand (bei „Bestand anzeigen“)
    plus IFCOs und direkt zugeordnete Gegenstände (bei „Inventar anzeigen“), „–“ wenn leer (grau, gestrichelt); archivierte Kacheln
    sind abgedunkelt, eine offene Inventur zeigt ein kleines Symbol. Tippen öffnet ein Bottom-Drawer mit dem vollen Pfad als Titel,
    Bestand und Inventar wie in der Karte und den Aktionen des Knotenmenüs als volle Buttons (eine gemeinsame Definition,
    `lagerAktionen.tsx`, gleiche Rechte- und Archiv-Regeln; Entnehmen, Einlagern, Umlagern, Inventur stehen oben). Reine Logik:
    `lagerAnsicht.ts` (Karten/Kachel-Aufteilung, Zähler, „belegt“, Aufklapp-Standard).
  - **Regalböden sind nicht verschiebbar:** Ihre Reihenfolge ist durch die Namen vorgegeben. `PUT /lagerorte/:id/reihenfolge` mit einem Regal als
    Eltern ist 400 „Regalböden lassen sich nicht verschieben.“; „Nach oben/unten“ erscheint bei Böden nicht (`lagerAktionen.tsx`). Ein anderes
    Eltern bekommt ein Boden weiterhin nicht.
  - **Höhe je Reihe:** Mit „Als IFCO-Lagerplätze anlegen“ und mehreren Reihen erscheint je Reihe ein Feld „Höhe Reihe r (cm)“ (alle folgen
    dem ersten Wert, bis man sie ändert); die Stellflächen sind gemeinsam. `boedenPlatzErgebnis` (`IfcoPlatzFelder.tsx`) macht daraus das Array
    pro Boden (`bodenMasse`, Reihe für Reihe wie `bodenNamen`).
  - **Regal anlegen/bearbeiten** (`LagerortFormular.tsx`, `BoedenFelder.tsx`, `BoedenModal.tsx`): Der Dialog (Titel „Lager anlegen“, „Unterebene anlegen“ bzw. „<Art> bearbeiten“)
    hat (wo ein Regal erlaubt ist) den Umschalter „Lagerort“ / „Regal“. Für ein Regal: Reihen (Standard 1), Plätze je Reihe (Standard 5),
    zusammen höchstens 50, Namensmuster (Standard `Boden {n}`, bei mehreren Reihen `Reihe {r} Platz {p}`), Startnummer (für `{n}`)
    und die Liste der erzeugten Namen als Eingabefelder, einzeln überschreibbar (Änderung von Muster/Anzahl erzeugt sie neu). „Böden
    hinzufügen“ nutzt dieselben Felder, `{n}` beginnt nach den vorhandenen Böden. Beim Bearbeiten ist der Umschalter gesperrt (mit Hinweis),
    wenn die Regeln es nicht erlauben; Regalböden sind einzeln über „Bearbeiten“ umbenennbar.
  - **Auf-/Zuklappen:** Standard: oberste Knoten aufgeklappt, tiefere zugeklappt; Regale sind bei jedem Aufruf zugeklappt (ihre Wahl gilt nur bis
    zum Verlassen der Seite und wird nicht gespeichert, `zuMerken`). Eigene Wahl anderer Knoten wird je Knoten im `localStorage`
    gemerkt (Schlüssel `lager.aufgeklappt`, Map Id → aufgeklappt); „Alle aufklappen“ / „Alle zuklappen“ setzen alle Knoten mit
    Unterknoten. Ohne Storage funktioniert die Seite, die Wahl wird dann nicht gemerkt.
  - **„Nur belegte Plätze“** (aus, Schlüssel `lager.nurBelegte`): blendet Knoten ohne Bestand/Inventar aus, wenn auch ihr Teilbaum leer ist
    (belegt zählt nur, was durch „Bestand“ / „Inventar anzeigen“ gerade sichtbar ist; sind beide aus oder noch nicht geladen, wirkt der
    Schalter nicht). Wirkt auch bei „Archivierte Lagerorte anzeigen“: leere archivierte Knoten verschwinden dann ebenfalls. Nach oben/unten
    tauscht mit dem sichtbaren Geschwister, die Anzeige (Karten vor Kacheln) kann davon abweichen.
  - **Aktionen (`bestand:buchen`, nicht archiviert):** Das Knotenmenü bietet Entnehmen, Einlagern, Umlagern und Inventur
    starten/fortsetzen. Oberste Knoten zeigen „Entnehmen“ und „Einlagern“ als Buttons in einer Zeile, darunter „Inventur“.
    „Entnehmen“ und „Umlagern“ erscheinen nur, wenn der Knoten samt Teilbaum Waren-Bestand hat (`knotenMitBestand`, unabhängig vom
    Schalter „Bestand anzeigen“; solange der Bestand lädt, werden sie gezeigt).
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
- `/waren/:id`: Stammdaten (Menü: Bearbeiten, Archivieren bzw. Wiederherstellen, Löschen), Schaltflächen „Einlagern“/„Entnehmen“ (`bestand:buchen`,
  `BuchungModal.tsx`; Entnahme zeigt danach die FIFO-Zeilen), Bestand je Lagerort (`WareBestand.tsx`), Bestandsverlauf als
  Stufendiagramm je Basisgebinde, umschaltbar Gesamt / Je Lager (`WareVerlauf.tsx`; `GET /waren/:id/verlauf` liefert dazu
  neben `zeilen` in Basiseinheiten auch `punkte` mit den Mengen je Lager und Gebinde für den Tooltip) sowie die Vorgänge,
  neueste zuerst, mit Löschen (`WareHistorie.tsx`); der Ersteller steht als Username (ohne Username „Vorname Nachname“), fett in der Statusfarbe und verlinkt zum Mitglied. `ersteller` in `GET /waren/:id/vorgaenge` und `/inventuren[/:id]` trägt dazu `sub`, `username` und `status`. Beim Löschen eines Vorgangs werden spätere FIFO-Aufteilungen nicht neu berechnet; enthält er Zeilen anderer Waren (`weitereZeilen`, Sammelbuchung), nennt die Bestätigung deren Anzahl, denn sie werden mitgelöscht.
- `/lager/inventur/:id` (`bestand:buchen`): Inventur als eine kompakte, direkt bearbeitbare Tabelle für das ganze Lager,
  Handy zuerst (`InventurPage.tsx`, Abschnitte und Zeilen aus `BestandAbschnitt.tsx` und `BestandZeile.tsx`, Daten in `inventurDaten.ts`). Je Platz (Tiefensuche) eine Überschrift
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
