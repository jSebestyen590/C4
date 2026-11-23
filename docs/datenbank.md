# Datenbank

Migrationen sind SQL-Dateien in `packages/api/src/db/migrations/`. `pnpm db:migrate` wendet sie in
Namensreihenfolge an und merkt sie in `schema_migrations`. Aurora DSQL erlaubt nur ein DDL-Statement
pro Transaktion, deshalb enthält jede Datei genau ein Statement.

## Überblick

Migrationen sind SQL-Dateien in `packages/api/src/db/migrations/`, die `pnpm db:migrate` in Namensreihenfolge anwendet und in `schema_migrations` merkt. Aurora DSQL erlaubt nur ein DDL-Statement pro Transaktion, deshalb enthält jede Datei genau ein Statement. Rollback läuft über Down-Dateien in `migrations/down/`; Reset und Deploy-Workflow gelten nur für dev.

Abschnitte: Rollback mit Down-Dateien, Deploy-Workflow (nur dev), Deploy-Reihenfolge und additive Migrationen, Umgebungsmarke (`app_info.env`), Reset (nur dev), Gleichzeitige Zugriffe, Fremdschlüssel und Löschen, Backups

## Rollback mit Down-Dateien

Down-Dateien liegen getrennt in `packages/api/src/db/migrations/down/`:

- Ein Statement: `<migration>.down.sql`, z. B. `0010_foo.down.sql` für `0010_foo.sql`.
- Mehrere Statements: `<migration>.down.1.sql`, `<migration>.down.2.sql`, ... Sie laufen in
  numerischer Reihenfolge, jedes als eigene Abfrage.
- Für die Migrationen 0001 bis 0009 gibt es keine Down-Dateien. Ab 0010 gehört zu jeder Migration eine; `migrations.test.ts` erzwingt das ab 0010 (genau ein Statement, Down-Datei, keine Lücken).
  0001–0009 sind ausgenommen: Sie stammen von vor der Ein-Statement-Regel (0009 hat zwei Statements) und wurden vor dem ersten Release zusammengeführt. `rollback.test.ts` prüft nur den Rollback-Ablauf (er bricht vor jeder Änderung ab,
  wenn eine Down-Datei fehlt), nicht die vorhandenen Dateien. 0010–0023 (Waren) und 0025–0035 (Inventar) löschen ihre Tabellen bzw.
  Indizes; 0036 löscht nur die Startbuchungen „Bestand übernommen“ wieder; 0024 entzieht den Vorstandsposten `waren:verwalten` und `inventar:verwalten` wieder. Rollback-Ziel nur für das
  Inventar: `0024_vorstandsposten_rechte`.
- Die Kalender-Migrationen `0037`–`0070` (Namen `*_kalender_*`, `*_push_*`) sind eine zusammengelegte, lückenlose Fassung
  der früheren Migrationen 0037–0082. `migrations.test.ts` prüft für 0010 und höher: genau ein Statement je Datei, eine
  Down-Datei je Migration, keine Lücken.
- 0073–0075 (Schlüssel) löschen ihre Tabellen bzw. ihren Index, 0076 entzieht den Vorstandsposten
  `schluessel:verwalten` wieder; Rollback-Ziel nur für die Schlüssel: `0072_mitglieder_geburtstag_im_kalender`.
- 0077–0091 (Umfragen, zusammengelegt vor dem Merge): 0077–0082 und 0087–0088 löschen ihre Tabellen, 0083–0085 und 0091
  ihre Indizes, 0086 entzieht den Vorstandsposten `umfragen:verwalten` wieder. 0089–0090 fügen `event_kategorien.dauer`
  und `event_vorlagen.tage` per `ALTER` hinzu; ihre Down-Dateien leeren nur die Werte. Rollback-Ziel nur für die Umfragen:
  `0076_schluessel_vorstandsposten_rechte`.
- 0130–0136 (Schlüssel-Anfragen): 0130 entfernt `mitglieder.wohnheim` wieder, 0131–0133 löschen ihre Tabellen
  (`schluessel_anfragen`, `schluessel_antworten`, `schluessel_planungen`), 0134–0136 ihre Indizes. Rollback-Ziel nur für die
  Anfragen: `0129_privatparty_nachrichten_message_idx`.
