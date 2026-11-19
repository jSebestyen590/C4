# Finanzen Scheibe 4c: Lager-Beleg-Abgleich statt Einlagern, Formular-Verbesserungen – Umsetzungsplan

Folgt auf [finanzen-belege-4b.md](./finanzen-belege-4b.md) (umgesetzt, noch nicht gemergt) und läuft auf demselben Branch
`finanzen-belege-4b` (ein PR für 4b + 4c). Entscheidungen mit dem Nutzer geklärt am 19.11.2026.

## Entscheidungen (geklärt)

| Thema | Entscheidung |
| --- | --- |
| Einlagern beim Buchen | **Entfällt komplett** (Schalter, Lagerort/MHD je Posten, Zeitpunkt, `einlagernTx`, 403-Prüfung `bestand:buchen`, Storno-Hinweis, Hilfe-Texte, Doku). Grund: Ware ist beim Erfassen des Belegs längst im Lager. |
| Ersatz | **Abgleich Lager ↔ Belege je Ware** (Ist = Einlagerungen, Soll = Ware-Posten der Belege), mit korrigierbarer Diskrepanz. |
| Einheit | Kleinste Einheit (`inBasiseinheiten`, `shared/src/waren.ts:705`); Anzeige gemischt wie `bestandAnzeigen` („1 Kasten, 3 Flaschen“). |
| Ist | Nur Vorgänge vom Typ `einlagerung`, Zeilen-Art `zugang`. Entnahme, Umlagerung, Inventur zählen nicht. |
| Soll | Ware-Posten gebuchter, nicht stornierter Belege (Anzahl × Gebinde in Basiseinheiten, Vorzeichen wie gebucht: Rückgabe negativ). Leergut zählt nicht. Eingereichte, noch nicht gebuchte Entwürfe zählen nicht. |
| Start | Globaler **Stichtag** (Datum); nur Einlagerungen (Zeitpunkt) und Belege (Belegdatum) ab dem Tag. Ohne Stichtag zeigt die Seite nur den Hinweis „Stichtag festlegen“. |
| Korrektur | Eigener Eintrag je Ware: Menge (Basiseinheiten, Vorzeichen frei), Grund (Pflicht: Bruch beim Einlagern, Fehler beim Händler, Sonstiges + Text), Datum, Person. **Nur-INSERT**; Rücknahme per Gegenkorrektur. Ändert weder Lagerbestand noch Buchungen. |
| Formel | Diskrepanz = Σ Ist − Σ Soll − Σ Korrektur. „Ausgleichen“ legt eine Korrektur über die aktuelle Diskrepanz an (vorbelegt, änderbar). |
| Rechte | Lesen: `finanzen:lesen` **oder** `waren:verwalten`. Korrigieren und Stichtag setzen: `finanzen:buchen` **oder** `waren:verwalten`. |
| Mitglieder: Ware-Posten | Beim Einreichen dürfen Mitglieder auch Ware-Posten angeben (Ware, Gebinde, Anzahl, Preis je Gebinde, Pfand vorbelegt). Kategorie kommt aus der Warengruppe (Mitglied wählt sie nicht; fehlt sie, ergänzt die Finanzer:in). |
| Labels | Alle Eingaben einer Zeile stehen auf gleicher Höhe, ausgerichtet am höchsten Label (Inputs unten bündig). Gilt app-weit, Regel kommt in `CLAUDE.md` („UI“). |
| Handy | Spalte „davon Pfand“ in `BelegSummen` ab `sm` sichtbar, darunter ausgeblendet; das Belegformular scrollt am Handy nicht seitlich. |
| Reload | Eingaben überleben einen Reload: Finanzer:in-Belegformular (neu und Entwurf) und Mitglieder-Einreichen. |

## Datenmodell (Migrationen ab nächster freier Nummer, je mit Down-Datei, DSQL: eine Anweisung je Datei)

- Einlagern-Spalten: `fin_belege.bestandsvorgang_id` aus Schema und Code entfernen. Prüfen (`docs/datenbank.md`), ob DSQL
  `ALTER TABLE … DROP COLUMN` kann: ja → Migration; nein → Spalte bleibt ungenutzt, in `datenbank.md` vermerkt. `QUELLEN` behält
  `beleg` nicht: aus `shared/src/waren.ts:43` und `QUELLE_LABELS` entfernen (auf dev ggf. vorhandene Vorgänge mit `quelle = beleg`
  sind Testdaten; keine Sonderlogik, siehe „No legacy logic before prod“).
