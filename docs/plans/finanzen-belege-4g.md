# Finanzen Belege 4g

Status: umgesetzt

Feedback zur Beleg-Erfassung nach 4f.

## 1. Kopfbereich immer zweispaltig

`FinanzenBelegPage.tsx`: Ab `lg` immer zwei Spalten, unabhängig von der Vorschau. Links die
Beleg-Datei (mit Vorschau, wenn eingeblendet) samt Eigenbeleg-Schalter/Begründung, rechts
Rechnungssteller, Belegdatum, Belegsumme in derselben Anordnung wie heute mit Vorschau
(`kopfSpalten` entfällt, immer 2). Sticky-Stil nur mit Vorschau. Unter `lg` bleibt es einspaltig.

## 2. Rechnen im Preisfeld statt Gesamtpreis-Checkbox

- Checkbox/Spalte „Gesamt" entfällt (Tabellen, Karten, `gesamt`, `gesamtPatch`,
  `HILFE.belege.gesamtpreis`).
- `BetragFeld` bekommt `rechnen`: der Text darf ein Rechenausdruck sein mit `+ - * /`, Klammern
  und Dezimalkomma, z. B. `(7,99 + 4,50)/12`. Eigener kleiner Parser (kein `eval`), Fehler „Ungültige
  Rechnung", Division durch 0 ist ein Fehler. Beim Verlassen zeigt das Feld das Ergebnis auf Cent
  gerundet. Nur in den Preisfeldern der Posten (Waren, Kategorien, Leergut), nicht in der Belegsumme.
- Genauigkeit: Die Zeile hält den ungerundeten Preis (`preisExaktCent`, Kommazahl in Cent). Ist er
  kein ganzer Cent-Betrag, wird beim Speichern `gesamtCent = round(preisExakt × Anzahl)` gesetzt
  (bestehende Spalte `gesamt_cent`, API unverändert), sonst `null`. Ändert sich die Anzahl, rechnet
  sich der Betrag aus dem exakten Preis neu. Beim Laden eines Entwurfs:
  `preisExakt = gesamtCent / Anzahl`, sonst `einzelpreisCent`. Leergut wird wie bisher gerundet
  (kein `gesamtCent`).
- Der Hinweis „≈ x je Gebinde/Stück" unter dem Betrag zeigt den gerundeten Preis, wenn exakt ≠
  gerundet.
- Info-i am Preis (Tabellenkopf und Karte), neuer Text `HILFE.belege.preisRechnen`: Rechnung erlaubt,
  Beispiel `(7,99 + 4,50)/12`, Divisor meist die Anzahl, der Betrag wird exakt gerechnet.

## 3. Leere Spalte in der Steuersatz-Tabelle

`BelegSummen` im Beleg-Formular bekommt rechts eine leere Spalte (Breite wie die Lösch-Spalte der
Posten-Tabellen, `w={44}`), damit die Tabellen bündig sind. Per Prop, nur wo die Posten-Tabellen
darüber stehen.

## 4. Eigenbeleg ohne Steuersatz

- Ist der Beleg ein Eigenbeleg (`formularEigenbeleg`), entfällt die Steuersatz-Spalte in allen
  Posten-Tabellen und das Feld in den Karten. Die Werte der Zeilen bleiben erhalten (für den Fall,
  dass der Schalter zurückgestellt wird).
- `BelegSummen` zeigt bei Eigenbeleg keine Aufteilung nach Steuersatz, nur Summe (und ggf. davon
  Pfand).
- `belegPruefen` prüft die Gültigkeit der Steuersätze am Belegdatum nicht für Eigenbelege (Fehler
  in unsichtbarem Feld wäre nicht behebbar). Buchung ignoriert sie schon (keine Vorsteuer).

## 5. Warnung bei Preis 0

`belegWarnungenBilden` (API, auch Fake): neuer Code `preis_null`, eine Warnung für alle Posten mit
Preis 0 (Einzelpreis 0 und kein `gesamtCent` ≠ 0), Text z. B. „Posten mit Preis 0: Waren 2
(Sterni), Kategorien 1 (Deko)." mit den Zeilenlabels wie in `belegPruefen`. Muss wie die anderen
Warnungen bestätigt werden.

## 6. Belegsumme aus der Einreichung

Die API setzt `belegsummeCent` bei neuen Einreichungen schon (seit 4e). Das Formular füllt die
Belegsumme beim Laden zusätzlich mit `eingereichtBetragCent`, wenn sie leer ist
(`belegFormular.ts`, Mapping Daten → Formular).

## Tests

- Parser: `betragEingabe.test.ts` (Ausdrücke, Klammern, Komma, Fehler, Division durch 0, negativ).
- `belegFormular.test.ts`: exakter Preis → `gesamtCent`, Anzahl-Änderung, Laden, Belegsumme-Fallback.
- `belege.test.ts`: `belegPruefen` ohne Steuersatzprüfung bei Eigenbeleg.
- API-Test: Warnung `preis_null`.

## Doku

`docs/finanzen.md` (Beleg-Erfassung: Rechnen im Preisfeld statt Gesamtpreis, Eigenbeleg ohne
Steuersatz, Warnung Preis 0, Kopf-Layout). Plan danach auf „umgesetzt".
