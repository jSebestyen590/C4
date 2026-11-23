# Finanzen Scheibe 3: Barkassen – Umsetzungsplan

> **Erledigt.** Umgesetzt; das Gebaute steht in [../finanzen.md](../finanzen.md) („Barkassen“). Diese Datei bleibt als Entscheidungsprotokoll.

Rahmen: [finanzen.md](./finanzen.md) (Architektur, Bedienung, Scheibe 3). Diese Datei ist der
vollständige Plan für die Umsetzungs-Session; sie enthält alle mit dem Nutzer geklärten Entscheidungen
(18.11.2026). Nach dem Merge den Stand in `docs/plans/finanzen.md` nachtragen und diese Datei löschen
oder als erledigt markieren.

## Entscheidungen (geklärt)

| Thema                  | Entscheidung                                                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kasse im Kontenplan    | **Eine Kasse ist ein Safe-Fach** (Bargeld, Stückelung, Eltern `safe`) mit Zusatzdaten in `fin_kassen`. Keine eigene Kontogruppe.                                                                                   |
| Grundbestand           | Je Nennwert an der Kasse (Stammdaten, änderbar durch `finanzen:verwalten`).                                                                                                                                       |
| Einsatzort             | **Entfällt.** Nur der Name der Kasse (= Kontoname).                                                                                                                                                               |
| Steuer / Erlöskonto    | Kasse hat ein **Standard-Erlöskonto**; die Abrechnung übernimmt es, änderbar auf jedes Erlöskonto. Die **gesamte** Einnahme der Abrechnung geht auf dieses eine Konto, Steuersatz = `steuersatz_standard` des Kontos. Keine Aufteilung 19/7 innerhalb einer Abrechnung (getrennte Kassen für Getränke/Essen). |
| Rückführung            | Überschuss bzw. fehlende Münzen gehen an / kommen aus einem **Ziel-Fach**: Standard je Kasse, in der Abrechnung änderbar.                                                                                          |
| Dienst-Zählung         | Jede:r mit `kasse:zaehlen` (alle Status, existiert schon) darf an jedem Event zählen. **Unverbindlich**: nur Übersicht und Zuordnung der Einnahmen auf Events für interne Auswertungen, keine Buchung.               |
| Finanzer-Zählung       | Nur die Zählung in der Abrechnung ist buchhalterisch relevant.                                                                                                                                                    |
| Fehler                 | Einnahme gesamt − Summe der Event-Einnahmen = **Fehler ohne Event** (z. B. Finanzer 100 €, Event 1 50 €, Event 2 40 € → Fehler 10 €). Gebucht wird die gesamte Einnahme als Erlös; der Fehler steht nur in der Zuordnung. |
| Erinnerung             | **Kein Push.** Nur ein Hinweis am Event „Kasse noch nicht gezählt“.                                                                                                                                               |

## Fachlicher Ablauf

1. **Stammdaten** (`/finanzen/kassen`, `finanzen:verwalten`): Kasse anlegen = neues Safe-Fach (Name)
   plus Grundbestand je Nennwert, Standard-Erlöskonto, Standard-Ziel-Fach. Name/Archivierung weiter über
   den Kontenplan; archivierte Kassen-Fächer verschwinden aus allen Auswahlen.
2. **Dienst-Zählung am Event** (Event-Seite, mobile first): Kasse wählen, Münzen/Scheine mit
   `StueckelungFeld` (ZahlFeld) zählen, Summe live, speichern. Mehrere Zählungen je Event und Kasse
   erlaubt; **die neueste je (Event, Kasse) gilt** (Korrektur = neu zählen). Liste der Zählungen am Event
   (Kasse, Summe, wer – `StatusName`, wann).
