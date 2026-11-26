# Protokolle: Usability-Runde nach dem ersten echten Protokoll

> Status: umgesetzt (Phasen 1 bis 5, Doku in `docs/protokolle*.md`).

## Context

Erstes komplettes Protokoll mit der App geschrieben (dev, `protokolle/23a394a7-…`). Auffällig: Externe (EMs ohne App, Gäste) passen nicht zu /erscheint und /geht, Bausteine sind zu hoch (viel Scrollen), einige Felder fehlen (Enddatum, Sitzungsende, Ort, Putz-Datum), Dienste lassen sich im Event nicht eintragen, Gliederungs-Drag bei verschachteltem Thema kaputt. Ziel: schnelleres Schreiben, kompaktere Bausteine, fehlende Angaben ergänzen.

Randbedingungen:

- Das verlinkte Protokoll auf dev wird **inhaltlich nicht verändert**; es muss nach der Änderung weiter laden und gleich aussehen (alte Kopf-Strings, alte EM-`name`-Werte bleiben lesbar).
- Finanz-Scheiben 6/7 laufen parallel: eigene Branch `protokoll-usability` von `main` in eigener Worktree, **keine DB-Migration** (alles steckt in `kopf`/`inhalt`-JSON), keine Änderungen an Finanzen-Dateien.
- Großes Feature (>50 Schritte) → nach Freigabe wird dieser Plan nach `docs/plans/protokoll-usability.md` geschrieben, eine neue Session setzt ihn um (CLAUDE.md).

Entscheidungen aus den Rückfragen:

- Inline-Zitat: Syntax `""Text""` + Werkzeugleisten-Button + /zitat-Unterpunkt „Im Text“.
- Überarbeiten: eigener Merker-Baustein mit Notiz, nie im Dokument/PDF, Warnung beim Abschließen.
- /dienst legt neue Schichten an („Von–bis“ oder „Gesamt“), Schichten werden im Formular entfernbar.
- /erscheint, /geht mit unbekanntem Namen: Auswahl „als Gast“ oder „als EM“ hinzufügen.

## Umsetzung

### 1. Externe bei Erscheint/Geht, Chips für EMs und Gäste

- Shared `protokollKopfSchema` (`packages/shared/src/protokolle.ts` ~1025): `emsFreitext` und `gaeste` werden `string[]` (Name je max. 100, max. 50). `z.preprocess`: alter String → an Zeilenumbrüchen/Kommas teilen, trimmen, Leere weg (hält das dev-Protokoll lesbar, Inhalt gleich).
- `bausteinAnwesenheitDatenSchema` (~260): zusätzlich `name: string` (max 100, Standard `''`), gilt nur ohne `sub`. Person = `sub` oder `name`.
- `protokollAnwesenheit.ts`: `anwesenheitsZeiten` liefert zusätzlich Zeiten je Externem (Schlüssel `extern:<name>` oder eigenes Record `extern`). `anwesenheitsVerlauf`/Beschlussfähigkeit ignorieren Externe (zählen nie); im Meinungsbild zählen anwesende EM-Chips wie heute gewählte EMs (Gäste nicht).
- Kopf-Formular (`ProtokollKopf.tsx` 441–459): Textareas → Chip-Eingabe (Mantine `PillsInput` + `Pill`, Enter/Komma legt Chip an, x entfernt). Pill-Text mit Zeiten aus `anwesenheitsZeitText`: „Ralle · bis 20:30“. Lesend und in Dokumentansicht/PDF (`dokumentDaten.ts` 167–211, `ProtokollDokumentAnsicht.tsx` 944–953, `pdf/pdfBloecke.tsx` 980–989): kommagetrennte Liste, Zeiten in Klammern.
- Slash zweite Stufe (`slashLogik.ts` `personEintraege` 449–480, `anwesenheit.ts` `slashPersonen`): Liste = Teilnahmeliste + EM-Chips + Gast-Chips (Beschreibung „EM (extern)“/„Gast“). Passt der Filtertext zu keinem Eintrag exakt: zwei Einträge „„Ralle“ als Gast hinzufügen“ und „„Ralle“ als EM hinzufügen“ → Chip im Kopf anlegen + Baustein mit `name` einfügen. Kopf-Änderung über neuen Callback analog `onAnwesenheit`/`kopfNachAnwesenheit` (`ProtokollPage.tsx` 254–262).
- `AnwesenheitBaustein.tsx` Select: Optionen um Chips erweitern (Werte `p:<sub>` / `x:<name>`).
- Anzeige des Namens Externer: normaler Text (kein `StatusName`), Gliederung „Ralle erscheint“.
- Chip umbenennen/löschen ändert Bausteine nicht; Baustein mit Namen ohne Chip zeigt Namen trotzdem.