- 0137–0140 (Benachrichtigungsverlauf): 0137 löscht die Tabelle `benachrichtigung_verlauf` (mit allen Einträgen), 0138–0140
  ihre Indizes. Rollback-Ziel nur für den Verlauf: `0136_schluessel_planungen_schluessel_idx`.
- 0141–0156 (Finanzen): 0141 löscht den Posten `kassenpruefung` wieder, 0142 entzieht den Posten die vergebenen
  `finanzen:*`-Rechte, 0143–0147 löschen ihre Tabellen (`fin_konten`, `fin_buchungen`, `fin_buchungszeilen`,
  `fin_stueckelung`, `fin_zaehler`), 0148 die Zählerzeile `journal`, 0149 die Grundkonten (`safe`, `bank`, `geldtransit`,
  `eroeffnung`), 0150–0154 ihre Indizes, 0155 ergänzt `fin_buchungen.idempotenz_schluessel` per ALTER (Down leert die Werte), 0156 löscht ihren Index `fin_buchungen_idempotenz_idx`. Rollback-Ziel nur für Finanzen: `0140_benachrichtigung_verlauf_erstellt_idx`.
  `mitWiederholung` (Wiederholung bei DSQL-Konflikten) liegt dafür in `packages/api/src/db/wiederholung.ts` und wird von
  Migration, Rollback und Finanzen-Buchungen genutzt.
- 0157–0162 (Finanzen, Bargeld): 0157 löscht das Konto `kassendifferenz`, 0158 setzt `safe.stueckelung` wieder auf `true`,
  0159 und 0162 löschen die Tabellen `fin_zaehlungen` und `fin_zaehlung_posten` (insert-only, mit allen Zählprotokollen),
  0160 und 0161 ihre Indizes. Rollback-Ziel nur für Bargeld: `0156_fin_buchungen_idempotenz_idx`.
- 0194–0196 (Kassen je Event): löschen die Tabellen `fin_kassen_kategorien`, `fin_event_kassen_angepasst` und `fin_event_kassen` (veränderbare Stammdaten, mit den Zuordnungen). Rollback-Ziel nur dafür: `0193_fin_kassenabrechnung_events_event_idx`.
- 0197–0212 (Finanzen, Belege): 0197–0205 löschen die Tabellen `fin_rechnungssteller`, `fin_beleg_entwuerfe`, `fin_belege`,
  `fin_belegposten`, `fin_beleg_korrekturen`, `fin_erstattungen`, `fin_erstattung_belege` und `fin_exporte` (`fin_rechnungssteller`
  und `fin_beleg_entwuerfe` sind änderbar, alle anderen insert-only, mit allen Belegen, Erstattungen und Exportvermerken); 0205
  entfernt das Konto `auslagen` (Durchlauf, „Auslagen Mitglieder“), 0206–0212 löschen ihre Indizes. `fin_beleg_entwuerfe.daten` ist
  `text` mit JSON, nicht `jsonb` (DSQL kennt den Typ nicht als Spalte). Rollback-Ziel nur für die Belege:
  `0196_fin_event_kassen`.
