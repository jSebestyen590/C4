# Finanzen

Stand: **Scheibe 0 (Fundament), Scheibe 1 (Bargeld), Scheibe 2 (Buch, siehe [buch.md](./buch.md)) und Scheibe 3 (Barkassen) sind gebaut**: Kontenplan, Journal mit Hash-Kette,
Storno, freie Buchung, „Kette prüfen“ (nur gegen die Datenbank), der Safe mit Fächern, das Buch als Nebenbuch und die Barkassen mit Dienst-Zählung am Event und Abrechnung. Alles Weitere (Belege, Archiv in S3, …)
steht als Zielbild unten und im Umsetzungsplan [plans/finanzen.md](./plans/finanzen.md). Diese Seite
wird mit jeder Scheibe um das tatsächlich Gebaute ergänzt und wird zugleich die Verfahrensdokumentation
(wer bucht wie, wo liegen Belege, wie läuft die Prüfung).

## Überblick

Die Finanzen des Vereins laufen ab dem 01.01.2027 über die App und lösen die Access-Datenbank ab. Gebaut sind Fundament (Kontenplan, Journal mit Hash-Kette, Storno, freie Buchung, „Kette prüfen“), Bargeld (Safe mit Fächern), das Buch ([buch.md](./buch.md)) und die Barkassen (Dienst-Zählung am Event, Abrechnung mit einer Buchung); alles Weitere steht als Zielbild und im Umsetzungsplan [plans/finanzen.md](./plans/finanzen.md). Die Seite wird mit jeder Scheibe ergänzt und ist zugleich die Verfahrensdokumentation (GoBD: jede Änderung erkennbar, Rechte, Prüfung).

Abschnitte: Zielbild, GoBD, Rechte, Kontenplan, Journal, Hash-Kette, Kette prüfen, Warnungen je Kontoart, Bargeld (Safe), Barkassen, Seiten, API, Datenbankrolle

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

| Recht                | Wer                                                                           | Wofür                                                                   |
| -------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `buch:lesen`         | alle Status                                                                   | eigene Buchseite, Rangliste (`/buch`)                                   |
| `kasse:zaehlen`      | alle Status                                                                   | Kassen am Event zählen (Abschnitt „Kasse“ der Event-Seite)              |
| `belege:einreichen`  | alle Status                                                                   | eigene Auslagen-Belege einreichen (noch keine Seite)                    |
| `finanzen:lesen`     | Admin, Buchhaltung, Vorstandsvorsitz, Stellv. Vorstandsvorsitz, Kassenprüfung | Kontenplan und Journal lesen                                            |
| `finanzen:buchen`    | Admin, Buchhaltung                                                            | buchen, stornieren, Buch abrechnen und Seiten verwalten                 |
| `finanzen:verwalten` | Admin, Buchhaltung                                                            | Kontenplan und Buch-Tarife pflegen (später Anbindungen, Festschreibung) |
| `finanzen:pruefen`   | Admin, Kassenprüfung                                                          | „Kette prüfen“ (später Prüfexport)                                      |

Die ersten drei Rechte stehen in `STATUS_PERMISSIONS`, die `finanzen:*`-Rechte vergeben Posten
(Migration `0142`, siehe [posten.md](./posten.md)) und die Gruppe `admin`. Der Posten
`kassenpruefung` kommt mit Migration `0141`. Wer ein `finanzen:*`-Recht hat, sieht den Menüpunkt
„Finanzen“.

## Kontenplan

Tabelle `fin_konten`: `id`, `name`, `art`, `parent_id`, `stueckelung`, `steuersatz_standard`
(Basispunkte, 1900 = 19 %), `archiviert`.

- **Arten:** Bargeld, Bank, Durchlauf, Erlöse, Aufwand, Neutral. Eine Art „Buch“ gibt es bewusst nicht:
  Das Buch der Mitglieder (Scheibe 2) ist ein Nebenbuch ohne Journalbuchungen.
- **Grundkonten** mit festen Ids (Migration `0149`): `safe` „Safe“ (Bargeld, Gruppe der Fächer, seit `0158` ohne eigene Stückelung), `bank`
  „Bank (Fyrst)“, `geldtransit` „Geldtransit“ (Durchlauf), `eroeffnung` „Eröffnung / Saldovortrag“
  (Neutral); `kassendifferenz` „Kassendifferenz“ (Neutral, Migration `0157`). Weitere Konten legt
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