### 2. Inline-Zitat

- Neue TipTap-Mark `zitatInline` (`protokoll/ZitatInline.ts`): HTML `<q class="pk-zitat-inline">`, Stil wie Blockquote (kursiv, gedämpfte Farbe, „…“ per CSS). Input-Rule `markInputRule` für `""Text""`. Werkzeugleisten-Button (Toggle). `/zitat` bekommt zweite Stufe „Als Absatz“ (heutiges Verhalten) / „Im Text“ (Mark am Cursor bzw. auf Auswahl umschalten); `/zitat` + Enter ohne Wahl bleibt „Als Absatz“-Default oben.
- API/Shared `knotenFehler`: Mark-Typ `zitatInline` erlauben. Dokumentansicht + PDF rendern die Mark (`„…“` kursiv).

### 3. Vergangenes Event: Enddatum + eine Zeile

- Schema (`protokolle.ts` 212–217): `bisDatum: datum|null` (Standard null), nur ohne `eventId` editierbar; mit Kalender-Event aus dessen `ende` (`eventZeitenAus`). Formular (`BausteinFormulare.tsx` 483–563): Name | Von | Bis in einer Zeile (`Grid`, Handy: Name volle Breite, Daten 2 Spalten). Dokument/PDF: „11.–13.02. Name“.

### 4. Kompaktere Bausteine (mobile first: `base` = Handy, ab `sm` die gewünschte Zeile)

- **Todo** (372–481): Titel + Deadline in einer Zeile (`Grid` base 7/5). Zuständig + `Switch` „Gemeinsam abhaken“ (statt SegmentedControl) in einer Zeile; Switch immer gerendert, bei genau einer Person gesperrt (Tooltip mit bisherigem Hinweis) – Fokus-Regel aus `bausteine.md` bleibt.
- **Todo-Dropdown**: MultiSelect öffnet nicht mehr bei Fokus, nur bei Klick auf Feld/Chevron oder sobald getippt wird; nach Auswahl schließt es. Kontrolliert über `dropdownOpened` + `onDropdownOpen/Close`/`onOptionSubmit` (Mantine 9 Props prüfen; ggf. `openOnFocus={false}`).
- **Austritt** (754–830, s. Punkt 5): Person + Switch „Abstimmung zum EM“ in einer Zeile.
- **Thema**: Titel-Input in die Kopfzeile von `BausteinAnsicht` (`BausteinKnoten.tsx` ~100–130) zwischen „Thema“ und Lösch-Icon, ohne Label (Placeholder/aria-label „Titel“, `data-fokus=titel` bleibt). Generisch: optionaler `kopfFeld`-Renderer je Typ; `ThemaFormular` entfällt im Editor.
- **Event** (142–336): Zeile 1 Kategorie | Name. Zeile 2 vier feste Plätze Datum von | Datum bis | Uhrzeit von | Uhrzeit bis (`SimpleGrid cols={{ base: 2, sm: 4 }}`); nicht relevante Felder lassen den Platz leer (leere `div`).
- **Schichten** (`SchichtEditor.tsx`): Kopfzeile je Schicht Badge + Lösch-Icon (Schicht entfernen erlaubt). Zeile: Beginn | Ende | (Datum bei Aufbau/Putzen, s. Punkt 9) und je Dienstform ein Block mit halber Breite: `<Name Minimum> <Name Wunsch> <Personen-Button>` (`Grid` base 12 / sm 6). Erster Dienstform-Block füllt die zweite Hälfte der Zeile neben Beginn/Ende, weitere je halbe Zeile darunter. Handy: ein Block je Zeile (ZahlFeld mit ±-Knöpfen braucht die Breite).

### 5. Neues EM → „Austritt“

- Label überall „Austritt“: `symbole.tsx:98`, `slashLogik.ts:263` (Aliasse `austritt`, `em`, `ehrenmitglied`, `neues em`), `dokumentUeberschriften.ts:106`, `ProtokollDokumentAnsicht.tsx:790`, `pdfBloecke.tsx:861`, `protokollStimmen.ts:180`, Tests, Docs. Knotenname `bausteinEm` bleibt.
- Feld „Name (falls nicht in der App)“ entfernen (Formular 800). Schema-Feld `name` bleibt nur, damit altes Dokument gültig bleibt; Anzeige nutzt es weiter, falls gesetzt. Personen-Auswahl: nur Mitglieder (Status `mitglied`) der Teilnahmeliste.
- Switch-Label „Abstimmung zum EM“.

### 6. Merker „Überarbeiten“