- 0213–0229 (Finanzen, Belege 4b): 0213 fügt das Konto `pfand` („Pfand/Leergut“, Durchlauf) idempotent ein, die Down-Datei löscht es.
  Alle anderen sind `ALTER TABLE … ADD COLUMN IF NOT EXISTS` (ein Statement je Datei, die Down-Dateien leeren nur die Werte, DSQL kann
  keine Spalten löschen): 0214 `warengruppen.kategorie_id` (Aufwandskonto, ohne FK, die API prüft es); 0215–0219 `fin_belegposten.art`,
  `ware_id`, `gebinde_id`, `pfand_cent`, `pfand_betrag_cent`; 0220–0223 `fin_belege.bestandsvorgang_id` (seit 4c ungenutzt, bleibt in der Tabelle, DSQL kann sie nicht löschen; nicht mehr im Drizzle-Schema), `eingereicht_von`,
  `eingereicht_am`, `eingereicht_betrag_cent`; 0224–0229 `fin_beleg_entwuerfe.status`, `eingereicht_von`, `eingereicht_am`,
  `verworfen_grund`, `verworfen_von`, `verworfen_am`. DSQL kennt kein `ADD COLUMN … NOT NULL/DEFAULT` und kein `DROP NOT NULL`:
  `art` und `status` sind nullable (die API schreibt sie immer; `null` gilt als `kategorie` bzw. `entwurf`), und Leergut-Posten
  tragen in `kategorie_id` das Konto `pfand`. `bestandsvorgaenge.quelle` ist freier Text (kein Check).
  Rollback-Ziel nur dafür: `0212_fin_erstattung_belege_beleg_idx`.
- 0230–0231 (Finanzen, Lager-Beleg-Abgleich): 0230 legt `waren_abgleich_korrekturen` an (insert-only: Korrekturen je Ware mit
  vorzeichenbehafteter `menge` in Basiseinheiten, `grund`, `text`, `datum`; `ware_id` und `erstellt_von` ohne Fremdschlüssel, die API prüft
  die Ware), 0231 die allgemeine Schlüssel-Wert-Tabelle `einstellungen` (erster Schlüssel `lager_abgleich_stichtag`, ISO-Datum; änderbar).
  Die Down-Dateien löschen die Tabellen. Rollback-Ziel nur dafür: `0229_fin_beleg_entwuerfe_verworfen_am`.
- 0232 (Finanzen, Belege 4d): `waren.standard_gebinde_id text NULL` (Standard-Gebinde der Ware, wird im Beleg vorbelegt; ohne
  Fremdschlüssel, die API prüft, dass es zu den Gebinden der Ware gehört, und setzt es zurück, wenn das Gebinde entfernt wird).
  `ADD COLUMN IF NOT EXISTS`, die Down-Datei leert nur die Werte (DSQL kann keine Spalten löschen). Rollback-Ziel:
  `0231_einstellungen`.
- 0233–0236 (Standard-Gebinde, Artikel): 0233 füllt fehlende `waren.standard_gebinde_id` mit dem ersten gewählten Gebinde (Down: nichts
  zu tun, die Werte bleiben), 0234 legt `fin_artikel` an (Artikel eines Kategorie-Postens mit Standard-Steuersatz, `name_norm` =
  `lower(trim(name))`, die API legt fehlende Artikel beim Buchen eines Belegs an und übernimmt den Steuersatz des Postens), 0235
  übernimmt die Namen gebuchter, nicht stornierter Kategorie-Posten (`erstellt_von = 'migration'`, Steuersatz und Datum des frühesten Postens;
  Down löscht diese Zeilen), 0236 ist der Unique-Index `fin_artikel_name_norm_idx` (`ASYNC`). Rollback-Ziel nur für die Artikel: `0233_waren_standard_gebinde_backfill`.
- 0237–0244 (Finanzen, Belege 4f): 0237 legt `fin_steuersatz_zeitraeume` an (Steuersatz-Zeiträume: `ab` Datum, `regel` und
  `ermaessigt` in Basispunkten; ein Zeitraum gilt bis zum `ab` des nächsten, der älteste auch davor), 0238 ist ihr Unique-Index auf `ab`
  (`ASYNC`), 0239 füllt die Zeiträume (2007-01-01 19/7 %, 2020-07-01 16/5 %, 2021-01-01 19/7 %; nur in eine leere Tabelle; Down löscht die
  Zeilen von `migration`). 0240/0242 fügen `fin_konten.steuersatz_art` und `fin_artikel.steuersatz_art` hinzu (`regel` | `ermaessigt` |
  `keine`, null = keine Vorgabe; der Wert ergibt sich aus dem Belegdatum), 0241/0243 füllen sie aus den alten Zahlen (1900, 700, 0). Die
  alten Spalten `fin_konten.steuersatz_standard` und `fin_artikel.steuersatz` bleiben (DSQL kann keine Spalten löschen); die API liest sie
  nicht mehr. `fin_artikel.steuersatz` ist `NOT NULL`, deshalb schreibt die API beim Anlegen eines Artikels weiter eine Zahl hinein.
  0244 fügt `fin_belegposten.gesamt_cent` hinzu (Gesamtpreis der Zeile ohne Pfand; gesetzt = `betrag_cent` ist genau dieser Wert,
  `einzelpreis_cent` der gerundete Einzelpreis). Down-Dateien der ADD COLUMN leeren nur die Werte, die der Backfills tun nichts.
  Rollback-Ziel nur dafür: `0236_fin_artikel_name_norm_idx`.
