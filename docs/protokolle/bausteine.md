# Protokolle: Bausteine

Teil von [protokolle.md](../protokolle.md): das Dokument, seine Bausteine, Regeln für Stimmen und Wahlen, Slash-Befehle und
Erwähnungen. Die Darstellung steht in [ansicht-pdf.md](./ansicht-pdf.md), die Aktionen beim Abschließen in
[aktionen.md](./aktionen.md).

## Dokument

Das Dokument (TipTap, `@mantine/tiptap`) besteht aus genau vier Abschnitten mit fester Überschrift (Vergangenes, Gegenwärtiges,
Zukünftiges, Sonstiges). Sie lassen sich weder
löschen, verschieben noch umbenennen (auch nicht durch Alles-markieren + Löschen oder Einfügen; der Editor lehnt solche
Änderungen ab, die API prüft Anzahl und Reihenfolge). **Sonstiges** ist optional: Im Editor immer da, in der Dokumentansicht nur mit
Inhalt. Ältere Dokumente haben nur drei Abschnitte; beim Lesen (API, Editor) kommt ein leeres Sonstiges dazu
(`protokollDokumentNormalisieren`), die Prüfung nimmt drei oder vier. In einem Abschnitt stehen Absätze, Überschriften (Ebene 2 und 3),
Listen, Links, fett und kursiv sowie Bausteine. Am Ende jedes Abschnitts bleibt ein leerer Absatz.

Ein **Baustein** ist ein Block mit Feldern (Formular im Dokument) und einem Freitext darunter (normaler Text mit
Formatierung; nur Erscheint/Geht hat keinen). Jeder hat eine stabile `id` (UUID, bei Kopien neu vergeben) und `daten`. Lesende sehen Bausteine als kompakte
Karten.

## Die Bausteine

Je Baustein: Knotenname, Felder, Besonderheiten. Die Feld-Schemata stehen in `BAUSTEIN_DATEN_SCHEMAS` (Shared).

### Event (`bausteinEvent`)