3. **Abrechnung** (`/finanzen/kassen/:kontoId/abrechnen`, `finanzen:buchen`, desktop first):
   - Ist je Nennwert tippen (Spalten Bestand laut Buchhaltung, Ist, Grundbestand, Transfer, Kasse danach).
   - `Soll` = aktueller Bestand der Kasse (Saldo + Stückelung), **Einnahme = Ist − Soll** (darf negativ sein).
   - Event-Zuordnung: alle Dienst-Zählungen dieser Kasse seit der letzten (nicht stornierten)
     Abrechnung, je Event die neueste, sortiert nach Event-Beginn. Vorschlag: Event-Einnahme_i =
     Zählung_i − Zählung_{i−1}, Start mit `Soll`. Beträge sind änderbar (z. B. fehlende Zählung);
     **Fehler = Einnahme − Σ Event-Einnahmen**, rechnet live mit.
   - Rückführung: Transfer je Nennwert vorbelegt mit Ist − Grundbestand (positiv = in das Ziel-Fach,
     negativ = aus dem Ziel-Fach), änderbar; begrenzt durch Ist (Kasse) bzw. Bestand des Ziel-Fachs
     (Fehlermeldung je Nennwert wie bei Umbuchen). Vorschlag = min(Bedarf, Bestand Ziel-Fach).
   - **Fehlbestand je Nennwert** (Beispiel: Grundbestand 30 × 1 €, Ist 10 × 1 €, Ziel-Fach hat nur
     10 × 1 € → 10 fehlen): Die Zeile ist markiert („Es fehlen 10 × 1,00 €“) und bietet direkt zwei
     Lösungen, auch kombinierbar:
     - **Münzrollen ins Ziel-Fach holen**: Münzen liegen in Rollen. Fach wählen (Auswahl zeigt den
       Bestand dieses Nennwerts je Fach, vorbelegt mit dem ersten Fach, das genug hat), Anzahl in
       **ganzen Rollen** (vorbelegt: so viele Rollen, wie für den Rest nötig, z. B. 1 × 25 × 1 €; als
       Rollen und Stück angezeigt). Die Rollen gehen ins **Ziel-Fach** (z. B. Zählbrett), und aus dem
       Ziel-Fach wird die Kasse aufgefüllt; der Rest der Rolle bleibt im Ziel-Fach (im Beispiel: 25 ins
       Zählbrett, 20 in die Kasse, Zählbrett danach 15). Alles in derselben Buchung. Hat das Quell-Fach
       keine ganze Rolle mehr, ist die Stückzahl frei änderbar (Hinweis „keine ganze Rolle“).
     - Rollengröße je Nennwert als Konstante `MUENZROLLE` in `@c4/shared` (Euro-Standard: 1, 2, 5 ct je
       50; 10, 20, 50 ct je 40; 1 €, 2 € je 25; Scheine ohne Rolle). Kein Stammdatum, solange nichts
       anderes nötig ist.
     - **Diesmal mit weniger auffüllen**: Der Grundbestand der Kasse bleibt unverändert (keine
       dauerhafte Änderung); die Kasse geht nur für dieses Mal mit weniger Münzen dieses Nennwerts raus.
       Das ist die bestätigungspflichtige Warnung „Kasse danach ≠ Grundbestand“ („1,00 €: 20 statt 30“),
       die Abrechnung speichert es in `fin_kassenabrechnung_posten` (Grundbestand und Kasse danach).
       Die nächste Abrechnung rechnet ohnehin vom tatsächlichen Bestand aus.
   - Warnungen (bestätigungspflichtig, nicht blockierend): Fehler ≠ 0 („Abweichung zur letzten
     Dienst-Zählung: 10,00 €“), Kasse danach ≠ Grundbestand (je Nennwert), keine Dienst-Zählung seit
     letzter Abrechnung, Einnahme negativ (über `saldoWarnungen` Erlös im Soll), Datum in der Zukunft.
   - Zusammenfassung mit Bestätigung → **eine** Buchung (`quelle_typ` `kassenabrechnung`, `quelle_id` =
     Abrechnungs-Id, `event_id` null), Zeilen:
     - Kasse +Einnahme, Stückelung Ist − Bestand je Nennwert
     - Erlöskonto −Einnahme (Steuer aus `steuersatz_standard`, `steuer_art` `ust`, netto/steuer wie bei
       freien Buchungen berechnen – vorhandene Logik in `@c4/shared` nutzen)
     - Kasse −Transfer, Stückelung −Transfer (nur wenn Transfer ≠ 0)
     - Ziel-Fach +Transfer, Stückelung +Transfer (nur wenn Transfer ≠ 0)
     - je Nachschub-Fach: Fach −Rollen und Ziel-Fach +Rollen (mit Stückelung); das Auffüllen der Kasse aus dem Ziel-Fach steckt in den Transfer-Zeilen oben
     - Einnahme 0 → keine Erlös-/Einnahme-Zeilen; ganz ohne Zeilen → Abrechnung ohne Buchung (`buchung_id` null), wie `zaehlenTx`.
     Bestandsregel `pruefeBestand` gilt in der Transaktion.
   - Danach: „Abrechnung gespeichert – Buchung Nr. X ansehen“.
4. **Storno**: Über das Journal (bestehender Storno). Eine Abrechnung, deren Buchung storniert ist, gilt
   nicht mehr als „letzte Abrechnung“; ihre Dienst-Zählungen erscheinen in der nächsten Abrechnung wieder.
   Die Abrechnungsliste zeigt „storniert“.