- 0180–0193 (Finanzen, Barkassen): 0180, 0181, 0182, 0183, 0184, 0185, 0186 und 0187 löschen die Tabellen `fin_kassen`,
  `fin_kassen_grundbestand`, `fin_kassenzaehlungen`, `fin_kassenzaehlung_posten`, `fin_kassenabrechnungen`,
  `fin_kassenabrechnung_posten`, `fin_kassenabrechnung_transfers` und `fin_kassenabrechnung_events` (alle außer den ersten beiden
  insert-only, mit allen Zählungen und Abrechnungen), 0188–0193 ihre Indizes. Rollback-Ziel nur für die Barkassen:
  `0179_buch_seiten_verlauf_angelegt`.
- 0177–0179 (Buch-Seitenverlauf): 0177 löscht die Tabelle `buch_seiten_verlauf` (insert-only), 0178 ihren Index, 0179 (Backfill
  der Zeilen `angelegt`/`archiviert` bestehender Seiten) löscht nur diese Startzeilen. Rollback-Ziel nur dafür: `0176_buch_eintraege_idempotenz_idx`.
- 0169–0176 (Buch): 0169, 0170, 0171 und 0173 löschen die Tabellen `buch_seiten`, `buch_tarife`, `buch_abrechnungen` und
  `buch_eintraege` (mit allen Einträgen, die insert-only sind), 0172 und 0174–0176 ihre Indizes. Rollback-Ziel nur für das Buch:
  `0168_mail_abruf_laeuft_bis`.
- 0092–0096 (Trichter): 0092–0094 löschen ihre Tabellen, 0095–0096 ihre Indizes. Rollback-Ziel nur für den Trichter:
  `0091_umfragen_erstellt_idx`.
- 0098–0100 (Status-Verlauf): 0098 löscht die Tabelle, 0099 den Index, 0100 löscht nur die Startbuchungen ohne Datum
  wieder. Rollback-Ziel nur für den Status-Verlauf: `0097_mitglieder_deaktiviert_am`.
- 0101–0103 (Inventar-Teile) fügen `gegenstaende.teil_von`, `virtuell` und `anzahl_je` per `ALTER` hinzu; ihre Down-Dateien
  leeren nur die Werte. Rollback-Ziel nur für die Teile: `0100_mitglied_status_verlauf_bestand`.
- 0104–0109 (Bilder): 0104 löscht die Tabelle `onedrive_verbindung`, 0108 die Tabelle `bilder_freigaben`, 0109 die Tabelle `bilder_ordner_cache`; 0105–0107 fügen `events.bilder_ordner_id`,
  `events.bilder_ordner_url` und `event_vorlagen.bilder_ordner` per `ALTER` hinzu, ihre Down-Dateien leeren nur die Werte.
  Rollback-Ziel nur für die Bilder: `0103_gegenstaende_anzahl_je`.
