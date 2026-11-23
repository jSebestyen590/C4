# Finanzen

Stand: **Scheibe 0 (Fundament), Scheibe 1 (Bargeld), Scheibe 2 (Buch, siehe [buch.md](./buch.md)), Scheibe 3 (Barkassen) Scheibe 4 (Belege inkl. Einreichen, Lager-Posten, Pfand, Lager-Beleg-Abgleich) und Scheibe 5 (GoBD-Abschluss) sind gebaut**: Kontenplan, Journal mit Hash-Kette,
Storno, freie Buchung, „Kette prüfen“ (gegen Datenbank und Archiv), Festschreibung, Datenexport fürs Finanzamt, der Safe mit Fächern, das Buch als Nebenbuch, die Barkassen mit Dienst-Zählung am Event und Abrechnung sowie Belege mit Datei-Archiv und Auslagen. Alles Weitere (Bankanbindung, …)
steht als Zielbild unten und im Umsetzungsplan [plans/finanzen.md](./plans/finanzen.md). Diese Seite
wird mit jeder Scheibe um das tatsächlich Gebaute ergänzt und wird zugleich die Verfahrensdokumentation
(wer bucht wie, wo liegen Belege, wie läuft die Prüfung).

## Überblick

Die Finanzen des Vereins laufen ab dem 01.01.2027 über die App und lösen die Access-Datenbank ab. Gebaut sind Fundament (Kontenplan, Journal mit Hash-Kette, Storno, freie Buchung, „Kette prüfen“), Bargeld (Safe mit Fächern), das Buch ([buch.md](./buch.md)) die Barkassen (Dienst-Zählung am Event, Abrechnung mit einer Buchung) die Belege (Datei-Archiv, Zahlwege, Auslagen mit Sammelerstattung, täglicher Export, Lager-Posten, Pfand, Einreichen durch Mitglieder, Lager-Beleg-Abgleich) und der GoBD-Abschluss (Festschreibung je Monat, Kette prüfen gegen das Archiv, CloudTrail, Datenexport, Verfahrensdokumentation); alles Weitere steht als Zielbild und im Umsetzungsplan [plans/finanzen.md](./plans/finanzen.md). Die Seite wird mit jeder Scheibe ergänzt und ist zugleich die Verfahrensdokumentation (GoBD: jede Änderung erkennbar, Rechte, Prüfung).

Abschnitte: Zielbild, GoBD, Rechte, Kontenplan, Journal, Hash-Kette, Kette prüfen, Warnungen je Kontoart, Bargeld (Safe), Barkassen, Belege, Lager-Beleg-Abgleich, Festschreibung, Datenexport, CloudTrail, Seiten, API, Datenbankrolle, Verfahrensdokumentation

## Zielbild

Die Finanzen des Vereins laufen ab dem **01.01.2027** über die App und lösen die Access-Datenbank ab
(sie bleibt das Archiv bis einschließlich 2026).

| Bereich      | Inhalt                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Journal      | Jede Geldbewegung als Buchung mit Zeilen auf Konten (Summe 0), nur Anlegen, Korrektur per Storno                          |
| Bargeld      | Safe mit Fächern, Bestand je Münze/Schein, Umbuchen, Wechseln, Zählung                                                    |
| Buch         | Nummerierte Seiten der Mitglieder, Striche/Bar/Abzahlung, Tarife je Status, Verlauf, Rangliste                            |
| Barkassen    | Grundbestand, Zählung am Event durch die Dienste, verbindliche Abrechnung durch den:die Finanzer:in                       |
| Belege       | Posten mit Kategorie, brutto/netto, Auslagen mit Sammelerstattung (Lager-Posten, Pfand, Einreichen, Lager-Beleg-Abgleich) |
| Konto        | Fyrst per FinTS (Fallback Datei-Import), Zuordnung der Umsätze                                                            |
| SumUp        | Kartenumsätze, Gebühren und Auszahlungen per API                                                                          |
| Rechnungen   | Ausgangsrechnungen als PDF an Mitglieder oder externe Empfänger                                                           |
| Auswertungen | Einnahmen je Event, USt, EÜR-Vorbereitung, Einkauf                                                                        |

## GoBD

Ziel ist nicht, Manipulation unmöglich zu machen, sondern jede Änderung erkennbar:

- Journal nur mit INSERT, lückenlose Nummer, Storno statt Ändern, Festschreibung je Monat (siehe „Festschreibung“).
- Hash-Kette über alle Buchungen samt Hash der Belegdateien.
- Originalbelege, tägliche Journal-Exporte und der Ketten-Hash liegen in S3 mit Object Lock
  (Compliance, 10 Jahre). Der tägliche Export läuft ab 01.01.2027.
- Der Posten „Kassenprüfung“ liest alles, kann die Kette gegen das Archiv prüfen und den Datenexport fürs Finanzamt erzeugen.
- Zugriffe auf das Archiv protokolliert CloudTrail in einen eigenen Object-Lock-Bucket (siehe „CloudTrail“).

## Rechte

| Recht                | Wer                                                                           | Wofür                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `buch:lesen`         | alle Status                                                                   | eigene Buchseite, Rangliste (`/buch`)                                                                                             |
| `kasse:zaehlen`      | alle Status                                                                   | Kassen am Event zählen (Abschnitt „Kasse“ der Event-Seite)                                                                        |
| `belege:einreichen`  | alle Status                                                                   | eigene Auslagen-Belege einreichen, ansehen und zurückziehen (`/belege`)                                                           |
| `finanzen:lesen`     | Admin, Buchhaltung, Vorstandsvorsitz, Stellv. Vorstandsvorsitz, Kassenprüfung | Kontenplan und Journal lesen                                                                                                      |
| `finanzen:buchen`    | Admin, Buchhaltung                                                            | buchen, stornieren, Belege erfassen und buchen, Auslagen erstatten, Rechnungssteller pflegen, Buch abrechnen und Seiten verwalten |
| `finanzen:verwalten` | Admin, Buchhaltung                                                            | Kontenplan und Buch-Tarife pflegen (später Anbindungen), Monate festschreiben, Datenexport                                        |
| `finanzen:pruefen`   | Admin, Kassenprüfung                                                          | „Kette prüfen“, Datenexport fürs Finanzamt                                                                                        |

Die ersten drei Rechte stehen in `STATUS_PERMISSIONS`, die `finanzen:*`-Rechte vergeben Posten
(Migration `0142`, siehe [posten.md](./posten.md)) und die Gruppe `admin`. Der Posten
`kassenpruefung` kommt mit Migration `0141`. Wer ein `finanzen:*`-Recht hat, sieht den Menüpunkt
„Finanzen“.

## Kontenplan

Tabelle `fin_konten`: `id`, `name`, `art`, `parent_id`, `stueckelung`, `steuersatz_art`
(`regel` | `ermaessigt` | `keine`, null = keine Vorgabe; der Satz ergibt sich aus dem Datum, siehe „Steuersatz-Zeiträume“),
`archiviert`. Die alte Spalte `steuersatz_standard` bleibt ungenutzt.

- **Arten:** Bargeld, Bank, Durchlauf, Erlöse, Aufwand, Neutral. Eine Art „Buch“ gibt es bewusst nicht:
  Das Buch der Mitglieder (Scheibe 2) ist ein Nebenbuch ohne Journalbuchungen.
- **Grundkonten** mit festen Ids (Migration `0149`): `safe` „Safe“ (Bargeld, Gruppe der Fächer, seit `0158` ohne eigene Stückelung), `bank`
  „Bank (Fyrst)“, `geldtransit` „Geldtransit“ (Durchlauf), `eroeffnung` „Eröffnung / Saldovortrag“
  (Neutral); `kassendifferenz` „Kassendifferenz“ (Neutral, Migration `0157`); `pfand` „Pfand/Leergut“ (Durchlauf, Migration `0213`, siehe „Belege“). Weitere Konten legt
  `finanzen:verwalten` an.
- **Unterkonten** über `parent_id` (später z. B. Safe → Fächer). Das übergeordnete Konto muss
  existieren, Zyklen und das eigene Konto als Eltern sind ungültig.
- **Archivieren statt löschen:** Archivierte Konten erscheinen nicht mehr in der Liste (Schalter
  „Archivierte anzeigen“) und nehmen keine neuen Buchungen an; ihre Zeilen bleiben.
- **Art, Stückelung und Übergeordnet** lassen sich nur ändern, solange keine Buchungszeile auf dem
  Konto liegt (sonst 409). Name, Steuersatz und Archivierung gehen immer.
- Der Saldo je Konto (`saldoCent`) ist die Summe seiner Zeilen, `saldoGesamtCent` zusätzlich die seiner
  Unterkonten (der Kontenplan zeigt die Gesamtsumme).
- **Gruppenregel:** Ein Konto mit Unterkonten nimmt keine Buchungszeilen an (400 „Auf das Konto „X“ kann
  nicht gebucht werden, weil es Unterkonten hat …“), auch nicht per Storno. Umgekehrt bekommt ein Konto mit
  Buchungszeilen keine Unterkonten (409). Die Regel gilt einheitlich, es gibt keine Sonderfälle für Altdaten.

## Journal

Tabellen (Migrationen `0144`–`0148`, Index auf `idempotenz_schluessel` in `0156`, Spalte `idempotenz_schluessel` in `0155`):

