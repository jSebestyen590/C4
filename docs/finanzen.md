# Finanzen

Stand: **geplant, noch nichts umgesetzt.** Der Umsetzungsplan mit allen Scheiben steht in
[plans/finanzen.md](./plans/finanzen.md). Diese Seite beschreibt das Zielbild und wird mit jeder
Scheibe um das tatsächlich Gebaute ergänzt. Sie wird zugleich die Verfahrensdokumentation (wer bucht
wie, wo liegen Belege, wie läuft die Prüfung).

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
  (Compliance, 10 Jahre).
- Der Posten „Kassenprüfung“ liest alles und kann die Kette gegen das Archiv prüfen.

## Rechte

| Recht                | Wer                           | Wofür                                           |
| -------------------- | ----------------------------- | ----------------------------------------------- |
| `buch:lesen`         | alle Status                   | eigene Buchseite, Rangliste                     |
| `kasse:zaehlen`      | alle Status                   | Kassenzählung am Event                          |
| `belege:einreichen`  | alle Status                   | eigene Auslagen-Belege als Entwurf einreichen   |
| `finanzen:lesen`     | Vorstand, Kassenprüfung       | alles lesen                                     |
| `finanzen:buchen`    | Finanzer:in (`buchhaltung`)   | buchen, stornieren, abrechnen                   |
| `finanzen:verwalten` | Finanzer:in                   | Stammdaten, Tarife, Anbindungen, Festschreibung |
| `finanzen:pruefen`   | Posten `kassenpruefung` (neu) | „Kette prüfen“, Prüfexport                      |
