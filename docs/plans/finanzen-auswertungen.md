# Scheibe 9: Auswertungen

Rahmen: [finanzen.md](./finanzen.md), „Scheibe 9“. Arbeitsseite der Finanzer:in → **desktop first**
(Regeln „Bedienung“ im Rahmenplan), muss am Handy ohne horizontales Scrollen gehen.

## Entscheidungen

| Thema         | Entscheidung                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sphären       | **Entfallen**: Der Verein ist nicht gemeinnützig, Sphären braucht nur die Gemeinnützigkeit.                                                                             |
| EÜR-Zuordnung | Neue Spalte `euer_zeile` an `fin_konten` (nur `erloes`/`aufwand`/`neutral`), gepflegt im Kontenplan. Eigene kurze Liste in `@c4/shared`, keine amtlichen Zeilennummern. |
| Event-Werte   | Nur Einnahmen: bar (Kassenabrechnung) und Karte (SumUp) getrennt, Summe brutto und netto. Belege/Rechnungen bekommen kein Event.                                        |
| USt           | Tabelle je Zeitraum und Steuersatz plus UStVA-Kennzahlen (Kz 81, 86, 66, 83) zum Abtippen in ELSTER.                                                                    |
| Datumsbasis   | Buchungsdatum (`fin_buchungen.datum`), also Ist-Prinzip wie gebucht. Events nach `events.beginn` (Berlin), Einkauf nach `fin_belege.belegdatum`.                        |
| Stornos       | USt, G+V, EÜR: alle Buchungen summieren (Storno hebt sich mit eigenem Datum auf). Events, Einkauf: stornierte Quellen und Stornobuchungen auslassen.                    |
| CSV           | Im Browser aus denselben Daten wie die Tabelle: `;` als Trenner, deutsches Komma, UTF-8 mit BOM (Excel), ein Button je Auswertung.                                      |
| Charts        | `@mantine/charts` (installiert, Muster `packages/web/src/WareVerlauf.tsx`) nur für den Event-Verlauf; sonst Tabellen.                                                   |
| Recht         | `finanzen:lesen` für alles, keine neue Berechtigung.                                                                                                                    |

## EÜR-Zeilen (`EUER_ZEILEN` in `packages/shared/src/finanzenAuswertungen.ts`)

Wert → Label, je mit `seite: 'einnahme' | 'ausgabe'` und `berechnet?: true` (nicht zuordenbar,
kommt aus den Steuerfeldern):

- Einnahmen: `umsatz` „Umsatzerlöse (steuerpflichtig)“, `umsatz_steuerfrei` „Steuerfreie Umsätze“,
  `nicht_steuerbar` „Nicht steuerbare Einnahmen (Beiträge, Spenden)“, `sonstige_einnahmen`
  „Sonstige Einnahmen“, `ust_vereinnahmt` „Vereinnahmte Umsatzsteuer“ (berechnet),
  `ust_erstattung` „Umsatzsteuer-Erstattung vom Finanzamt“.
- Ausgaben: `wareneinkauf` „Wareneinkauf“, `fremdleistungen` „Fremdleistungen (Künstler:innen,
  Technik)“, `raumkosten` „Raumkosten“, `versicherungen_beitraege` „Versicherungen, Beiträge,
  Gebühren“, `werbung` „Werbung“, `instandhaltung` „Instandhaltung“, `gwg` „Geringwertige
  Wirtschaftsgüter“, `sonstige_ausgaben` „Übrige Ausgaben“, `vorsteuer_gezahlt` „Gezahlte
  Vorsteuer“ (berechnet), `ust_zahlung` „Umsatzsteuer-Zahlung an das Finanzamt“.

Konten ohne Zeile erscheinen in der EÜR als „Nicht zugeordnet“ mit Warnhinweis und Link zum
Kontenplan. Die Liste darfst du zu Beginn der Umsetzung noch anpassen.

## Datenbank / Migration

- `packages/api/src/db/migrations/0280_fin_konten_euer_zeile.sql` (nächste freie Nummer prüfen):
  `ALTER TABLE fin_konten ADD COLUMN euer_zeile text;` plus `UPDATE` für die Standardkonten
  (`kartenerloese` → `umsatz`, `sumup-gebuehren` → `sonstige_ausgaben`; weitere Seed-Konten aus den
  bisherigen Migrationen sinnvoll vorbelegen). Schema in `packages/api/src/db/schema.ts`
  (`fin_konten`, ~1237).
- Kein Check-Constraint (DSQL), Prüfung per Zod gegen `EUER_ZEILEN` (ohne `berechnet`).
- **Migration → Deploy auf dev nötig** (geteilte dev-DB, siehe `CLAUDE.md` „Testing on dev“).

## Shared (`packages/shared/src/finanzenAuswertungen.ts` + Test, Export in `index.ts`)

Reine Funktionen auf Rohzeilen, von echtem Store und Fake gemeinsam genutzt:

