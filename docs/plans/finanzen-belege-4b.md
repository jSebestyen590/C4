# Finanzen Scheibe 4b: Belege einreichen, Lager-Posten, Pfand, Einlagern – Umsetzungsplan

Rahmen: [finanzen.md](./finanzen.md) (Architektur, Bedienung, Scheibe 4), Vorgänger:
[finanzen-belege.md](./finanzen-belege.md) (4a, umgesetzt). Diese Datei ist der vollständige Plan für die
Umsetzungs-Session; Entscheidungen mit dem Nutzer geklärt am 19.11.2026. Nach dem Merge den Stand in
`docs/plans/finanzen.md` (Scheibe 4, Stand-Tabelle) nachtragen und diese Datei als erledigt markieren.

## Entscheidungen (geklärt)

| Thema                  | Entscheidung                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pfand                  | Neues Konto `pfand` „Pfand/Leergut“, Art `durchlauf` (Forderung, kein Aufwand). Pfand trägt **Vorsteuer mit dem Satz der Ware** (Zeile `steuer_art = vorsteuer`, die Validierung erlaubt das an jedem Konto). Saldo = ausstehendes Leergut. |
| Pfandrückgabe          | Neue Posten-Art `leergut` (Text + Betrag, meist negativ, Steuersatz wählbar) bucht gegen `pfand`. Kategorie-Posten bleiben Aufwand.                                                                                                          |
| Lager-Posten           | Posten-Art `ware`: Ware + Gebinde, Anzahl in Gebinden, Einzelpreis je Gebinde **ohne** Pfand, Pfand je Gebinde aus `pfandGesamtCent` vorbelegt (überschreibbar, `null` = kein Pfand), gleich netto/brutto wie der Posten.                    |
| Warengruppe → Kategorie | Spalte `warengruppen.kategorie_id` (Aufwandskonto, nullable), vererbt an Untergruppen (nächster Vorfahr mit Zuordnung). Ware-Posten übernimmt sie, überschreibbar. Ohne Zuordnung: Pflichtfehler „Kategorie fehlt“ am Posten.               |
| Einlagern              | Optionaler Schalter je Beleg, **beim Buchen in derselben Transaktion**. Lagerort je Ware-Posten, MHD wo die Ware eins braucht, Zeitpunkt (Standard Belegdatum 12:00 Berlin, bei heute jetzt; nicht in der Zukunft). Braucht zusätzlich `bestand:buchen`. |
| Einlagern-Verweis      | `bestandsvorgaenge.quelle` bekommt den Wert `beleg`; `fin_belege.bestandsvorgang_id` (nullable) verweist darauf; Kommentar des Vorgangs „Beleg B-JJJJ-NNNN“. Storno des Belegs ändert den Bestand **nicht** (Hinweis im Storno-Dialog).       |
| Einreichen: Zahlweg    | Mitglied reicht immer als **Auslage** ein (Zahler = Einreicher:in). Die Finanzer:in darf den Zahlweg beim Prüfen ändern.                                                                                                                      |
| Einreichen: Felder     | Pflicht: Foto/Datei, Belegdatum, Gesamtbetrag. Optional: Rechnungssteller (Auswahl oder freier Name als Vorschlag), Notiz, Posten (Kategorie-Posten). Eigenbeleg nicht für Mitglieder.                                                       |
| Einreichen: Änderung   | Nach dem Einreichen kein Bearbeiten durch das Mitglied; **Zurückziehen** (löschen) solange noch eingereicht, dann neu einreichen.                                                                                                             |
| Status fürs Mitglied   | eingereicht → gebucht (offen) → erstattet; oder verworfen (mit Begründung); storniert. Abgeleitet, nicht gespeichert, außer `verworfen`.                                                                                                       |
| Push                   | `belege.eingereicht` an alle mit `finanzen:buchen` (außer Einreicher:in); `belege.status` ans Mitglied bei gebucht, verworfen (mit Grund) und erstattet. Beide abschaltbar, Standard an.                                                     |
| Betragsabgleich        | Eingereichter Betrag ≠ berechnete Summe beim Buchen → neue Warnung `betrag_abweichung` (bestätigungspflichtig).                                                                                                                              |

## Datenmodell (Migrationen ab der nächsten freien Nummer, je mit Down-Datei)

