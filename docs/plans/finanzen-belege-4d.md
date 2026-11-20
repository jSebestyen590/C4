# Finanzen Scheibe 4d: Posten-Erfassung als Tabellen, Artikelnamen, Standard-Gebinde – Umsetzungsplan

Folgt auf [finanzen-belege-4c.md](./finanzen-belege-4c.md), gleicher Branch `finanzen-belege-4b` (ein PR für 4b–4d). Wünsche des
Nutzers vom 20.11.2026; offene Details hier entschieden (siehe Tabelle), bei Bedarf beim Review ändern.

## Entscheidungen

| Thema | Entscheidung |
| --- | --- |
| Aufteilung (Mitglied) | „Aufteilen (optional)“ ist einklappbar, solange es keinen Posten gibt. Ab dem ersten Posten ist der Bereich immer offen (kein Einklappen), damit Fehlermeldungen sichtbar sind. Nach Reload mit Posten: offen. |
| Standard-Art | Ein neuer Posten ist immer Art **Ware (Lager)** (Mitglied und Finanzer:in). |
| Finanzer:in, große Screens | Ab `md` statt Posten-Karten **drei Tabellen untereinander**: „Waren“, „Kategorien“, „Leergut“, je mit eigener „Zeile hinzufügen“ und Tastaturführung (Enter = nächste Zeile derselben Tabelle, am Tabellenende neue Zeile). Unter `md` bleibt die bisherige Karten-Maske. Datenmodell unverändert (eine Posten-Liste mit `art`); die Reihenfolge im Beleg ist Waren, Kategorien, Leergut. |
| Spalten Waren | Ware · Gebinde · Anzahl · Preis je Gebinde · Pfand je Gebinde · Steuersatz · Kategorie · Betrag. **Kein Text** (Ware ist eindeutig; `text` entfällt im Ware-Posten-Schema). |
| Spalten Kategorien | **Artikel** (Pflicht, z. B. „Deko“) · Kategorie · Anzahl · Einzelpreis · Steuersatz · Betrag. |
| Spalten Leergut | Beschreibung · Anzahl · Preis · Steuersatz · Betrag (wie bisher). |
| Artikel → Kategorie | Bei Kategorie-Posten zuerst den Artikelnamen (Autocomplete aus bisherigen Artikelnamen), dann die Kategorie: Dropdown mit **Vorschlägen** oben (Kategorien, in denen dieser Artikelname schon gebucht wurde, nach Häufigkeit; die häufigste wird vorbelegt, solange die Kategorie leer ist) und darunter **alle anderen** Aufwandskategorien. Quelle: gebuchte, nicht stornierte Belegposten (`fin_belegposten.text`, `kategorie_id`, `art = kategorie`), Vergleich ohne Groß/Klein und Leerzeichen am Rand. Gilt auch fürs Mitglied. |
| Ware-Suche | Ware ist auch über ihre **Aliase** findbar (`waren.aliase`, `shared/src/waren.ts:276`): Treffer im Alias zeigt die Ware („Sternburg Export“ bei „Sterni“), optional mit Alias-Hinweis. Mitglied und Finanzer:in. |
| Standard-Gebinde | Neue Spalte `waren.standard_gebinde_id` (nullable, muss zu den Gebinden der Ware gehören). Gepflegt im Ware-Formular (`/waren`), Auswahl aus den Gebinden der Ware. Beim Wählen einer Ware wird das Standard-Gebinde vorbelegt (sonst: einziges Gebinde, sonst leer) samt Pfand. |

## Datenmodell

- Migration (nächste freie Nummer nach 0231, mit Down-Datei, DSQL: eine Anweisung): `waren.standard_gebinde_id text NULL`.
  Prüfung in der API (gehört zur Ware über `ware_gebinde`); beim Entfernen eines Gebindes von der Ware wird ein passender Standard
  auf `null` gesetzt. `docs/datenbank.md`.
- Belegposten unverändert; Ware-Posten speichern künftig keinen eigenen Text (Anzeige über Ware-Name).

## Shared

- `belegPostenWareSchema`: `text` raus. `belegPostenKategorieSchema`: `text` Pflicht (Artikel, 1–100 Zeichen).
  `belegEinreichenSchema` entsprechend. Bestehende Tests anpassen.
