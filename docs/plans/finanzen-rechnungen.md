# Finanzen Scheibe 8: Rechnungen schreiben

Umsetzungsplan für Scheibe 8 aus [finanzen.md](./finanzen.md). Ausgangsrechnungen an Mitglieder oder externe
Empfänger, lückenlos nummeriert, als PDF im Finanzarchiv, mit Buchung nach **Ist-Versteuerung** (Erlös und USt erst bei
Zahlung). Arbeitsseiten **desktop first** (Regeln „Bedienung“ in [finanzen.md](./finanzen.md)).

## Entscheidungen (mit dir geklärt am 23.11.2026)

| Thema            | Entscheidung                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buchung          | Beim **Stellen**: `forderungen` an `erloese_offen` (zwei Durchlaufkonten, kein Erlös, keine USt). Bei **Zahlung**: Geld an `forderungen` **und** `erloese_offen` an Erlöskonten mit USt (Zahldatum) |
| Steuer           | Ist-Versteuerung: Erlös und USt entstehen erst mit dem Geldfluss, das Journal ist damit selbst Ist; Scheibe 9 braucht keine Sonderregel                                                            |
| Aufschlag        | **entfällt** (stand nur im Gesamtplan, kein Anwendungsfall)                                                                                                                                        |
| Vereinsdaten     | Einstellungsseite „Rechnungs-Einstellungen“ (`finanzen:verwalten`), in der DB; beim Stellen in die Rechnung kopiert                                                                               |
| Zahlwege         | Bank, bar (Safe-Fach mit Stückelung), SumUp/Karte. **Nicht** aufs Buch (Buch-Abzahlungen werden schon über die Kasse Erlös → doppelt)                                                              |

Eigene Festlegungen (beim Plan-Review änderbar):

- **Nummer** `NNN-JJJJ` (z. B. `001-2027`), lückenlos je Jahr, Zähler `rechnung:JJJJ` in `fin_zaehler`, Jahr = Rechnungsdatum
  (= Tag des Stellens, Berlin). Stornorechnungen bekommen eine Nummer aus demselben Kreis.
- **Stornorechnung nur für unbezahlte Rechnungen.** Ist eine Rechnung bezahlt, storniert man zuerst die Zahlungsbuchung im
  Journal (Rechnung ist wieder „gestellt“), dann die Rechnung. Teilzahlungen gibt es nicht (Zahlung = voller Bruttobetrag).
- **SumUp** bucht gegen ein neues Durchlaufkonto `sumup` („SumUp-Guthaben“), das Scheibe 7 später abgleicht.
- **Mitglied als Empfänger:** Rechnungen tragen den Klarnamen „Vorname Nachname“ und `mitglieder.adresse` (ein Freitextfeld).
  Fehlt die Adresse, kann man nicht stellen („Für <username> ist im Profil keine Adresse hinterlegt.“). In der App wird das
  Mitglied wie üblich per `StatusName`/Username gezeigt.
- **Externe Empfänger** (`fin_rechnungsempfaenger`): Name, Anschrift (mehrzeilig), optional E-Mail und USt-IdNr., archiviert.
  Anlegen als Option im Dropdown (wie Rechnungssteller) und auf einer eigenen Pflegeseite.
- **PDF im Browser** (`@react-pdf/renderer`, Muster `packages/web/src/protokoll/pdf/`) aus dem gespeicherten Rechnungs-Snapshot,
  direkt nach dem Stellen erzeugt und ins Archiv geladen (`rechnungen/<sha256>.pdf`, Presigned PUT wie Belege). Schlägt das
  fehl, zeigt die Detailseite „PDF erzeugen“. Je Rechnung genau eine Datei (`fin_rechnung_dateien`, nur INSERT).
  Der Rechnungsinhalt selbst ist über den Snapshot in `fin_rechnungen`/`fin_rechnungsposten` (nur INSERT) gesichert.
- **Kein Versand per Mail** in dieser Scheibe (PDF herunterladen). Kein Lagerabgang durch Rechnungen. E-Rechnung (ZUGFeRD)
  bleibt Folgescheibe.
- **Preise brutto oder netto** je Rechnung umschaltbar (wie Belege, Standard brutto); Steuer je Steuersatz aus der Gruppensumme.

## Datenmodell (Migrationen ab `0254`, je ein Statement + Down-Datei)

- **Konten** (Seed wie `auslagen`/`pfand`): `forderungen` („Forderungen aus Rechnungen“, durchlauf), `erloese_offen`
  („Erlöse aus offenen Rechnungen“, durchlauf), `sumup` („SumUp-Guthaben“, durchlauf).