- Neuer Baustein `bausteinMerker` (Shared Schema `{}` + Freitext als reiner Text; Editor `BAUSTEIN_KNOTEN`, Gruppen `block` und `innerbaustein`, also oben und in Notizen erlaubt, nicht in Listen/Zitaten). Gelb (Mantine `yellow` light), Titel „Überarbeiten“, Symbol `IconPencilExclamation`.
- Slash `/ueberarbeiten`, Aliasse `/merker`, `/markieren`, `/nacharbeiten`; im Menü „Baustein“. Cursor in den Text.
- Gliederung „Überarbeiten: <Textanfang>“. Dokumentansicht, PDF, `protokollVorschlag`, Erwähnungen, Aktionen: übersprungen.
- Abschließen-Dialog (`ProtokollPage.tsx` 522–565): gelber `Alert` „Noch zu überarbeiten“ mit Links (`zuBaustein`) je Merker; warnt, sperrt nicht.

### 7. Dokument-Vorschau springt zur aktuellen Stelle

- Editor: aktive Baustein-Id = innerster Baustein-Vorfahre der Selektion (sonst Abschnitt). Beim Umschalten auf „Dokument“ (`ProtokollPage.tsx` 448–458) einmalig dorthin scrollen.
- Dokumentansicht: je Baustein-Element `data-id` (Render-Funktionen um 535 und 812). Merker → nächstes vorheriges sichtbares Element. Kein gekoppeltes Scrollen.

### 8. Dienste direkt im Event eintragen

- Shared: Baustein-eigenes Schicht-Schema = `vorlageSchichtSchema` + `personen: sub[]` (Betrieb je Bedarf, Aufbau/Putzen je Schicht; max. 50, Standard `[]`). `ausVorlage`-Aufruf bekommt die Schichten ohne `personen`. `eventDatenAusKalender` füllt `personen` aus den Eintragungen des Kalenders (nur Mitglieder).
- Formular: Icon-Button (`IconUsers`, aria-label „Personen eintragen“, 42px) je Dienstform/Schicht → `Modal` mit durchsuchbarer `MultiSelect` (Mitglieder, Anwärter:innen, EMs; „username (Vorname Nachname)“). Außerhalb des Modals keine Namen.
- Aktionen (`shared/src/protokollAktionen.ts` `eventAnlegen` 262–300, `api/src/protokollAktionen.ts` 219–223): nach `eventAnlegen` Event neu laden, Schichten der Reihe nach zuordnen, je Person `deps.kalender.dienstEintragen(schichtId, { dienstformId?, mitgliedSub })`. `event.aendern`: fehlende Eintragungen ergänzen; Personen, die nur im Kalender stehen, werden nicht ausgetragen (Hinweis in Doku). Fehler einzelner Eintragungen → Aktion mit Hinweis fehlgeschlagen, idempotent („Bereits erledigt“).
- **/dienst** (nur mit Cursor in den Notizen eines Events): Stufe 1 „Gesamt (Eventzeit)“ oder Zeitspanne aus dem Filter (`/dienst 18-22` / `18:00-22:30` → Eintrag „18:00–22:30“); Stufe 2 Dienstform (Dienstformen der Kategorie/Vorlage, dazu Aufbau, Putzen); Stufe 3 „Ohne Personen“ oder eine Person (filterbar). Ergebnis: Schicht mit genau diesen Zeiten finden oder anlegen, Bedarf der Dienstform ergänzen (Minimum/Wunsch = max(1, Personen)), Person dazu. Getippter Text wird entfernt, kein Unterbaustein. Neue `SlashAktion` `{ art: 'dienst', … }`, Callback ändert die Daten des umgebenden Event-Bausteins per Transaktion. Logik + Parser in `slashLogik.ts`/`bausteinLogik.ts` mit Tests.

### 9. Datum für Putz-/Aufbau-Schichten

- `SchichtEditor`: bei Aufbau/Putzen ein `DatumFeld` „Datum“ = Eventdatum + `tagVersatz`; Ändern rechnet `tagVersatz` zurück (`tageZwischen`). Ohne Eventdatum gesperrt mit Hinweis.

### 10. Gliederung: Drag'n'Drop verschachtelter Themen

- Erst reproduzieren: Struktur des dev-Protokolls um „Rückführung BZGs“ (nur lesen) per `browser-check` erfassen, als Test in `gliederung.test.ts`/`themaSchachtelung.test.tsx` nachbauen. Verdächtige: `ende()` in `GliederungBaum.tsx` 93–116 berechnet die Zeilen neu (Index-Versatz durch eingeklappte Zeilen), stille `null`-Rückgaben in `gliederungZiel` (276–277) / `bausteinInGliederungVerschieben` (326–384). Ursache fixen; jedes `null` beim Drop zeigt „Hierhin lässt sich der Baustein nicht verschieben.“
- Scrollen: während des Ziehens nur die Gliederung scrollen. Fenster beim Drag-Start sperren (`overflow: hidden` auf `html`, beim Ende zurück), `tr.scrollIntoView()` in `gliederung.ts:384` entfernen. Drawer am Handy prüfen.