- 0245–0249 (offizielles Protokoll): `protokolle.offiziell_von`, `protokolle.fassung` samt Backfill `normal`, Unique-Index `protokolle_event_fassung_idx` auf `(event_id, fassung)` (kein partieller Index, DSQL), dann Entfernen von `protokolle_event_idx`; die Down-Datei von 0249 scheitert, solange offizielle Kopien dieselbe `event_id` haben.
- 0254–0269 (Finanzen, Rechnungen): 0254–0256 fügen die Konten `forderungen`, `erloese_offen` und `sumup` idempotent ein (Down löscht sie), 0257–0269 legen die Tabellen `fin_rechnung_einstellungen`, `fin_rechnungsempfaenger`, `fin_rechnung_entwuerfe`, `fin_rechnungen`, `fin_rechnungsposten`, `fin_rechnung_zahlungen`, `fin_rechnung_dateien` und ihre Indizes an (Down löscht sie). Rollback-Ziel nur dafür: `0253_fin_datenexporte_mit_belegdateien`.
- 0110–0113 (Protokolle): 0110 löscht die Tabelle `protokolle`, 0111 den Index `protokolle_event_idx`; 0112 und 0113 fügen
  `event_kategorien.protokoll` und `protokoll_art` per `ALTER` hinzu, die Down-Dateien leeren nur die Werte. Rollback-Ziel nur für die Protokolle:
  `0109_bilder_ordner_cache`.
- 0163–0165 (Protokoll-Sperre) fügen `protokolle.sperre_sub`, `sperre_tab` und `sperre_bis` per `ALTER` hinzu; die Down-Dateien leeren nur
  die Werte. `0157`–`0162` gehören dem Finanzen-PR.
- 0118–0119 (vCard-Links): 0118 löscht die Tabelle `vcard_tokens`, 0119 ihren Index. Rollback-Ziel nur für die vCards:
  `0117_todos_protokoll_idx`.
- 0120–0129 (Privatpartys): 0120–0124 löschen die Tabellen `privatparty_personen`, `privatpartys`, `privatparty_termine`,
  `privatparty_nachrichten` und `mail_abruf`, 0125–0129 ihre Indizes. Rollback-Ziel nur für die Privatpartys:
  `0119_vcard_tokens_hash_idx`.
- Vor dem ersten Release wurden die Migrationen ab 0010 zusammengelegt: Spalten, die später per `ALTER TABLE … ADD COLUMN`
  dazukamen, stehen jetzt in der `CREATE TABLE` (Aurora DSQL kann `DROP COLUMN` nicht, Down-Dateien solcher Spalten
  könnten nur Werte leeren). Neue Spalten nach einem Release brauchen wieder ein eigenes `ALTER`, dessen Down-Datei die
  Werte auf `NULL` setzt; eine Spalte mit `REFERENCES` per `ALTER` ist in DSQL nicht sicher (deshalb ist z. B.
  `ifcos.typ_id` nur Text, der Bezug zu `ifco_typen` wird in der API geprüft).
- 0166 (`privatpartys_event_idx`) legt einen Unique-Index auf `privatpartys.event_id` an (ein Event gehört zu höchstens einer
  Privatparty); die Down-Datei löscht ihn. Rollback-Ziel: `0165_protokolle_sperre_bis`.

Aufruf (braucht `CONFIRM_DB_ROLLBACK=yes`):

```
CONFIRM_DB_ROLLBACK=yes pnpm db:rollback --to 0009_foo   # alles nach 0009_foo zurücknehmen
CONFIRM_DB_ROLLBACK=yes pnpm db:rollback --last 2        # die letzten zwei Migrationen
```

Zurückgenommen wird in umgekehrter Reihenfolge; danach wird die Zeile aus `schema_migrations`
gelöscht. Fehlt für eine dieser Migrationen die Down-Datei, bricht das Skript vor jeder Änderung mit
einer Liste der fehlenden Dateien ab. Ein unbekanntes Ziel ist ein Fehler, nichts zurückzunehmen ist
kein Fehler. Daten der zurückgenommenen Tabellen gehen verloren.

## Deploy-Workflow (nur dev)

Die Eingabe `rollback_to` (z. B. `0009_foo`) nimmt vor dem Migrieren alle Migrationen nach dieser
zurück. Sie funktioniert nur für `dev`; `reset_db` hat Vorrang.