- `fin_rechnung_einstellungen` (nur INSERT, die neueste Zeile gilt): `id`, `vereinsname`, `anschrift`, `steuernummer`,
  `ust_id` (opt.), `bank_name`, `iban`, `bic`, `vorstand` (Freitext, z. B. „Vertreten durch …“), `register` (opt., z. B.
  „VR 1234, Amtsgericht Leipzig“), `kontakt` (opt.), `zahlungsziel_tage` (Standard 14), `fusstext` (opt.),
  `erloes_konto_waren` (Vorbelegung der Erlös-Kategorie für Ware-Posten), `erstellt_von`, `erstellt_am`.
- `fin_rechnungsempfaenger`: `id`, `name` (eindeutig ohne Groß/Klein), `anschrift`, `email`, `ust_id`, `archiviert`.
  (Stammdaten, änderbar wie `fin_rechnungssteller`; die Rechnung hält eine Kopie.)
- `fin_rechnung_entwuerfe`: `id`, `daten` (JSON, Schema `rechnungEntwurfSchema`), `erstellt_von`, `erstellt_am`,
  `geaendert_am` (änderbar/löschbar wie `fin_beleg_entwuerfe`).
- `fin_rechnungen` (nur INSERT): `id`, `nummer` (unique), `jahr`, `lfd`, `rechnungsdatum`, `leistungsdatum` (oder
  `leistung_von`/`leistung_bis`), `faellig_am`, `mitglied_sub` | `empfaenger_id` (genau eins), `empfaenger_name`,
  `empfaenger_anschrift`, `empfaenger_ust_id` (Snapshot), `verein` (JSON-Snapshot der Einstellungen), `modus`
  (brutto|netto), `betreff`, `einleitung`/`hinweis` (opt. Freitexte), `brutto_cent`, `storno_von` (Stornorechnung →
  Original, unique), `buchung_id` (Stellungsbuchung), `idempotenz_schluessel` (unique), `erstellt_von`, `erstellt_am`.
- `fin_rechnungsposten` (nur INSERT): `rechnung_id`, `pos`, `art` (`ware` | `frei`), `ware_id`, `gebinde_id`, `text`,
  `anzahl`, `einzelpreis_cent`, `pfand_cent` (je Gebinde, opt.), `steuersatz`, `erloes_konto_id`, `gesamt_cent`.
- `fin_rechnung_zahlungen` (nur INSERT): `id`, `rechnung_id`, `zahlweg` (`bank`|`bar`|`sumup`), `datum`, `konto_id`,
  `buchung_id`, `idempotenz_schluessel`, `erstellt_von`, `erstellt_am`. „Bezahlt“ = eine Zahlung, deren Buchung nicht
  storniert ist (Sperre `rechnung:<id>` gegen doppelte Zahlung, wie `erstattung:<sub>`).
- `fin_rechnung_dateien` (nur INSERT): `rechnung_id` (PK), `sha256`, `groesse`, `erstellt_am`.
- Alle neuen Insert-only-Tabellen in den Guard `finanzenNurInsert.test.ts` aufnehmen.

**Status** (abgeleitet, `rechnungStatus` in shared): `entwurf` (nur Entwurfstabelle) → `gestellt` → `bezahlt` | `storniert`
(es gibt eine Stornorechnung) ; zusätzlich `ueberfaellig` als Anzeige, wenn gestellt und `faellig_am` < heute.

## Buchungen (`quelle_typ` neu: `rechnung`, `rechnungszahlung`)

Beispiel 119 € brutto Freitext 19 % + Ware 24 € (inkl. 3,10 € Pfand, 7 %):

| Schritt         | Zeilen                                                                                                                                       | Datum        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Stellen         | `forderungen` +Brutto, `erloese_offen` −Brutto (`steuer_art keine`)                                                                          | Rechnungsdat |
| Zahlung         | Geld (`bank` / Safe-Fach mit Stückelung / `sumup`) +Brutto, `forderungen` −Brutto, `erloese_offen` +Brutto, je (Erlöskonto, Satz) −Brutto mit `steuer_art ust`, Netto, Steuer; Pfand gegen `pfand` (mit Satz der Ware, wie Belege) | Zahldatum    |
| Stornorechnung  | Storno der Stellungsbuchung (`quelle_typ storno` wie im Journal, Text „Stornorechnung NNN-JJJJ zu NNN-JJJJ“) in derselben Transaktion wie `fin_rechnungen` mit `storno_von` | heute        |

- Reine Funktionen in `packages/shared/src/rechnungen.ts`: `rechnungBerechnen` (Summen je Satz, Pfand; Logik aus
  `belegBerechnen` wiederverwenden bzw. gemeinsamen Kern herausziehen, **nicht kopieren**), `rechnungPruefen` (Meldungen mit
  Tabelle/Zeile wie Belege), `rechnungStellungsZeilen`, `rechnungZahlungsZeilen`, `rechnungNummer(jahr, lfd)` →
  `001-2027`, `rechnungStatus`, `faelligAm`. Unit-Tests für alle, insbesondere Rundung, Pfand, gemischte Sätze, netto/brutto.