Das Ergebnis zeigt Anzahl, Kopf-Hash und Fehler je `seq`. **In dieser Scheibe wird nur gegen die
Datenbank geprüft.** Wer die Datenbank ändern kann, könnte Buchungen samt Hashes neu schreiben; der
Abgleich gegen Exporte und Kopf-Hash im S3-Archiv (Object Lock) kommt mit Scheibe 5.

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
  änderbar), Steuer = `steuersatz_standard` des Kontos (`ust`, netto/steuer aus dem Brutto); keine Aufteilung 19/7 in einer
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
  vorher/nachher, Spalten die vorkommenden Nennwerte plus Summe (Tabelle ab `md`, gestapelte Karten auf dem Handy).
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

## Seiten

Navigation: Menüpunkt „Finanzen“ (`/finanzen`) im `AppLayout`.

Diese Seiten sind **desktop first** (Regeln in [plans/finanzen.md](./plans/finanzen.md), „Bedienung“),
funktionieren aber auch auf dem Handy ohne horizontales Scrollen der Seite: dichte Tabellen mit
fixierter Kopfzeile, Beträge rechtsbündig mit Tabellenziffern, Zugang/Abgang und Von/Nach als Wörter,
Eingabe per Tastatur (Enter springt weiter), Prüfung am Feld, Zusammenfassung vor dem Buchen.