- `fin_konten`: `INSERT … ('pfand', 'Pfand/Leergut', 'durchlauf', false)` idempotent (Muster `0205`).
- `warengruppen.kategorie_id text NULL` (kein FK über Bereiche nötig, Prüfung in der API: Aufwandskonto, nicht archiviert).
- `fin_belegposten`: `art text NOT NULL DEFAULT 'kategorie'` (`kategorie` | `ware` | `leergut`), `ware_id`, `gebinde_id`,
  `pfand_cent` (je Gebinde, nullable), `pfand_betrag_cent` (nullable). `kategorie_id` bleibt nullable (leergut hat keine).
- `fin_belege`: `bestandsvorgang_id` (nullable), `eingereicht_von` (Mitglied-ID, nullable), `eingereicht_am`, `eingereicht_betrag_cent`.
- `fin_beleg_entwuerfe`: `eingereicht_von`, `eingereicht_am`, `status text NOT NULL DEFAULT 'entwurf'` (`entwurf` | `eingereicht` |
  `verworfen`), `verworfen_grund`, `verworfen_von`, `verworfen_am`. Verworfene Einreichungen bleiben als Zeile (Historie fürs Mitglied).
- `bestandsvorgaenge.quelle`: `QUELLEN` in `shared/src/waren.ts:43` um `beleg` erweitern (Check-Constraint, falls vorhanden, anpassen).
- `finanzenNurInsert.test.ts`: `fin_belegposten`/`fin_belege` bleiben Nur-INSERT; Entwürfe dürfen weiter geändert werden.
- `docs/datenbank.md` ergänzen.

## Shared (`packages/shared/src/belege.ts`, Bezug: Posten-Schema 117-130, Entwurf 140-161, `belegBerechnen` 261, `belegBuchungszeilen` 332-378)

- `belegPostenSchema` → diskriminiert nach `art`:
  - `kategorie` wie bisher;
  - `ware`: `wareId`, `gebindeId`, `kategorieId` (Pflicht beim Buchen, Vorschlag aus Warengruppe), `text` (optional, Standard Warenname),
    `anzahlMilli`, `einzelpreisCent`, `steuersatz`, `pfandCent | null`;
  - `leergut`: `text`, `anzahlMilli`, `einzelpreisCent` (Vorzeichen frei), `steuersatz`.
  - Bestehende Entwurfs-JSONs ohne `art` gelten als `kategorie` (Default im Schema; keine Altdaten-Sonderlogik darüber hinaus).
- Entwurf-Daten zusätzlich: `einlagern: boolean`, `einlagerungZeitpunkt`, je Ware-Posten `lagerortId`, `mhd`; Einreichungsfelder
  `eingereichtBetragCent`, `rechnungsstellerName` (freier Vorschlag), `notiz`.
- `belegEinreichenSchema` (Mitglied): `datei`, `belegdatum`, `betragCent`, optional `rechnungsstellerId | rechnungsstellerName`, `notiz`,
  `posten[]` (nur `kategorie`).
- `belegBerechnen`: Pfand eines Ware-Postens = Anzahl × `pfandCent`, geht in die Summe je Steuersatz ein; `postenBetraege` bekommt Pfand separat.
- `belegBuchungszeilen`: Gruppenschlüssel (Konto, Satz); Ware → `kategorieId`, Pfand eines Ware-Postens und `leergut` → `pfand`.
  Steuerverteilung (`verteile`) unverändert über alle Gruppen.
- `belegPruefen`: Ware/Gebinde Pflicht bei `ware`; bei `einlagern` je Ware-Posten mit positiver Anzahl: ganze Anzahl ≥ 1 (`anzahlSchema`),
  Lagerort; MHD-Pflicht prüft die API (braucht `mhdArt`). Negative Ware-Posten werden nicht eingelagert.
- `warengruppeKategorie(gruppen, id)`: nächster Vorfahr mit `kategorieId`.
- `einreichungStatus(...)` → `eingereicht | verworfen | gebucht | erstattet | storniert` (für Liste und Push).
- Tests in `belege.test.ts`: Pfand brutto/netto, gemischte Sätze mit Pfand, Leergut negativ, Gruppierung Ware+Kategorie, Vererbung der
  Kategorie, Einlagern-Prüfung, Status-Ableitung.

## API