- Datum in festgeschriebener Periode: `datumVerschiebbar` wie bei Belegen.
- Erlöskonten: `art = erloes`, keine Unterkonten, nicht archiviert (wie `erloesKontoId` in `kassen.ts`). Steuersatz-Vorschlag
  aus `fin_konten.steuersatz_art` und Rechnungsdatum (`steuersaetzeAm`).
- `QUELLE_TYPEN`/`QUELLE_TYP_LABELS` ergänzen („Rechnung“, „Rechnungszahlung“); Buchungsdetail (`FinanzenBuchungPage.tsx`)
  verlinkt auf die Rechnung. Datenexport (`finanzen.ts` ~l.2288) nimmt die PDF-Hashes der Rechnungen mit auf.

## API (`routes/finanzen.ts` bzw. neue `routes/finanzenRechnungen.ts`, Store `finanzenRechnungen.ts` + `.fake.ts`)

Lesen `finanzen:lesen`, Schreiben `finanzen:buchen`, Einstellungen schreiben `finanzen:verwalten`.

- `GET/POST /finanzen/rechnung-einstellungen` (POST legt neue Zeile an).
- `GET/POST /finanzen/rechnungsempfaenger`, `PUT /finanzen/rechnungsempfaenger/:id`.
- `POST /finanzen/rechnung-entwuerfe`, `GET/PUT/DELETE /finanzen/rechnung-entwuerfe/:id`.
- `POST /finanzen/rechnung-entwuerfe/:id/stellen` `{ idempotenzSchluessel, bestaetigt }`: Muster `entwurfBuchenTx` (Retry,
  Idempotenz, Warnungen → 409, Nummer, `kern.einfuegen`, Rechnung + Posten, Entwurf löschen in **einer** Transaktion).
  Warnungen: `leistung_zukunft`, `hoher_betrag` (≥ 500 €), `preis_null`, `adresse_fehlt` ist **Fehler** (400), fehlende
  Einstellungen ebenfalls 400 („Bitte erst die Rechnungs-Einstellungen ausfüllen.“).
- `GET /finanzen/rechnungen?status=&jahr=&q=`, `GET /finanzen/rechnungen/:id` (inkl. Status, Zahlung, Stornorechnung, Datei-URL).
- `POST /finanzen/rechnungen/:id/zahlung` `{ zahlweg, datum, fachId?, stueckelung?, idempotenzSchluessel, bestaetigt }`
  (409 wenn bezahlt/storniert; Warnung `zahlung_zukunft` ist Fehler, `zahlung_vor_rechnung` Warnung).
- `POST /finanzen/rechnungen/:id/storno` `{ begruendung, idempotenzSchluessel }` (409 wenn bezahlt oder schon storniert).
- `POST /finanzen/rechnungen/:id/kopieren` → neuer Entwurf.
- `POST /finanzen/rechnung-dateien/upload` `{ rechnungId, sha256, groesse }` → Presigned PUT unter `rechnungen/<sha>.pdf`
  (`finanzarchiv.uploadVorbereiten` um Präfix erweitern), `POST /finanzen/rechnungen/:id/datei` `{ sha256, groesse }`
  registriert (409 wenn schon vorhanden). Ohne `FINANZARCHIV_BUCKET` 503 wie bei Belegen.
- `GET /finanzen/beleg-waren` liefert zusätzlich `letzterPreisCent` je Ware+Gebinde (letzter gebuchter Einkaufspreis brutto
  je Gebinde ohne Pfand) zur Vorbelegung des Rechnungspreises.
- Routentests über Fake-Stores in `routes/finanzen.test.ts` (Stellen, Idempotenz, Warnungen, Zahlung bank/bar/sumup,
  doppelte Zahlung, Storno offen/bezahlt, Nummernfolge inkl. Jahreswechsel).

## Web (desktop first, `packages/web/src/pages/`)

- **Hub** `FinanzenPage.tsx`: Kachel „Rechnungen“ (offene Summe, überfällige Anzahl).
- `FinanzenRechnungenPage.tsx` (`/finanzen/rechnungen`): Tabelle Nummer, Datum, Empfänger (`StatusName` bzw. Name), Betrag,
  fällig, Status-Badge; Filter Status/Jahr, Suche; Entwürfe oben; Karten unter `sm`. „Neue Rechnung“.