| Tabelle              | Inhalt                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fin_buchungen`      | Kopf: `seq`, `datum`, `text`, `quelle_typ`/`quelle_id`, `event_id`, `storno_von`, `erstellt_von` (Cognito-sub), `erstellt_am`, `prev_hash`, `hash`, `idempotenz_schluessel` |
| `fin_buchungszeilen` | Zeilen: `buchung_id`, `pos`, `konto_id`, `betrag_cent` (mit Vorzeichen), `netto_cent`, `steuer_cent`, `steuersatz`, `steuer_art`                                            |
| `fin_stueckelung`    | je Zeile auf einem Stückelungskonto: `nennwert_cent`, `anzahl` (mit Vorzeichen)                                                                                             |
| `fin_zaehler`        | Zeile `journal`: letzte `seq` und letzter Hash                                                                                                                              |

**Nur INSERT.** Es gibt keine Update- oder Delete-Route auf Buchungen; eine Korrektur ist ein Storno
plus Neubuchung. Geld ist durchgehend ganze Cent (Soll positiv, Haben negativ), der Steuersatz
steht in Basispunkten.

**Regeln** (`pruefeBuchung` in `@c4/shared`, Meldungen deutsch, Antwort 400):

- mindestens zwei, höchstens 50 Zeilen; die Zeilen ergeben zusammen 0
- Betrag je Zeile höchstens 10 Mio. €; 0 nur bei einer Zeile mit Stückelung (Wechseln)
- Konten müssen existieren und dürfen nicht archiviert sein
- Stückelung: auf Stückelungskonten Pflicht, sonst verboten; erlaubte Nennwerte 1 ct bis 100 €
  (1, 2, 5, 10, 20, 50 ct, 1, 2, 5, 10, 20, 50, 100 €), je Nennwert nur einmal, Anzahl ungleich 0;
  Σ Nennwert × Anzahl = Betrag der Zeile
- Steuer: Steuerart `keine` erlaubt keine Steuerwerte; bei `ust`/`vorsteuer` braucht die Zeile
  Netto, Steuer und Satz, und Netto + Steuer = Betrag
- `event_id` muss ein vorhandenes Event sein

**Nummer (`seq`):** lückenlos ab 1. Jede Buchung erhöht in ihrer Transaktion die Zählerzeile
`fin_zaehler` `journal`; Aurora DSQL bricht von zwei parallelen Buchungen eine mit einem
Konflikt (SQLSTATE 40001) ab, `mitWiederholung` (`packages/api/src/db/wiederholung.ts`) wiederholt
sie mit Backoff. So werden parallele Buchungen nacheinander nummeriert. Eindeutige Indizes auf `seq` und
`storno_von` (Migrationen `0150`, `0151`) sichern die Nummer und den Einmal-Storno zusätzlich.

**Storno** (`POST /api/finanzen/buchungen/:id/storno`): eine neue Buchung mit `quelle_typ` `storno`
und `storno_von` auf das Original, alle Beträge und Stückelungsanzahlen negiert, mit eigenem Datum
und **Begründung** (Pflichtfeld `text`, getrimmt, 1 bis 500 Zeichen; ohne sie 400 „Bitte gib eine
Begründung für das Storno an.“). Der Buchungstext lautet „Storno von Nr. n: <Begründung>“. Eine Buchung lässt sich nur einmal stornieren, ein Storno
selbst nicht (409).

**Journal-Liste** (`GET /api/finanzen/buchungen`, Seite „Journal“): jeder Eintrag trägt `abgang` und
`zugang`, die Zeilen mit negativem bzw. positivem Betrag je Konto zusammengefasst (positive Beträge,
Wechsel-Zeilen mit 0 entfallen). Die Tabelle (ab `sm`) hat die Spalten Nr., Datum, Text, **Von**, **Nach**,
Betrag (Volumen) und Erstellt von (Von/Nach je mit eigener Sortierung, `sort=von|nach`; Tabelle scrollt bei schmaler Breite im eigenen Container); Karten auf dem Handy zeigen dieselbe Zeile „Bank (Fyrst) → Geldtransit“.
**Alle Spalten sind sortierbar** (Klick auf die Kopfzeile, erneuter Klick dreht die Richtung, `aria-sort`;
Standard Nr. absteigend; im URL-Parameter `sort`/`richtung`). Dafür liefert die API **alle Treffer in einer
Antwort** (keine Seiten, kein „Mehr laden“), höchstens `JOURNAL_MAX` = 2000, neueste (`seq`) zuerst; gibt es
mehr, ist `gekappt: true` und die Seite zeigt „Es werden die neuesten 2.000 Buchungen gezeigt – grenze den
Zeitraum ein.“ Sortiert wird im Browser über das ganze Ergebnis (Von und Nach nach angezeigtem Text,
`localeCompare('de')`; Betrag nach Cent, Bewegung nach Cent mit Vorzeichen; Gleichstand: Datum, dann Nr.).
Auf dem Handy wählt ein Feld „Sortieren nach“ über den Karten dieselbe Sortierung. **Filter „Nur Stornos“**
(`storno=1`): zeigt Stornobuchungen **und** die Originale, die sie rückgängig machen; kombinierbar mit Konto
und Zeitraum (UND). Der Ersteller steht als einfacher fetter Statusname, **ohne Link** zum Mitglied (auch auf
der Detailseite).
Mehr als zwei Konten einer Seite werden als „Bank + 3 weitere“ gekürzt (Tooltip mit allen Konten und
Beträgen), lange Namen mit Auslassungspunkten (Logik in `packages/web/src/finanzenJournal.ts`).
**Kontoauszug-Ansicht:** mit Kontofilter bekommt jeder Eintrag zusätzlich `konto` (`betragCent` mit
Vorzeichen, `saldoNachCent`); sonst ist `konto` `null`. Die Tabelle zeigt dann „Gegenkonto“ (nur die
andere Seite), „Bewegung“ („Zugang 25,50 €“ / „Abgang 25,50 €“, Abgang fett und rot) und „Saldo danach“
(negativ rot mit Minus). Der laufende Saldo folgt der **Journalreihenfolge (`seq`)**, nicht dem Datum
und unabhängig von Filtern und Anzeigereihenfolge: Kontosumme bis zur höchsten `seq` der Liste, davon
werden die Bewegungen aller neueren Buchungen des Kontos abgezogen (auch solcher, die ein Filter ausblendet).

**Idempotenz-Schlüssel:** Buchen und Stornieren verlangen `idempotenzSchluessel` (UUID, die die Seite je
Erfassung erzeugt). Wird derselbe Schlüssel noch einmal gesendet (doppelter Klick, Wiederholung nach
Netzfehler, Neuladen), legt die API keine zweite Buchung an, sondern gibt die vorhandene zurück: neu
`201 { id, seq }`, wiederholt `200 { id, seq, wiederholt: true }`. Die Prüfung läuft in der
Transaktion; der eindeutige Index `fin_buchungen_idempotenz_idx` (Migration `0156`) fängt zwei parallele
Anfragen mit demselben Schlüssel ab (dann wird die vorhandene Buchung gelesen). Der Schlüssel ist ein
technisches Feld und **nicht Teil des Hashs**. Er ist `NULL` bei späteren Systembuchungen.

**Quellen:** `manuell`, `umbuchung`, `storno`, `eroeffnung`; spätere Scheiben ergänzen eigene Typen.

## Hash-Kette

Jede Buchung trägt `prev_hash` (Hash der vorigen Buchung; bei der ersten 64 Nullen) und `hash`:

```
hash = SHA-256-hex( prev_hash + "\n" + kanonisches_JSON )
```

`kanonisch` in `packages/shared/src/finanzen.ts` (Format Version 1, JCS-artig): ein JSON-Objekt ohne
Leerzeichen, Schlüssel aller Objekte aufsteigend sortiert (UTF-16-Reihenfolge), Strings Unicode-NFC
normalisiert und wie `JSON.stringify` escaped, Zahlen nur sichere Ganzzahlen. Inhalt:

| Feld                                                                                                             | Wert                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `v`                                                                                                              | `1`                                                                                                                                 |
| `seq`, `id`, `datum` (`JJJJ-MM-TT`), `text`, `quelle_typ`, `quelle_id`, `event_id`, `storno_von`, `erstellt_von` | wie in `fin_buchungen` (leere Werte `null`)                                                                                         |
| `erstellt_am`                                                                                                    | ISO-8601 UTC mit Millisekunden, z. B. `2027-01-05T09:30:12.345Z`                                                                    |
| `zeilen`                                                                                                         | nach `pos` aufsteigend, je `pos`, `konto_id`, `betrag_cent`, `netto_cent`, `steuer_cent`, `steuersatz`, `steuer_art`, `stueckelung` |
| `zeilen[].stueckelung`                                                                                           | nach `nennwert_cent` aufsteigend, je `nennwert_cent`, `anzahl` (leer: `[]`)                                                         |
| `belege`                                                                                                         | `[]` (reserviert für Beleg-Hashes späterer Scheiben)                                                                                |

`prev_hash` und `hash` gehören nicht in das JSON. Ein Prüfer kann einen Eintrag mit Zeilen und
Stückelung (z. B. aus einem Export) so nachrechnen, hier mit Python (`entry` = das Objekt wie oben,
Schlüssel bereits in Snake-Case):

```python
import hashlib, json, unicodedata

def nfc(v):
    if isinstance(v, str): return unicodedata.normalize("NFC", v)
    if isinstance(v, list): return [nfc(x) for x in v]
    if isinstance(v, dict): return {nfc(k): nfc(x) for k, x in v.items()}
    return v