- `zeitraumSchluessel(datum, intervall: 'monat' | 'quartal' | 'jahr')` → `2027-03` / `2027-Q1` /
  `2027`, `zeitraumLabel` („März 2027“, „1. Quartal 2027“, „2027“), `zeitraeumeZwischen(von, bis,
intervall)` (lückenlose Spalten, auch leere Zeiträume).
- `ustAuswertung(zeilen, intervall, saetze)`: je Zeitraum und `steuersatz`:
  Bemessung = −Σ `netto_cent`, USt = −Σ `steuer_cent` (Zeilen `steuer_art='ust'`),
  Vorsteuer = Σ `steuer_cent` (`vorsteuer`), Zahllast = USt − Vorsteuer. Kennzahlen je Zeitraum:
  Kz 81 = Bemessung zum Regelsatz, Kz 86 = zum ermäßigten Satz (Zuordnung über `steuersaetzeAm`
  aus `steuersaetze.ts` am Buchungsdatum), beide in **vollen Euro abgerundet**; Kz 66 = Vorsteuer,
  Kz 83 = USt − Vorsteuer (Cent). Andere Sätze (0 %, Altsätze) als eigene Zeile mit Hinweis
  „nicht in Kz 81/86“.
- `guvAuswertung(zeilen, konten, intervall)`: je `erloes`/`aufwand`-Konto und Zeitraum Netto
  (`netto_cent`, bei `steuer_art='keine'` den Wert prüfen, ggf. `betrag_cent`), Erlöse positiv
  angezeigt, Summen Erlöse, Aufwand, Ergebnis. Unterkonten nach `parent_id` eingerückt.
- `euerAuswertung(zeilen, konten, jahr)`: G+V-Werte gruppiert nach `euer_zeile`, plus berechnete
  Zeilen `ust_vereinnahmt`/`vorsteuer_gezahlt` aus den Steuerfeldern, „Nicht zugeordnet“, Summen
  Einnahmen/Ausgaben/Überschuss. `neutral`-Konten nur, wenn sie eine Zeile haben (z. B.
  USt-Zahlung).
- `eventEinnahmen(quellen)`: Zeile je Event mit bar/karte brutto, netto, Summe; `eventVerlauf(
zeilen, intervall)` je Event-Kategorie und Zeitraum (für das Chart).
- `einkaufAuswertung(posten, gebinde, jahr)`: je Ware: Anzahl Gebinde, Basismenge über
  `inBasiseinheiten` (`lagerAbgleich.ts`, löst Obergebinde auf) mit Einheit (l/kg/Stk), Summe netto
  ohne Pfand, Durchschnittspreis je Basiseinheit und je Standard-Gebinde. Gemischte Einheiten je
  Ware getrennt ausweisen.
- `csvText(kopf, zeilen)`: Escaping (`"`, `;`, Zeilenumbruch), Cent → `1234,56`. Erst prüfen, ob
  `packages/api/src/finanzExport.ts` schon einen CSV-Schreiber hat, der nach shared wandern kann.
- Zod-Schemas der Abfragen (`von`, `bis`, `intervall`, `jahr`) und DTOs ebenfalls hier.

Unit-Tests: Quartalsgrenzen, Storno im Folgemonat, Kz-Abrundung, Altsatz 16 %, Obergebinde,
gemischte Einheiten, CSV-Escaping.

## API

Neue Datei `packages/api/src/routes/finanzenAuswertungen.ts` (Muster `finanzenSumup.ts`),
Registrierung in `app.ts` (~125), alle `auth, finanzenLesen`:

| Route                                                 | Antwort                                 |
| ----------------------------------------------------- | --------------------------------------- |
| `GET /finanzen/auswertungen/ust?von&bis&intervall`    | Tabelle je Zeitraum × Satz + Kennzahlen |
| `GET /finanzen/auswertungen/guv?von&bis&intervall`    | Konten × Zeiträume                      |
| `GET /finanzen/auswertungen/euer?jahr`                | EÜR-Zeilen mit Konten                   |
| `GET /finanzen/auswertungen/events?von&bis&intervall` | Events + Verlauf je Kategorie           |
| `GET /finanzen/auswertungen/einkauf?jahr`             | Waren + Pfandsaldo                      |

Store `AuswertungenStore` in `packages/api/src/finanzen.ts` (in `FinanzenStore` einhängen), liefert
nur Rohzeilen, Rechnen in shared:

- Journalzeilen im Zeitraum: `fin_buchungszeilen` ⨝ `fin_buchungen` (datum, quelle_typ, event_id,
  storno_von) — Datenmenge eines Vereins, kein SQL-Aggregat nötig.
- Events: Kassenabrechnung über `fin_kassenabrechnung_events` ⨝ `fin_kassenabrechnungen`
  (`buchung_id` nicht NULL, Buchung nicht storniert); netto anteilig aus Netto/Brutto der
  Erlöszeile der Abrechnungsbuchung. SumUp über `fin_buchungen.event_id` mit
  `quelle_typ='sumup'`, Erlöszeile `kartenerloese`. Event-Titel, Beginn, Kategorie (Name, Farbe)
  aus `events`/`event_kategorien`.