- Ware-DTOs (`BelegWareDto`, Waren-DTOs in `waren.ts`): `aliase`, `standardGebindeId`. Ware-Schema: `standardGebindeId`.
- Hilfsfunktion `wareSuchen(waren, suchtext)` (Name und Aliase, ohne Groß/Klein) für die Selects, mit Tests.
- `artikelKategorieVorschlaege`-DTO: `{ artikel, kategorien: { kategorieId, anzahl }[] }[]`.

## API

- Waren: `standardGebindeId` lesen/schreiben (Ware anlegen/ändern), Validierung, Zurücksetzen beim Gebinde-Entfernen, Tests.
- `GET /api/finanzen/beleg-waren` und `GET /api/finanzen/einreichungen/auswahl` liefern `aliase` und `standardGebindeId`.
- Artikel-Vorschläge: in beiden Routen (Finanzer:in: neue Route `GET /api/finanzen/artikel-vorschlaege`, `finanzen:lesen`;
  Mitglied: Feld in `einreichungen/auswahl`) die Liste aller Artikelnamen mit Kategorien und Häufigkeit (eine Abfrage, gruppiert).
- Ware-Posten ohne Text (Plan/Buchen: Buchungstext je Posten = Ware-Name), Tests.

## Web

- `BelegEinreichenPage.tsx` (Mitglied, mobile first): Aufteilung nicht einklappbar ab einem Posten; neuer Posten Art Ware; Ware-Suche
  mit Aliasen; Standard-Gebinde vorbelegt; Kategorie-Posten mit Artikel (Autocomplete) + Kategorie-Select mit Vorschlägen
  (Mantine `Select` mit Gruppen „Vorschläge“ / „Alle Kategorien“); Ware-Posten ohne Text.
- `FinanzenBelegPage.tsx` / `BelegPostenZeile.tsx` (desktop first): ab `md` drei Tabellen (neue Komponente z. B. `BelegPostenTabellen.tsx`
  mit `BelegPostenTabelle` je Art), kompakte Eingaben in Zellen (Mantine size `sm` in Tabellen ist auf Desktop ok, Schrift ≥ 16 px nur
  am Handy nötig), Betrag-Spalte rechts, Löschen je Zeile, Fehler je Zelle sichtbar (rote Umrandung + Text unter der Tabelle oder
  Tooltip). Unter `md` die bisherige Karten-Maske (mit denselben Neuerungen: Art Ware als Standard, Artikel/Kategorie, Aliase,
  Standard-Gebinde, kein Text bei Ware). `belegFormular.ts`: Zeilen-Reihenfolge/Gruppierung nach Art, Tests.
- Ware-Formular (`/waren`, Ware anlegen/bearbeiten): Feld „Standard-Gebinde“ (Select aus den gewählten Gebinden).
- Alle Ware-Auswahlen in Belegen: Suche über Aliase (`wareSuchen`).
- `finanzenHilfe.ts`: Artikel/Kategorie-Vorschlag, Standard-Gebinde.

## Doku

- `docs/finanzen.md` (Belege: Tabellen-Erfassung, Artikel → Kategorie, Standard-Art Ware, Aufteilung offen), `docs/waren.md`
  (Standard-Gebinde, Aliase in der Beleg-Suche), `docs/datenbank.md`, dieser Plan → umgesetzt.

## Phasen (je ein frischer `implementer`)

1. Migration + shared + API (Standard-Gebinde, Aliase in DTOs, Artikel-Vorschläge, Ware-Posten ohne Text, Kategorie-Posten mit Artikel) + Tests.
2. Web Mitglied (`BelegEinreichenPage`) + Ware-Formular (Standard-Gebinde) + gemeinsame Ware-Suche.
3. Web Finanzer:in: drei Tabellen ab `md`, Karten-Maske unter `md` angepasst.
4. Doku.

## Verifikation

- `tester`: lint, typecheck, test, Deploy dev.
- `browser-check` nacheinander: „Standard-Gebinde für Testbier setzen, Alias ‚Sterni‘ anlegen“ (`/waren`); „Mitglied reicht mit
  Ware (Suche ‚Sterni‘) und Artikel ‚Deko‘ ein, Aufteilung bleibt offen, Fehler sichtbar“ (375×812); „Finanzer:in erfasst Beleg in den
  drei Tabellen per Tastatur, Artikel ‚Deko‘ schlägt Kategorie vor“ (1440×900); „Belegformular am Handy ohne seitliches Scrollen“.