## Datenmodell (Migrationen ab `0180`, je ein Statement + `down/`, Indizes `ASYNC` in eigener Datei)

- `fin_kassen` (Stammdaten, **änderbar**): `konto_id` PK → `fin_konten`, `standard_erloes_konto_id` →
  `fin_konten`, `standard_ziel_fach_id` → `fin_konten`, `geaendert_am`.
- `fin_kassen_grundbestand` (änderbar, beim Speichern ersetzt): `konto_id`, `nennwert_cent`, `anzahl`
  (≥ 0), PK (`konto_id`, `nennwert_cent`).
- `fin_kassenzaehlungen` (**nur INSERT**): `id`, `konto_id`, `event_id` → `events` (Pflicht),
  `summe_cent`, `gezaehlt_von` (sub), `gezaehlt_am`, `idempotenz_schluessel`; Unique-Index auf den
  Schlüssel, Index (`konto_id`, `gezaehlt_am`), Index `event_id`.
- `fin_kassenzaehlung_posten` (nur INSERT): `zaehlung_id`, `nennwert_cent`, `anzahl`.
- `fin_kassenabrechnungen` (nur INSERT): `id`, `konto_id`, `datum`, `buchung_id` (nullable),
  `erloes_konto_id`, `ziel_fach_id`, `soll_cent`, `ist_cent`, `einnahme_cent`, `transfer_cent`,
  `fehler_cent`, `erstellt_von`, `erstellt_am`, `idempotenz_schluessel` (unique).
- `fin_kassenabrechnung_posten` (nur INSERT): `abrechnung_id`, `nennwert_cent`, `soll`, `ist`,
  `grundbestand`, `danach`.
- `fin_kassenabrechnung_transfers` (nur INSERT): `abrechnung_id`, `fach_id`, `nennwert_cent`, `anzahl`
  (Ziel-Fach: positiv = Kasse → Ziel-Fach, negativ = Ziel-Fach → Kasse; Nachschub-Fach: negativ = Fach → Ziel-Fach).
- `fin_kassenabrechnung_events` (nur INSERT): `abrechnung_id`, `event_id`, `zaehlung_id` (nullable),
  `betrag_cent`.
- `QUELLE_TYPEN` um `kassenabrechnung` ergänzen (nicht in `MANUELLE_QUELLE_TYPEN`).
- Die sechs Nur-INSERT-Tabellen in `finanzenNurInsert.test.ts` (`TABELLEN` und `SQL_TABELLEN`) aufnehmen.
- Event-Löschsperre: `eventsLoeschenTx` (`packages/api/src/kalender.ts` ~1471–1500, auch Massenlöschen
  ~1542) prüft zusätzlich `fin_kassenzaehlungen.event_id` und `fin_kassenabrechnung_events.event_id`
  (Sperre `finanzen`, bestehender Text passt).

## Reine Logik (`packages/shared/src/kassen.ts`, mit Unit-Tests)

- Schemas: `kasseEingabeSchema` (name, grundbestand, standardErloesKontoId, standardZielFachId),
  `kasseAendernSchema`, `kassenzaehlungEingabeSchema` (idempotenzSchluessel, kontoId, eventId, ist
  [{nennwertCent, anzahl ≥ 0}]), `kassenabrechnungEingabeSchema` (idempotenzSchluessel, kontoId, datum,
  ist, erloesKontoId, zielFachId, transfers [{fachId, nennwertCent, anzahl}] (Ziel-Fach + Nachschub;
  Nachschub-Fächer nur mit negativer Anzahl, ihr Gegenstück landet im Ziel-Fach),
  events [{eventId, zaehlungId?, betragCent}]).
- `eventEinnahmenVorschlag(sollCent, zaehlungen)` → je Event Betrag (Differenzen der neuesten Zählungen).
- `transferVorschlag(ist, grundbestand, bestandZielFach)` → Transfer + `fehlbestand` je Nennwert.
- `nachschubVorschlag(fehlbestand, bestandFaecher)` → je Nennwert erstes Fach mit genug Bestand, Anzahl auf ganze `MUENZROLLE` aufgerundet (höchstens Bestand).
- `berechneKassenabrechnung({ kasse, bestand, ist, transfer, erloesKonto, zielFach, events })` →
  `{ sollCent, istCent, einnahmeCent, transferCent, fehlerCent, kasseDanach, zeilen, warnungen }`; der
  Server rechnet damit erneut (Client-Werte für Fehler/Einnahme werden nicht übernommen).
