# Finanzen

Stand: **Scheibe 0 (Fundament) ist gebaut**: Kontenplan, Journal mit Hash-Kette, Storno, freie Buchung
und „Kette prüfen“ (nur gegen die Datenbank). Alles Weitere (Bargeld, Buch, Belege, Archiv in S3, …)
steht als Zielbild unten und im Umsetzungsplan [plans/finanzen.md](./plans/finanzen.md). Diese Seite
wird mit jeder Scheibe um das tatsächlich Gebaute ergänzt und wird zugleich die Verfahrensdokumentation
(wer bucht wie, wo liegen Belege, wie läuft die Prüfung).

## Zielbild

Die Finanzen des Vereins laufen ab dem **01.01.2027** über die App und lösen die Access-Datenbank ab
(sie bleibt das Archiv bis einschließlich 2026).

| Bereich      | Inhalt                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Journal      | Jede Geldbewegung als Buchung mit Zeilen auf Konten (Summe 0), nur Anlegen, Korrektur per Storno    |
| Bargeld      | Safe mit Fächern, Bestand je Münze/Schein, Umbuchen, Wechseln, Zählung                              |
| Buch         | Nummerierte Seiten der Mitglieder, Striche/Bar/Abzahlung, Tarife je Status, Verlauf, Rangliste      |
| Barkassen    | Grundbestand, Zählung am Event durch die Dienste, verbindliche Abrechnung durch den:die Finanzer:in |
| Belege       | Posten mit Lager-Ware oder Kategorie, brutto/netto, Auslagen mit Sammelerstattung, Einreichen       |
| Konto        | Fyrst per FinTS (Fallback Datei-Import), Zuordnung der Umsätze                                      |
| SumUp        | Kartenumsätze, Gebühren und Auszahlungen per API                                                    |
| Rechnungen   | Ausgangsrechnungen als PDF an Mitglieder oder externe Empfänger                                     |
| Auswertungen | Einnahmen je Event, USt, EÜR-Vorbereitung, Einkauf                                                  |

## GoBD

Ziel ist nicht, Manipulation unmöglich zu machen, sondern jede Änderung erkennbar:

- Journal nur mit INSERT, lückenlose Nummer, Storno statt Ändern, Festschreibung je Monat.
- Hash-Kette über alle Buchungen samt Hash der Belegdateien.
- Originalbelege, tägliche Journal-Exporte und der Ketten-Hash liegen in S3 mit Object Lock
  (Compliance, 10 Jahre). Der tägliche Export läuft ab 01.01.2027.
- Der Posten „Kassenprüfung“ liest alles und kann die Kette gegen das Archiv prüfen.

## Rechte

| Recht                | Wer                                                                           | Wofür                                                           |
| -------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `buch:lesen`         | alle Status                                                                   | eigene Buchseite, Rangliste (noch keine Seite)                  |
| `kasse:zaehlen`      | alle Status                                                                   | Kassenzählung am Event (noch keine Seite)                       |
| `belege:einreichen`  | alle Status                                                                   | eigene Auslagen-Belege einreichen (noch keine Seite)            |
| `finanzen:lesen`     | Admin, Buchhaltung, Vorstandsvorsitz, Stellv. Vorstandsvorsitz, Kassenprüfung | Kontenplan und Journal lesen                                    |
| `finanzen:buchen`    | Admin, Buchhaltung                                                            | buchen, stornieren (später abrechnen)                           |
| `finanzen:verwalten` | Admin, Buchhaltung                                                            | Kontenplan pflegen (später Tarife, Anbindungen, Festschreibung) |
| `finanzen:pruefen`   | Admin, Kassenprüfung                                                          | „Kette prüfen“ (später Prüfexport)                              |

Die ersten drei Rechte stehen in `STATUS_PERMISSIONS`, die `finanzen:*`-Rechte vergeben Posten
(Migration `0142`, siehe [posten.md](./posten.md)) und die Gruppe `admin`. Der Posten
`kassenpruefung` kommt mit Migration `0141`. Wer ein `finanzen:*`-Recht hat, sieht den Menüpunkt
„Finanzen“.

## Kontenplan

Tabelle `fin_konten`: `id`, `name`, `art`, `parent_id`, `stueckelung`, `steuersatz_standard`
(Basispunkte, 1900 = 19 %), `archiviert`.

- **Arten:** Bargeld, Bank, Durchlauf, Erlöse, Aufwand, Neutral. Eine Art „Buch“ gibt es bewusst nicht:
  Das Buch der Mitglieder (Scheibe 2) ist ein Nebenbuch ohne Journalbuchungen.
- **Grundkonten** mit festen Ids (Migration `0149`): `safe` „Safe“ (Bargeld, mit Stückelung), `bank`
  „Bank (Fyrst)“, `geldtransit` „Geldtransit“ (Durchlauf), `eroeffnung` „Eröffnung / Saldovortrag“
  (Neutral). Weitere Konten legt `finanzen:verwalten` an.
- **Unterkonten** über `parent_id` (später z. B. Safe → Fächer). Das übergeordnete Konto muss
  existieren, Zyklen und das eigene Konto als Eltern sind ungültig.
- **Archivieren statt löschen:** Archivierte Konten erscheinen nicht mehr in der Liste (Schalter
  „Archivierte anzeigen“) und nehmen keine neuen Buchungen an; ihre Zeilen bleiben.
- **Art, Stückelung und Übergeordnet** lassen sich nur ändern, solange keine Buchungszeile auf dem
  Konto liegt (sonst 409). Name, Steuersatz und Archivierung gehen immer.