def hash_von(prev_hash, entry):
    kanonisch = json.dumps(nfc(entry), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256((prev_hash + "\n" + kanonisch).encode("utf-8")).hexdigest()
```

Die Kette beginnt mit `prev_hash` = `"0" * 64`; der `hash` jeder Buchung ist der `prev_hash` der nächsten.

## Kette prüfen

`GET /api/finanzen/kette` (`finanzen:pruefen`, Seite `/finanzen/kette`) liest alle Buchungen samt
Zeilen und Zähler in einem Snapshot und prüft mit `pruefeKette`:

- `seq` lückenlos ab 1 (Fehler „Nummer fehlt oder ist doppelt“)
- `prev_hash` = Hash der Vorgängerin
- gespeicherter `hash` = neu berechneter Hash (erkennt nachträglich veränderte Inhalte)
- Zeilen jeder Buchung ergeben 0
- Stückelung jeder Zeile, die eine hat, passt zum Betrag
- die Zählerzeile `fin_zaehler` stimmt mit letzter `seq` und letztem Hash überein

**Abgleich mit dem Archiv** (Object Lock): Wer die Datenbank ändern kann, könnte Buchungen samt Hashes neu
schreiben; das Archiv kann er nicht ändern. Deshalb prüft `pruefeArchiv` zusätzlich:

- `export/*.jsonl` und `festschreibung/*.jsonl`: je `seq` müssen Hash, `prev_hash` und die kanonische Buchung mit der
  Datenbank übereinstimmen (Fehler „Archiv weicht ab“); eine `seq` im Archiv, die in der Datenbank fehlt, ist ein Fehler.
  Buchungen nach dem letzten Export sind kein Fehler, das Ergebnis zählt sie als `nichtExportiert`.
- `anker/*.json` und `festschreibung/*.json`: der Datenbank-Hash bei `bis_seq` muss dem `kopf_hash` entsprechen.
- Alle Versionen der Objekte unter `export/`, `anker/` und `festschreibung/` werden gelesen. Mehrere Versionen
  eines Exports oder Ankers sind ein Fehler („Archiv überschrieben“). Festschreibungs-Objekte dürfen identisch
  neu geschrieben worden sein (ohne `erstellt_am`), etwa nach einem abgebrochenen Lauf.
- Jede Beleg-Datei der Kette: die SHA-256-Prüfsumme in S3 (`HeadObject`) muss dem Hash in der Buchung entsprechen
  (auch fehlende Dateien sind ein Fehler).

Das Ergebnis zeigt Anzahl, Kopf-Hash, Fehler je `seq` und `archiv` (Zähler für Exporte, Anker, Festschreibungen,
Belegdateien, `nichtExportiert`, `eingerichtet`). Ohne Archiv-Bucket (`eingerichtet: false`, lokal) wird nur gegen die
Datenbank geprüft; die Seite sagt das. Das Archiv wird parallel (höchstens 16 Zugriffe) gelesen.

## Festschreibung

Je Monat schließt `finanzen:verwalten` das Journal ab (Seite `/finanzen/festschreibung`). Regeln:

- **Der Reihe nach:** erster Monat = Monat der frühesten Buchung, danach jeweils der nächste (leere Monate
  eingeschlossen). Nur ganz vergangene Monate (vor dem aktuellen Monat, Europe/Berlin).
- **Nicht rücknehmbar:** Tabelle `fin_festschreibungen` (nur INSERT, eindeutig auf `monat`) mit Monat, `bis_seq`
  (höchste Nummer beim Festschreiben), `kopf_hash`, Anzahl Buchungen des Monats, Archivschlüssel, wer und wann. Es gibt keine
  Route zum Aufheben.
- **Sperre:** `einfuegen` im Journal liest in der Transaktion den letzten festgeschriebenen Monat. Freie Buchung,
  Umbuchung und Storno mit Datum in einem festgeschriebenen Monat: 400 („Der Monat MM/JJJJ ist festgeschrieben. Buche
  mit einem Datum ab TT.MM.JJJJ.“). Beleg, Erstattung, Zählung und Kassenabrechnung buchen mit dem **ersten offenen
  Tag** als Buchungsdatum; Beleg-, Bezahl- und Eventdatum bleiben unverändert. Die Seiten zeigen das vorher an.
  Ein Storno einer Buchung aus einem festgeschriebenen Monat bucht in einem offenen Monat; die alte Buchung bleibt unverändert.
- **Ablauf:** `POST /api/finanzen/festschreibungen` (`{ monat, idempotenzSchluessel }`) schreibt in einer Transaktion
  (mit Zählerzeile, damit parallele Buchungen kollidieren und wiederholt werden) die Zeile und legt im Archiv
  `festschreibung/<JJJJ-MM>.jsonl` (alle Buchungen bis `bis_seq`) und `festschreibung/<JJJJ-MM>.json` (Monat,
  `bis_seq`, `kopf_hash`) ab. Wiederholung für denselben Monat: 200 mit `wiederholt`. „Kette prüfen“ gleicht diese Objekte ab.
- **Hinweise** vor dem Festschreiben (blockieren nicht, Bestätigung nötig): Beleg-Entwürfe und Einreichungen mit
  Belegdatum im Monat, Events im Monat mit Kassenzählung ohne Abrechnung.
- **Benachrichtigung:** Push `finanzen.festgeschrieben` (Kopf-Hash) an alle mit `finanzen:pruefen`; der Kopf-Hash steht
  auch auf der Seite. Der Tagesjob erinnert ab dem 10. des Folgemonats mit `finanzen.festschreibung_faellig`
  (höchstens einmal pro Woche, an `finanzen:verwalten`); die Übersicht zeigt zusätzlich einen Hinweis. Mail gibt es
  nicht (kein SES).

## Datenexport

Für das Finanzamt (Betriebsprüfung, Z3-Zugriff) erzeugt `POST /api/finanzen/datenexporte` (`{ von, bis }`;
`finanzen:pruefen` oder `finanzen:verwalten`, Seite `/finanzen/datenexport`, Standard: Vorjahr) ein ZIP:

- `konten.csv`, `buchungen.csv` (mit `seq`, Hashes, Storno-Bezug, Quelle; nach Buchungsdatum im Zeitraum),
  `buchungszeilen.csv`, `stueckelung.csv`, `belege.csv` (mit `sha256` und Archivschlüssel; die Belegdateien selbst
  liegen nicht im ZIP), `belegposten.csv`, `rechnungssteller.csv`, `festschreibungen.csv`
- `index.xml`: Beschreibungsstandard GDPdU (DTD `gdpdu-01-08-2002`): je Tabelle Datei, Name, Spalten mit Typ, Schlüssel
- `beschreibung.txt`: Zeitraum, Ersteller, Spaltenbedeutung, Hinweis auf die Hash-Kette

CSV: UTF-8, Trenner `;`, CRLF, Beträge `1234,56`, Datum `TT.MM.JJJJ`. Das ZIP liegt im Archiv unter
`datenexport/<Zeitstempel>-<von>-<bis>.zip`, eine Zeile in `fin_datenexporte` (nur INSERT) hält Zeitraum, Schlüssel,
SHA-256 und Ersteller. Die Antwort enthält eine kurzlebige Download-URL (kein Direkt-Download: API Gateway begrenzt
Antworten auf 6 MB); `GET /api/finanzen/datenexporte` listet frühere Exporte mit frischer URL.

**Mit Belegdateien** (`mitBelegdateien: true`, Checkbox „Mit Belegdateien“): Die Belegdateien können Gigabytes
ergeben, deshalb läuft der Export im Hintergrund. Die Route prüft die Eingabe und ruft die API-Lambda asynchron
selbst auf (`InvocationType: Event`, Ereignis `{ c4: 'datenexport', id, von, bis, sub }`, keine Wiederholung); Antwort
`202 { id, laeuft: true }`. Lokal (ohne Lambda-Umgebung) läuft der Job im Hintergrund desselben Prozesses. Der Job
(`finanzenDatenexportJob.ts`) schreibt das ZIP als Strom (fflate `Zip`: CSV/XML/TXT komprimiert, Belegdateien
unkomprimiert) direkt in einen Multipart-Upload ins Archiv (`@aws-sdk/lib-storage`); der Speicherbedarf bleibt klein,
egal wie groß das ZIP wird. Die Belegdateien liegen als `belege/<sha256>.<Endung>` im ZIP (jede Datei einmal), ihr
Pfad steht in `belege.csv` (Spalte `datei_pfad`, leer beim Export ohne Dateien), `beschreibung.txt` nennt den Ordner.
Der Job prüft den SHA-256 jeder Datei. Fehlt oder stimmt eine Datei nicht, scheitert der ganze Export (kein
unvollständiges ZIP, keine Zeile) und die Meldung nennt die Belegnummer. Ein ZIP über 4 GB wird abgelehnt (fflate
schreibt kein Zip64): dann den Zeitraum verkürzen. Am Ende steht eine Zeile in `fin_datenexporte`
(`mit_belegdateien = true`, `id` wie in der 202-Antwort) und der Anfragende bekommt einen Push der Art
`finanzen.datenexport_fertig` („Dein Datenexport TT.MM.JJJJ–TT.MM.JJJJ mit Belegdateien ist fertig.“ bzw. „… ist
fehlgeschlagen.“, Ziel `/app/finanzen/datenexport`); Fehler stehen im Log. Die Liste zeigt „mit Belegdateien“ als
Badge. Infra: Lambda-Timeout 900 s (HTTP bleibt durch API Gateway auf 29 s begrenzt), Recht `lambda:InvokeFunction`
auf die eigene Funktion, `maximum_retry_attempts = 0`, Lifecycle-Regel für abgebrochene Multipart-Uploads.

## CloudTrail

Ein Trail (`c4-<env>-trail`, Single-Region, Log-Dateivalidierung) schreibt in den Bucket `c4-<env>-cloudtrail-<Konto>`
(Object Lock, Versionierung, gleiche Retention wie das Finanzarchiv, kein öffentlicher Zugriff). Er protokolliert
schreibende Datenereignisse auf dem Finanzarchiv, also wer wann Objekte angelegt oder gelöscht hat. Verwaltungsereignisse
(Write) nur in prod (`cloudtrail_verwaltungsereignisse`), weil dev und prod im selben Konto liegen und nur der erste
Trail kostenlos ist. Die Lambda darf im Archiv `s3:GetObjectVersion` und `ListBucketVersions` (für „Kette prüfen“),
aber weder löschen noch Retention umgehen. **Einmalig vor dem Deploy:** `infra/bootstrap` neu anwenden
(Deploy-Rolle braucht `cloudtrail:*` auf `c4-<env>-*`, Boundary die Versions-Rechte).

## Warnungen je Kontoart

Beim Buchen, Stornieren und Umbuchen von Bargeld prüft `saldoWarnungen` (`@c4/shared`) den Saldo nach der
Buchung (Zeilen je Konto zusammengerechnet, Soll/Zugang positiv). Die Warnungen blockieren nicht, müssen aber
in der Zusammenfassung bestätigt werden:

| Kontoart           | Warnung                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| Bank               | Saldo danach unter 0                                                                                |
| Aufwand            | Saldo danach im Haben (Guthaben) und die Buchung vergrößert es (z. B. Erstattung über den Ausgaben) |
| Erlöse             | Saldo danach im Soll (Minus) und die Buchung vergrößert es (z. B. Rückzahlung über den Einnahmen)   |
| Bargeld            | keine Warnung: harte Bestandsregel auf dem Server (siehe Bargeld)                                   |
| Durchlauf, Neutral | keine Warnung                                                                                       |

Die Salden werden vor dem Öffnen der Zusammenfassung neu geladen.

## Bargeld (Safe)

Der Safe ist eine **Gruppe**: Seine Unterkonten sind die **Fächer** (Bargeld mit Stückelung, z. B.
„Zählbrett“, „Kleingeld“, „Wechselgeld“, je Barkasse eines). Die Finanzer:in legt sie frei im Kontenplan an
(Art Bargeld, Stückelung an, Übergeordnet „Safe“); es gibt keine vorgegebenen Fächer. Gebucht wird nur auf
Fächer, nie auf den Safe selbst (Gruppenregel).

- **Bestandsregel** (`pruefeBestand`, bei jeder Buchung samt Storno und Zählung in der Transaktion geprüft,
  Antwort 400): Kein Bargeldkonto darf negativ werden, und bei Stückelungskonten darf keine Münz-/Scheinart
  unter 0 fallen („Im Fach „Wechselgeld“ sind nur 3 × 2,00 € vorhanden.“). Mehrere Zeilen auf demselben
  Konto werden zusammengerechnet (Wechseln).
- **Bestand** je Fach: Saldo und Anzahl je Nennwert (Summe der Stückelungszeilen). `GET /api/finanzen/bargeld`
  liefert alle nicht archivierten Fächer unter `safe` mit den 13 Nennwerten sowie Summen je Nennwert.
- **Umbuchen:** Von und Nach, wobei mindestens eine Seite ein Fach ist (die andere ein Fach oder ein
  anderes buchbares Konto, z. B. Bank). Sind beide Seiten keine Fächer, sperrt die Seite und verweist auf „Buchen“; umgekehrt bietet „Buchen“ die Fächer an, sperrt aber die Buchung und verweist auf die Bargeld-Umbuchung. Beide Seiten übernehmen `von`/`nach` (und `modus=umbuchung` auf „Buchen“) aus dem Link als Vorbelegung. Die Stückelung wird einmal erfasst; die Fach-Seite bekommt sie
  (Von negiert), die andere Seite nur den Betrag. Von begrenzt auf den Bestand. **Rückgeld:** Anzahlen dürfen negativ sein (z. B. Rechnung über 4,99 € aus „Kasse“: 1 × 5,00 € und −1 × 0,01 € ergibt Von −4,99 € mit Stückelung {5,00 €: −1, 0,01 €: +1}); der Betrag insgesamt darf auch 0 oder negativ sein (Tausch zwischen zwei Fächern: Von −Stückelung, Nach +Stückelung, eine Zeile mit 0 ist mit Stückelung erlaubt). Ist eine Seite kein Fach, braucht die Umbuchung einen Betrag. Die Zusammenfassung nennt die Netto-Richtung („Netto 10,00 € von „B“ nach „A““ oder „reiner Tausch“). Positive Anzahlen sind am Bestand des Von-Fachs begrenzt, negative (wenn Nach ein Fach ist) am Bestand des Nach-Fachs. Am Handy kehrt eine „±“-Taste das Vorzeichen um. `quelle_typ` `umbuchung`.
- **Wechseln:** ein Fach und **eine Tabelle** mit den Nennwerten (1 ct bis 100 €) und den Spalten Bestand,
  Abgang (raus, je Nennwert auf den Bestand begrenzt), Zugang (rein) und Bestand danach; die Summen müssen
  gleich sein („Noch 1,00 € Unterschied“). Zwei Zeilen auf dem Fach (−Abgang, +Zugang), Text „Wechseln <Fach>“.
  Ein Schalter „Felder spaltenweise durchlaufen“ legt fest, ob Tab und Enter zeilenweise (Abgang 1 ct, Zugang
  1 ct, Abgang 2 ct …) oder spaltenweise (erst alle Abgang-, dann alle Zugang-Felder) springen; die Wahl
  merkt sich der Browser (`localStorage`, Standard zeilenweise).
- **Zählen:** Der gezählte Ist-Bestand eines Fachs wird gegen den Soll-Bestand gerechnet
  (`berechneZaehlung`). Eine Zählung wird **immer** als insert-only Protokoll gespeichert, auch ohne
  Differenz (Tabellen `fin_zaehlungen` und `fin_zaehlung_posten`: Soll, Ist und Differenz je Nennwert,
  Zähler:in, Zeitpunkt, Verweis auf die Buchung). Weicht etwas ab, entsteht in derselben Transaktion eine
  Differenzbuchung (`quelle_typ` `zaehlung`, `quelle_id` = Zählung): Mehr-Nennwerte stehen auf einer
  Fach-Zeile, Fehl-Nennwerte auf einer zweiten, dazu eine Zeile auf `kassendifferenz` mit dem Gegenbetrag
  der Nettodifferenz. Stimmt der Betrag, aber nicht die Mischung (Netto 0), bleiben es die zwei Fach-Zeilen. Stimmt alles, gibt
  es keine Buchung. Text: Anmerkung der Zähler:in oder „Zählung <Fach>: Differenz …“. Ein Fach ist ein
  Stückelungskonto ohne Unterkonten und nicht archiviert, sonst 400.
- Rechte: Lesen `finanzen:lesen`, Umbuchen, Wechseln und Zählen `finanzen:buchen` (nicht `kasse:zaehlen`,
  das gehört der Dienst-Zählung am Event, siehe „Barkassen“).

## Barkassen

Eine **Kasse** ist ein Fach des Safes (Bargeld, Stückelung, Eltern `safe`) mit Zusatzdaten in `fin_kassen`:
**Grundbestand** je Nennwert (`fin_kassen_grundbestand`, änderbar), **Standard-Erlöskonto** und **Standard-Ziel-Fach**.
Der Name ist der Kontoname des Fachs und lässt sich im Formular „Bearbeiten“ ändern (gleiche Prüfung wie im Kontenplan, der keine eindeutigen Namen verlangt), das Archivieren läuft über den Kontenplan; archivierte Kassen verschwinden aus den Auswahlen. Die Kasse
erscheint wie jedes Fach unter „Bargeld“ und wird mit Umbuchen gefüllt. Reine Logik: `packages/shared/src/kassen.ts`
(`berechneKassenabrechnung`, Vorschläge, Schemas, DTOs, `MUENZROLLE`), Prüfung und Hilfen für Store und Fake in
`packages/api/src/finanzenKassen.ts`.

- **Dienst-Zählung** (jede:r mit `kasse:zaehlen`, alle Status): am Event zählt man die Kasse (`StueckelungFeld`). Sie ist
  **unverbindlich**: keine Buchung, nur Übersicht und Zuordnung der Einnahmen zu Events (`fin_kassenzaehlungen`, nur INSERT,
  Event Pflicht, nicht abgesagt). Mehrere Zählungen je Event und Kasse sind erlaubt, **die neueste gilt** (ältere zeigt die
  Event-Seite als „ersetzt“). Ein Event mit Zählung lässt sich nicht löschen. Es gibt keinen Push, nur den Hinweis
  „Kasse noch nicht gezählt“ auf der Event-Seite.
- **Kassen eines Events:** Jede Kasse kann **Standard für mehrere Event-Kategorien** sein (Formular „Bearbeiten“ auf `/finanzen/kassen`,
  `finanzen:verwalten`, Tabelle `fin_kassen_kategorien`). Ein Event nutzt **dynamisch** den aktuellen Standard seiner Kategorie, bis die
  Finanzer:in (`finanzen:buchen`) am Event die Kassen selbst festlegt („Kassen festlegen“, `fin_event_kassen_angepasst` + `fin_event_kassen`);
  danach gilt die eigene Liste (auch eine leere), „Standard der Kategorie wiederherstellen“ setzt zurück. Änderungen am Standard wirken auf
  alle nicht angepassten Events, auch bestehende und Serien. Archivierte Kassen verschwinden aus Listen und Auswahlen. Die Zuordnungen sind
  veränderbare Stammdaten, **keine** Nur-INSERT-Tabellen (nicht im Guard `finanzenNurInsert.test.ts`), sperren das Löschen eines Events
  nicht und werden mit ihm gelöscht.
- **Einnahmen am Event** (für alle mit `kasse:zaehlen`, vom Server berechnet): je gezählter oder zugewiesener Kasse vor der Abrechnung der
  Vorschlag der Abrechnung (`eventKassenEinnahme`, „vorläufig“: neueste Zählung des Events minus die des vorigen Events seit der letzten nicht
  stornierten Abrechnung, bzw. minus den Bestand), danach der gebuchte Betrag aus `fin_kassenabrechnung_events` („abgerechnet“; nach Storno
  wieder der Vorschlag). Die Summe zählt alle Kassen des Events; eine zugewiesene, noch nicht gezählte Kasse macht sie „unvollständig“.
- **Abrechnung** (`finanzen:buchen`): Die Finanzer:in zählt die Kasse (Ist). `Soll` ist der Bestand laut Buchhaltung,
  **Einnahme = Ist − Soll** (darf negativ sein). Die **gesamte** Einnahme geht auf **ein** Erlöskonto (Standard der Kasse,
  änderbar), Steuer = Satz der `steuersatz_art` des Kontos am Abrechnungsdatum (`ust`, netto/steuer aus dem Brutto); keine Aufteilung 19/7 in einer
  Abrechnung, dafür getrennte Kassen.
- **Zuordnung zu Events:** Alle Dienst-Zählungen der Kasse seit der letzten (nicht stornierten) Abrechnung, je Event die
  neueste, nach Event-Beginn. Vorschlag: Einnahme des Events = Zählung − vorige Zählung (Start mit `Soll`); die Beträge sind
  änderbar. **Fehler ohne Event** = Einnahme − Summe der Event-Einnahmen (Beispiel: 100 € gezählt, Event 1 = 50 €, Event 2 =
  40 € → Fehler 10 €). Gebucht wird immer die ganze Einnahme als Erlös, der Fehler steht nur in der Zuordnung
  (`fin_kassenabrechnung_events`, `fehler_cent`). Der Server rechnet alles neu und ignoriert Einnahme und Fehler vom Client.
- **Rückführung:** Der Transfer je Nennwert ist mit `Ist − Grundbestand` vorbelegt (positiv: Kasse → Ziel-Fach, negativ:
  Ziel-Fach → Kasse), änderbar und durch Bestand begrenzt (Bestandsregel, Fehlermeldung je Nennwert). Das Ziel-Fach ist je
  Kasse voreingestellt und in der Abrechnung änderbar.
- **Fehlbestand** (z. B. Grundbestand 30 × 1 €, Ist 10, Ziel-Fach hat nur 10): Die Zeile ist markiert und bietet zwei Wege.
  _Münzrollen holen_: Fach wählen (Bestand je Fach in der Auswahl), Anzahl in ganzen Rollen (`MUENZROLLE`: 1/2/5 ct je 50,
  10/20/50 ct je 40, 1/2 € je 25, Scheine ohne Rolle). Die Rollen gehen ins **Ziel-Fach**, daraus wird die Kasse aufgefüllt, der
  Rest der Rolle bleibt dort (25 ins Zählbrett, 20 in die Kasse, Zählbrett danach 15). Hat das Fach keine ganze Rolle, ist die
  Stückzahl frei. _Diesmal weniger auffüllen_: Die Kasse geht mit weniger Münzen raus; der Grundbestand bleibt unverändert, die
  Abrechnung speichert „Kasse danach“ je Nennwert (`fin_kassenabrechnung_posten`).
- **Prüfdialog:** Zusammenfassung mit Einnahme, Erlöskonto (mit Umsatzsteuer, falls das Konto einen Satz hat), Event-Zuordnung
  und Fehler sowie einer Matrix: Zeilen Kasse (Ist), Kasse (Delta, Abgang −), Ziel-Fach vorher/nachher und je Nachschub-Fach
  vorher/nachher, Spalten immer alle Nennwerte (leere grau) plus Summe (Tabelle ab `md`, gestapelte Karten auf dem Handy).
- **Entwurf:** Eingaben (Ist, Transfer, Münzrollen, Erlöskonto, Ziel-Fach, Event-Beträge, Idempotenz-Schlüssel) bleiben je Kasse
  im `localStorage` und überstehen ein Neuladen; nach erfolgreichem Buchen werden sie gelöscht. Passt der Stand der Kasse nicht
  mehr (neue Abrechnung, neue Zählung, anderer Bestand), wird der Entwurf mit Hinweis verworfen. „Eingaben verwerfen“ leert ihn.
  Nach dem Buchen öffnet die Detailseite der Abrechnung. Logik: `kassenEntwurf.ts`, Matrix: `abrechnungsMatrix` in `kassenFormular.ts`.
- **Warnungen** (nicht blockierend, zum Abhaken): Fehler ≠ 0 („Abweichung zur letzten Dienst-Zählung“), Kasse danach ≠
  Grundbestand, keine Dienst-Zählung seit der letzten Abrechnung, negative Einnahme, Datum in der Zukunft.
- **Buchung:** eine Buchung (`quelle_typ` `kassenabrechnung`, `quelle_id` = Abrechnungs-Id, `event_id` leer) mit den Zeilen
  Kasse (Ist − Bestand je Nennwert, getrennt nach mehr und weniger), Erlöskonto (− Einnahme mit Steuer), Kasse (− Transfer),
  Ziel-Fach (+ Transfer) und je Nachschub-Fach Fach (− Rollen) / Ziel-Fach (+ Rollen). Die Bestandsregel gilt in der Transaktion
  für alle beteiligten Fächer. Ändert sich nichts, gibt es keine Buchung (`buchung_id` leer), die Abrechnung wird trotzdem
  protokolliert (wie bei der Zählung). Alle Abrechnungstabellen sind nur INSERT (`finanzenNurInsert.test.ts`).
- **Storno:** über das Journal wie jede Buchung. Eine Abrechnung mit stornierter Buchung gilt nicht mehr als „letzte
  Abrechnung“, ihre Dienst-Zählungen erscheinen in der nächsten wieder; die Liste zeigt „storniert“.
- **Idempotenz:** Dienst-Zählung und Abrechnung haben je einen Schlüssel mit eindeutigem Index, ein zweiter Aufruf liefert
  200 mit der vorhandenen.

## Belege

Ein **Beleg** ist eine **Ausgabe** mit Datei, Rechnungssteller und Posten. Gutschriften (z. B. Pfandrückgabe auf dem Bon) sind negative
Posten; die Summe eines Belegs darf 0 oder negativ sein (siehe „Summe ≤ 0“). Einnahmen ohne Rechnung laufen über Kasse oder freie Buchung. Reine Logik: `packages/shared/src/belege.ts`
(`belegBerechnen`, `belegBuchungszeilen`, `belegPruefen`, `belegNummer`, `offeneAuslagen`), Store und Hilfen in
`packages/api/src/finanzenBelege.ts`, Datei-Archiv in `finanzarchiv.ts`, Export in `finanzExport.ts`. Rechte: Lesen `finanzen:lesen`,
Entwürfe, Buchen, Erstattung und Rechnungssteller `finanzen:buchen`, Einreichen durch Mitglieder `belege:einreichen`.

- **Ablauf:** „Neuer Beleg“, Datei wählen (Handy: Kamera); der Browser berechnet den SHA-256, die Datei geht direkt ins Archiv und
  es entsteht ein **Entwurf** (`fin_beleg_entwuerfe`, änderbar, wird automatisch gespeichert, ohne Nummer). Maske: Rechnungssteller
  (suchbar, als Option im Dropdown anlegbar; bei neuem Beleg nicht vorbelegt und mit Autofokus, bei Entwurf oder eingereichtem Beleg ohne), Belegdatum, **Belegsumme**, Brutto oder Netto, Posten (Kategorie = Aufwandskonto, Text, Anzahl, Einzelpreis,
  Steuersatz: Regelsatz, ermäßigter Satz oder 0 %, je nach Belegdatum; der Vorschlag kommt aus `fin_konten.steuersatz_art` der Kategorie), Zahlweg. „Buchen“ zeigt eine
  Zusammenfassung mit Warnungen; danach ist der Beleg unveränderlich.
- **Posten-Arten** (`art`; fehlt sie, gilt `kategorie`):
  - `kategorie`: **Artikel** (Pflicht, `text`, z. B. „Deko“), Aufwandskonto, Anzahl, Einzelpreis (wie oben).
  - `ware`: Lager-Posten ohne Text (Buchungstext = Ware-Name) mit Ware und Gebinde, Anzahl in Gebinden, Einzelpreis je Gebinde **ohne** Pfand und Pfand je Gebinde (aus
    `pfandGesamtCent` der Ware vorbelegt, überschreibbar, leer = kein Pfand); netto/brutto wie der Beleg. Die Kategorie kommt aus der
    Warengruppe (siehe unten), ist überschreibbar und Pflicht („Kategorie fehlt“ am Posten). Der Warenanteil bucht auf die Kategorie,
    das Pfand auf `pfand`.
  - `leergut`: Pfandrückgabe mit Beschreibung, Anzahl, Pfand je Stück (≥ 0) und wählbarem Steuersatz; Anzahl > 0 ist die
    **Rückgabe**, der Betrag ist negativ (−Anzahl × Preis, `postenBetrag`); bucht gegen `pfand` (Zeilen speichern
    `kategorie_id = 'pfand'`). Ein eigener Pfand-Kauf kommt nicht vor.
- **Posten-Erfassung (Finanzer:in):** Ein neuer Posten ist immer Art Ware. Ab `md` (`BelegPostenTabellen.tsx`) stehen drei Tabellen
  untereinander, je mit Löschen je gefüllter Zeile: **Waren** (Ware, Gebinde, Anzahl, Preis je Gebinde, Pfand je Gebinde, Steuer %,
  Kategorie, Betrag), **Kategorien** (Artikel, Kategorie, Anzahl, Einzelpreis, Steuer %, Betrag) und **Leergut** (Beschreibung,
  Anzahl, Preis, Steuer %, Betrag, negativ angezeigt). Die Posten bleiben eine Liste mit `art`, im Beleg in der Reihenfolge Waren,
  Kategorien, Leergut. Die Seite nutzt die volle Breite.
  - **Immer eine leere Zeile:** Jede Tabelle endet mit genau einer leeren Zeile; sobald darin etwas steht, erscheint darunter die
    nächste. Es gibt kein „Zeile hinzufügen“ und keine Spalte „Nr.“. Leere Zeilen werden nicht gespeichert, nicht geprüft und haben
    kein Löschen-Icon. „Inhalt“: Ware = Ware gewählt; Kategorie = Artikel, Kategorie oder Preis; Leergut = Beschreibung oder Preis
    (vorbelegte Anzahl und Steuersatz zählen nicht). Der Steuersatz steht ohne „%“ in den Optionen (z. B. „19“, „7“, „0“, Kopf „Steuer %“); die Sätze kommen aus dem Belegdatum.
  - **Meldungen** nennen Tabelle und Zeile, z. B. „Waren, Zeile 2: Bitte wähle ein Gebinde.“ (Zeile = Position innerhalb der Art;
    `belegPruefen`, API und Zellfehler unter den Tabellen). Zellen mit Fehlern sind rot; Fehlertexte verschieben keine Felder.
  - **Fokusführung:** Enter springt ins nächste Feld, in der letzten Zelle einer gefüllten Zeile in die nächste (leere) Zeile,
    Strg/Cmd+Enter bucht. Tab im Ware- oder Kategorie-Feld übernimmt die markierte Option, wenn das Dropdown offen ist
    (`autoSelectOnBlur`). Nach der Wahl einer Ware springt der Fokus zu **Anzahl** (das Gebinde bleibt per Shift-Tab erreichbar).
  - **Neue Ware aus dem Beleg:** Mit Recht `waren:verwalten` steht im Ware-Feld unten „Neue Ware anlegen“ (mit Suchtext
    „„Köstritzer“ als neue Ware anlegen“). Es öffnet das `WareFormular` mit vorbelegtem Namen; danach steht die Ware samt
    Standard-Gebinde, Pfand und Kategorie in der Zeile und `beleg-waren` wird neu geladen. Gilt auch in der Karten-Maske und beim
    Mitglied (dort nur mit dem Recht).
  - **Neuer Rechnungssteller aus dem Beleg:** Im Rechnungssteller-Feld steht mit Suchtext unten „„X“ als neuen Rechnungssteller
    anlegen“ (nicht bei vorhandenem Namen); Wählen legt ihn sofort an (nur Name), wählt ihn aus und springt zum Belegdatum. Nie per
    Tab/Blur (`rechnungsstellerWahl`, `blurWaehltMarkierte`).
  - **Anzahl** ist nirgends vorbelegt (auch nicht bei Karten und Mitglied); leer = Fehler „Bitte angeben.“ an der Zelle.
  - **Rechnen im Preisfeld:** Die Preisfelder der Posten (Waren, Kategorien, Leergut; nicht die Belegsumme) nehmen einen Rechenausdruck
    mit `+ - * /`, Klammern und Dezimalkomma, z. B. `(7,99 + 4,50)/12` (`BetragFeld` mit `rechnen`, Parser `betragRechnen` in
    `betragEingabe.ts`, kein `eval`; Fehler „Ungültige Rechnung“, Division durch 0 ist ein Fehler). Beim Verlassen bleibt die getippte Formel im
    Feld stehen (zum schnellen Korrigieren; ein einfacher Betrag wird wie sonst formatiert); sie liegt als `preisFormel` in der Zeile und im Entwurf
    (`belegPostenSchema`, max. 200 Zeichen, nicht in `fin_belegposten`) und erscheint nach dem Neuladen wieder. Das Ergebnis steht im „≈ X €“-Hinweis. Die Zeile hält den ungerundeten Preis (`preisExaktCent`); ist er kein ganzer Cent, wird beim Speichern
    `gesamtCent = round(preisExakt × Anzahl)` gesetzt (`fin_belegposten.gesamt_cent`, Betrag exakt, der gerundete Einzelpreis
    wird mit `einzelpreisAusGesamt` mitgespeichert), sonst `null`. Ändert sich die Anzahl, rechnet sich der Betrag aus dem exakten Preis neu;
    beim Laden gilt `preisExakt = gesamtCent / Anzahl`. Leergut wird gerundet (kein `gesamtCent`). Unter dem Betrag steht „≈ X € je
    Gebinde/Stück“ (gerundeter Preis), wenn exakt ≠ gerundet. Info-i am Preis: `HILFE.belege.preisRechnen`.
  - **Info-i „Kategorie“** (Tabellenkopf, Karten, Mitglied): Kategorien sind die Aufwandskonten im Kontenplan, auf die die Ausgabe
    gebucht wird. Das Info-i zu „Preise sind“ (Brutto/Netto) steht direkt am Umschalter.
  - **Belegdatum:** In der Zukunft = Fehler am Feld (live; Buchen gesperrt, auch serverseitig und bei Mitglied-Einreichungen);
    älter als 2 Monate = orange Hinweis am Feld und Warnung `belegdatum_alt` im Buchen-Dialog (bucht trotzdem).
    Wechselt es in einen anderen Steuersatz-Zeitraum, werden Posten mit Regel-/ermäßigtem Satz umgestellt (Hinweis,
    `saetzeUmstellen`); Steuersatz-Optionen kommen aus dem Datum.
  - **Eigenbeleg** (ohne Datei, mit Begründung; die Steuersatz-Felder entfallen schon, sobald der Schalter an ist, `formularEigenbeleg`) bucht **ohne Vorsteuer**: je Steuersatz der Bruttobetrag voll auf die Kategorie,
    Steuer 0, `steuer_art = keine` (auch Pfand und Leergut). Hinweis „keine Vorsteuer, der volle Betrag ist Aufwand“, Summen und
    Dialog ohne Netto/Steuer; in der Erfassung entfällt die Steuersatz-Spalte (Karten: das Feld; die Werte der Zeilen bleiben für den Fall, dass
    der Schalter zurückgestellt wird), die Summen zeigen nur die Gesamtsumme (und davon Pfand), `belegPruefen` prüft die Sätze am Belegdatum nicht (das Formular blendet die Meldung bei Eigenbeleg aus), im Netto-Modus entfällt auch „Korrektur je Steuersatz“; im Netto-Modus ist Netto + berechnete Steuer der gezahlte Betrag. Gilt auch für Einreichungen ohne Datei.
  - **Vorschau** der Datei: bei neuen Belegen aus, bei eingereichten an („Vorschau ein-/ausblenden“); der Kopf ist ab `lg` immer zweispaltig (links Datei mit Vorschau,
    Eigenbeleg-Schalter und Begründung, rechts Rechnungssteller, Belegdatum, Belegsumme). Die Summen-Tabelle hat ab `md` rechts eine leere Spalte
    (Breite der Lösch-Spalte), damit sie mit den Posten-Tabellen bündig ist.
  - **Serienerfassung** (Checkbox unter „Prüfen und buchen“, initial an): neuer Beleg = nach dem Buchen gleich `/finanzen/belege/neu`
    (Hinweis mit Link zum gebuchten Beleg); eingereichter Beleg = nach Buchen oder Verwerfen zur nächsten Einreichung (älteste
    zuerst), ausgegraut ohne weitere. Die Seite bekommt dafür einen frischen Durchlauf (Key), kein Rest des alten Formulars.
  - **Speichern vor dem Verlassen:** Eine Navigation weg vom Entwurf speichert zuerst und geht bei Erfolg weiter; schlägt es fehl,
    fragt ein Dialog „trotzdem verlassen?“ (Eingaben bleiben lokal). Der Entwurf-Cache (`belegEntwurf`) wird nach jedem Speichern
    aktualisiert und beim Öffnen immer frisch geladen.
  - Die **Belege-Liste** ist clientseitig sortierbar (`useSortierung`, `sortierung.tsx`): Klick auf den Spaltenkopf (Nummer, Belegdatum,
    Rechnungssteller, Summe, Zahlweg, Mitglied), zweiter Klick dreht die Richtung; auf dem Handy ein Select „Sortieren nach“.
  - Das **Beleg-Detail** zeigt Ware-Posten ohne doppelten Namen: „Ur-Krostitzer, 20 x 0,5l Flasche 3,10 € … 131,00 € (davon Pfand
    31,00 €)“; Zeilen mit exaktem Preis „Gesamtpreis, ≈ X je Stück“.
  - Unter `md` bleibt die Karten-Maske (`BelegPostenZeile.tsx`, gleiche Regeln) mit „Posten hinzufügen“. Hilfen:
    `packages/web/src/belegAuswahl.ts`.
- **Belegsumme:** Die Finanzer:in gibt oben die **Belegsumme (brutto)** an (Pflicht; bei eingereichten Belegen vorbelegt mit dem eingereichten Betrag, wenn sie leer ist). Unter den Tabellen steht live „Posten: X € ·
  Belegsumme: Y € · Differenz: Z €“ (Differenz rot, wenn ≠ 0). Gebucht wird nur, wenn die Summe der Posten (inkl. Pfand, Leergut
  negativ) gleich der Belegsumme ist („Die Posten ergeben X €, die Belegsumme ist Y €.“, in `belegPruefen`, also auch serverseitig).
  Gespeichert wird sie nur im Entwurf-JSON (`belegsummeCent`); bei eingereichten Belegen ist sie mit dem eingereichten Betrag
  (`eingereicht_betrag_cent`) vorbelegt. Gebucht zählt weiter `fin_belege.summe_cent`.
- **Summe ≤ 0:** Die Summe eines Belegs darf 0 oder negativ sein, bei allen Zahlwegen. Bar: negative Summe = Geldeingang in die
  Kasse (Stückelung positiv, „Eingenommen“). Bank: Eingang. Auslage: negativer Betrag = das Mitglied schuldet dem Verein. Summe
  genau 0 ist buchbar, erzeugt aber keine Gegenbuchung und taucht nicht in den offenen Auslagen auf. Die Warnung `hoher_betrag`
  vergleicht den Betrag.
- **Artikel → Kategorie:** Bei Kategorie-Posten gibt man zuerst den Artikel (Autocomplete aus bisherigen Artikelnamen), dann die
  Kategorie. Das Dropdown zeigt oben die **Vorschläge** (Kategorien, in denen der Artikelname schon gebucht wurde, nach Häufigkeit;
  die häufigste ist vorbelegt, solange die Kategorie leer ist), darunter **Alle Kategorien**. Quelle: gebuchte, nicht stornierte
  Posten mit `art = kategorie` (Vergleich ohne Groß/Klein und Leerzeichen am Rand). Gilt auch für Mitglieder.
- **Artikel** (`fin_artikel`, Migrationen `0234`–`0236`, `0242`/`0243`): Name, normalisierter Name (eindeutig) und **Standard-Steuersatz als
  Art** (`steuersatz_art`: Regelsatz, ermäßigt, keine; die alte Zahl `steuersatz` wird beim Anlegen noch geschrieben, weil `NOT NULL`,
  aber nicht gelesen). Ein Artikel
  entsteht beim **Buchen** eines Kategorie-Postens mit unbekanntem Namen, mit der Art von dessen Steuersatz (gleiche Transaktion, Konflikt auf
  `name_norm` wird ignoriert); bestehende gebuchte Artikel übernimmt die Migration. Wählt man im Formular einen bekannten Artikel,
  ist seine Art vorbelegt (vor dem Kategorie-Standard); der Wert ergibt sich aus dem Belegdatum. Kein Umbenennen oder Zusammenführen. Seite `/finanzen/artikel`.
- **Steuersatz-Zeiträume** (`fin_steuersatz_zeitraeume`, Migrationen `0237`–`0239`): je Zeitraum `ab` (Datum), Regelsatz und ermäßigter
  Satz in Basispunkten. Seed: ab 2007-01-01 19/7 %, ab 2020-07-01 16/5 %, ab 2021-01-01 19/7 %. Für ein Datum gilt der letzte Zeitraum
  mit `ab` ≤ Datum (der älteste gilt auch davor); wählbar sind Regelsatz, ermäßigter Satz und 0. Posten speichern weiter die Zahl;
  Konten und Artikel nur die Art. Geprüft wird der Satz am **Belegdatum** (Kassenabrechnung: am Abrechnungsdatum), Mitglied-Einreichungen
  ebenso. Seite `/finanzen/steuersaetze` (Link von Kontenplan und Belege-Seite): Liste und „Zeitraum hinzufügen“ (Datum, Regelsatz, ermäßigt);
  ein Zeitraum ist nur löschbar (`loeschbar`), wenn darin noch kein Beleg und keine Kassenabrechnung gebucht ist und es nicht der
  einzige ist. Wechselt das Belegdatum in einen anderen Zeitraum, stellt das Formular die Posten um (siehe „Belegdatum“).
- **Ware-Auswahl:** Die Suche findet Waren auch über ihre Aliase ([waren.md](./waren.md)); gewählt wird das Standard-Gebinde samt Pfand
  vorbelegt (sonst das einzige Gebinde).
- **Pfand:** Konto `pfand` „Pfand/Leergut“ (Art Durchlauf, Forderung, kein Aufwand, Migration `0213`). Das Pfand trägt die **Vorsteuer
  mit dem Satz der Ware**; der Saldo ist das ausstehende Leergut.
- **Warengruppe → Kategorie:** `warengruppen.kategorie_id` (Aufwandskonto, nullable) wird an Untergruppen vererbt (nächster Vorfahr mit
  Zuordnung). Gepflegt auf `/finanzen/warengruppen-kategorien` (Link von der Belege-Seite, Ändern `finanzen:buchen`).
- **Einreichen durch Mitglieder:** Auf `/belege/einreichen` (Handy zuerst) lädt ein Mitglied Foto/Datei hoch und gibt Belegdatum und
  Gesamtbetrag an (Pflicht; der Betrag darf auch 0 oder negativ sein; Belegdatum nicht in der Zukunft, Sätze nach Datum); optional Rechnungssteller (Auswahl oder freier Name als Vorschlag), Notiz und Posten: Kategorie-Posten (Artikel + Kategorie mit Vorschlägen und Info-i), **Ware-Posten** (Ware, Gebinde, Anzahl ohne Vorbelegung, Preis je Gebinde, im Preisfeld rechenbar wie in der Erfassung, z. B. `(7,99 + 4,50)/12`, ein exakter Preis wird als `gesamtCent` mitgeschickt; Pfand vorbelegt; Kategorie-Posten haben dort keine Anzahl) und **Leergut** (Anzahl = Rückgabe, Betrag negativ); neue Posten sind Ware, „Aufteilen (optional)“ ist ab dem ersten Posten immer offen (vorher einklappbar), damit Fehler sichtbar sind. Bei Ware-Posten setzt die API die Kategorie aus der Warengruppe (das Mitglied wählt sie nicht); fehlt sie, ergänzt die Finanzer:in sie vor dem Buchen. Die Auswahl (`/einreichungen/auswahl`) liefert dafür auch die Waren und `artikelVorschlaege`. Der
  Beleg ist immer eine **Auslage** (Zahler = Einreicher:in), kein Eigenbeleg. Es entsteht ein Entwurf mit `status = eingereicht`
  (`eingereicht_von`, `eingereicht_am`, `eingereicht_betrag_cent`; fehlt `status`, gilt `entwurf`). Die Finanzer:in sieht
  Einreichungen in der Belege-Liste, ergänzt sie wie jeden Entwurf (auch den Zahlweg) und bucht sie.
- **Status für das Mitglied:** „Eingereicht“ (Entwurf eingereicht), „Verworfen“ (mit Grund), „Gebucht“ (Beleg mit Nummer), dazu
  „Erstattet“ aus der Erstattung. **Zurückziehen** (löschen) geht nur, solange der Beleg noch eingereicht und nicht in Bearbeitung ist
  (409 sonst); dann reicht man neu ein. Nach dem Einreichen kein Bearbeiten durch das Mitglied. **Verwerfen** durch die Finanzer:in:
  `POST /api/finanzen/beleg-entwuerfe/:id/verwerfen` mit Begründung (Pflicht; `verworfen_grund`, `_von`, `_am`), nur für eingereichte.
- **Reload-sicher:** Die Eingaben der Formulare überstehen ein Neuladen (`packages/web/src/entwurfSpeicher.ts`, `localStorage`): das
  Belegformular der Finanzer:in je Beleg (`beleg-neu`, `beleg-<id>`) und das Einreichen der Mitglieder (`beleg-einreichen`). Nach
  Speichern, Buchen oder Einreichen werden sie gelöscht. Die Dateivorschau beim Mitglieder-Einreichen wird nach einem Neuladen nicht
  wiederhergestellt (die Datei muss neu gewählt werden).
- **Layout:** Eingaben einer Zeile stehen unten bündig (gleiche Höhe trotz unterschiedlich hoher Labels); „davon Pfand“ in
  `BelegSummen` erscheint ab `sm`, das Belegformular scrollt am Handy nicht seitlich.
- **Pushes:** `belege.eingereicht` an alle mit `finanzen:buchen` (außer dem Einreicher), `belege.status` an das Mitglied bei Buchen,
  Verwerfen und Erstattung (siehe [benachrichtigungen.md](./benachrichtigungen.md)).
- **Datei:** Pflicht, außer **Eigenbeleg** (dann Begründung Pflicht). PDF, JPEG, PNG oder HEIC, höchstens 20 MB, das Original wird
  unverändert archiviert. Ein Beleg hat Datei, Hash und Typ; dieselbe Datei hat denselben Schlüssel (Dublettenhinweis). Verworfene
  Entwürfe und gelöschte Einreichungen hinterlassen ihre Datei im Archiv: Object Lock erlaubt kein Löschen, eine Ansicht gibt es
  nicht, das ist gewollt (GoBD).
- **Rechnungssteller** (`fin_rechnungssteller`): nur Name (eindeutig ohne Rücksicht auf Groß-/Kleinschreibung) und archiviert; im
  Formular der Finanzer:in ist keiner vorbelegt; angelegt wird er dort als Option im Dropdown.
- **Brutto/Netto:** Brutto: Steuer je Steuersatz aus der Summe der Gruppe (wie Kassenbons), nicht je Posten. Netto: Steuer =
  gerundet Netto × Satz; stimmen die Summen nicht mit dem Beleg überein, korrigiert man je Steuersatz Netto und Steuer um höchstens
  ±10 ct (`fin_beleg_korrekturen`). Die Vorsteuer ist ein **Merkmal der Aufwandszeile** (`steuer_art = vorsteuer`, Netto, Steuer und
  Satz an der Zeile), kein eigenes Konto. Je (Kategorie, Steuersatz) gibt es eine Zeile, die Gegenzeile geht auf Fach, Bank oder
  `auslagen`.
- **Nummer:** `B-JJJJ-NNNN`, lückenlos je Jahr, vergeben beim Buchen (Jahr = Zeitpunkt des Buchens, Zähler `beleg:JJJJ` in
  `fin_zaehler`). Buchen ist idempotent (Schlüssel) und läuft mit Beleg, Posten, Korrekturen, Buchung und Löschen des Entwurfs in
  **einer** Transaktion.
- **Zahlwege:**

| Zahlweg | Buchung                                                                             | Datum                                                       |
| ------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| bar     | Abgang aus einem Safe-Fach mit Stückelung (Wechselgeld als Zugänge, Summe = Betrag) | Bezahldatum                                                 |
| Bank    | gegen das Konto `bank` (Scheibe 6 ordnet den Umsatz später zu, ohne neue Buchung)   | Bezahldatum                                                 |
| Auslage | gegen das Durchlaufkonto `auslagen` („Auslagen Mitglieder“), Mitglied am Beleg      | Belegdatum; Bezahldatum = Datum der Erstattung (abgeleitet) |

- **Warnungen** (serverseitig mit Codes `zukunft`, `belegdatum_alt`, `datei_doppelt`, `beleg_doppelt`, `hoher_betrag` ab 500 €, `preis_null` für Posten mit Preis 0 (listet Zeilen wie „Waren 2, Kategorien 1 (Deko)“), `saldo:<n>`): Die
  Buchungsroute liefert sie in einer 409-Antwort, solange der Client sie nicht in `bestaetigt` zurückschickt.
- **Korrektur:** Ein gebuchter Beleg ist unveränderlich. Storno läuft über die Buchung im Journal; „Als Entwurf kopieren“ legt einen
  neuen Entwurf mit denselben Daten und derselben Datei an. Der Status „storniert“ wird aus `fin_buchungen.storno_von` abgeleitet.
- **Auslagen und Sammelerstattung:** „Offene Auslagen“ zeigt je Mitglied (`StatusName`) die Summe und die Belege mit Zahlweg Auslage,
  die noch in keiner nicht stornierten Erstattung stehen (Summe 0 ausgenommen; negative Salden heißen „Mitglied schuldet …“). Mehrere Belege eines Mitglieds wählt man aus und erstattet sie **bar**
  (Safe-Fach mit Stückelung) oder per **Bank** in einer Buchung `auslagen` an Fach/Bank (`quelle_typ` `erstattung`,
  `fin_erstattungen`, `fin_erstattung_belege`). Eine doppelte Erstattung lehnt die API unter einer Sperre (`erstattung:<mitglied_id>`)
  ab; eine stornierte Erstattung macht ihre Belege wieder offen. Die Sammelerstattung darf **< 0** sein (nur 0 ist ungültig):
  dann zahlt das Mitglied, bar als Einlage in die Kasse (Stückelung positiv), per Bank als Überweisung an den Verein.
- **Archiv:** Eigener S3-Bucket `c4-<env>-finanzarchiv-<acct>` mit **Object Lock**, Versionierung und ohne Löschregel (prod:
  Compliance 10 Jahre, dev: Governance 1 Tag). Die Lambda darf nur schreiben und lesen, nicht löschen. Der Browser lädt per
  Presigned PUT unter `belege/<sha256>.<ext>` hoch, S3 prüft den Hash (`ChecksumSHA256`); die Anzeige nutzt Presigned GET (1 Stunde).
  Der **Datei-Hash geht in den Buchungs-Hash** (`belege` in der kanonischen Form; Buchungen ohne Beleg behalten ihren alten Hash),
  „Kette prüfen“ lädt ihn mit. `FINANZARCHIV_BUCKET` ist optional: ohne Bucket lehnen Upload und Export ab.
- **Täglicher Export/Anker:** Jeden Tag um 03:00 (Europe/Berlin, Schedule `finanz_export`, Zweig `finanz-export` in `lambda.ts`)
  schreibt der Job `export/<JJJJ-MM-TT>.jsonl` (alle neuen Buchungen seit dem letzten Export, je Zeile das kanonische JSON
  `{ hash, prev_hash, buchung }` mit Zeilen, Stückelung und Beleg-Hashes) und `anker/<JJJJ-MM-TT>.json`
  (`{ bis_seq, kopf_hash, erstellt_am }`), danach eine Zeile in `fin_exporte`. Ohne neue Buchungen gibt es nur den Anker.
- **Journal:** Das Buchungsdetail verlinkt bei `quelle_typ` `beleg` auf den Beleg, bei `erstattung` auf „Offene Auslagen“.

## Lager-Beleg-Abgleich

Der Abgleich vergleicht je Ware, was **eingelagert** wurde (Ist), mit dem, was auf **Belegen** steht (Soll). Reine Logik:
`packages/shared/src/lagerAbgleich.ts` (`lagerAbgleich`), Store in `packages/api/src/lagerAbgleich.ts`, Routen in
`packages/api/src/routes/lagerAbgleich.ts`. Er ersetzt das frühere „Einlagern“ beim Buchen (die Ware ist beim Erfassen des Belegs
meist längst im Lager); ein Beleg ändert den Lagerbestand nicht.

- **Einheit:** kleinste Einheit (Basiseinheiten, `inBasiseinheiten`); Anzeige gemischt wie der Bestand („1 Kasten, 3 Flaschen“).
- **Ist:** Zeilen der Art `zugang` von Vorgängen des Typs `einlagerung` (Zeitpunkt ab Stichtag). Entnahme, Umlagerung und Inventur zählen nicht.
- **Soll:** Ware-Posten gebuchter, nicht stornierter Belege (Belegdatum ab Stichtag), Anzahl × Gebinde in Basiseinheiten, Vorzeichen wie
  gebucht (Rückgabe negativ). Leergut und nicht gebuchte Entwürfe zählen nicht.
- **Korrektur:** Eigener Eintrag je Ware (`waren_abgleich_korrekturen`): Menge (Basiseinheiten, Vorzeichen frei), Grund (Bruch beim
  Einlagern, Fehler beim Händler, Sonstiges mit Text als Pflicht), Datum (nicht vor dem Stichtag, nicht in der Zukunft), Person. **Nur
  INSERT**: eine Korrektur wird nicht geändert oder gelöscht, eine Rücknahme ist eine Gegenkorrektur. Sie ändert weder Lagerbestand noch
  Buchungen.
- **Formel:** Diskrepanz = Σ Ist − Σ Soll − Σ Korrektur. „Ausgleichen“ legt eine Korrektur über die aktuelle Diskrepanz an (Menge
  vorbelegt, änderbar, Grund Pflicht).
- **Stichtag:** globales Datum (`einstellungen`, Schlüssel `lager_abgleich_stichtag`), nur Bewegungen ab dem Tag zählen. Ohne Stichtag
  zeigt die Seite nur den Hinweis zum Festlegen; Korrektur und Zeitleiste antworten dann mit 409.
- **Zeitleiste** je Ware (chronologisch, am selben Tag Ist vor Soll vor Korrektur, mit laufender Diskrepanz). Beispiel:

| Ereignis    | Menge | Diskrepanz danach |
| ----------- | ----- | ----------------- |
| Einlagerung | 10    | 10                |
| Beleg       | 5     | 5                 |
| Beleg       | 5     | 0                 |
| Einlagerung | 10    | 10                |
| Beleg       | 9     | 1                 |

- **Rechte:** Lesen `finanzen:lesen` oder `waren:verwalten`; Korrigieren und Stichtag setzen `finanzen:buchen` oder `waren:verwalten`.
- **Seiten:** `/finanzen/lager-abgleich` (Liste je Ware mit Ist, Soll, Korrektur, Diskrepanz; Stichtag) und
  `/finanzen/lager-abgleich/:wareId` (Zeitleiste mit Links zu Vorgang und Beleg, „Ausgleichen“-Dialog). Links auf `/finanzen/belege`,
  `/lager` und `/waren/:id` (dort die Diskrepanz der Ware, wenn ≠ 0). Kein eigener Eintrag in `AppLayout`.

## Seiten

Navigation: Menüpunkt „Finanzen“ (`/finanzen`) im `AppLayout`.

Diese Seiten sind **desktop first** (Regeln in [plans/finanzen.md](./plans/finanzen.md), „Bedienung“),
funktionieren aber auch auf dem Handy ohne horizontales Scrollen der Seite: dichte Tabellen mit
fixierter Kopfzeile, Beträge rechtsbündig mit Tabellenziffern, Zugang/Abgang und Von/Nach als Wörter,
Eingabe per Tastatur (Enter springt weiter), Prüfung am Feld, Zusammenfassung vor dem Buchen.

| Seite                                                 | Recht                                                    | Inhalt                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/finanzen`                                           | `finanzen:lesen`                                         | Übersicht mit Zugängen zu den Unterseiten                                                                                                                                                                                                                                                                                                                                                                                                    |
| `/finanzen/konten`                                    | `finanzen:lesen`, Pflege `finanzen:verwalten`            | Kontenplan: Tabelle ab `sm` (nach Art gruppiert, Unterkonten eingerückt, Saldo, Status, Aktionen), Karten auf dem Handy; anlegen, bearbeiten, archivieren                                                                                                                                                                                                                                                                                    |
| `/finanzen/journal`                                   | `finanzen:lesen`                                         | Buchungen (Karten auf dem Handy, Tabelle mit fixierter Kopfzeile ab `sm`), Filter Konto, Zeitraum und „Nur Stornos“, alle Spalten sortierbar                                                                                                                                                                                                                                                                                                 |
| `/finanzen/journal/:id`                               | `finanzen:lesen`, Storno `finanzen:buchen`               | Zeilen (Zugang/Abgang), Stückelung, Hash und `prev_hash`, Verweis Storno und Original; Storno-Dialog mit Gegenbuchung, Begründung (Pflicht), Bestätigung und eigenem Schlüssel                                                                                                                                                                                                                                                               |
| `/finanzen/buchen`                                    | `finanzen:buchen`                                        | freie Buchung und Umbuchung (siehe unten); Fächer und Konten mit Unterkonten bietet die Seite nicht an (Bargeld siehe `/finanzen/bargeld`)                                                                                                                                                                                                                                                                                                   |
| `/finanzen/kassen`                                    | `finanzen:lesen`, Aktionen `finanzen:buchen`/`verwalten` | Kassen: Bestand, Grundbestand, Abweichung, offene Dienst-Zählungen, letzte Abrechnung; „Kasse anlegen“/„Bearbeiten“ (Grundbestand, Erlöskonto, Ziel-Fach), „Abrechnen“ (Tabelle ab `sm`, Karten auf dem Handy)                                                                                                                                                                                                                               |
| `/finanzen/kassen/:kontoId/abrechnen`                 | `finanzen:buchen`                                        | Abrechnung (desktop first): Ist, Grundbestand, Transfer, Kasse danach je Nennwert, Münzrollen bei Fehlbestand, Event-Zuordnung mit „Fehler ohne Event“ live, Zusammenfassung mit Warnungen, Strg+Enter                                                                                                                                                                                                                                       |
| `/finanzen/kassen/abrechnungen` und `/:id`            | `finanzen:lesen`                                         | Liste (Filter Kasse, „storniert“) und Detail (Posten, Transfers, Events, Fehler, Ersteller, Link zur Buchung)                                                                                                                                                                                                                                                                                                                                |
| `/finanzen/belege`                                    | `finanzen:lesen`                                         | Belege: Entwürfe oben, Filter (Status, Rechnungssteller, Zeitraum, Zahlweg, Mitglied), Tabelle ab `sm`, Karten darunter, „Neuer Beleg“                                                                                                                                                                                                                                                                                                       |
| `/finanzen/belege/neu`, `/entwurf/:id`                | `finanzen:buchen`                                        | Erfassung (desktop first): Datei links, Maske rechts ab `lg`, Belegsumme mit Differenzanzeige, Posten ab `md` als drei Tabellen (Waren, Kategorien, Leergut, je mit immer einer leeren Zeile; Enter = nächstes Feld, Tab übernimmt die markierte Option, Ware → Anzahl; „Neue Ware anlegen“ mit `waren:verwalten`), darunter Karten, Summen je Steuersatz, Zahlweg, Autospeichern, Zusammenfassung mit Warnungen; am Handy Upload per Kamera |
| `/finanzen/belege/:id`                                | `finanzen:lesen`, Kopieren `finanzen:buchen`             | gebuchter Beleg: Datei, Posten, Summen, Link zur Buchung, Erstattung, „Als Entwurf kopieren“                                                                                                                                                                                                                                                                                                                                                 |
| `/belege`, `/belege/:id`, `/belege/einreichen`        | `belege:einreichen`                                      | „Meine Belege“ (Navigation, mobile first): Eingereicht (Entwürfe mit Status), Gebucht und Erstattet; Detail mit Datei, Status, eigenen Posten, Verwerfungsgrund und „Zurückziehen“; Einreichen mit Kamera/Datei, Datum, Betrag (auch ≤ 0), optional Rechnungssteller, Notiz, Posten                                                                                                                                                          |
| `/finanzen/lager-abgleich`, `/:wareId`                | `finanzen:lesen` oder `waren:verwalten`                  | Lager-Beleg-Abgleich: Liste je Ware und Zeitleiste, Stichtag und „Ausgleichen“ mit `finanzen:buchen` oder `waren:verwalten` (siehe „Lager-Beleg-Abgleich“)                                                                                                                                                                                                                                                                                   |
| `/finanzen/warengruppen-kategorien`                   | `finanzen:lesen`, Ändern `finanzen:buchen`               | Warengruppe → Kategorie zuordnen (Link von `/finanzen/belege`)                                                                                                                                                                                                                                                                                                                                                                               |
| `/finanzen/auslagen`                                  | `finanzen:lesen`, Erstatten `finanzen:buchen`            | Offene Auslagen je Mitglied, Auswahl und Sammelerstattung (bar mit Stückelung oder Bank) mit Zusammenfassung                                                                                                                                                                                                                                                                                                                                 |
| `/finanzen/artikel`                                   | `finanzen:lesen`, Steuersatz ändern `finanzen:buchen`    | Artikel (Karten auf dem Handy, Tabelle ab `sm`): Name, Standard-Steuersatzart (inline änderbar), Kategorien mit Häufigkeit, Anzahl Posten, zuletzt gebucht (Link von `/finanzen/belege`)                                                                                                                                                                                                                                                     |
| `/finanzen/steuersaetze`                              | `finanzen:lesen`, Ändern `finanzen:verwalten`            | Steuersatz-Zeiträume: Liste (Gültig ab, Regelsatz, ermäßigt, löschbar), „Zeitraum hinzufügen“, Löschen nur ohne Buchungen im Zeitraum                                                                                                                                                                                                                                                                                                        |
| `/finanzen/rechnungssteller`                          | `finanzen:lesen`, Pflege `finanzen:buchen`               | Rechnungssteller anlegen, umbenennen, archivieren                                                                                                                                                                                                                                                                                                                                                                                            |
| `/finanzen/festschreibung`                            | `finanzen:lesen`, Festschreiben `finanzen:verwalten`     | Festgeschrieben bis, nächster Monat mit Hinweisen und Bestätigung, Liste mit Kopf-Hash; Tabelle ab `sm`, Karten darunter                                                                                                                                                                                                                                                                                                                     |
| `/finanzen/datenexport`                               | `finanzen:pruefen` oder `finanzen:verwalten`             | Zeitraum wählen, optional mit Belegdateien (Hintergrund-Job, Push), ZIP erstellen, frühere Exporte laden                                                                                                                                                                                                                                                                                                                                                                                        |
| `/finanzen/kette`                                     | `finanzen:pruefen`                                       | „Kette prüfen“ mit Ergebnis und Abschnitt „Archiv“                                                                                                                                                                                                                                                                                                                                                                                           |
| `/finanzen/bargeld`                                   | `finanzen:lesen`                                         | Fächer (Spalten) × Nennwerte (Zeilen, aufsteigend von 1 ct bis 100 €) mit Summen; unter `sm` eine Karte je Fach; Zugänge zu Umbuchen, Wechseln, Zählen, Zählungen und „Fach anlegen“ (Kontenplan)                                                                                                                                                                                                                                            |
| `/finanzen/bargeld/umbuchen`, `/wechseln`, `/zaehlen` | `finanzen:buchen`                                        | Erfassung per `StueckelungFeld` (13 Zahlfelder von 1 ct bis 100 €, Tab/Enter von oben nach unten, Spalten Bestand/Soll und Differenz, Summenzeile); Zusammenfassung vor dem Speichern, Idempotenz-Schlüssel je Erfassung                                                                                                                                                                                                                     |
| `/finanzen/bargeld/zaehlungen` und `/:id`             | `finanzen:lesen`                                         | Protokoll der Zählungen (Tabelle ab `sm`, Karten darunter, Filter Fach) und Detail mit Soll/Ist/Differenz je Nennwert, Zähler:in (`StatusName`), Link zur Buchung                                                                                                                                                                                                                                                                            |

**Hinweise:** Erklärungsbedürftige Felder haben ein Info-Symbol (`InfoHinweis`), dessen Text in
`packages/web/src/finanzenHilfe.ts` steht (Konto, Buchen, Storno, Bargeld, Kette prüfen, Belege). Das
Symbol ist kein Tab-Stopp und macht das Label nicht höher, damit Felder nebeneinander bündig bleiben.

**Buchen:** Modus „Umbuchung“ (Von Konto = Abgang, Nach Konto = Zugang, Betrag) oder „Frei“ mit der
wiederverwendbaren `BuchungszeilenTabelle` (Konto suchbar, Zugang/Abgang, Betrag; Summenzeile mit
„Noch 5,00 € Abgang offen“ / „Ausgeglichen“; unter `sm` gestapelte Karten). Beträge tippt man im
`BetragFeld` (`1,10`, `1.234,56`). Enter springt zum nächsten Feld, im Betrag der letzten Zeile legt es
die nächste Zeile an, Strg+Enter öffnet die Zusammenfassung. „Prüfen und buchen“ ist gesperrt, solange
die Buchung nicht aufgeht, und nennt den Grund. Die Zusammenfassung zeigt Datum, Text und alle Zeilen;
Plausibilitätswarnungen (Datum in der Zukunft, Betrag ab 1.000,00 € „ungewöhnlich hoch“) blockieren
nicht, müssen aber angehakt werden. Nach dem Buchen erscheint „Buchung Nr. X gebucht – ansehen“, die
Eingabe wird geleert (Datum bleibt) und der Fokus steht im Buchungstext. Ungespeicherte Eingaben warnen
beim Verlassen (Router-Dialog, beim Schließen oder Neuladen die Browser-Warnung). Der Idempotenz-Schlüssel
gehört zur Erfassung: gleicher Inhalt behält ihn bei Wiederholung und Doppelklick, geänderter Inhalt oder
eine geglückte Buchung erzeugt einen neuen.

## API

| Route                                               | Recht                                    | Hinweise                                                                                                                                                                                                                                                 |
| --------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/finanzen/konten`                          | `finanzen:lesen`                         | `?archiviert=1` nimmt archivierte mit; je Konto `saldoCent`                                                                                                                                                                                              |
| `GET /api/finanzen/steuersatz-zeitraeume`           | `finanzen:lesen`                         | Zeiträume `{ id, ab, regel, ermaessigt, loeschbar }[]`                                                                                                                                                                                                   |
| `POST /api/finanzen/steuersatz-zeitraeume`          | `finanzen:verwalten`                     | `{ ab, regel, ermaessigt }`; 201 `{ id }`, 400 bei doppeltem `ab`                                                                                                                                                                                        |
| `DELETE /api/finanzen/steuersatz-zeitraeume/:id`    | `finanzen:verwalten`                     | 400, wenn im Zeitraum schon gebucht ist oder es der einzige ist                                                                                                                                                                                          |
| `POST /api/finanzen/konten`                         | `finanzen:verwalten`                     | `name`, `art`, `parentId`, `stueckelung`, `steuersatzArt`; Antwort `{ id }`                                                                                                                                                                              |
| `PUT /api/finanzen/konten/:id`                      | `finanzen:verwalten`                     | beliebige Felder; 409 bei Art/Stückelung/Eltern mit Buchungen                                                                                                                                                                                            |
| `PUT /api/finanzen/konten/:id/archiv`               | `finanzen:verwalten`                     | `{ archiviert }`                                                                                                                                                                                                                                         |
| `GET /api/finanzen/buchungen`                       | `finanzen:lesen`                         | `von`, `bis`, `kontoId`, `storno` (`1`); alle Treffer, neueste zuerst, höchstens 2000 (`gekappt`)                                                                                                                                                        |
| `GET /api/finanzen/buchungen/:id`                   | `finanzen:lesen`                         | mit Zeilen, Stückelung, Hashes                                                                                                                                                                                                                           |
| `POST /api/finanzen/buchungen`                      | `finanzen:buchen`                        | `idempotenzSchluessel`, `datum`, `text`, `quelleTyp` (`manuell`/`umbuchung`; `zaehlung` und `storno` entstehen nur über ihre Routen), `eventId`, `zeilen`; 201 `{ id, seq }`, bei bekanntem Schlüssel 200 mit der vorhandenen Buchung                    |
| `POST /api/finanzen/buchungen/:id/storno`           | `finanzen:buchen`                        | `idempotenzSchluessel`, `datum`, `text` (Begründung, Pflicht); 409 bei doppeltem Storno                                                                                                                                                                  |
| `GET /api/finanzen/bargeld`                         | `finanzen:lesen`                         | Fächer des Safes mit `saldoCent` und `bestand` (13 Nennwerte), `summeBestand`, `summeCent`                                                                                                                                                               |
| `POST /api/finanzen/zaehlungen`                     | `finanzen:buchen`                        | `idempotenzSchluessel`, `kontoId`, `datum`, `text`, `ist` (`[{ nennwertCent, anzahl }]`); 201 `{ id, buchungId, buchungSeq, differenzCent }`, bei bekanntem Schlüssel 200; 400 bei Nicht-Fach                                                            |
| `GET /api/finanzen/zaehlungen`                      | `finanzen:lesen`                         | `?kontoId=`; neueste zuerst, höchstens 2000 (`gekappt`)                                                                                                                                                                                                  |
| `GET /api/finanzen/zaehlungen/:id`                  | `finanzen:lesen`                         | mit `posten` (Soll/Ist/Differenz je Nennwert) und Verweis auf die Buchung                                                                                                                                                                                |
| `GET /api/finanzen/kassen`                          | `finanzen:lesen`                         | `?archiviert=1`; Kassen mit Bestand, Grundbestand, Standardkonten, letzter Abrechnung, offenen Zählungen                                                                                                                                                 |
| `POST /api/finanzen/kassen`                         | `finanzen:verwalten`                     | `name`, `grundbestand`, `standardErloesKontoId`, `standardZielFachId`, `standardKategorieIds`; legt das Fach unter `safe` an; 201 `{ kontoId }`; 400 bei Nicht-Erlöskonto/Nicht-Fach                                                                     |
| `PUT /api/finanzen/kassen/:kontoId`                 | `finanzen:verwalten`                     | optional `name`, optional `standardKategorieIds`, `grundbestand`, `standardErloesKontoId`, `standardZielFachId`                                                                                                                                          |
| `GET /api/finanzen/kassen/:kontoId/abrechnung`      | `finanzen:lesen`                         | Vorschau: Kasse und die Dienst-Zählungen seit der letzten Abrechnung (neueste je Event)                                                                                                                                                                  |
| `POST /api/finanzen/kassenabrechnungen`             | `finanzen:buchen`                        | `idempotenzSchluessel`, `kontoId`, `datum`, `ist`, `erloesKontoId`, `zielFachId`, `transfers`, `events`; 201 `{ id, buchungId, buchungSeq, einnahmeCent, fehlerCent }`, bei bekanntem Schlüssel 200; 400 bei Regelverstoß (z. B. Bestand)                |
| `GET /api/finanzen/kassenabrechnungen`              | `finanzen:lesen`                         | `?kontoId=`; neueste zuerst, höchstens 2000 (`gekappt`), mit `storniert`                                                                                                                                                                                 |
| `GET /api/finanzen/kassenabrechnungen/:id`          | `finanzen:lesen`                         | Posten, Transfers, Events, Fehler, Verweis auf die Buchung                                                                                                                                                                                               |
| `PUT /api/finanzen/events/:eventId/kassen`          | `finanzen:buchen`                        | `{ kontoIds }`: Kassen des Events festlegen (aktive Kassen, sonst 400); `DELETE` setzt auf den Standard der Kategorie zurück                                                                                                                             |
| `GET /api/kassen`                                   | `kasse:zaehlen`                          | aktive Kassen nur mit `kontoId` und `name` (keine Bestände)                                                                                                                                                                                              |
| `GET /api/kassen/zaehlungen?eventId=`               | `kasse:zaehlen`                          | Kassen des Events (`kassen` mit Einnahme und Status, `summeCent`, `unvollstaendig`, `angepasst`) und Dienst-Zählungen (Kasse, Summe, wer, wann, `ersetzt`); 404 bei unbekanntem Event                                                                    |
| `POST /api/kassen/zaehlungen`                       | `kasse:zaehlen`                          | `idempotenzSchluessel`, `kontoId`, `eventId`, `ist`; 400 bei fehlendem oder abgesagtem Event; 201 `{ id, summeCent }`, bei bekanntem Schlüssel 200                                                                                                       |
| `GET`/`POST`/`PATCH /api/finanzen/rechnungssteller` | `finanzen:lesen`/`buchen`                | Liste (mit `zuletztAm`), Anlegen, Ändern (Name, `archiviert`); Name eindeutig, sonst 409                                                                                                                                                                 |
| `GET /api/finanzen/belege`                          | `finanzen:lesen`                         | Filter Status (entwurf/gebucht/storniert), Rechnungssteller, Zeitraum, Zahlweg, Mitglied; Entwürfe zuerst, gebuchte höchstens 500 (`gekappt`)                                                                                                            |
| `GET /api/finanzen/belege/:id`                      | `finanzen:lesen`                         | gebuchter Beleg mit Posten, Korrekturen, Datei-URL, Buchung, Erstattung                                                                                                                                                                                  |
| `POST /api/finanzen/belege/:id/kopieren`            | `finanzen:buchen`                        | neuer Entwurf mit denselben Daten und Datei                                                                                                                                                                                                              |
| `POST /api/finanzen/beleg-entwuerfe`                | `finanzen:buchen`                        | Entwurf anlegen; `GET`/`PUT`/`DELETE /api/finanzen/beleg-entwuerfe/:id` lesen, speichern, verwerfen (Lesen `finanzen:lesen`)                                                                                                                             |
| `POST /api/finanzen/beleg-entwuerfe/:id/buchen`     | `finanzen:buchen`                        | `idempotenzSchluessel`, `bestaetigt` (Warnungscodes); 409 mit Warnungen, solange nicht bestätigt; 201 mit Nummer und Buchung, bei bekanntem Schlüssel 200                                                                                                |
| `POST /api/finanzen/beleg-dateien/upload`           | `finanzen:buchen`                        | `sha256`, Größe, Typ, Name; Presigned PUT mit `ChecksumSHA256` nach `belege/<sha256>.<ext>`, `schonGebucht` als Dublettenhinweis; ohne `FINANZARCHIV_BUCKET` abgelehnt                                                                                   |
| `POST /api/finanzen/beleg-entwuerfe/:id/verwerfen`  | `finanzen:buchen`                        | `{ grund }`; nur eingereichte Entwürfe (sonst 409); Push `belege.status`                                                                                                                                                                                 |
| `GET /api/finanzen/beleg-waren`                     | `finanzen:lesen`                         | Waren mit Gebinde, Standard-Gebinde, Aliase, Pfand, MHD-Art und Vorschlags-Kategorie für Ware-Posten                                                                                                                                                     |
| `GET /api/finanzen/warengruppen-kategorien`         | `finanzen:lesen`                         | Warengruppen mit zugeordneter und geerbter Kategorie                                                                                                                                                                                                     |
| `PUT /api/finanzen/warengruppen/:id/kategorie`      | `finanzen:buchen`                        | `{ kategorieId }` (Aufwandskonto oder `null`)                                                                                                                                                                                                            |
| `POST /api/finanzen/einreichungen/upload`           | `belege:einreichen`                      | wie `beleg-dateien/upload` für Mitglieder                                                                                                                                                                                                                |
| `POST /api/finanzen/einreichungen`                  | `belege:einreichen`                      | Datei, Belegdatum, `betragCent`, optional Rechnungssteller, Notiz, Posten (Kategorie oder Ware); Zahlweg immer Auslage; 201 `{ id }`, Push `belege.eingereicht`                                                                                          |
| `GET /api/finanzen/einreichungen`, `/:id`           | `belege:einreichen`                      | eigene Einreichungen (Liste, Detail mit Status, Grund, Posten, Datei-URL); die Liste „Eingereicht“ der Seite nutzt `GET /api/finanzen/belege` (`entwurfStatus`, freier Rechnungssteller-Name als `rechnungsstellerName`, in der Liste als „(Vorschlag)“) |
| `DELETE /api/finanzen/einreichungen/:id`            | `belege:einreichen`                      | Zurückziehen, nur eigene und noch eingereichte (409 sonst)                                                                                                                                                                                               |
| `GET /api/finanzen/einreichungen/auswahl`           | `belege:einreichen`                      | `id`/`name` der Rechnungssteller und aktiven Aufwandskonten, dazu die Waren für Ware-Posten und `artikelVorschlaege`                                                                                                                                     |
| `GET /api/finanzen/artikel-vorschlaege`             | `finanzen:lesen`                         | Artikelnamen gebuchter Kategorie-Posten mit Kategorien, Häufigkeit und Standard-Steuersatzart `{ artikel, steuersatzArt, kategorien: { kategorieId, anzahl }[] }[]`                                                                                      |
| `GET /api/finanzen/artikel`                         | `finanzen:lesen`                         | Artikel `{ id, name, steuersatzArt, kategorien, postenAnzahl, zuletztAm }`                                                                                                                                                                               |
| `PATCH /api/finanzen/artikel/:id`                   | `finanzen:buchen`                        | `{ steuersatzArt }`                                                                                                                                                                                                                                      |
| `GET /api/lager-abgleich`, `/waren/:id`             | `finanzen:lesen` oder `waren:verwalten`  | Liste je Ware (`stichtag: null` ohne Stichtag) und Zeitleiste einer Ware (409 ohne Stichtag)                                                                                                                                                             |
| `POST /api/lager-abgleich/korrekturen`              | `finanzen:buchen` oder `waren:verwalten` | `{ wareId, menge, grund, text?, datum }`; 409 ohne Stichtag, 400 bei Datum vor Stichtag oder in der Zukunft                                                                                                                                              |
| `PUT /api/lager-abgleich/stichtag`                  | `finanzen:buchen` oder `waren:verwalten` | `{ stichtag }`                                                                                                                                                                                                                                           |
| `GET /api/finanzen/auslagen`                        | `finanzen:lesen`                         | offene Auslagen je Mitglied                                                                                                                                                                                                                              |
| `POST /api/finanzen/erstattungen`                   | `finanzen:buchen`                        | `idempotenzSchluessel`, `mitgliedId`, `datum`, Belege, Zahlweg (bar mit Fach und Stückelung oder Bank); 201, bei bekanntem Schlüssel 200; 409 bei schon erstatteten Belegen                                                                              |
| `GET /api/finanzen/kette`                           | `finanzen:pruefen`                       | Ergebnis von „Kette prüfen“ inkl. `archiv`                                                                                                                                                                                                               |
| `GET /api/finanzen/festschreibungen`                | `finanzen:lesen`                         | `festgeschriebenBis`, `ersterOffenerTag`, `naechsterMonat`, `hinweise`, `liste`                                                                                                                                                                          |
| `POST /api/finanzen/festschreibungen`               | `finanzen:verwalten`                     | `{ monat, idempotenzSchluessel }`; 201, bei schon festgeschriebenem Monat 200 mit `wiederholt`; 409, wenn nicht der nächste Monat dran ist, die Kette Fehler hat oder gleichzeitig gebucht wurde; 503 ohne Archiv                                        |
| `POST /api/finanzen/datenexporte`                   | `finanzen:pruefen` oder `verwalten`      | `{ von, bis, mitBelegdateien? }`; ZIP im Archiv, Antwort `{ id, url }`; mit Belegdateien `202 { id, laeuft }` (Job)                                                                                                                                                                                                     |
| `GET /api/finanzen/datenexporte`                    | `finanzen:pruefen` oder `verwalten`      | frühere Exporte mit frischer URL                                                                                                                                                                                                                         |

Der Ersteller einer Buchung erscheint als Mitglied (`StatusName`) mit Username und Status.

## Datenbankrolle

Es gibt bewusst **keine eigene DB-Rolle** für die Journaltabellen (Entscheidung 11.11.2026, Begründung
in [plans/finanzen-spike-dsql-rolle.md](./plans/finanzen-spike-dsql-rolle.md)). Es schützen: die API
hat keine Update-/Delete-Routen, der Test `packages/api/src/finanzenNurInsert.test.ts` schlägt an,
sobald Code `fin_buchungen`, `fin_buchungszeilen`, `fin_stueckelung` oder die Protokolltabellen (Zählungen, Kassenzählungen, Kassenabrechnungen, Belege, Posten, Korrekturen, Erstattungen, Exporte, Festschreibungen, Datenexporte) ändert oder löscht, dazu
Hash-Kette und Anker.

## Verfahrensdokumentation

Gliederung nach GoBD; die Abschnitte dieser Seite sind die Verfahrensdokumentation.

| Teil                           | Inhalt                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Allgemeine Beschreibung        | Zweck und Umfang: „Zielbild“, „GoBD“; Konten: „Kontenplan“                                                                          |
| Anwenderdokumentation          | Wer bucht wie: „Rechte“, „Journal“, „Bargeld (Safe)“, „Barkassen“, „Belege“, „Lager-Beleg-Abgleich“, „Seiten“; [buch.md](./buch.md) |
| Technische Systemdokumentation | „Hash-Kette“, „Festschreibung“, „Datenexport“, „API“, „Datenbankrolle“, Datenmodell in `packages/api/src/db/schema.ts`              |
| Betriebsdokumentation          | Archiv und Täglicher Export („Belege“), „CloudTrail“, Datensicherung und Änderungsprozess (unten)                                   |
| Internes Kontrollsystem        | „Kette prüfen“, „Festschreibung“, „Warnungen je Kontoart“, Idempotenz-Schlüssel, nur INSERT mit Test                                |

- **Zuständigkeiten (Posten, siehe [posten.md](./posten.md)):** Buchhaltung bucht (`finanzen:buchen`) und schreibt
  Monate fest (`finanzen:verwalten`); Kassenprüfung prüft (`finanzen:pruefen`: Kette, Datenexport); Admin hat alle Rechte.
  Alle Mitglieder zählen Kassen und reichen Belege ein.
- **Aufbewahrung:** Belege, Exporte, Anker, Festschreibungen, Datenexporte und CloudTrail-Logs liegen mindestens 10 Jahre
  in S3 mit Object Lock (Compliance); die Access-Datenbank bleibt Archiv bis einschließlich 2026.
- **Änderungsprozess:** Änderungen am Programm nur per Pull Request mit grüner CI (Lint, Typen, Tests); Deploy auf dev
  per Workflow, Deploy auf prod (Tag `v*`) erst nach Freigabe durch den Repo-Owner in der Umgebung `prod`. Änderungen
  an der Infrastruktur laufen über Terraform im Repo, das Bootstrap wendet der Owner von Hand an.
- **Datensicherung:** Aurora DSQL mit AWS-Backups (siehe README, „Bootstrap: Rechte der Deploy-Rolle und Backups“); das
  Archiv ist durch Object Lock und Versionierung geschützt und gleichzeitig Gegenstück zur Datenbank für „Kette prüfen“.
- **Prüfung durch das Finanzamt:** Datenexport (GDPdU-Index) für Z3; „Kette prüfen“ weist nach, dass Datenbank und
  Archiv übereinstimmen.