### 11. Ende der Sitzung

- Kopf: `ende: uhrzeitOderLeer` (Standard `''`), im Formular neben „Eröffnung“ („Ende“, `type="time"`).
- `/ende` (Aliasse `/schluss`, `/beenden`): setzt `kopf.ende` = aktuelle Berliner Zeit, entfernt den getippten Text, kein Baustein; Benachrichtigung „Ende 22:10 eingetragen“. Neue `SlashAktion` `{ art: 'ende' }` + Callback wie `onAnwesenheit`.
- Dokument/PDF ganz unten: „<Sitzungsleitung> beendet die Sitzung um 22:10 Uhr.“ (Leitung als `StatusName`/fett; ohne Leitung „Die Sitzung endet um 22:10 Uhr.“). Satz-Funktion neben `eroeffnungSatz` (`dokumentDaten.ts:223`).

### 12. Nächste Sitzung: fett + Ort

- Kopf: `naechsteSitzungOrt: string` (max 100, Standard `'C4'`). Feld „Ort“ in `NaechsteSitzungKarte.tsx`.
- `naechsteSitzungSatz` (`dokumentDaten.ts` 93–98) liefert Teile `{ vor, fett }`: „Die nächste Sitzung findet statt am **Montag, 30.11.2026 um 20:00 Uhr im C4**.“ (Wochentag ausgeschrieben; leerer Ort → ohne „im …“). Web und PDF rendern den fetten Teil.

## Phasen (je ein frischer `implementer`, Korrekturen per `SendMessage`)

1. **Shared + API**: alle Schema-Änderungen (Kopf-Chips mit Preprocess, `ende`, `naechsteSitzungOrt`, Anwesenheit `name`, Vergangenes `bisDatum`, Schicht-`personen`, `bausteinMerker`, Mark `zitatInline`), Anwesenheit/Stimmen für Externe, Label „Austritt“ in Stimmen, Aktionen Dienst-Eintragungen, `naechsteSitzungSatz`/Ende-Satz-Logik; Unit-Tests (`protokolle.test.ts`, `protokollAnwesenheit.test.ts`, `protokollAktionen.test.ts`, `app.test.ts`).
2. **Web Editor A**: Layouts (Punkt 3, 4, 5, 9), Thema-Kopfzeile, Todo-Dropdown, Austritt, Personen-Modal (Punkt 8 Formular).
3. **Web Editor B**: Slash/Chips (Punkt 1), Inline-Zitat, Merker, `/ende`, `/dienst`; Tests `slashLogik.test.ts` u. a.
4. **Web Ansicht**: Dokumentansicht/PDF (Chips, Zitat, Ende, Ort, Merker aus, `data-id`), Vorschau-Scroll, Abschließen-Warnung, Gliederung-DnD-Fix + Test.
5. **Docs**: `docs/protokolle.md` (Kopf), `docs/protokolle/bausteine.md` (Bausteine, Slash, Austritt, Merker, Dienste), `docs/protokolle/ansicht-pdf.md` (Gliederung, Vorschau, Sätze), `docs/protokolle/aktionen.md` (Dienst-Eintragungen), `docs/members.md:91` (Austritt).

## Verifikation

- `tester`: `pnpm -r test`, Typecheck, Lint, Build (`| tail -40`).
- Push, `gh workflow run deploy.yml --ref protokoll-usability -f env=dev`, Warten im `tester`.
- `browser-check` nacheinander, je eins: (a) verlinktes Protokoll nur **lesen**: lädt, Dokument unverändert (Kopf-Gäste/EMs als Liste); (b) neues Test-Protokoll auf einer Test-Sitzung (nicht das verlinkte) bei 375px und Desktop: Bausteine-Layouts, Thema-Kopfzeile, Todo-Dropdown, Chips + /erscheint „Ralle“ als Gast → Chip „Ralle · ab …“, `""Zitat""`, /ueberarbeiten + Warnung beim Abschließen, /ende, /dienst, Personen-Modal, Putz-Datum; (c) Vorschau-Sprung und Gliederung-DnD verschachteltes Thema, kein Editor-Scrollen; (d) Abschließen eines Test-Protokolls: Event mit Diensten + Eintragungen im Kalender, Dokument-Sätze Ende/Nächste Sitzung fett mit Ort. Test-Protokoll danach löschen bzw. Test-Daten aufräumen.