- Der Saldo je Konto ist die Summe seiner Zeilen (ohne Unterkonten).

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
Betrag (Volumen) und Erstellt von (Von/Nach je mit eigener Sortierung, `sort=von|nach`; der alte Wert `konten` gilt als `von`; Tabelle scrollt bei schmaler Breite im eigenen Container); Karten auf dem Handy zeigen dieselbe Zeile „Bank (Fyrst) → Geldtransit“.
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

Das Ergebnis zeigt Anzahl, Kopf-Hash und Fehler je `seq`. **In dieser Scheibe wird nur gegen die
Datenbank geprüft.** Wer die Datenbank ändern kann, könnte Buchungen samt Hashes neu schreiben; der
Abgleich gegen Exporte und Kopf-Hash im S3-Archiv (Object Lock) kommt mit Scheibe 5.

## Seiten

Navigation: Menüpunkt „Finanzen“ (`/finanzen`) im `AppLayout`.

Diese Seiten sind **desktop first** (Regeln in [plans/finanzen.md](./plans/finanzen.md), „Bedienung“),
funktionieren aber auch auf dem Handy ohne horizontales Scrollen der Seite: dichte Tabellen mit
fixierter Kopfzeile, Beträge rechtsbündig mit Tabellenziffern, Zugang/Abgang und Von/Nach als Wörter,
Eingabe per Tastatur (Enter springt weiter), Prüfung am Feld, Zusammenfassung vor dem Buchen.

| Seite                   | Recht                                         | Inhalt                                                                                                                                                                         |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/finanzen`             | `finanzen:lesen`                              | Übersicht mit Zugängen zu den Unterseiten                                                                                                                                      |
| `/finanzen/konten`      | `finanzen:lesen`, Pflege `finanzen:verwalten` | Kontenplan: Tabelle ab `sm` (nach Art gruppiert, Unterkonten eingerückt, Saldo, Status, Aktionen), Karten auf dem Handy; anlegen, bearbeiten, archivieren                      |
| `/finanzen/journal`     | `finanzen:lesen`                              | Buchungen (Karten auf dem Handy, Tabelle mit fixierter Kopfzeile ab `sm`), Filter Konto, Zeitraum und „Nur Stornos“, alle Spalten sortierbar                                   |
| `/finanzen/journal/:id` | `finanzen:lesen`, Storno `finanzen:buchen`    | Zeilen (Zugang/Abgang), Stückelung, Hash und `prev_hash`, Verweis Storno und Original; Storno-Dialog mit Gegenbuchung, Begründung (Pflicht), Bestätigung und eigenem Schlüssel |
| `/finanzen/buchen`      | `finanzen:buchen`                             | freie Buchung und Umbuchung (siehe unten); Konten mit Stückelung bietet die Seite noch nicht an (kommt mit Scheibe 1)                                                          |
| `/finanzen/kette`       | `finanzen:pruefen`                            | „Kette prüfen“ mit Ergebnis                                                                                                                                                    |

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

| Route                                     | Recht                | Hinweise                                                                                                                                                                      |
| ----------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/finanzen/konten`                | `finanzen:lesen`     | `?archiviert=1` nimmt archivierte mit; je Konto `saldoCent`                                                                                                                   |
| `POST /api/finanzen/konten`               | `finanzen:verwalten` | `name`, `art`, `parentId`, `stueckelung`, `steuersatzStandard`; Antwort `{ id }`                                                                                              |
| `PUT /api/finanzen/konten/:id`            | `finanzen:verwalten` | beliebige Felder; 409 bei Art/Stückelung/Eltern mit Buchungen                                                                                                                 |
| `PUT /api/finanzen/konten/:id/archiv`     | `finanzen:verwalten` | `{ archiviert }`                                                                                                                                                              |
| `GET /api/finanzen/buchungen`             | `finanzen:lesen`     | `von`, `bis`, `kontoId`, `storno` (`1`); alle Treffer, neueste zuerst, höchstens 2000 (`gekappt`)                                                                             |
| `GET /api/finanzen/buchungen/:id`         | `finanzen:lesen`     | mit Zeilen, Stückelung, Hashes                                                                                                                                                |
| `POST /api/finanzen/buchungen`            | `finanzen:buchen`    | `idempotenzSchluessel`, `datum`, `text`, `quelleTyp` (`manuell`/`umbuchung`), `eventId`, `zeilen`; 201 `{ id, seq }`, bei bekanntem Schlüssel 200 mit der vorhandenen Buchung |
| `POST /api/finanzen/buchungen/:id/storno` | `finanzen:buchen`    | `idempotenzSchluessel`, `datum`, `text` (Begründung, Pflicht); 409 bei doppeltem Storno                                                                                       |
| `GET /api/finanzen/kette`                 | `finanzen:pruefen`   | Ergebnis von „Kette prüfen“                                                                                                                                                   |

Der Ersteller einer Buchung erscheint als Mitglied (`StatusName`) mit Username und Status.

## Datenbankrolle

Es gibt bewusst **keine eigene DB-Rolle** für die Journaltabellen (Entscheidung 11.11.2026, Begründung
in [plans/finanzen-spike-dsql-rolle.md](./plans/finanzen-spike-dsql-rolle.md)). Es schützen: die API
hat keine Update-/Delete-Routen, der Test `packages/api/src/finanzenNurInsert.test.ts` schlägt an,
sobald Code `fin_buchungen`, `fin_buchungszeilen` oder `fin_stueckelung` ändert oder löscht, dazu
Hash-Kette und Anker.