- Felder: Vorlage (`vorlageId`, optional), Name, Datum (bei mehreren Tagen von/bis), Beginn und Ende, Dienste (Schichten im Format der Vorlage), Verantwortliche:r, Kategorie (`kategorieId`, nötig zum Anlegen, Standard `null`), Kalender-Event (`eventId`, mit Link „Im Kalender öffnen“ in neuem Tab, auch bei Vergangenes Event).
- Notizen: normaler Freitext, nimmt andere Bausteine auf (siehe [Bausteine in Notizen](#bausteine-in-notizen-und-verschachtelte-themen)).

### Anwesenheit (`bausteinAnwesenheit`)

- Felder: Art (`erscheint`/`geht`), Mitglied (`sub`), Uhrzeit (`HH:MM`, optional).
- Ohne Freitext (Atom, kein `content`; alte Bausteine mit Absatz werden beim Laden bereinigt). Kommt nicht in den Vorschlag fürs nächste Protokoll.
- Steht auf oberster Ebene oder in den Notizen eines Bausteins mit Notizen (`istVerschachtelbar`, Knotengruppe `innerbaustein`), auch in einem Listenpunkt dort. Alle Auswertungen (Teilnahme, Beschlussfähigkeit, Stimmen-Prüfung, Kopf) laufen rekursiv in Dokumentreihenfolge und finden ihn überall.

### Thema (`bausteinThema`)

- Feld: Titel (`titel`, höchstens 200 Zeichen, Standard leer). Allgemeiner Punkt ohne weitere Felder; auf oberster Ebene oder verschachtelt (siehe unten), in den Notizen sind Abstimmung, Meinungsbild und Wahl möglich.
- Kommt nicht in den Vorschlag fürs nächste Protokoll, keine Aktionen.

### Todo (`bausteinTodo`)

- Felder: Titel (`titel`, höchstens 200 Zeichen), Zuständig (`zustaendig`, höchstens 50 Einträge: `{ art: 'person', sub }` oder `{ art: 'gruppe', gruppe }`, dieselben Attribute wie eine Erwähnung), Deadline (`faelligAm`, nur im Entwurf leer), Abhaken (`modus`: `einzeln` (Standard) oder `gemeinsam`), `todoId` (wird beim Abschließen zurückgeschrieben).
- Notizen sind reiner Text wie bei den Abstimmungen. Steht nur in den Notizen anderer Bausteine (Event, Thema, Vergangenes Event …), nie auf oberster Ebene eines Abschnitts und nicht in einer Abstimmung oder einem anderen Todo. Kommt nicht in den Vorschlag fürs nächste Protokoll.
- Aktionen `todo.anlegen`/`todo.aendern` (siehe [aktionen.md](./aktionen.md) und [todos.md](../todos.md)).

### Vergangenes Event (`bausteinVergangenesEvent`)

- Felder: Kalender-Event (`eventId`) oder Name und Datum von Hand.

### Anwärter:in (`bausteinAnwaerter`)

- Felder: Vorname, Nachname, E-Mail (optional), `sub` (das Konto nach der Einladung, Standard `null`).
- Ein gesetztes `sub` zeigt „Eingeladen“ mit Link zum Mitglied; die E-Mail ist dann nicht mehr änderbar.

### Abstimmung (`bausteinBeschluss`)

- Felder: Antrag, Ja / Nein / Enthaltung (`ZahlFeld`), Ergebnis `angenommen`/`abgelehnt` (aus den Stimmen vorgeschlagen, überschreibbar; Gleichstand = abgelehnt, ohne Ja- und Nein-Stimmen kein Vorschlag).
- Nur Mitglieder stimmen, verbindlich. Der Knotenname bleibt `bausteinBeschluss` (alte Daten gelten weiter).

### Neues EM (`bausteinEm`)

- Felder: Person (`sub`) oder Name als Freitext (`name`, nur ohne `sub`), optional Abstimmung (`abstimmung`: Ja / Nein / Enthaltung und Ergebnis wie bei der Abstimmung, sonst `null`).

### Aufnahme (`bausteinAufnahme`)

- Felder: Person (`sub`, zuerst die Anwärter:innen der Teilnahmeliste) oder Name als Freitext (`name`, nur ohne `sub`), `abstimmung` immer vorhanden (Ja / Nein / Enthaltung und Ergebnis wie bei der Abstimmung, Beschlussfähigkeit wie dort).

### Meinungsbild (`bausteinMeinungsbild`)

- Felder: Frage (`frage`, höchstens 500 Zeichen), Optionen (`optionen`: Text höchstens 100 Zeichen und Stimmen, höchstens 12; neu: Ja / Nein / Enthaltung).
- Unverbindlich, alle Anwesenden stimmen, keine Beschlussfähigkeit.

### Wahl (`bausteinWahl`)

- Posten (`posten`, höchstens 200 Zeichen): Auswahl aus den nicht archivierten Posten der App oder Freitext; passt der Text zu einem Posten, steht dessen Id in `postenId`, sonst `null`.
- „Gilt ab“ (`gueltigAb`, `YYYY-MM-DD` oder leer; neu vorbelegt mit `wahlGueltigAbVorschlag`: nach dem 01.11. der 01.01. des nächsten Jahres, sonst der heutige Tag).
- Anzahl zu wählen (`anzahl`, 1–20, Standard 1), Stimmen pro Person (`stimmenProPerson`, 1–20 oder `null` = wie `anzahl`; alte Daten ohne das Feld gelten weiter).
- Kandidat:innen (`kandidaten`, höchstens 30: `id`, Person `sub`, Stimmen; nur Personen der App, alte Daten mit Freitext-`name` ohne `sub` werden weiter angezeigt), `enthaltung`.
- Stichwahlen (`stichwahlen`, höchstens 10: Stimmen je Kandidat:in und Enthaltung).
- `nichtAngetreten`: Personen der App, die vorgeschlagen wurden, aber nicht antreten; höchstens 30, nur Anzeige; Mehrfachauswahl „Vorgeschlagen, tritt nicht an“.
- `annahme`: je Kandidat-Id `false`, wenn die gewählte Person die Wahl nicht annimmt; fehlt der Eintrag, nimmt sie an.
- Nur Mitglieder stimmen, Beschlussfähigkeit wie bei der Abstimmung (`anwesenheitsVerlauf`), Ergebnis siehe unten.
- Alte Wahlen ohne `postenId`, `gueltigAb`, `stimmenProPerson`, `nichtAngetreten` und `annahme` bleiben gültig (Standard `null`, leer bzw. `[]`/`{}`).

### Abstimmung mit mehreren Möglichkeiten (`bausteinAuswahl`)

- Felder: Frage (`frage`, höchstens 2000 Zeichen), Anzahl zu wählen (`anzahl`, 1–20, Standard 1), Stimmen pro Person (`stimmenProPerson`, wie bei der Wahl), Möglichkeiten (`optionen`, höchstens 30: `id`, Text höchstens 200 Zeichen, Stimmen), `enthaltung`, Stichwahlen (`stichwahlen` wie bei der Wahl) und `wiederholung`.
- Eine Abstimmung über mehrere freie Möglichkeiten; ohne Posten, „Gilt ab“, Annahme und nicht Angetretene. Nur Mitglieder stimmen, Beschlussfähigkeit und Stimmenprüfung wie bei der Wahl (Meldungen „Abstimmung „Frage“: …“).
- Formular: Frage, Anzahl zu wählen, Stimmen pro Person, je Möglichkeit Text + Stimmen + Entfernen, „Möglichkeit hinzufügen“, Enthaltung, Stichwahlen. Im Editor „Abstimmung (Auswahl)“, in der Gliederung „Abstimmung: Frage“.

### Event-Baustein im Editor

Das Feld „Kategorie“ (nicht archivierte Kategorien) steht neben der Vorlage; wird im Feld „Im Kalender“ ein Event gewählt, übernimmt der Baustein dessen Angaben (Kalender gewinnt: Name, Datum, Zeiten, Kategorie, Verantwortliche:r, Dienste über `eventDatenAusKalender`), die Notizen bleiben.

**Einschränkungen der Dienste** im Event-Baustein: Sie sind eine Planung, kein Eintrag im Kalender. Je Dienst lassen sich nur Zeiten und Anzahlen (Minimum, Wunsch) ändern, Schichten lassen sich nicht hinzufügen oder entfernen (höchstens 20), und die Vorlage bestimmt die Dienstformen. Die Uhrzeitfelder entfallen bei ganztägigen Kategorien, das Bis-Datum erscheint bei mehrtägigen.

Die Feld-Schemata (`BAUSTEIN_DATEN_SCHEMAS`) prüft die API streng, im Entwurf dürfen Felder leer sein. Das übrige Dokument prüft sie nur in der Struktur (Knotentypen, Tiefe höchstens 30, höchstens 500 KB).

## Regeln für Abstimmungen und Wahlen

**Wiederholung (`wiederholung`):** Abstimmung, Neues EM (mit Abstimmung), Aufnahme, Wahl und Auswahl haben das optionale Feld
`wiederholung` (`{ datum, sitzung }` oder `null`, Standard `null`, alte Daten bleiben gültig). Es steht an Abstimmungen, die
`protokollVorschlag` aus einer nicht beschlussfähigen Sitzung übernommen hat (siehe [Vorbelegung](../protokolle.md#vorbelegung-eines-neuen-protokolls)).
Der Editor zeigt oben im Baustein den Hinweis „Wiederholung der Abstimmung vom 05.11.2026 (Sitzung), damals nicht
beschlussfähig.“ (Wahl: „… der Wahl …“, Aufnahme: „… der Aufnahme-Abstimmung …“), die Dokumentansicht dieselbe Zeile klein im Block.

**Stimmen müssen zur Anwesenheit passen (`stimmenPruefen` in `protokollStimmen.ts`):** Jede Abstimmung, die Abstimmung eines
Neuen EM (falls vorhanden), jede Aufnahme, jede Wahl und jede Auswahl braucht **genau so viele Stimmen, wie Mitglieder an der Stelle anwesend
sind** (dieselbe Zahl wie „Anwesend: x von y Mitgliedern“, `anwesenheitsVerlauf`). Abstimmung: Ja + Nein + Enthaltung = x. Wahl und Auswahl,
Hauptrunde: Stimmen aller Kandidat:innen + Enthaltung = x × Stimmen pro Person (im Formular „Stimmen pro Person“ nach „Anzahl zu
wählen“, folgt `anzahl`, bis man es ändert). Jede geltende Stichwahl: x × min(Stimmen pro Person, Plätze der Runde). Ein offener
Gleichstand, der noch eine Stichwahl braucht, zählt auch als Fehler („Stichwahl nötig“). Das Meinungsbild ist nicht verbindlich und
wird nicht geprüft. Bausteine in Notizen anderer Bausteine zählen mit.

**Wahl, Ergebnis (`wahlErgebnis` in `protokolle.ts`):** Die Kandidat:innen werden nach den Stimmen der Hauptrunde geordnet
(Enthaltungen zählen nicht). Ist die Stimmenzahl auf Platz `anzahl` größer als auf Platz `anzahl + 1`, sind die obersten
`anzahl` gewählt. Sonst sind die klar Vorderen gewählt und die am Rand Gleichaufliegenden gehen in eine **Stichwahl** um die
übrigen Plätze (Hinweis „Gleichstand zwischen B und C um 1 Platz – Stichwahl nötig“, Button „Stichwahl hinzufügen“). Jeder
Eintrag in `stichwahlen` ist eine Runde unter genau den Kandidat:innen, die die Runde davor gleichauf ließ, mit derselben
Regel; gibt es wieder Gleichstand, ist die nächste Runde nötig. Eine Runde ganz ohne Stimmen gilt als noch nicht
durchgeführt. Gibt es höchstens `anzahl` Kandidat:innen, sind alle mit mindestens einer Stimme gewählt. Ohne Kandidat:innen
oder Stimmen gibt es kein Ergebnis. Gespeicherte Stichwahlen, die nicht mehr gebraucht werden (die Stimmen änderten sich),
ignoriert die Logik; der Editor bietet an, sie zu entfernen.

**Auswahl, Ergebnis (`auswahlErgebnis` in `protokolle.ts`):** Es gelten dieselben Regeln wie bei der Wahl (`rangErgebnis`: Rangfolge nach den Stimmen der Hauptrunde, Gleichstand um den letzten Platz führt in eine Stichwahl, mehrere Runden möglich), nur ohne Annahme: `abgelehnt` ist immer leer. Das Ergebnis erscheint als „Ergebnis: A, B“ (grün) bzw. als Hinweis „Gleichstand zwischen B und C um 1 Platz – Stichwahl nötig“ mit dem Knopf „Stichwahl hinzufügen“; überflüssige Stichwahlen lassen sich entfernen. Die Annahme-Schalter der Wahl behalten im Editor eine feste Reihenfolge (nach Kandidat:innen, nicht nach Ergebnis), damit der gedrückte Schalter beim Umschalten den Fokus behält.

**Wahl, Annahme:** Nach dem Ergebnis hat jede gewählte Person im Editor einen Schalter „<Name> nimmt die Wahl an“ (Standard: an).
Schaltet man ihn aus (`annahme[id] = false`), wird das Ergebnis so berechnet, als stünde die Person nicht auf der Liste: gleiche
Stimmen, gleiche Stichwahl-Regeln, die Nächstplatzierte rückt nach (ein Gleichstand an der neuen Grenze braucht wie üblich eine
Stichwahl). Das wiederholt sich, bis keine gewählte Person mehr abgelehnt hat. `wahlErgebnis` liefert dann nur die Annehmenden in
`gewaehlt` und die Übersprungenen in `abgelehnt` (ihr Schalter bleibt, aus, und lässt sich wieder einschalten). Absagen von nicht
gewählten Personen haben keine Wirkung. Gespeicherte Stichwahlen gehören zur Runde `i` und gelten dafür per Kandidat-Id weiter;
`wahlRunden` zeigt und prüft zuerst die Runden, wie sie ohne Absagen stattfanden (die Stimmen wurden dafür abgegeben), danach nur
durch Absagen nötig gewordene. Die Stimmen-Prüfung, die Dokumentansicht und die Aktion `wahl.posten` nutzen dieses Ergebnis.

## Todo im Editor

**Todo-Formular** (`TodoFormular` in `BausteinFormulare.tsx`, mobile first): „Titel“, „Zuständig“ (durchsuchbare Mehrfachauswahl: zuerst die
Gruppen `@Anwärter:innen` … `@Alle`, dann die Mitglieder; Werte `g:<gruppe>` bzw. `p:<sub>`), „Deadline“ und „Abhaken“ (Einzeln / Gemeinsam).
„Abhaken“ ist **immer** da und bleibt an seinem Platz: Bei genau einer Person (ohne Gruppe) ist es gesperrt und ein Hinweis erklärt, warum.
Das ist Absicht: Ein fokussiertes Feld, das im Editor-Knoten verschoben oder entfernt wird, verliert den Fokus, der Cursor springt in den Text
und die Handy-Tastatur geht auf. Lesende sehen eine Textzeile wie im Dokument. Die Logik steht in `bausteinLogik.ts` (`todoZustaendigSetzen`).

**Das Todo gibt es nur in Notizen** (`istNurInNotizen`): Es steht nie direkt in einem Abschnitt. Dafür sorgen:

- der Editor-Schema: Knotengruppe `notizbaustein` statt `block`, nur in den Notizen (auch in Listenpunkten dort, aber nicht in Zitaten);
- das Slash-Menü und das Menü „Baustein“: Auf oberster Ebene (Cursor in keinem Baustein, `ausserhalbBaustein`) fehlt „Todo“, auch seine Aliasse (`/aufgabe`);
- die Gliederung: Ein Todo lässt sich nur in die Notizen anderer Bausteine ziehen (`gliederungZiel` und `bausteinInGliederungVerschieben` liefern sonst keinen Platz);
- die Prüfung beim Speichern (`protokollDokumentPruefen`): „Ein Todo gehört in die Notizen eines anderen Bausteins, nicht auf die oberste Ebene.“

### Bedienung im Editor

- **Farbleiste:** Jede Baustein-Karte hat links eine 4 px breite Leiste in der Farbe ihres Typs (eine Zuordnung `BAUSTEIN_FARBE` in `symbole.tsx`, setzt `--baustein-farbe`; dieselbe Farbe hat das Symbol in der Gliederung; Zitat bleibt in der Primärfarbe). Verschachtelte Bausteine zeigen mehrere Leisten nebeneinander. Nur im Editor, nicht in Dokument-Ansicht und PDF.
- **Tab-Reihenfolge:** Tab auf dem letzten Feld des Formulars (kein weiterer Tab-Stopp dahinter: ohne unsichtbare/inerte Elemente, bei Radiogruppen zählt nur der gewählte) setzt den Cursor an den Anfang der Notizen dieses Bausteins, beim Bild hinter das Bild (`BausteinKnoten.tsx`, `BildKnoten.tsx`, `fokusSetzen`, Hilfen in `tabFolge.ts`). In den Notizen (auch im Text eines Abschnitts) verlässt Tab den Text nie: Er rückt einen Listenpunkt ein, sonst tut er nichts; Shift+Tab rückt aus oder tut nichts (`NotizenTabulator` in `schema.ts`, niedrige Priorität, damit Tab im Slash-/@-Popup weiter den Eintrag wählt). Zurück ins Formular geht es nur per Pfeiltasten oder Maus. Reine Icon-Buttons (Baustein entfernen, Datum löschen) sind kein Tab-Stopp.
- **Formularfelder:** Datum ist ein tippbares Mantine-`DateInput` (`DatumFeld` mit `tippbar`), Uhrzeit ein Mantine-`TimePicker` (`ZeitFeld.tsx`, Wert `HH:mm`, leer solange unvollständig), damit kein natives Picker-Symbol als Tab-Stopp stört. Selects haben `allowDeselect={false}`: Ein erneuter Klick auf den gewählten Wert leert ihn nicht (leeren nur über das Kreuz bei `clearable`).
- **Fokus:** Ein Klick auf eine Stelle im Formular, die kein Eingabeelement ist (Label, Rand), würde der Browser sonst selbst in die Notizen setzen (das Formular ist eine `contenteditable=false`-Insel im Editor, ProseMirror sieht die Events nicht); `formularMausTaste` verhindert das. `fokusSetzen` bricht bei jeder anderen Eingabe (Klick, Taste, Fokuswechsel) oder geänderter Knotenposition ab.

## Bausteine in Notizen und verschachtelte Themen

**Abstimmung, Meinungsbild, Wahl, Auswahl und Todo in anderen Bausteinen:** Diese fünf (`BAUSTEINE_IN_NOTIZEN`), dazu Erscheint/Geht (nur `istVerschachtelbar`, keine Abstimmung), lassen sich auch in den Notizen
eines anderen Bausteins (z. B. eines Events oder Themas) an der Cursor-Stelle einfügen, nicht ineinander. Alle anderen Bausteine bleiben
auf oberster Ebene. Sie enthalten selbst nur Text, also keine weiteren Bausteine. Im Editor erlaubt das die Knotengruppe `innerbaustein` (`BausteinKnoten.tsx`); steht so ein Baustein am
Ende der Notizen, kommt ein leerer Absatz dahinter. `protokollVorschlag` übernimmt sie nicht ins nächste Protokoll.

**Verschachtelte Themen:** Ein Thema darf in den Notizen jedes Bausteins mit Notizen stehen, der kein Abstimmungs-Baustein ist
(Event, Vergangenes Event, Anwärter:in, Aufnahme, Neues EM) und in den Notizen eines anderen Themas, beliebig tief
(`kannBausteineEnthalten`, `istVerschachtelbar`, `darfInNotizen` in `protokolle.ts`). Abstimmung, Meinungsbild und Wahl bleiben in jedem
(auch verschachtelten) Thema erlaubt. Alle anderen Bausteine bleiben auf oberster Ebene. Im Editor ist das die Knotengruppe `thema`
(Thema ist kein `block`, steht also nicht in Zitaten; in Listenpunkten ist es erlaubt, siehe unten). Alte Dokumente bleiben gültig. Im Vorschlag fürs nächste
Protokoll entfallen verschachtelte Themen samt Inhalt aus den Notizen übernommener Events; Beschlussfähigkeit, Stimmen-Prüfung,
Wiederholung und Aktionen finden Abstimmungen und Wahlen in beliebiger Tiefe. Mit dem Cursor in den Notizen fügt `/thema` (oder
der Baustein-Button) das Thema dort ein, im innersten Baustein, der es aufnehmen kann; sonst steht es auf oberster Ebene.

**Bausteine in Aufzählungen:** Fügt man in den Notizen eines Bausteins aus einem Listenpunkt heraus einen verschachtelbaren
Baustein (Abstimmung, Meinungsbild, Wahl, Auswahl, Todo, Thema, Erscheint/Geht) oder ein Zitat ein, steht er als Kind eines
Listenpunkts (`ListenPunkt` in `schema.ts`: Inhalt `paragraph (block | notizbaustein | thema)*`, also immer hinter dem Text des
Punkts) und wird ohne Aufzählungspunkt, eingerückt auf Höhe dieses Punkts gezeigt; die folgenden Punkte behalten ihre Ebene
(Platzierung: `listenStelle` in `einfuegen.ts`):

- Leerer Punkt (nur der Rest des getippten `/…`), außer dem ersten Punkt einer Liste direkt in den Notizen: Er bleibt auf seiner Ebene als
  `listItem(leerer Absatz, Baustein)`; Aufzählungspunkt und leere Zeile werden ausgeblendet (Editor: Dekoration `pk-ohne-punkt` aus `schema.ts`
  - CSS in `protokoll.css`; Dokument-Ansicht und PDF: `istBlockPunkt`).
- Leerer erster Punkt einer Liste direkt in den Notizen: Der Punkt entfällt, der Baustein steht vor der Liste (war es der einzige Punkt, ersetzt er die Liste).
- Punkt mit Text (oder mit Unterliste): Der Baustein steht direkt hinter dem Text im selben Punkt; ein leerer Folgeabsatz im Punkt wird ersetzt.
- Hinter dem Punkt mit dem Baustein folgt immer ein leerer Punkt auf gleicher Ebene (wird angelegt, außer der nächste ist schon leer); der Cursor
  springt dorthin (Erscheint/Geht) bzw. er ist per Klick erreichbar. Enter auf der leeren letzten Zeile eines Zitats im Punkt setzt den Cursor
  in diesen Folgepunkt (`zitatInPunktVerlassen`), statt eine Ebene höher zu springen.
- Punkte nur aus leeren Absätzen zeigen Dokument-Ansicht und PDF nirgends als Aufzählungspunkt (auch nicht mitten in den Notizen).
- Top-Level-Bausteine (Event usw.) und alle Listen auf oberster Ebene eines Abschnitts verhalten sich wie vorher (hinter dem Block des Abschnitts).

Prüfung und Auswertungen laufen rekursiv: Die Todo-Regel („nur in Notizen“) richtet sich nach dem umgebenden Baustein, nicht nach der
Tiefe (`knotenFehler`); Gliederung (auch Ziehen, Einfügen neben die Liste), Dokument-Ansicht (`Knoten` rendert wie sonst) und PDF
(`knotenInListe`) zeigen Bausteine in Listenpunkten wie anderswo.

## Slash-Befehle und Button „Baustein“

- `/` im Dokument öffnet das Menü der Bausteine; Weitertippen filtert (`/ev`, auch Aliasse wie `/rueckblick`, Umlaute
  schreibt man aus oder normal). Pfeiltasten, Enter, Tab, Escape und Antippen funktionieren.
- **Zweite Stufe:** `/event` + Enter zeigt „Ohne Vorlage“ und alle nicht archivierten Vorlagen (filterbar: `/event bar`).
  Die Vorlage füllt Name, Uhrzeiten, Dauer und Dienste, das Datum bleibt leer. `/vergangenes` + Enter zeigt „Ohne
  Kalender-Event“ und die vergangenen, nicht abgesagten Events der letzten rund drei Monate vor der Sitzung (die Sitzung selbst
  nicht).
- Thema (`/thema`, Aliasse `/punkt`, `/top`, `/tagesordnungspunkt`; Cursor ins Feld „Titel“), Todo (`/todo`, Aliasse `/aufgabe`, `/aufgaben`; Cursor ins Feld „Titel“), Anwärter:in, Aufnahme, Meinungsbild (`/meinungsbild`, Alias `/stimmungsbild`),
  Wahl (`/wahl`, Aliasse `/waehlen`, `/wahlen`, `/postenwahl`; Cursor ins Feld „Posten“) und Neues EM (`/em`, `/ehrenmitglied`) werden direkt eingefügt. Bei der Aufnahme springt der Cursor ins Feld „Person“, beim
  Meinungsbild ins Feld „Frage“; das Meinungsbild zeigt „Anwesend: x Personen (ohne Gäste)“ (nur Info). Innerhalb einer
  Abstimmung, eines Meinungsbilds, einer Wahl, einer Auswahl oder eines Todos bietet das Menü Abstimmung, Meinungsbild, Wahl und Todo nicht an; Todo fehlt außerdem auf oberster Ebene (außerhalb jedes Bausteins). Beim Neuen EM springt der Cursor ins Feld
  „Person“ (durchsuchbar, Teilnahmeliste und EMs; ohne Person erscheint „Name (falls nicht in der App)“); der Schalter „Abstimmung“
  blendet Ja / Nein / Enthaltung und Ergebnis wie bei der Abstimmung samt Hinweis zur Beschlussfähigkeit ein.
- Die **Abstimmung** (`/abstimmung`, Alias `/beschluss`) hat eine zweite Stufe: `/abstimmung` + Enter zeigt „Ja / Nein“ (die Abstimmung mit Antrag) und „Mehrere Möglichkeiten“ (die Auswahl), filterbar (`/abstimmung meh`). Die Auswahl lässt sich auch direkt mit `/auswahl`, `/mehrfach` oder `/mehrfachauswahl` einfügen (nur mit Suchtext, nicht in der Liste); Cursor ins Feld „Frage“. Das Symbol-Menü „Baustein“ öffnet dieselbe zweite Stufe.
- **Erscheint / Geht** (`/erscheint`, `/kommt`, `/geht`, `/verlaesst`): Enter öffnet die zweite Stufe mit den Personen der
  Teilnahmeliste, filterbar (`/erscheint jul`). Bei Erscheint stehen zuerst die, die zu Beginn nicht da waren, bei Geht die
  Anwesenden; dann Mitglieder vor den übrigen, nach Name. Das Auswählen fügt den Baustein Anwesenheit ein (Uhrzeit = aktuelle
  Berliner Zeit, immer; wählt man die Person erst im Baustein und die Uhrzeit ist noch leer, wird sie ebenso gefüllt); der Cursor springt dahinter in den nächsten Absatz (bei Bedarf wird einer angelegt). Der Baustein ist eine Zeile (Person, erscheint/geht,
  Uhrzeit; „Erscheint“ bzw. „Geht“ steht fest und lässt sich nicht umschalten, dafür Baustein entfernen und neu einfügen) mit „12 von 25 Mitgliedern anwesend“ und bei Wechsel „→ Jetzt beschlussfähig“ bzw. „→ Nicht mehr beschlussfähig“
  ohne Freitext. Eine **Abstimmung** (und eine Aufnahme, Wahl) zeigt „Anwesend: x von y Mitgliedern“, bei fehlender
  Beschlussfähigkeit rot „Nicht beschlussfähig“ und die Zeile „Stimmen: 4 von 5“ (Wahl: „Stimmen: 7 von 10 (5 × 2)“, je Stichwahl eine
  Zeile), bei Abweichung orange.
  **Erscheint und Geht setzen den Kopf:** Bekommt ein solcher Baustein eine Person (beim Einfügen oder später im Formular) und gilt sie im
  Kopf nicht als `anwesend`, setzt das die Überschreibung `anwesend` (`kopfNachAnwesenheit` in `protokoll/anwesenheit.ts`); die Person ist
  danach gesperrt (siehe Kopf). Entfernen aller Bausteine löst die Sperre, die Überschreibung bleibt „da“.
- **Notizen** neuer Event-, Thema- und Vergangenes-Event-Bausteine beginnen mit einer leeren Aufzählung.
- **Zitat** (`/zitat`, `/quote`) ist kein Baustein: Es macht den aktuellen Absatz am Cursor zum Zitat (Knoten `blockquote`,
  nur Absätze darin) und lässt den Cursor darin. Das geht überall, auch im Freitext („Notizen“) eines Bausteins; „— Name“ ist
  einfach eine weitere Zeile. In einem Listenpunkt wird es zum Kind des Listenpunkts (siehe „Bausteine in Aufzählungen“) statt den Text des Punkts zu umschließen. Derselbe Eintrag steht im Menü „Baustein“, dazu der Zitat-Button der Werkzeugleiste. Die API
  prüft `blockquote` wie jeden anderen Knoten (Struktur, Tiefe).
- **Bild** (`/bild`, `/foto`, `/image`) öffnet die Dateiauswahl und lädt das Bild hoch, siehe [Bilder](./ansicht-pdf.md#bilder). Es kommt hinter den
  aktuellen Block, im Freitext eines Bausteins (auch einer Abstimmung) in dessen Notizen.
- Der Baustein kommt hinter den aktuellen Block (ein leerer Absatz wird ersetzt, im Freitext eines Bausteins dahinter; keine
  Verschachtelung). Abstimmung, Meinungsbild, Wahl, Todo, Thema und Erscheint/Geht kommen dagegen in die Notizen am Cursor (leerer Absatz ersetzt, sonst hinter
  dem aktuellen Block dort).
  `/` öffnet das Menü auch in Listenpunkten (Aufzählung und nummerierte Liste, auch in den Notizen eines Bausteins), nicht in
  Zitaten. In Notizen kommen verschachtelbare Bausteine und Zitate in den Listenpunkt (siehe „Bausteine in Aufzählungen“);
  auf oberster Ebene eines Abschnitts (Liste direkt im Abschnitt) wird ein leerer letzter Listenpunkt entfernt (bei einem einzigen
  Punkt die ganze Liste) und der Baustein kommt hinter den Block des Abschnitts. Der **Cursor springt ins erste leere Feld** (Event: Name, dann Datum, Abstimmung: Antrag, Meinungsbild: Frage, Wahl: Posten, Aufnahme: Person, sonst der
  Freitext).
- Auf dem Handy ist `/` umständlich: Die Werkzeugleiste (klebt unter dem Header) hat den Button **„Baustein“** mit demselben
  Menü, dazu fett, kursiv, Überschriften, Listen, Link, Rückgängig/Wiederholen.

## Erwähnungen

`@` im Freitext (Absätze, auch in Listen, Zitaten und den Notizen eines Bausteins; nicht in Überschriften und nicht in den
Formularfeldern der Bausteine) öffnet eine Liste zum Erwähnen: zuerst die Gruppen **Anwärter:innen**, **Mitglieder**,
**EMs**, **Aktive** (Anwärter:innen und Mitglieder) und **Alle** (Anwärter:innen, Mitglieder und EMs, keine Externen), dann
die Mitglieder als „username (Vorname Nachname)“, Externe zuletzt. Die Liste filtert beim Tippen (`erwaehnungEintraege` in
`protokoll/erwaehnungLogik.ts`, getestet) und nutzt `SlashPopup` (Handy: Vollbreite über der Tastatur). Während das
`/`-Menü offen ist, bleibt `@` Teil dessen Eingabe (die Erweiterung hat niedrigere Priorität und prüft den Zustand des
`/`-Menüs). Die Auswahl fügt den Knoten `erwaehnung` (inline, atomar) plus ein Leerzeichen ein.

- **Knoten:** `attrs` = `{ art: 'person', sub }` oder `{ art: 'gruppe', gruppe }` (`anwaerter | mitglieder | ems | aktive |
alle`). Gespeichert wird nur die Referenz, der Name wird beim Anzeigen aufgelöst (Username, sonst „Vorname Nachname“).
  Shared: `ERWAEHNUNG_GRUPPEN`, `erwaehnungAttrs`, `erwaehnungBetrifft`; die API prüft die Attribute in `knotenFehler`
  („Eine Erwähnung ist ungültig.“), Dokumente ohne Erwähnungen bleiben gültig.
- **Betrifft dich:** die Person selbst, oder eine Gruppe, zu der dein **aktueller** Status gehört (nicht der Status zur Sitzung).
- **Editor:** Person als `@username` fett in Statusfarbe, Gruppe als `@Mitglieder` in normaler Schrift.
- **Dokumentansicht:** Person als `StatusName` mit Link auf die Mitgliederseite, Gruppe als Text. Was dich betrifft, hat einen
  **Textmarker** (`<mark class="pk-dok-erw-ich">`, hell und dunkel lesbar, im Druck ohne) und einen Anker (`dok-erw-<n>`).
  `DokumentEingabe` trägt dafür `mitglieder` (alle Mitglieder) und `ich` (Sub und aktueller Status); ohne `ich` gibt es weder
  Textmarker noch Übersicht.
- **Meine Erwähnungen:** unter der Gliederung (Seitenleiste ab `lg`, sonst in der Schublade). Jeder Eintrag zeigt die nächste
  Überschrift davor und einen Textauszug; Antippen scrollt zur Erwähnung (am Handy schließt sich die Schublade). Ohne Treffer:
  „Du wirst in diesem Protokoll nicht erwähnt.“ (`meineErwaehnungen`, getestet.)
- **Event-Verantwortliche:** Die verantwortliche Person eines Events steht ohne „@“ im Dokument und im PDF, zählt aber als
  Erwähnung: Bist du es, ist dein Name mit Textmarker hinterlegt und das Event steht unter „Meine Erwähnungen“.
- **Todo-Zuständige:** Ein Todo-Baustein, in dem du zuständig bist (als Person oder über eine Gruppe deines aktuellen Status), zählt
  ebenfalls als Erwähnung: Eintrag „Todo: Titel“ unter „Meine Erwähnungen“, der Name in der Todo-Zeile hat den Textmarker.
- **PDF und Druck:** `@username` (fett in Statusfarbe) bzw. `@Mitglieder`, ohne Textmarker, da das PDF für alle gleich ist.
