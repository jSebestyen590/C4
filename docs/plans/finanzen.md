# Finanzen: Gesamtplan in Zielscheiben

## Kontext

Der Verein führt seine Finanzen seit 2016 in einer Access-Datenbank (Belege mit Posten, Safe- und
Kassenzählungen je Münze/Schein, „Buch" der Mitglieder, Ausgangsrechnungen, G+V/USt-Abfragen). Die
Datei ist jederzeit änderbar (kaskadierendes Löschen), also nicht GoBD-fest, und hat fachliche
Schwächen: Steuersatz am Artikel, „Sonstiges_7/_19"-Artikel, jeder Kauf braucht einen Lagerartikel,
SumUp ohne Gebühren, Umbuchungen als Beleg-Trick. Ziel: Die Finanzen wandern in die C4-App,
GoBD-konform (jede Änderung erkennbar), mobil bedienbar und mit Lager, Kalender und Mitgliedern
verzahnt.

Dieser Plan ist der Rahmen. Jede Scheibe wird in einer eigenen Session umgesetzt (Opus plant und
reviewt, Sonnet-Subagents implementieren und testen, wie in `CLAUDE.md`), mit eigenem PR und
Deploy auf dev. Zu Beginn jeder Scheibe werden deren „Offene Punkte" mit dir geklärt.

## Getroffene Entscheidungen

| Thema         | Entscheidung                                                            |
| ------------- | ----------------------------------------------------------------------- |
| GoBD-Anker    | S3 Object Lock (Compliance) im **bestehenden** AWS-Konto                |
| Kassenprüfung | Posten „Kassenprüfung" mit eigenem Recht in der App                     |
| Altdaten      | Nur Stammdaten + Anfangsbestände; Access bleibt Archiv bis 2026         |
| Stichtag      | **01.01.2027** (2026 wird in Access abgeschlossen)                      |
| Konto         | FinTS direkt, Datei-Import (CSV/CAMT) als Fallback                      |
| SumUp         | Abruf per SumUp-API                                                     |
| Buch-Sicht    | Eigene Seite + Rangliste für alle; Rest nur mit Finanzrecht             |
| Lager         | Belegposten verweisen auf Ware + Gebinde; „Einlagern" optional je Beleg |

## Architektur (gilt für alle Scheiben)

**Ein Journal, doppelte Buchführung im Kern.** Jede Geldbewegung ist eine Buchung mit Zeilen auf
Konten, die Summe der Zeilen ist 0. Das löst Umbuchungen (Safe → Bank ist _eine_ Buchung),
SumUp-Gebühren, Buch-Guthaben und Pfand ohne Sonderfälle. Die Oberfläche bleibt fachlich (Beleg,
Zählung, Abrechnung); Soll/Haben sieht nur, wer ins Journal schaut.

- `fin_konten`: `id`, `name`, `art` (`bargeld` | `bank` | `durchlauf` | `erloes` | `aufwand` |
  `neutral`), `parent_id` (Safe → Fächer, Kassen), `stueckelung boolean`,
  `steuersatz_standard`, `archiviert`. Die Erlös-/Aufwandskonten sind die **Kategorien** (Nachfolger
  der Access-Warengruppen als G+V-Konten). Das Buch ist ein Nebenbuch (Scheibe 2) und hat keine eigene
  Kontoart.
- `fin_buchungen`: `id`, `seq` (lückenlos), `datum date`, `text`, `quelle_typ`/`quelle_id` (Beleg,
  Zählung, Buch-Abrechnung, Bankumsatz, SumUp, Rechnung, Umbuchung, Eröffnung), `event_id`,
  `storno_von`, `erstellt_von`, `erstellt_am`, `prev_hash`, `hash`.
- `fin_buchungszeilen`: `buchung_id`, `konto_id`, `betrag_cent` (Vorzeichen), `netto_cent`,
  `steuer_cent`, `steuersatz` (Promille/Basispunkte), `steuer_art` (`ust` | `vorsteuer` | `keine`).
- `fin_stueckelung`: `zeile_id`, `nennwert_cent` (1 ct … 100 €, ohne 200/500), `anzahl`
  (Vorzeichen). Für Konten mit `stueckelung` muss Σ Nennwert × Anzahl = Betrag der Zeile gelten;
  „Wechseln" ist eine Zeile mit Betrag 0.
- **Nur INSERT.** Keine Update-/Delete-Routen; Korrektur = Storno (Gegenbuchung mit `storno_von`)
  plus Neubuchung. `seq` kommt aus einer Zählerzeile in derselben Transaktion; dafür wird
  `mitWiederholung` aus `packages/api/src/db/migrate.ts` zu einem allgemeinen Retry für
  DSQL-Konflikte (40001) ausgebaut.
- **Hash-Kette:** `hash = SHA-256(prev_hash ‖ kanonisches JSON aus Buchung, Zeilen, Stückelung,
Beleg-Datei-Hashes)`; die kanonische Serialisierung liegt als reine Funktion in `@c4/shared`.
- **Festschreibung** je Monat (`fin_perioden`): danach keine Buchung mehr mit Datum in der Periode.
- Geld durchgehend als ganze Cent (`integer`), Anzeige mit `centAnzeigen`
  (`packages/shared/src/waren.ts`), Eingabe über `ZahlFeld` mit Cent-Umrechnung.

**Rechte** (`packages/shared/src/roles.ts`, Labels in `packages/web/src/i18n.ts`, Vergabe per
Migration nach Muster 0076):

| Recht                | Wer                             | Wofür                                           |
| -------------------- | ------------------------------- | ----------------------------------------------- |
| `buch:lesen`         | alle Status                     | eigene Buchseite, Rangliste                     |
| `kasse:zaehlen`      | alle Status                     | Kassenzählung am Event                          |
| `belege:einreichen`  | alle Status                     | eigene Auslagen-Belege als Entwurf einreichen   |
| `finanzen:lesen`     | Vorstand, Kassenprüfung         | alles lesen                                     |
| `finanzen:buchen`    | Finanzer (`buchhaltung`), Admin | buchen, stornieren, abrechnen                   |
| `finanzen:verwalten` | Finanzer, Admin                 | Stammdaten, Tarife, Anbindungen, Festschreibung |
| `finanzen:pruefen`   | neuer Posten `kassenpruefung`   | „Kette prüfen", Prüfexport                      |

**Code-Muster** wie bei den bestehenden Features: Schemas/DTOs/reine Logik in
`packages/shared/src/finanzen*.ts`, Store + Fake in `packages/api/src/<bereich>.ts`/`.fake.ts`,
Routen in `app.ts`, Seiten in `packages/web/src/pages/`, Navigation in `AppLayout.tsx` (ein
Menüpunkt „Finanzen" mit Unterseiten, „Buch" separat für alle). Migrationen ab `0141`, je ein
Statement plus Down-Datei.

### Bedienung: Arbeitsseiten zuerst für den Desktop

Abweichend vom Rest der App (mobile first) sind die **Arbeitsseiten der Finanzen** für den Desktop
entworfen: Journal, Buchen, Kontenplan, Belegerfassung, Buch-Abrechnung, Kassenabrechnung,
Umsatz-Zuordnung, Rechnungen, Auswertungen. Dort wird viel gearbeitet, und Fehler sind teuer, weil
Gebuchtes nur per Storno korrigierbar ist. Auf dem Handy müssen sie funktionieren (kein
horizontales Scrollen der Seite), sind dort aber zweitrangig. **Mobile first bleiben** die Seiten
für alle Mitglieder: eigene Buchseite, Rangliste, Kassenzählung am Event, Beleg einreichen.

Schnell arbeiten:

- Volle Breite nutzen: dichte Tabellen mit fixierter Kopfzeile und Summenzeile, Erfassung direkt in
  der Tabelle (Belegposten, Buch-Abrechnung, Stückelung) statt Dialog je Zeile.
- Durchgehend per Tastatur bedienbar: sinnvolle Tab-Reihenfolge, Enter springt ins nächste Feld
  bzw. legt die nächste Zeile an, Fokus steht nach dem Speichern im ersten Feld der nächsten
  Erfassung. Auswahlfelder (Konto, Kategorie, Ware, Rechnungssteller, Mitglied) mit Tippen suchbar.
- Beträge werden getippt (deutsches Komma, `1,10`), nicht mit −/+ gezählt; `ZahlFeld` bleibt für
  Stückzahlen auf den mobilen Seiten.
- Sinnvolle Vorbelegung (heutiges Datum, letzter Rechnungssteller, Standard-Steuersatz) und
  „Speichern und nächster".
- Beleg-Datei und Erfassungsmaske nebeneinander, damit man abtippen kann, ohne zu wechseln.

Keine Fehler:

- Summen, Differenzen und Salden rechnen beim Tippen mit; eine Buchung, die nicht aufgeht, lässt
  sich nicht speichern, und die Seite zeigt, wo die Differenz liegt.
- Prüfung am Feld mit klarer Meldung, nicht erst nach dem Absenden. Plausibilitätswarnungen
  (Datum in der Zukunft oder in festgeschriebener Periode, ungewöhnlich hoher Betrag, möglicher
  doppelter Beleg, Überzug im Buch) blockieren nicht, müssen aber bestätigt werden.
- Vor jedem unumkehrbaren Schritt (buchen, abrechnen, stornieren, festschreiben) eine
  Zusammenfassung dessen, was gebucht wird, mit ausdrücklicher Bestätigung.
- Nichts geht verloren: Entwürfe werden gespeichert, ungespeicherte Eingaben warnen beim Verlassen,
  ein doppelter Klick oder ein Neuladen erzeugt keine zweite Buchung (Idempotenz-Schlüssel je
  Erfassung).
- Vorzeichen nie raten lassen: Einnahme/Ausgabe, Zugang/Abgang und Von/Nach stehen als Wörter da,
  Beträge sind rechtsbündig mit Tabellenziffern, negative Werte deutlich abgesetzt.

## Zielscheiben

Abhängigkeiten: 0 → (1, 2, 4 parallel) → 3 (braucht 1) → 5 → 6 → 7; 8 braucht 4; 9 braucht 4 und
wächst mit; Ü läuft vor dem Stichtag; 10 kommt zuletzt.

### Scheibe 0: Fundament

- Rechte, Posten `kassenpruefung`, Navigation, leere Seiten.
- Tabellen `fin_konten`, `fin_buchungen`, `fin_buchungszeilen`, `fin_stueckelung`, `fin_zaehler`;
  Buchungslogik mit Summenprüfung, `seq`, Hash, Storno, Retry.
- Seiten: Kontenplan (verwalten), Journal (Liste, Detail, Storno), freie Buchung/Umbuchung.
- „Kette prüfen" (zunächst nur gegen die Datenbank).
- Spike DSQL-Rolle: **Entscheidung 11.11.2026: keine eigene DB-Rolle.** Schutz durch insert-only API
  (Test `finanzenNurInsert.test.ts`), Hash-Kette und Anker (siehe
  [finanzen-spike-dsql-rolle.md](./finanzen-spike-dsql-rolle.md)).
- `docs/finanzen.md` (Zielbild, Verfahrensdokumentation im Aufbau) und `docs/plans/finanzen.md`
  (dieser Plan, wird nach jeder Scheibe fortgeschrieben), Zeilen in `docs/README.md`,
  `docs/datenbank.md`, `docs/posten.md`.

### Scheibe 1: Bargeld (Safe)

- Safe als Konto mit Fächern (Zählbrett, Kleingeld, Wechselgeld, je Barkasse eines, frei anlegbar).
- Bestand je Fach als Saldo **und** je Münze/Schein; Gesamtübersicht.
- Umbuchung zwischen Fächern mit Stückelung, Wechseln innerhalb eines Fachs, Zählung mit
  Differenzbuchung auf „Kassendifferenz".
- Wiederverwendbare Komponente `StueckelungFeld` (je Nennwert eine Anzahl, Summe live): am Desktop
  getippt und per Tab durchlaufbar, auf dem Handy (Kassenzählung am Event) mit `ZahlFeld`.

### Scheibe 2: Buch

- `buch_seiten`: Nummer (eindeutig unter aktiven Seiten), Mitglied oder externer Name, archivierbar
  (Nummer wird frei). `buch_tarife`: je Status Strichwert und maximaler Überzug, mit „gültig ab".
- `buch_eintraege` (nur INSERT, Storno): Striche, Bar, Abzahlung, Strichwert zum Zeitpunkt.
- Abrechnungstabelle aller Seiten (Mitglied, Striche, Bar, Abzahlung); leere Zeilen erzeugen
  nichts. Am Desktop eine Tabelle, die sich per Tastatur zeilenweise durcharbeiten lässt; auf dem
  Handy als Kartenliste mit denselben Feldern.
- Eigene Seite mit Verlauf und Saldo, Überzugswarnung; Rangliste gesamt/pro Jahr (Muster
  `packages/shared/src/trichter.ts` + `TrichterRangliste.tsx`).
- Deaktivieren-Vorschau der Mitglieder zeigt offenen Buch-Saldo.
- **Das Buch ist ein Nebenbuch, kein Teil des Bargeldbestands und ohne eigene Journalbuchungen.**
  Striche und Bar sind „virtuell"; das Geld der Abzahlungen liegt in einer Barkasse und wird mit
  deren Abrechnung (Scheibe 3) als Bareinnahme erfasst. Maßgeblicher Zeitpunkt eines Eintrags ist
  das Eintragen in die App, Steuersatz immer der reguläre (derzeit 19 %). Die Scheibe hängt damit
  nur an den Rechten aus Scheibe 0 und kann früh live gehen.
- Offener Punkt: Push bei Überzug (Access hatte „Buch-Mails")?

### Scheibe 3: Barkassen

- Kassen als Bargeld-Konten mit Grundbestand je Nennwert und Einsatzort; Safe-Fach je Kasse.
- Event-Zählung durch die Dienste (`kasse:zaehlen`, unverbindlich, am Event sichtbar; Event mit
  Zählung nicht löschbar, Muster `eventLoeschenMitPruefung`).
- Verbindliche Abrechnung durch den Finanzer: Zählung → Einnahme = Ist − Soll, verteilt auf die
  Events seit der letzten Abrechnung (anhand der Dienst-Zählungen) → Rückführung auf den
  Grundbestand mit vorgeschlagenen Münz-Transfers von/zum Safe.
- Warnung bei Abweichung zwischen letzter Dienst-Zählung und Finanzer-Zählung.
- Offene Punkte: Aufteilung der Bareinnahmen auf 19 %/7 % (Access: „Bareinnahmen" und „Bar_7");
  Pflicht oder Erinnerung für die Zählung am Event-Ende.

### Scheibe 4: Belege

- Rechnungssteller (mit Rabatt), Steuersätze, Kategorien (Erlös-/Aufwandskonten).
- **Vorzeichen in der Anzeige je Kontenart:** Im Journal gilt Zugang = +, die Summe aller Salden ist 0. Gegenkonten von Geldzugängen haben daher negative Salden (500 € Getränkeerlöse → −500 €,
  „Eröffnung / Saldovortrag“ = −Vereinsvermögen). Kontenplan, Salden und Auswertungen zeigen
  Erlös- und Neutral-Konten deshalb mit umgekehrtem Vorzeichen (Erlöse positiv, „Eröffnung“ z. B.
  als „Vereinsvermögen zum Stichtag“); Bargeld, Bank, Durchlauf und Aufwand bleiben, wie sie sind.
  Nur Anzeige, die gespeicherten Beträge und der Hash ändern sich nicht.
- Beleg: Nummernkreis, **Belegdatum und Bezahldatum**, Zahlweg (bar aus Safe-Fach mit Stückelung,
  Bank, Auslage eines Mitglieds), brutto oder netto, Datei (PDF/Foto), Eigenbeleg mit Begründung.
- **Auslagen (elementar):** Ein Beleg mit Zahlweg „Auslage" bucht gegen das Durchlaufkonto
  „Auslagen Mitglieder" und ist bis zur Erstattung offen. **Sammelerstattung:** mehrere offene
  Belege eines Mitglieds in einer Auszahlung (bar mit Stückelung oder Überweisung); sie setzt das
  Bezahldatum der Belege. Übersicht „Offene Auslagen" je Mitglied.
- **Einreichen durch Mitglieder:** neues Recht `belege:einreichen` (alle Status). Das Mitglied
  fotografiert den Beleg am Handy und legt einen Entwurf an (Foto, Rechnungssteller, Datum, Betrag,
  optional Posten). Der Finanzer korrigiert und genehmigt (→ gebucht) oder verwirft mit Begründung
  und bucht selbst. Das Mitglied sieht den Status seiner Einreichungen; Push an den Finanzer bei
  neuer Einreichung und an das Mitglied bei Genehmigung, Verwerfung und Erstattung.
- Posten: **entweder** Lager-Ware + Gebinde **oder** Kategorie + Freitext (Beamer braucht keinen
  Artikel mehr); Anzahl, Einzelpreis, tatsächlicher Steuersatz (Vorschlag aus
  `waren.steuersatz_standard` bzw. der Kategorie), Pfand aus dem Gebinde (überschreibbar, gleich
  netto/brutto wie der Posten). Warengruppe → Kategorie als Zuordnung, damit Lager-Waren
  automatisch richtig kontiert werden.
- Netto-Belege: Korrektur der Summen netto und je Steuersatz bis 10 ct.
- Entwurf (änderbar) → gebucht (Journal, unveränderlich; Storno + neu).
- Neuer Bucket `c4-<env>-finanzarchiv-<acct>` mit Object Lock (prod: Compliance, 10 Jahre; dev:
  Governance, kurz), Lambda darf nur schreiben/lesen; Upload per Presigned URL nach dem Muster
  `packages/api/src/protokollbilder.ts`, SHA-256 der Datei geht in den Buchungs-Hash.
- Täglicher Job (neuer Zweig in `lambda.ts` + Schedule): Journal-Export und Kopf-Hash ins Archiv
  (aus Scheibe 5 vorgezogen, muss zum 01.01.2027 laufen; ersetzt die fehlende DB-Rolle).

### Scheibe 5: GoBD-Abschluss

- Festschreibung je Monat mit Export; Kopf-Hash per Push an alle mit `finanzen:pruefen` und in der
  App abrufbar (Mail bräuchte SES, offen).
- „Kette prüfen" gegen Archiv-Exporte und Beleg-Hashes, Abweichungen anzeigen.
- CloudTrail in einen Object-Lock-Bucket; Datenexport fürs Finanzamt (CSV + Beschreibung);
  Verfahrensdokumentation in `docs/finanzen.md` fertigstellen.

### Scheibe 6: Konto (Fyrst)

- Bankkonto, `bank_umsaetze` (Rohdaten, Duplikaterkennung), Zuordnung zu Beleg, Rechnung,
  Umbuchung Bargeld ↔ Bank (über „Geldtransit"), SumUp-Auszahlung oder direkt zu einer Kategorie
  (z. B. Kontogebühren).
- FinTS-Spike zuerst: Bibliothek, Fyrst-Server, BestSign-Freigabe, Laufzeit (eigenes Lambda mit
  längerem Timeout, Zugangsdaten in Secrets Manager nach Muster `partymail.ts`). **Die
  FinTS-Produktregistrierung bei der Deutschen Kreditwirtschaft dauert Tage bis Wochen: am besten
  sofort beantragen.** Scheitert der Spike, wird der Datei-Import (CSV/CAMT.053) gebaut.
- Überweisungen aus der App als Folgescheibe, wenn der Abruf stabil läuft.

### Scheibe 7: SumUp

- API-Schlüssel in Secrets Manager, Job ruft Transaktionen und Auszahlungen ab.
- Kartenumsatz brutto als Erlös (dem Event per Zeitpunkt zugeordnet) auf Durchlaufkonto
  „SumUp-Guthaben", Gebühr als Aufwand, Auszahlung gleicht das Konto gegen den Bankumsatz aus.

### Scheibe 8: Rechnungen schreiben

- Empfänger ist **entweder ein Mitglied** (Name und Adresse kommen direkt aus dem Profil, kein
  eigener Empfänger-Datensatz) **oder ein externer Empfänger** (eigene Stammdaten). Beim Stellen
  der Rechnung wird die Anschrift in der Rechnung festgehalten, damit sie unverändert bleibt.
- Rechnung mit lückenlosem Nummernkreis (`NNN-JJJJ` wie bisher), Pflichtangaben,
  Posten als Ware + Gebinde (mit/ohne Pfand, mit/ohne Aufschlag) oder Freitext mit Erlös-Kategorie
  (1:1, also 150 € + 100 € bei zwei Gutschein-Posten).
- PDF mit `@react-pdf/renderer` (Muster `packages/web/src/protokoll/pdf/`), Ablage im Archiv.
- Status Entwurf → gestellt → bezahlt (Zuordnung zum Bankumsatz oder bar) → Stornorechnung.
- Offener Punkt: E-Rechnung (ZUGFeRD) als Folgescheibe, wird für B2B absehbar Pflicht.

### Scheibe 9: Auswertungen

- Einnahmen pro Event und Verlauf je Event-Kategorie (`event_kategorien`), mit `@mantine/charts`.
- USt: Umsatzsteuer, Vorsteuer und Zahllast je Steuersatz, Intervall Monat/Quartal/Jahr.
- EÜR-Vorbereitung: Kategorien auf EÜR-Zeilen und Vereinssphären (ideell, Vermögensverwaltung,
  Zweckbetrieb, wirtschaftlicher Geschäftsbetrieb) abbilden; G+V je Monat/Jahr.
- Einkauf: Menge, Liter (aus Gebinde) und Durchschnittspreis je Ware und Jahr; Pfandsaldo.
- CSV-Export jeder Auswertung.

### Scheibe Ü: Übernahme zum 01.01.2027

- **Du wählst im Detail aus, was übernommen wird.** Schritt 1: Ein Skript liest die
  Access-Tabellen und erzeugt je Bereich eine Vorschlagsliste (Rechnungssteller, externe
  Rechnungsempfänger, Kategorien aus den Warengruppen, Standard-Steuersätze der Waren, Buchseiten
  mit Saldo, Safe-Fächer und Kassen mit Stückelung, Kontostand) mit Nutzungszahlen (z. B. Belege je
  Rechnungssteller, letzte Verwendung). Schritt 2: Du entscheidest je Zeile „übernehmen / nicht /
  zusammenführen mit …" und die Zuordnung (z. B. Warengruppe → Kategorie, Access-Mitglied →
  App-Mitglied). Schritt 3: Der Import liest nur die freigegebenen Zeilen; Bestände kommen als
  Eröffnungsbuchungen. Ob die Auswahl als Tabellen-Dateien oder als Seite in der App läuft, klären
  wir zu Beginn der Scheibe.
- Probelauf auf dev, Abgleich der Salden mit Access, dann prod.

### Scheibe 10: Unentgeltliche Abgaben

- Ersetzt die Papierliste: Dienstgetränke, Sitzung, Semesterputz, Clubfahrt, Weihnachtsfeier,
  Bandverpflegung, Gutscheine … (Arten aus Access `tbl_07_UA_*` als Startwerte, Eigen- und
  Fremdverbrauch).
- Erfassung am Handy (Ware, Menge, Art, optional Event), auf Wunsch mit Lagerabgang; Auswertung je
  Art, Event und Zeitraum, Bewertung zum Einkaufspreis für die Steuer.
- Braucht Scheibe 4 (Einkaufspreise) und 9 (Auswertungen); steht bewusst am Ende.

### Später

Einlagern aus dem Beleg (vorbefüllte Sammel-Einlagerung, `bestandsvorgang_id` am Posten), Verweis
Beleg ↔ Inventar-Gegenstand mit Anschaffungswert, digitales Buch (in der App abstreichen),
FinTS-Überweisungen, E-Rechnung.

## Weitere Ideen (teils aus der Access-Datenbank)

- **Verkaufspreise** (`tbl_01_VKP`: Preise für Gäste/Mitglieder je Artikel): Grundlage für Marge
  und Soll-Einnahmen je Event gegenüber dem Lagerverbrauch.
- **Erstattung als Buch-Gutschrift**: Auslagen wahlweise mit dem Buch-Saldo verrechnen.
- **Texterkennung** für fotografierte Belege (Access hatte „Beleg scannen").
- **Gutscheine** als eigene Verbindlichkeit (verkauft ≠ eingelöst) statt nur als Erlös.
- **Wochenübersicht** für den Finanzer (Kassen, Buch, offene Belege, nicht zugeordnete Umsätze).
- **Spenden, Mitgliedsbeiträge, Bandgagen, GEMA** als eigene Kategorien mit passender Sphäre.

## Risiken

- **Stichtag in sieben Wochen.** Bis 01.01.2027 müssen 0, 1, 2, 3, 4 (inkl. täglichem Anker-Export) und Ü stehen. Konto, SumUp,
  Rechnungen und Auswertungen können im ersten Quartal folgen und rückwirkend ab 01.01. buchen;
  die Festschreibung für Januar braucht Scheibe 5 erst im Februar.
- **FinTS** ist der unsicherste Teil (Registrierung, TAN-Verfahren, Lambda-Laufzeit).
- **Steuerfragen** (Aufteilung der Bareinnahmen 19 %/7 %, Sphären, E-Rechnung) solltest du
  mit Steuerberatung oder Kassenprüfung abstimmen; der Plan lässt sie je Scheibe offen.
- **Object Lock im Compliance-Modus** ist nicht rückholbar: erst auf dev mit Governance erproben.
- Das Bootstrap-Terraform braucht für neue Dienste (CloudTrail, ggf. zweites Lambda) einen
  erneuten Apply, bevor der Deploy sie anlegen darf.

## Stand

| Scheibe                   | Stand                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Fundament               | umgesetzt (PR #31); Arbeitsseiten desktop first nachgezogen, Idempotenz-Schlüssel; keine eigene DB-Rolle ([Spike](./finanzen-spike-dsql-rolle.md)) |
| 1 Bargeld                 | offen                                                                                                                                              |
| 2 Buch                    | offen                                                                                                                                              |
| 3 Barkassen               | offen                                                                                                                                              |
| 4 Belege                  | offen                                                                                                                                              |
| 5 GoBD-Abschluss          | offen                                                                                                                                              |
| 6 Konto                   | offen (FinTS-Produktregistrierung beantragen)                                                                                                      |
| 7 SumUp                   | offen (API-Schlüssel besorgen)                                                                                                                     |
| 8 Rechnungen              | offen                                                                                                                                              |
| 9 Auswertungen            | offen                                                                                                                                              |
| Ü Übernahme               | offen                                                                                                                                              |
| 10 Unentgeltliche Abgaben | offen                                                                                                                                              |

## Verifikation (je Scheibe)

- `pnpm lint`, `pnpm typecheck`, `pnpm test` in einem Sonnet-Subagent; neue Logik (Buchung, Hash,
  Stückelung, Rundung, Buch-Saldo, Kassenabrechnung) als reine Funktionen in `@c4/shared` mit
  Unit-Tests, Routen über Fake-Stores in `app.test.ts`.
- Deploy auf dev (`gh workflow run deploy.yml --ref <branch> -f env=dev`), Browser-Check auf
  https://dev.c4-leipzig.de/app/ durch einen frischen Sonnet-Subagent: Arbeitsseiten zuerst am
  Desktop (1440×900), einmal komplett nur mit der Tastatur, dann bei 375×812; Mitglieder-Seiten
  zuerst bei 375×812.
- Fachlicher Abgleich: Salden nach Übernahme gegen Access (Safe je Nennwert, Kassen, Buchsalden,
  Kontostand); ab Scheibe 5 „Kette prüfen" nach einer absichtlichen Manipulation auf dev.