- DTOs: `KasseDto` (kontoId, name, archiviert, grundbestand, bestand, saldoCent, standardErloesKonto,
  standardZielFach, letzteAbrechnung, offeneZaehlungen), `KassenzaehlungDto` (inkl. `gezaehltVon`
  mit username/status), `KassenabrechnungVorschauDto`, `KassenabrechnungListe/DetailDto`.
- Muster: `packages/shared/src/bargeld.ts` (`berechneZaehlung`, `pruefeBestand`, `anzahlenAus`,
  `stueckelungSumme`).

## API

Store-Erweiterung in `packages/api/src/finanzen.ts` (`FinanzenStore`) + Fake `finanzen.fake.ts`; Insert-Pfad
über `einfuegen(tx, entwurf)` mit `mitWiederholung`, Idempotenz wie `zaehlenTx` (Lookup + `istDoppelt` bei 23505).

| Route                                               | Recht                | Inhalt                                                                                     |
| --------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| `GET /api/finanzen/kassen`                          | `finanzen:lesen`     | alle Kassen (`?archiviert=1`) als `KasseDto`                                                |
| `POST /api/finanzen/kassen`                         | `finanzen:verwalten` | legt Fach unter `safe` (Bargeld, Stückelung) + `fin_kassen` + Grundbestand an; `{ kontoId }` |
| `PUT /api/finanzen/kassen/:kontoId`                 | `finanzen:verwalten` | Grundbestand, Standardkonten; Erlöskonto muss Art `erloes`, Ziel-Fach ein Fach ≠ Kasse sein |
| `GET /api/finanzen/kassen/:kontoId/abrechnung`      | `finanzen:lesen`     | Vorschau: Bestand, Grundbestand, Standardkonten, Dienst-Zählungen seit letzter Abrechnung   |
| `POST /api/finanzen/kassenabrechnungen`             | `finanzen:buchen`    | 201 `{ id, buchungId, buchungSeq }`, 200 bei bekanntem Schlüssel; 400/409 über `finanzenFehler` |
| `GET /api/finanzen/kassenabrechnungen`              | `finanzen:lesen`     | `?kontoId=`; neueste zuerst, max 2000 (`gekappt`), mit `storniert`                          |
| `GET /api/finanzen/kassenabrechnungen/:id`          | `finanzen:lesen`     | Posten, Events (Titel, Datum, Betrag), Fehler, Verweis Buchung                              |
| `GET /api/kassen`                                   | `kasse:zaehlen`      | aktive Kassen nur mit `kontoId`, `name` (keine Bestände)                                    |
| `GET /api/kassen/zaehlungen?eventId=`               | `kasse:zaehlen`      | Zählungen des Events (Kasse, Summe, Posten, wer, wann)                                      |
| `POST /api/kassen/zaehlungen`                       | `kasse:zaehlen`      | Event muss existieren und darf nicht abgesagt sein; Kasse aktiv; 201/200 wie oben            |

`EventDto` bekommt **kein** neues Feld; der Hinweis „Kasse noch nicht gezählt“ kommt aus
`GET /api/kassen/zaehlungen?eventId=` (leer) auf der Event-Seite.

## Web

- `finanzenDaten.ts`: Keys `kassen`, `kassenabrechnungen`, `kassenabrechnung`, `kassenAbrechnungVorschau`;
  Hooks. Event-Seite: eigener Key `['kassen', 'zaehlungen', eventId]` (Mitglieder ohne Finanzrecht).
  Nach Abrechnung/Zählung `finanzenKeys.alle` und die Event-Zählungen invalidieren.
- **`FinanzenKassenPage`** (`/finanzen/kassen`, lesen; Aktionen nur mit verwalten/buchen): Tabelle ab `sm`,
  Karten darunter: Name, Bestand, Grundbestand, Abweichung, offene Dienst-Zählungen, letzte Abrechnung,
  Buttons „Abrechnen“, „Bearbeiten“. „Kasse anlegen“/„Bearbeiten“ als Formular (Name nur beim Anlegen,
  Grundbestand mit `StueckelungFeld`, Erlöskonto- und Fach-Auswahl suchbar).
- **`FinanzenKasseAbrechnenPage`** (`/finanzen/kassen/:kontoId/abrechnen`, buchen; desktop first nach
  „Bedienung“): Datum (heute), Ist-Tabelle mit Spalten wie oben (Tab/Enter wie Wechseln-Seite),
  Erlöskonto, Ziel-Fach, Event-Zuordnungstabelle (Event mit Datum + Link, Dienst-Zählung, Einnahme
  `BetragFeld`, Zeile „Fehler ohne Event“ live), Summenzeile, „Prüfen und abrechnen“ → Zusammenfassung
  mit allen Buchungszeilen und Warnungen zum Abhaken. Idempotenz-Schlüssel je Erfassung, Warnung beim
  Verlassen, Strg+Enter. Am Handy gestapelt, kein horizontales Scrollen.