- `finanzenBelege.ts` (`planeBeleg` 113, `belegWarnungenBilden` 156, `entwurfBuchenTx` 412):
  - Ware-Posten laden (Ware, Gebinde gehört zur Ware über `ware_gebinde`, nicht archiviert), `pfand`-Konto als Gegenkonto für Pfandzeilen.
  - Warnung `betrag_abweichung`, wenn `eingereicht_betrag_cent` gesetzt und ≠ Summe.
  - **Einlagern** in derselben `db.transaction`: Waren-Helfer `buchbareWare`, `buchbarerLagerort`, `einlagerungMhd`, `vorgangAnlegen`
    (`packages/api/src/waren.ts` ~1544-1625) exportieren bzw. als `tx`-Funktionen herauslösen und aus `entwurfBuchenTx` aufrufen
    (`typ: 'einlagerung'`, `quelle: 'beleg'`, Kommentar mit Belegnummer); Fehler als 400. Prüfen, dass `kern.wiederholen` die
    Waren-Schreibzugriffe mit wiederholt (DSQL 40001) und die Transaktion unter dem DSQL-Zeilenlimit bleibt (`docs/datenbank.md`).
  - `bestand:buchen` prüfen, wenn `einlagern` gesetzt (403 sonst).
  - Beim Buchen eines eingereichten Entwurfs: `eingereicht_von/_am/_betrag` in `fin_belege` übernehmen; Push `belege.status` „gebucht“.
  - Verwerfen: `status = verworfen` + Grund; Push `belege.status` mit Grund.
- `routes/finanzen.ts` (bei den Beleg-Routen ~458-590), Hilfe `belegeEinreichen = requirePermission('belege:einreichen')` im RoutenKontext
  neben `finanzenBuchen`:
  - Mitglied: `POST /finanzen/einreichungen/upload` (Presign wie `beleg-dateien/upload`), `POST /finanzen/einreichungen`,
    `GET /finanzen/einreichungen` (eigene, mit Status, Betrag, Datum, Grund), `GET /finanzen/einreichungen/:id` (eigene, mit Presigned GET),
    `DELETE /finanzen/einreichungen/:id` (nur eigene, nur `eingereicht`; 409 sonst).
  - Finanzer:in (`finanzen:buchen`): `POST /finanzen/beleg-entwuerfe/:id/verwerfen { grund }`; `GET /finanzen/beleg-entwuerfe?status=eingereicht`
    (oder Feld im bestehenden Listen-DTO) für die Liste „Eingereicht“.
  - Warengruppe → Kategorie: `GET /finanzen/warengruppen-kategorien`, `PUT /finanzen/warengruppen/:id/kategorie { kategorieId | null }`
    (`finanzen:buchen`).
  - Für das Belegformular: Waren mit Gebinden, Pfand (`pfandGesamtCent`, shared/waren.ts:620), `mhdArt` und vorgeschlagener Kategorie
    (bestehende Waren-Routen wiederverwenden, sonst schlanke Route unter `/finanzen`).
  - Erstattung (`POST /finanzen/erstattungen`): je eingereichtem Beleg Push `belege.status` „erstattet“ ans Mitglied (eine Push je Erstattung).
- Push: Registry `packages/shared/src/benachrichtigungen.ts` (~130) Bereich `belege`: `belege.eingereicht`, `belege.status`; Versand per
  `bestEffort(() => benachrichtigungen.senden(...))`, Empfänger Finanzer:in über `mitgliederMitRecht(deps, 'finanzen:buchen')`
  (`privatpartyBenachrichtigungen.ts:12`), Vorbild `privatpartyMail.ts:104-113`. URLs: Finanzer:in → `/app/finanzen/belege/entwurf/<id>`,
  Mitglied → `/app/belege`. Texte z. B. „Neuer Beleg von <username>: 23,40 €“, „Dein Beleg über 23,40 € wurde gebucht“,
  „Dein Beleg wurde verworfen: <Grund>“, „Deine Auslagen über 57,10 € wurden erstattet“.
- Tests (`routes/finanzen.test.ts`, Fakes): Einreichen (Recht, Pflichtfelder, nur eigene sehen/zurückziehen, nicht nach Verarbeitung),
  Verwerfen, Buchen mit Ware/Pfand/Leergut, Einlagern (Vorgang + Bestand, ohne `bestand:buchen` 403, MHD-Pflicht, Rollback bei Fehler),
  `betrag_abweichung`, Pushes (Empfänger, Handelnde:r ausgenommen), Warengruppe-Kategorie-Routen.

## Web