- `FinanzenRechnungPage.tsx` (`/finanzen/rechnungen/neu`, `/finanzen/rechnungen/entwurf/:id`): Empfänger (Mitglied oder
  extern in einem suchbaren Feld, Gruppen „Mitglieder“/„Extern“, „„X“ als neuen Empfänger anlegen“ öffnet Mini-Formular mit
  Anschrift), Anschrift-Vorschau, Rechnungsdatum (heute, fix), Leistungsdatum (Pflicht), Zahlungsziel, Betreff, Brutto/Netto,
  zwei Posten-Tabellen **Waren** (Ware, Gebinde, Anzahl, Preis je Gebinde, Pfand je Gebinde, Steuer %, Erlös-Kategorie,
  Betrag) und **Freitext** (Text, Anzahl, Einzelpreis, Steuer %, Erlös-Kategorie, Betrag) mit den Belege-Bausteinen
  (`BelegPostenTabellen`-Muster: immer eine leere Zeile, Enter-Führung, `BetragFeld` mit `rechnen`, Zellfehler), Summen je
  Satz live (`BelegSummen` wiederverwenden), Autosave des Entwurfs, Warnung beim Verlassen. „Stellen“ (Strg/Cmd+Enter)
  zeigt Zusammenfassung + Warnungen + PDF-Vorschau-Hinweis; danach PDF erzeugen, hochladen, registrieren, zur Detailseite.
- `FinanzenRechnungDetailPage.tsx` (`/finanzen/rechnungen/:id`): Kopf, Posten, Summen, Status, Buchungen (Links ins
  Journal), PDF anzeigen/herunterladen (bzw. „PDF erzeugen“), Aktionen „Zahlung erfassen“ (Dialog: Zahlweg, Datum, bei bar
  Fach + Stückelung wie Erstattung), „Stornorechnung“ (Begründung, Zusammenfassung), „Als Entwurf kopieren“.
- `FinanzenRechnungsempfaengerPage.tsx` (`/finanzen/rechnungsempfaenger`) wie `FinanzenRechnungsstellerPage.tsx`.
- `FinanzenRechnungEinstellungenPage.tsx` (`/finanzen/rechnungen/einstellungen`, `finanzen:verwalten`): Formular, zeigt
  Stand und wer zuletzt geändert hat.
- PDF `packages/web/src/rechnung/pdf/RechnungPdf.tsx` (+ Erzeugen-Funktion nach `pdfErzeugen.tsx`, Schriften aus
  `protokoll/pdf/schriften.ts` teilen): DIN-5008-nahes Layout: Absenderzeile, Empfängeranschrift, Rechnungsnummer, Datum,
  Leistungsdatum, Posten (Pos, Text bzw. Ware + Gebinde, Anzahl, Einzelpreis, Satz, Betrag), Pfand als eigene Zeile je
  Ware-Posten, Netto je Satz, USt je Satz, Brutto, Zahlungsziel + Bankverbindung, Fuß mit Steuernummer/USt-IdNr., Vorstand,
  Register. Stornorechnung: Titel „Stornorechnung“, Bezug „zu Rechnung NNN-JJJJ vom …“, negative Beträge.
- Routen in `routes/finanzenRouten.tsx` mit `Protected`; Texte in `finanzenHilfe.ts` (`HILFE.rechnungen`: Ist-Versteuerung,
  Leistungsdatum, Erlös-Kategorie, Stornorechnung, Zahlweg SumUp). Alles deutsch, du-Form.

## Phasen (je ein frischer `implementer`)

1. **Shared + DB + API:** Migrationen, Schema, `rechnungen.ts` mit Tests, Store + Fake, Routen + Routentests, Quelle-Typen,
   Export.
2. **Web:** Seiten, PDF, Hub, Routen, Hilfe-Texte (mit Liste der in Phase 1 berührten Dateien).
3. **Doku:** `docs/finanzen.md` neuer Abschnitt „Rechnungen“ (+ Überblick, Rechte, Seiten, API, Konten), Stand in
   `docs/plans/finanzen.md` (Scheibe 8 umgesetzt, Aufschlag gestrichen), `docs/datenbank.md` Tabellen.

## Verifikation

- `tester`: `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Deploy auf dev, dann je ein `browser-check` nacheinander (1440×900, einmal nur Tastatur, dann 375×812):
  1. Einstellungen ausfüllen, externen Empfänger anlegen.
  2. Rechnung an externen Empfänger mit Ware (Pfand) + Freitext, 19 % und 7 %, stellen, PDF prüfen; Journal zeigt
     `forderungen`/`erloese_offen`.
  3. Zahlung bar mit Stückelung und per Bank; Journal zeigt Erlöse mit USt zum Zahldatum; Status „bezahlt“.
  4. Rechnung an Mitglied ohne Adresse (Fehler), mit Adresse stellen, Stornorechnung; Nummernfolge lückenlos.