- Einkauf: `fin_belegposten` mit `art='ware'` ⨝ `fin_belege` (Jahr aus `belegdatum`, Beleg mit
  Buchung, nicht storniert), Gebinde-Liste wie `lagerAbgleich.ts`. Bedeutung von `betrag_cent` /
  `gesamt_cent` / `pfand_betrag_cent` und Modus brutto/netto beim Beleg vorher in
  `docs/finanzen.md` „Belege“ prüfen.
- Pfandsaldo: Saldo Konto `PFAND_KONTO_ID` zum Jahresende plus Zu-/Abgang im Jahr.

Fake `packages/api/src/finanzenAuswertungen.fake.ts` aus den Buchungen des Journal-Fakes (Muster
`finanzenSumup.fake.ts`). Routentests `routes/finanzenAuswertungen.test.ts`: Rechte (403 ohne
`finanzen:lesen`), Validierung, je Route ein fachlicher Fall.

Konto anlegen/ändern: `euer_zeile` in Schema/Route/Store des Kontenplans ergänzen (Tests in
`routes/finanzen.test.ts`).

## Web

- Kontenplan (`FinanzenKonten*Page.tsx`): Auswahl „EÜR-Zeile“ (suchbar, nur bei
  `erloes`/`aufwand`/`neutral`), Spalte in der Liste, `InfoHinweis`.
- Neue Seite `packages/web/src/pages/FinanzenAuswertungenPage.tsx` unter `/finanzen/auswertungen`
  mit Unterrouten `/events`, `/ust`, `/guv`, `/euer`, `/einkauf` (Tabs als Links, Index leitet auf
  `/events` um), Routen in `routes/finanzenRouten.tsx`, Kachel „Auswertungen“ in
  `FinanzenPage.tsx`, Query-Hooks in `finanzenDaten.ts`.
- Filterzeile oben je Tab (bottom-aligned): Jahr (Standard laufendes Jahr) bzw. Von/Bis, Intervall
  (Monat/Quartal/Jahr, SegmentedControl), Button „CSV herunterladen“. Filter in der URL
  (`useSearchParams`), damit Reload und Teilen den Stand behalten.
- Tabellen dicht, Kopf- und Summenzeile fixiert, Beträge rechtsbündig mit Tabellenziffern, negative
  Werte abgesetzt; Zeiträume als Spalten (G+V, USt) mit horizontal scrollbarem Container unter
  `md` (einzige Ausnahme, Seite selbst scrollt nicht). Erlöse/Aufwand als Wörter, nie Vorzeichen
  raten lassen.
- Events: Chart (BarChart gestapelt je Event-Kategorie in deren `farbe`, je Zeitraum) über der
  Event-Tabelle; Zeile verlinkt auf das Event.
- USt: Kennzahlen-Kasten je Zeitraum (Kz 81, 86, 66, 83) mit Kopieren-Button je Wert.
- EÜR: Hinweis-Alert bei „Nicht zugeordnet“ mit Link zum Kontenplan.
- Einkauf: Waren-Tabelle (suchbar), darunter Pfandsaldo.
- CSV: `packages/web/src/csvHerunterladen.ts` (Blob + `URL.createObjectURL`), Dateiname
  `c4-<auswertung>-<zeitraum>.csv`.
- Texte (deutsch, du) und `InfoHinweis`-Texte in `finanzenHilfe.ts` (Kennzahlen, Ist-Prinzip,
  Durchschnittspreis, Pfandsaldo).

## E2E

`packages/e2e/routen.ts`: alle sechs Pfade (`/finanzen/auswertungen` + Unterrouten) als
`finanzen-arbeit`. Kein voller Flow-Spec (keine kritische Buchungsstrecke).

## Docs

`docs/finanzen.md`: neuer Abschnitt „Auswertungen“ (Überblick + Abschnittsliste, Seiten, API,
Kontenplan „EÜR-Zeile“). `docs/plans/finanzen.md`: Scheibe 9 ohne Sphären, Stand „umgesetzt“.

## Phasen (je ein frischer `implementer`)

1. Shared (`finanzenAuswertungen.ts`, Zod, Tests) + Migration + Schema + Store + Fake + Routen +
   Kontenplan-API.
2. Web: Kontenplan-Feld, Auswertungsseite mit Tabs, CSV, Chart, Hilfetexte, Kachel, Routen,
   `routen.ts`.
3. Docs.

Danach `tester` (lint, typecheck, test, `pnpm e2e` lokal), Deploy auf dev wegen Migration
(vorher `gh run list --workflow deploy.yml --limit 5` prüfen), `browser-check` je Tab am Desktop
und einmal bei 375×812. Fachlicher Abgleich: USt-Werte eines Monats gegen eine Handrechnung aus dem
Journal.

## Offene Punkte für die Umsetzung

- `netto_cent` bei `steuer_art='keine'`: gefüllt oder NULL? (bestimmt G+V-Formel)
- Wie wird eine USt-Zahlung ans Finanzamt heute gebucht (Konto)? Ggf. Konto `ust-zahlung`
  (`neutral`, Zeile `ust_zahlung`) in der Migration anlegen.