- Ware-Posten: `fin_belegposten.lagerort_id`/`mhd` gibt es nicht (lagen nur im Entwurfs-JSON) → aus Schema `belegPostenWareSchema` entfernen.
- Neu `waren_abgleich_korrekturen`: `id`, `ware_id`, `menge` (Basiseinheiten, int, signed), `grund` (`bruch` | `haendler` | `sonstiges`),
  `text` (nullable, Pflicht bei `sonstiges`), `datum` (date), `erstellt_von` (sub), `erstellt_am`. Nur-INSERT (in
  `finanzenNurInsert.test.ts` bzw. analogem Test aufnehmen).
- Neu `einstellungen` (`schluessel text PK`, `wert text`, `geaendert_von`, `geaendert_am`) mit Schlüssel `lager_abgleich_stichtag`
  (ISO-Datum). Falls es schon eine allgemeine Einstellungs-Tabelle gibt: die nutzen.

## Shared

- `belegPostenWareSchema`: `lagerortId`, `mhd` raus; `belegEntwurfDatenSchema`: `einlagern`, `einlagerungZeitpunkt` raus;
  `belegPruefen`: Einlagern-Regeln raus.
- `belegEinreichenSchema.posten`: `kategorie` **oder** `ware` (ohne `kategorieId`-Pflicht für Mitglieder; die API setzt die
  Kategorie aus `warengruppeKategorie`, sonst bleibt sie leer und `belegPruefen` meldet sie beim Buchen).
- Neu `lagerAbgleich.ts`: reine Funktion `lagerAbgleich({ stichtag, ist[], soll[], korrekturen[] })` → je Ware Summen, Diskrepanz und
  chronologische Zeitleiste (Ereignis, Menge, laufende Diskrepanz), wie im Beispiel des Nutzers:
  Ist 10 · Beleg 5 · Beleg 5 → 0 · Ist 10 · Beleg 9 → 1. Gleicher Tag: Ist vor Soll vor Korrektur. DTOs `LagerAbgleichDto`
  (Liste: Ware, Warengruppe, Ist, Soll, Korrektur, Diskrepanz) und `LagerAbgleichWareDto` (Zeitleiste mit Links: Vorgang/Beleg).
  Schemas `abgleichKorrekturSchema`, `abgleichStichtagSchema`. Tests in `lagerAbgleich.test.ts` (Beispiel oben, Stichtag-Grenze,
  Gebinde-Umrechnung Kasten/Flasche, negative Posten, Storno zählt nicht, Korrektur).

## API

- `finanzenBelege.ts`/`routes/finanzen.ts`: Einlagern vollständig entfernen (`einlagernTx`, `einlagerPositionen`, `berlinMittag`,
  `einlagerungZeitpunkt`, `einlagerungKommentar`, 403-Check, Tests). Die in 4b exportierten Waren-Helfer in `waren.ts` wieder
  unexportieren, wenn ungenutzt.
- Einreichen: Ware-Posten annehmen (Ware/Gebinde gültig, nicht archiviert), Kategorie aus Warengruppe vorbelegen.
  `GET /finanzen/einreichungen/auswahl` liefert zusätzlich `waren` (wie `BelegWareDto`, ohne Kategorie-Interna nötig).
- Abgleich (neue Datei `lagerAbgleich.ts` in api, Routen in `routes/finanzen.ts` oder eigener Router, Rechte siehe oben, eigene
  Hilfe im RoutenKontext):
  - `GET /lager-abgleich` → `LagerAbgleichDto` (alle Waren mit Bewegung ab Stichtag; ohne Stichtag `{ stichtag: null }`).
  - `GET /lager-abgleich/waren/:id` → Zeitleiste.
  - `POST /lager-abgleich/korrekturen` `{ wareId, menge, grund, text?, datum }`.
  - `PUT /lager-abgleich/stichtag` `{ stichtag }`.
  - Daten mit wenigen Abfragen holen (Einlagerungs-Zeilen ab Stichtag, Ware-Posten nicht stornierter Belege ab Stichtag, Korrekturen),
    Rechnung in der shared-Funktion. Fakes und Route-Tests.

## Web

- **Belegformular Finanzer:in** (`FinanzenBelegPage.tsx`, `BelegPostenZeile.tsx`, `BelegEinlagernFeld.tsx`, `BelegBuchenDialog.tsx`,
  `FinanzenBelegDetailPage.tsx`, `FinanzenBuchungPage.tsx` Storno-Hinweis, `belegFormular.ts`, `finanzenHilfe.ts`): Einlagern raus
  (`BelegEinlagernFeld.tsx` löschen, `c4.beleg.lagerort` raus).