| Seite                                                 | Recht                                                    | Inhalt                                                                                                                                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/finanzen`                                           | `finanzen:lesen`                                         | Übersicht mit Zugängen zu den Unterseiten                                                                                                                                                                                |
| `/finanzen/konten`                                    | `finanzen:lesen`, Pflege `finanzen:verwalten`            | Kontenplan: Tabelle ab `sm` (nach Art gruppiert, Unterkonten eingerückt, Saldo, Status, Aktionen), Karten auf dem Handy; anlegen, bearbeiten, archivieren                                                                |
| `/finanzen/journal`                                   | `finanzen:lesen`                                         | Buchungen (Karten auf dem Handy, Tabelle mit fixierter Kopfzeile ab `sm`), Filter Konto, Zeitraum und „Nur Stornos“, alle Spalten sortierbar                                                                             |
| `/finanzen/journal/:id`                               | `finanzen:lesen`, Storno `finanzen:buchen`               | Zeilen (Zugang/Abgang), Stückelung, Hash und `prev_hash`, Verweis Storno und Original; Storno-Dialog mit Gegenbuchung, Begründung (Pflicht), Bestätigung und eigenem Schlüssel                                           |
| `/finanzen/buchen`                                    | `finanzen:buchen`                                        | freie Buchung und Umbuchung (siehe unten); Fächer und Konten mit Unterkonten bietet die Seite nicht an (Bargeld siehe `/finanzen/bargeld`)                                                                               |
| `/finanzen/kassen`                                    | `finanzen:lesen`, Aktionen `finanzen:buchen`/`verwalten` | Kassen: Bestand, Grundbestand, Abweichung, offene Dienst-Zählungen, letzte Abrechnung; „Kasse anlegen“/„Bearbeiten“ (Grundbestand, Erlöskonto, Ziel-Fach), „Abrechnen“ (Tabelle ab `sm`, Karten auf dem Handy)           |
| `/finanzen/kassen/:kontoId/abrechnen`                 | `finanzen:buchen`                                        | Abrechnung (desktop first): Ist, Grundbestand, Transfer, Kasse danach je Nennwert, Münzrollen bei Fehlbestand, Event-Zuordnung mit „Fehler ohne Event“ live, Zusammenfassung mit Warnungen, Strg+Enter                   |
| `/finanzen/kassen/abrechnungen` und `/:id`            | `finanzen:lesen`                                         | Liste (Filter Kasse, „storniert“) und Detail (Posten, Transfers, Events, Fehler, Ersteller, Link zur Buchung)                                                                                                            |
| `/finanzen/kette`                                     | `finanzen:pruefen`                                       | „Kette prüfen“ mit Ergebnis                                                                                                                                                                                              |
| `/finanzen/bargeld`                                   | `finanzen:lesen`                                         | Fächer (Spalten) × Nennwerte (Zeilen, aufsteigend von 1 ct bis 100 €) mit Summen; unter `sm` eine Karte je Fach; Zugänge zu Umbuchen, Wechseln, Zählen, Zählungen und „Fach anlegen“ (Kontenplan)                        |
| `/finanzen/bargeld/umbuchen`, `/wechseln`, `/zaehlen` | `finanzen:buchen`                                        | Erfassung per `StueckelungFeld` (13 Zahlfelder von 1 ct bis 100 €, Tab/Enter von oben nach unten, Spalten Bestand/Soll und Differenz, Summenzeile); Zusammenfassung vor dem Speichern, Idempotenz-Schlüssel je Erfassung |
| `/finanzen/bargeld/zaehlungen` und `/:id`             | `finanzen:lesen`                                         | Protokoll der Zählungen (Tabelle ab `sm`, Karten darunter, Filter Fach) und Detail mit Soll/Ist/Differenz je Nennwert, Zähler:in (`StatusName`), Link zur Buchung                                                        |

**Hinweise:** Erklärungsbedürftige Felder haben ein Info-Symbol (`InfoHinweis`), dessen Text in
`packages/web/src/finanzenHilfe.ts` steht (Konto, Buchen, Storno, Bargeld, Kette prüfen).

**Hinweise:** Erklärungsbedürftige Felder haben ein Info-Symbol (`InfoHinweis`), dessen Text in
`packages/web/src/finanzenHilfe.ts` steht (Konto, Buchen, Storno, Bargeld, Kette prüfen).

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

| Route                                          | Recht                | Hinweise                                                                                                                                                                                                                                  |
| ---------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/finanzen/konten`                     | `finanzen:lesen`     | `?archiviert=1` nimmt archivierte mit; je Konto `saldoCent`                                                                                                                                                                               |
| `POST /api/finanzen/konten`                    | `finanzen:verwalten` | `name`, `art`, `parentId`, `stueckelung`, `steuersatzStandard`; Antwort `{ id }`                                                                                                                                                          |
| `PUT /api/finanzen/konten/:id`                 | `finanzen:verwalten` | beliebige Felder; 409 bei Art/Stückelung/Eltern mit Buchungen                                                                                                                                                                             |
| `PUT /api/finanzen/konten/:id/archiv`          | `finanzen:verwalten` | `{ archiviert }`                                                                                                                                                                                                                          |
| `GET /api/finanzen/buchungen`                  | `finanzen:lesen`     | `von`, `bis`, `kontoId`, `storno` (`1`); alle Treffer, neueste zuerst, höchstens 2000 (`gekappt`)                                                                                                                                         |
| `GET /api/finanzen/buchungen/:id`              | `finanzen:lesen`     | mit Zeilen, Stückelung, Hashes                                                                                                                                                                                                            |
| `POST /api/finanzen/buchungen`                 | `finanzen:buchen`    | `idempotenzSchluessel`, `datum`, `text`, `quelleTyp` (`manuell`/`umbuchung`; `zaehlung` und `storno` entstehen nur über ihre Routen), `eventId`, `zeilen`; 201 `{ id, seq }`, bei bekanntem Schlüssel 200 mit der vorhandenen Buchung     |
| `POST /api/finanzen/buchungen/:id/storno`      | `finanzen:buchen`    | `idempotenzSchluessel`, `datum`, `text` (Begründung, Pflicht); 409 bei doppeltem Storno                                                                                                                                                   |
| `GET /api/finanzen/bargeld`                    | `finanzen:lesen`     | Fächer des Safes mit `saldoCent` und `bestand` (13 Nennwerte), `summeBestand`, `summeCent`                                                                                                                                                |
| `POST /api/finanzen/zaehlungen`                | `finanzen:buchen`    | `idempotenzSchluessel`, `kontoId`, `datum`, `text`, `ist` (`[{ nennwertCent, anzahl }]`); 201 `{ id, buchungId, buchungSeq, differenzCent }`, bei bekanntem Schlüssel 200; 400 bei Nicht-Fach                                             |
| `GET /api/finanzen/zaehlungen`                 | `finanzen:lesen`     | `?kontoId=`; neueste zuerst, höchstens 2000 (`gekappt`)                                                                                                                                                                                   |
| `GET /api/finanzen/zaehlungen/:id`             | `finanzen:lesen`     | mit `posten` (Soll/Ist/Differenz je Nennwert) und Verweis auf die Buchung                                                                                                                                                                 |
| `GET /api/finanzen/kassen`                     | `finanzen:lesen`     | `?archiviert=1`; Kassen mit Bestand, Grundbestand, Standardkonten, letzter Abrechnung, offenen Zählungen                                                                                                                                  |
| `POST /api/finanzen/kassen`                    | `finanzen:verwalten` | `name`, `grundbestand`, `standardErloesKontoId`, `standardZielFachId`, `standardKategorieIds`; legt das Fach unter `safe` an; 201 `{ kontoId }`; 400 bei Nicht-Erlöskonto/Nicht-Fach                                                      |
| `PUT /api/finanzen/kassen/:kontoId`            | `finanzen:verwalten` | optional `name`, optional `standardKategorieIds`, `grundbestand`, `standardErloesKontoId`, `standardZielFachId`                                                                                                                           |
| `GET /api/finanzen/kassen/:kontoId/abrechnung` | `finanzen:lesen`     | Vorschau: Kasse und die Dienst-Zählungen seit der letzten Abrechnung (neueste je Event)                                                                                                                                                   |
| `POST /api/finanzen/kassenabrechnungen`        | `finanzen:buchen`    | `idempotenzSchluessel`, `kontoId`, `datum`, `ist`, `erloesKontoId`, `zielFachId`, `transfers`, `events`; 201 `{ id, buchungId, buchungSeq, einnahmeCent, fehlerCent }`, bei bekanntem Schlüssel 200; 400 bei Regelverstoß (z. B. Bestand) |
| `GET /api/finanzen/kassenabrechnungen`         | `finanzen:lesen`     | `?kontoId=`; neueste zuerst, höchstens 2000 (`gekappt`), mit `storniert`                                                                                                                                                                  |
| `GET /api/finanzen/kassenabrechnungen/:id`     | `finanzen:lesen`     | Posten, Transfers, Events, Fehler, Verweis auf die Buchung                                                                                                                                                                                |
| `PUT /api/finanzen/events/:eventId/kassen`     | `finanzen:buchen`    | `{ kontoIds }`: Kassen des Events festlegen (aktive Kassen, sonst 400); `DELETE` setzt auf den Standard der Kategorie zurück                                                                                                              |
| `GET /api/kassen`                              | `kasse:zaehlen`      | aktive Kassen nur mit `kontoId` und `name` (keine Bestände)                                                                                                                                                                               |
| `GET /api/kassen/zaehlungen?eventId=`          | `kasse:zaehlen`      | Kassen des Events (`kassen` mit Einnahme und Status, `summeCent`, `unvollstaendig`, `angepasst`) und Dienst-Zählungen (Kasse, Summe, wer, wann, `ersetzt`); 404 bei unbekanntem Event                                                     |
| `POST /api/kassen/zaehlungen`                  | `kasse:zaehlen`      | `idempotenzSchluessel`, `kontoId`, `eventId`, `ist`; 400 bei fehlendem oder abgesagtem Event; 201 `{ id, summeCent }`, bei bekanntem Schlüssel 200                                                                                        |
| `GET /api/finanzen/kette`                      | `finanzen:pruefen`   | Ergebnis von „Kette prüfen“                                                                                                                                                                                                               |

Der Ersteller einer Buchung erscheint als Mitglied (`StatusName`) mit Username und Status.

## Datenbankrolle

Es gibt bewusst **keine eigene DB-Rolle** für die Journaltabellen (Entscheidung 11.11.2026, Begründung
in [plans/finanzen-spike-dsql-rolle.md](./plans/finanzen-spike-dsql-rolle.md)). Es schützen: die API
hat keine Update-/Delete-Routen, der Test `packages/api/src/finanzenNurInsert.test.ts` schlägt an,
sobald Code `fin_buchungen`, `fin_buchungszeilen`, `fin_stueckelung` oder die Protokolltabellen (Zählungen, Kassenzählungen, Kassenabrechnungen) ändert oder löscht, dazu
Hash-Kette und Anker.