Szenario: Das Skript einer Migration auf dem Feature-Branch wurde nach dem Deploy erneut geändert.
Dann zuerst auf die letzte unveränderte Migration zurückgehen (`rollback_to`, der Branch braucht die
Down-Datei), das Skript anpassen und erneut deployen; die Migration läuft dann mit dem neuen Stand.

## Deploy-Reihenfolge und additive Migrationen

Der Deploy migriert die Datenbank **vor** dem Terraform-Apply, also bevor die neue Lambda live geht. Dadurch
läuft der alte Code kurz gegen das neue Schema. Migrationen müssen deshalb additiv sein: erst hinzufügen
(Spalte, Tabelle, Index), den Code umstellen und Altes erst in einem späteren Release entfernen
(Spalten löschen, umbenennen oder `NOT NULL` verschärfen nie zusammen mit dem Code, der sie noch braucht).
Beim allerersten Deploy gibt es noch keine Datenbank; dann läuft die Migration nach dem Apply.

## Umgebungsmarke (`app_info.env`)

`pnpm db:migrate` schreibt `app_info('env', <Wert>)`, wenn `C4_ENV` gesetzt ist (der Deploy-Workflow setzt
`dev` bzw. `prod`). `pnpm db:reset` und `pnpm db:rollback` lesen die Zeile zuerst und brechen bei `prod` ab.
Fehlt Tabelle oder Zeile, laufen sie wie bisher (Funktion `assertNotProd` in `db/environment.ts`).

## Reset (nur dev)

`pnpm db:reset` löscht alle Tabellen (braucht `CONFIRM_DB_RESET=yes`). Der Deploy-Workflow hat dafür
die Eingabe `reset_db`. Alle Daten gehen verloren.

## Gleichzeitige Zugriffe

Aurora DSQL arbeitet mit optimistischer Nebenläufigkeit: Ändern zwei Transaktionen gleichzeitig dieselben
Zeilen, schlägt eine mit SQLSTATE `40001` (Codes `OC000`/`OC001`) fehl.

- `createDb` (`packages/api/src/db/client.ts`) wiederholt jede Transaktion auf oberster Ebene bei einem
  solchen Konflikt: insgesamt 3 Versuche, Wartezeit ab 100 ms mit Jitter (`transaktionenWiederholen` in
  `db/wiederholung.ts`). Verschachtelte `tx.transaction`-Aufrufe (Savepoints) bleiben unberührt.
- Einzelne Statements außerhalb einer Transaktion werden nicht wiederholt.
- Die Buchung in `finanzen.ts` hat eine eigene, großzügigere Wiederholung (8 Versuche, ab 50 ms, wegen der
  Zählerzeile des Journals). Innerhalb von `mitWiederholung` wird nicht ein zweites Mal wiederholt.
- Die API antwortet bei einem Konflikt, der nach allen Versuchen bleibt, mit 409 „Jemand anderes hat gerade
  dasselbe geändert. Bitte versuch es noch einmal.“ und bei einer Unique- oder Fremdschlüssel-Verletzung
  (`23505`, `23503`) mit 409 „Das passt nicht mehr zum aktuellen Stand. Bitte lade die Seite neu und
  versuch es noch einmal.“ Beides wird weiterhin geloggt. Alles andere bleibt 500.
- **Belegen vor externen Aktionen:** Wo zwei parallele Läufe nur lesen und dann extern handeln (Mail abrufen, Token
  erneuern), reicht der Retry nicht. Der Lauf belegt vorab eine gemeinsame Zeile mit einem einzelnen bedingten
  `UPDATE`/Upsert (z. B. Lease `mail_abruf.laeuft_bis`: `WHERE laeuft_bis IS NULL OR laeuft_bis < jetzt`); 0 Zeilen oder `40001`
  heißt „läuft schon“ und der Lauf wird übersprungen. Die Sperre wird im `finally` freigegeben und läuft sonst von selbst ab.
  Innerhalb einer Lambda-Instanz genügt ein geteiltes Promise (OneDrive `erneuern`).