- **Labels:** Zeilen mit mehreren Eingaben (`BelegPostenZeile`, Belegkopf, Einreichen-Posten, weitere Formulare mit `Group`/`Grid`/
  `SimpleGrid` + mehreren Inputs, per grep finden) unten bündig ausrichten (`align="flex-end"` bzw. `align="end"`), sodass Inputs
  auf einer Linie stehen, auch bei umbrechenden Labels. Regel in `CLAUDE.md` unter „UI: mobile first“ ergänzen.
- **`BelegSummen`:** Spalte „davon Pfand“ `visibleFrom="sm"`; Belegformular bei 375 px ohne seitliches Scrollen.
- **Reload-fest:**
  - Finanzer:in: prüfen, warum Eingaben beim Reload verloren gehen (Autosave-Debounce, `/neu` ohne URL-Wechsel auf
    `/entwurf/<id>` nach dem ersten Speichern, ungespeicherte Felder). Ziel: Nach Reload steht der letzte Stand da (Entwurf sofort
    anlegen und URL ersetzen; ungespeicherte Änderungen zusätzlich im `localStorage` je Entwurf, beim Laden bevorzugen, wenn neuer).
  - Mitglied (`BelegEinreichenPage.tsx`): Formular inkl. hochgeladener Datei-Referenz im `localStorage` (try/catch), beim Einreichen
    bzw. „Verwerfen“ löschen. Ein Hinweis „Entwurf wiederhergestellt“ mit „Neu beginnen“.
- **Einreichen mit Ware-Posten:** Posten-Art Kategorie / Ware im „Aufteilen“-Bereich, Ware suchbar, Gebinde, Anzahl, Preis je
  Gebinde, Pfand vorbelegt (überschreibbar). Mobile first.
- **Abgleich-Seite** `/finanzen/lager-abgleich` (Finanzer:in desktop first, muss am Handy gehen; Karten unter `sm`):
  Stichtag (setzen mit Recht), Filter „nur mit Diskrepanz“ (Standard an), Tabelle Ware · Ist · Belege · Korrektur · Diskrepanz;
  Klick → Zeitleiste der Ware (Einlagerungen mit Link zum Vorgang/Lagerort, Belege mit Link zum Beleg, Korrekturen mit Grund und
  `StatusName`), „Ausgleichen“-Dialog (Menge vorbelegt, Grund Pflicht). Links: Belege-Seite (neben „Warengruppen und Kategorien“),
  `/lager` bzw. Waren-Detail (Diskrepanz der Ware, wenn ≠ 0). Route in `routes/finanzenRouten.tsx`, Navigation in `AppLayout` für
  Nutzer:innen mit `waren:verwalten` ohne Finanz-Rechte prüfen.
- `i18n.ts`: Gründe der Korrektur.

## Doku

- `docs/finanzen.md`: Einlagern raus, Abgleich (neuer Abschnitt), Einreichen mit Ware-Posten, API, Seiten, Rechte.
- `docs/waren.md`: Quelle `beleg` raus, Abgleich verlinken.
- `docs/datenbank.md`: neue Tabellen, entfernte Spalte.
- `docs/plans/finanzen-belege-4b.md`: Hinweis „Einlagern durch 4c ersetzt“; `docs/plans/finanzen.md` Stand.
- `CLAUDE.md`: Label-Regel.

## Phasen (je ein frischer `implementer`)

1. Einlagern entfernen (shared, API, Web, Tests) + Mitglieder-Ware-Posten (shared, API, Web).
2. Abgleich: Migrationen, shared-Funktion + Tests, API + Tests.
3. Web: Abgleich-Seite, Links; Label-Ausrichtung; „davon Pfand“ am Handy; Reload-Festigkeit beider Formulare.
4. Doku + `CLAUDE.md`.

## Verifikation

- `tester`: `pnpm lint`, `pnpm typecheck`, `pnpm test`; Deploy auf dev.
- `browser-check` nacheinander: „Auslage mit Ware-Posten am Handy einreichen, Reload mitten drin“ (375×812); „Beleg erfassen,
  Reload mitten drin, Labels bündig, kein seitliches Scrollen am Handy“; „Abgleich: Stichtag setzen, Testbier einlagern (Lager),
  Beleg mit Testbier buchen, Diskrepanz prüfen, ausgleichen“ (1440×900, danach 375×812).