- **Mitglied, mobile first** (`belege:einreichen`):
  - Seite `/belege` „Meine Belege“: Karten (Datum, Rechnungssteller, Betrag, Status-Badge, Grund bei verworfen), Knopf „Beleg einreichen“,
    „Zurückziehen“ bei eingereicht.
  - Seite `/belege/einreichen`: Kamera/Datei (`BelegDateiFeld` aus `BelegDatei.tsx` wiederverwenden, Upload über die Einreichungs-Route),
    Belegdatum, Betrag (`BetragFeld`), Rechnungssteller (Auswahl oder freier Text), Notiz, optional Posten (einfach), „Einreichen“.
  - Navigation in `AppLayout` (`can('belege:einreichen')`), Routen neben den Finanz-Routen (`routes/finanzenRouten.tsx`).
- **Finanzer:in, desktop first** (`FinanzenBelegPage.tsx`, Posten-Tabelle ~492-614, `belegFormular.ts`):
  - Posten-Art je Zeile (Kategorie / Ware / Leergut); Ware: suchbare Ware, Gebinde (volle Bezeichnung), Kategorie vorbelegt, Pfand je Gebinde
    vorbelegt; Pfand in `BelegSummen` je Steuersatz sichtbar. Tastaturführung wie bisher (Enter = nächste Zeile).
  - Schalter „Einlagern“ (nur mit `bestand:buchen`, nur bei Ware-Posten): Zeitpunkt, Lagerort je Ware-Posten (zuletzt verwendeter vorbelegt), MHD
    wo nötig. `BelegBuchenDialog` nennt die Einlagerung.
  - Eingereichte Entwürfe: in `FinanzenBelegePage` eigener Bereich „Eingereicht“ mit Anzahl; im Formular Kopf mit Einreicher:in (`StatusName`),
    eingereichtem Betrag, Notiz, Rechnungssteller-Vorschlag; Knopf „Verwerfen“ mit Pflicht-Begründung.
  - Neue Seite `/finanzen/warengruppen-kategorien`: Warengruppen-Baum mit Kategorie-Auswahl, geerbte Zuordnung grau angezeigt.
  - Beleg-Detail: Ware/Gebinde/Pfand je Posten, Link zur Einlagerung (Waren-Verlauf), Einreicher:in.
  - Storno-Dialog im Journal bei Belegen mit Einlagerung: Hinweis „Der Lagerbestand wird nicht zurückgebucht.“
- `finanzenHilfe.ts`: Texte zu Pfand/Leergut, Lager-Posten, Warengruppe → Kategorie, Einlagern, Einreichen/Verwerfen.
- `i18n.ts`: Push-Arten und Bereich `belege`, Status-Labels der Einreichung, Posten-Arten.

## Doku (im selben PR)

- `docs/finanzen.md`: „Belege“ um Lager-Posten, Pfand, Einlagern, Einreichen erweitern; Rechte (Zeile 48: `belege:einreichen` jetzt genutzt),
  Kontenplan (`pfand`), Seiten, API, Überblick.
- `docs/waren.md`: Quelle `beleg`, Warengruppe → Kategorie.
- `docs/benachrichtigungen.md`: Arten `belege.eingereicht`, `belege.status`.
- `docs/datenbank.md`: neue Spalten.
- `docs/plans/finanzen.md`: Scheibe 4 und Stand-Tabelle auf „umgesetzt“; Scheibe 12 kann das Einreichdatum nutzen.

## Phasen (je ein frischer `implementer`)

1. Shared (Schemas, Berechnung, Zeilen, Status, Tests) + Migrationen + API Ware/Pfand/Leergut/Warengruppe-Kategorie/Einlagern + Tests.
2. API Einreichen, Verwerfen, Pushes + Tests (Dateien aus Phase 1 im Prompt).
3. Web Finanzer:in (Posten-Arten, Einlagern, Eingereicht-Bereich, Verwerfen, Zuordnungsseite, Detail, Hilfe-Texte).
4. Web Mitglied (Meine Belege, Einreichen, Navigation).
5. Doku.

## Verifikation

- `tester`: `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Deploy auf dev, `browser-check` je Ablauf nacheinander: „Beleg am Handy einreichen + zurückziehen“ (375×812), „Eingereichten Beleg prüfen,
  Ware-Posten mit Pfand, Einlagern, buchen“ (1440×900; danach Bestand der Ware im Lager prüfen), „Einreichung verwerfen“ (Status beim
  Mitglied), „Warengruppe → Kategorie zuordnen“, „Leergut-Rückgabe als negativer Posten“. Danach „Kette prüfen“ grün und Saldo von
  `pfand` im Kontenplan plausibel.