- **Prüfen, dann einfügen:** DSQL erkennt Konflikte nur an Zeilen, die beide Transaktionen _schreiben_. Liest eine
  Transaktion nur und fügt dann ein (z. B. „gibt es schon eine offene Inventur?“), kollidieren zwei parallele nie. Deshalb
  ruft sie innerhalb derselben Transaktion **vor der Prüfung** `sperreBeruehren(tx, ...schluessel)` (`db/sperren.ts`) auf: ein
  `INSERT … ON CONFLICT DO UPDATE` in die Tabelle `sperren` (ein Schlüssel je umkämpfter Sache, sortiert und ohne Dopplungen
  geschrieben). Die zweite Transaktion schreibt dieselbe Zeile und scheitert mit 40001; der Retry sieht dann das Ergebnis der
  ersten und lehnt fachlich ab. Schlüssel: `gegenstand:<id>`, `lagerort:<id>`, `aufraeumaktion`,
  `besetzung:<posten>:<mitglied>`, `umfrage:<id>`. Nötig nur, wenn zwei verschiedene Abläufe dieselbe Regel prüfen und keine
  gemeinsame Zeile schreiben; schreiben beide ohnehin dieselbe Zeile (z. B. `inventuren` beim Abschließen), reicht der Retry.
  Die Fakes brauchen keine Sperre. Echtes Verhalten lässt sich nur auf dev prüfen (zwei gleichzeitige Requests).
- **Regel für neuen Code:** In einem Transaktions-Callback nur Datenbankarbeit. Er kann mehrfach laufen;
  S3, Cognito, OneDrive, Mail, Push, `fetch` und das Ändern von Variablen außerhalb des Callbacks gehören
  davor oder danach.

## Fremdschlüssel und Löschen

Die Tabellen deklarieren `REFERENCES` ohne `ON DELETE`. Ob Aurora DSQL Fremdschlüssel erzwingt, ist **ungeprüft**: Ein
Test auf dev (Lagerort mit Waren per SQL löschen) steht aus, und die AWS-Dokumentation, die wir lesen konnten, war dazu
nicht eindeutig. Der Code verlässt sich deshalb nicht darauf:

- **Prüfen, dann löschen:** Jede Löschroute prüft in derselben Transaktion vor dem `DELETE`, ob andere Zeilen auf die Zeile
  verweisen (`gibtEs` in `waren.ts`), und lehnt mit 409 und einer deutschen, konkreten Meldung ab (`WarenKonflikt`,
  `KalenderKonflikt`, ...). Fachlich abhängige Zeilen, die der Zeile gehören (Stimmen einer Umfrage, Teilnahmen eines
  Events, Aliase einer Ware), löscht der Store in derselben Transaktion mit.
- Neue Verweise: Beim Anlegen einer Tabelle mit `REFERENCES` die Löschroute der Zielzeile um die Prüfung ergänzen.
- Weiche Verweise ohne Fremdschlüssel (z. B. `privatpartys.umfrage_id`, `umfrage_termine.event_id`, `protokolle.event_id`)
  prüft der Code beim Lesen oder Löschen selbst; ein hängender Verweis ist dort zulässig und wird toleriert.
- Greift ein Fremdschlüssel doch (`23503`), antwortet die API mit dem allgemeinen 409 (siehe oben).

## Backups

AWS Backup sichert die DSQL-Cluster, die mit `Environment=<env>` getaggt sind. Konfiguriert ist das in `infra/bootstrap`
(vom Owner angewendet, die Deploy-Rolle kann es nicht ändern oder löschen).

| Umgebung | Regel        | Zeitplan          | Aufbewahrung |
| -------- | ------------ | ----------------- | ------------ |
| prod     | `stuendlich` | jede volle Stunde | 2 Tage       |
| prod     | `taeglich`   | täglich 03:00 UTC | 35 Tage      |
| dev      | `taeglich`   | täglich 03:00 UTC | 7 Tage       |

Voraussetzung: In AWS Backup ist der Ressourcentyp „Aurora DSQL“ für eu-central-1 aktiviert (manuell, siehe README).
Wiederherstellung erzeugt einen neuen Cluster, den die App erst bekommen muss; **noch nicht getestet**.