- **`FinanzenKassenabrechnungenPage`** + **`FinanzenKassenabrechnungPage`** (Liste mit Filter Kasse;
  Detail mit Posten, Events, Fehler, Ersteller `StatusName`, Link Buchung, „storniert“).
- **Event-Seite** (`EventDetailPage.tsx`, nach den Schichten, mobile first): Abschnitt „Kasse“ für
  `kasse:zaehlen`, nur wenn es aktive Kassen gibt. Hinweis „Kasse noch nicht gezählt“ ab Event-Beginn,
  wenn nicht abgesagt und keine Zählung. Button „Kasse zählen“ öffnet das Formular (Kasse-Auswahl,
  `StueckelungFeld` mit ZahlFeld, Summe, Speichern mit Bestätigung „Zählung über X € für Kasse Y
  speichern?“). Liste der Zählungen; ältere je Kasse als „ersetzt“ grau.
- Routen in `packages/web/src/routes/finanzenRouten.tsx`, Links auf `FinanzenPage.tsx` (Hub) und auf der
  Bargeld-Seite bei Kassen-Fächern („Abrechnen“).
- Texte: `finanzenHilfe.ts` (`HILFE.kassen`: Grundbestand, Standard-Erlöskonto, Ziel-Fach, Einnahme,
  Event-Zuordnung, Fehler, Transfer, Dienst-Zählung unverbindlich), `i18n.ts` (Quelle `kassenabrechnung`
  → „Kassenabrechnung“, falls Quelltypen übersetzt werden). Alles Deutsch, „du“.

## Tests

- `packages/shared/src/kassen.test.ts`: Vorschlag Event-Einnahmen (Beispiel 100/50/40 → Fehler 10),
  neueste Zählung je Event gilt, Transfer-Vorschlag mit knappem Ziel-Fach, Zeilen summieren auf 0,
  Stückelung je Zeile = Betrag, Einnahme negativ, keine Zeilen bei Ist = Soll und Transfer 0,
  Fehlbestand (30/10/10-Beispiel) mit Rolle (25) aus anderem Fach ins Zählbrett und 20 in die Kasse (Zählbrett danach 15); Rest ohne Nachschub → Warnung, Grundbestand unverändert; Quell-Fach ohne ganze Rolle.
- `routes/finanzen.test.ts` (neues `describe('Kassen')`): Rechte je Route (inkl. `kasse:zaehlen` ohne
  Finanzrecht sieht keine Bestände), Kasse anlegen/ändern (Validierung Erlöskonto/Fach), Dienst-Zählung
  (Event fehlt/abgesagt → 400, idempotent), Abrechnung bucht korrekte Zeilen, Bestandsregel am Ziel-Fach und an Nachschub-Fächern, Grundbestand bleibt bei jeder Abrechnung unverändert,
  idempotent, Storno → Zählungen wieder offen, Server ignoriert Client-Fehlerbetrag.
- Kalender-Test: Event mit Kassenzählung nicht löschbar.
- `finanzenNurInsert.test.ts` um die neuen Tabellen.
- Web: Formular-Helfer analog `bargeldFormular.test.ts`, `finanzenHilfe.test.ts`.

## Doku (im selben PR)

- `docs/finanzen.md`: Stand/Überblick, neuer Abschnitt „Barkassen“ (Ablauf, Buchung, Fehler, Storno),
  Rechte-Tabelle (`kasse:zaehlen` jetzt mit Seite), Seiten, API, Abschnittsliste.
- `docs/kalender.md`: Abschnitt Kasse auf der Event-Seite, Löschsperre.
- `docs/buch.md`: Abzahlungen landen in der Kasse und gehen mit der Kassenabrechnung als Einnahme ins Journal.
- `docs/datenbank.md`: neue Tabellen.
- `docs/plans/finanzen.md`: Scheibe 3 mit den Entscheidungen oben fortschreiben, Stand-Zeile „umgesetzt (PR #…)“.

## Verifikation

- `tester`: `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Deploy dev, `browser-check`: Kasse anlegen (Desktop 1440×900, Tastatur), Dienst-Zählung am Event bei
  375×812, Abrechnung mit zwei Event-Zählungen und Fehler, Fehlbestand einmal per Münzrolle ins Zählbrett und einmal mit weniger auffüllen (Warnung bestätigen, Grundbestand unverändert), Buchung im Journal prüfen, Bargeld-Bestände
  danach, Storno → Zählungen wieder offen, Event löschen gesperrt.
