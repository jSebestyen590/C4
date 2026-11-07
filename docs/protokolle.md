# Protokolle

Sitzungsprotokolle der Mitgliederversammlungen und Sitzungen. Ein Protokoll gehört zu genau einem Sitzungs-Event und besteht
aus dem **Kopf** (Teilnahme, EMs, Gäste) und einem **Dokument** mit vier festen Abschnitten (Vergangenes, Gegenwärtiges,
Zukünftiges, Sonstiges), in dem Text und **Bausteine** stehen. Rechte: `protokolle:lesen` (alle Status: ansehen, drucken),
`protokolle:schreiben` (anlegen, bearbeiten, abschließen, löschen). Das Schreibrecht geben Admins immer, sonst ein Posten
(`POSTEN_RECHTE`, siehe [posten.md](./posten.md)).

## Datenmodell

Tabelle `protokolle`: `id`, `event_id` (eindeutig), `inhalt` (Text, TipTap-JSON), `kopf` (Text, JSON), `status`
(`entwurf`/`abgeschlossen`), `version` (zählt bei jeder Änderung hoch), `erstellt_von/_am`, `geaendert_von/_am`. Migrationen
`0110`–`0113` (siehe [datenbank.md](./datenbank.md)); `event_kategorien.protokoll` ist das Sitzungs-Häkchen, `event_kategorien.protokoll_art` die Art der Sitzung.

Code: Typen, Prüfung, Vorbelegung in `packages/shared/src/protokolle.ts` (kennt TipTap nicht, nur die Knotenformen), Store
`packages/api/src/protokolle.ts`, Listen und Schnappschuss `protokolleAnsicht.ts`, Routen in `app.ts`, Web unter
`packages/web/src/protokoll/` (Editor), `ProtokollKopf.tsx`, `useProtokollAutosave.ts` und `pages/Protokoll*.tsx`.

## Sitzungen

- Eine Kategorie mit Teilnahme bekommt in der Kalender-Einrichtung das Häkchen **„Sitzung mit Protokoll“**
  (`event_kategorien.protokoll`; für Dienste-Kategorien 400). Events dieser Kategorie sind Sitzungen. Siehe auch
  [kalender.md](./kalender.md).
- **Art der Sitzung** (`protokollArt` an der Kategorie, `sitzung` oder `mitgliederversammlung`, Standard `sitzung`) bestimmt
  die Beschlussfähigkeit: Sitzung = mehr als die Hälfte der Mitglieder, Mitgliederversammlung = mehr als zwei Drittel.
  Gezählt werden nur Teilnehmende mit Status `mitglied` (nicht Anwärter:in, EM, Extern). Wer „da“ (`anwesend`) ist, zählt ab Beginn,
  **außer** wenn sein erster Anwesenheits-Baustein (in Dokument-Reihenfolge) ein „Erscheint“ ist: Dann zählt er erst ab diesem
  Baustein. Wessen erster Baustein „Geht“ ist, zählt zu Beginn mit; „Geht“ nimmt ihn heraus, „Erscheint“ holt ihn wieder dazu (`anwesenheitsVerlauf` in
  `packages/shared/src/protokollAnwesenheit.ts`, das den Stand auch an jeder Abstimmung, Aufnahme und jedem Neuen EM festhält; für das Meinungsbild zählt es alle Anwesenden
  (jeder Status plus gewählte EMs, Gäste sind Freitext und zählen nicht) als `anwesendePersonen`).
- Je Event gibt es höchstens ein Protokoll (eindeutiger Index; ein zweites gibt 409). Abgesagte Events und Events anderer
  Kategorien nimmt die API nicht an (400).
- **Löschschutz:** Ein Event mit Protokoll lässt sich nicht löschen (409); erst das Protokoll löschen (nur im Entwurf).
- **Serien** löschen oder ersetzen ein Event mit Protokoll nie: Es zählt in Serienänderungen als geändert und bleibt.

## Kopf

Der Kopf ist ein Formular über dem Dokument, nicht Teil des Editors (`kopf` als JSON).

- **Teilnahme** aller aktiven Anwärter:innen und Mitglieder (ohne Deaktivierte und Externe) mit den drei Werten `anwesend`,
  `entschuldigt`, `unentschuldigt` (Anzeige „da / entsch. / fehlt“). Der Wert `verspaetet` bleibt nur für alte Daten im Schema
  und gilt überall als `anwesend` (`teilnahmeNormalisiert`); die API liefert ihn nie, der Schnappschuss speichert `anwesend`.
- **Feste Teilnahme:** Wer in einem Baustein Erscheint oder Geht steht, ist im Kopf auf „da“ festgestellt (Auswahl gesperrt) und
  zeigt seine Zeiten aus den Bausteinen: „ab 21:00“ (erstes Erscheint), „bis 22:10“ (letztes Geht) oder „ab 21:00 · bis 22:10“
  (`anwesenheitsZeiten`, live aus dem Dokument, auch lesend). Entfällt die Person aus allen Bausteinen, endet die Sperre.
- **Ableitung** aus den eigenen Antworten auf das Sitzungs-Event (`teilnahmeAbleiten`): Zusage = anwesend, Absage =
  entschuldigt, keine Antwort = unentschuldigt.
- **Nur Überschreibungen** stehen im `kopf` (`teilnahme`: Mitglied → Wert). Alle anderen folgen im Entwurf live dem Event; ein
  Punkt markiert Abweichungen. „Aus der Sitzung übernehmen“ verwirft alle Überschreibungen. Wählt man wieder den abgeleiteten
  Wert, entfällt die Überschreibung. Auf dem Handy ist die Liste eingeklappt.
- **EMs:** Auswahl aus den aktiven EM-Mitgliedern plus Freitext (`emsFreitext`). Ohne Auswahl (`ems: null`) gelten die EMs mit
  Zusage; wer ausgewählt wird, ersetzt diese Ableitung.
- **Gäste:** nur Freitext.
- **Sitzungsleitung, Protokollführung** (`sitzungsleitung`, `protokollfuehrung`, je ein Mitglied oder leer; beim Anlegen
  wird die Protokollführung auf die anlegende Person gesetzt), **Eröffnung** (`eroeffnung`, `HH:MM`). Im Formular sind „Sitzungsleitung“ und
  „Protokoll“ durchsuchbare Auswahlfelder („username (Vorname Nachname)“), „Eröffnung“ ein Zeitfeld. Lesend steht alles als Text im Kopf.
  `verspaetung` (Zeit je Mitglied) bleibt nur aus Kompatibilität im Schema, wird nicht mehr geschrieben oder angezeigt.
- **Automatisch „da“:** Bekommt ein Baustein Erscheint oder Geht eine Person (Einfügen oder Personenwechsel) und gilt sie im Kopf nicht
  als `anwesend`, setzt das die Überschreibung `anwesend` (`kopfNachAnwesenheit`), siehe Slash-Befehle.
- **Beschlussfähigkeit:** Der Kopf zeigt live „Beschlussfähig: 13 von 25 Mitgliedern anwesend (nötig: 13)“ (rot: „Nicht
  beschlussfähig“) aus der Teilnahme zu Beginn (ohne die, die später per Erscheint kommen) und der Art der Sitzung.
- **Nächste Sitzung** (`naechsteSitzung`): `null` = automatisch, sonst `{ eventId, datum, uhrzeit }` von Hand. Automatisch ist die
  erste nicht abgesagte Sitzung nach dieser (jede Kategorie mit Häkchen „Sitzung mit Protokoll“, jede Art; live aus dem Kalender,
  `kommendeSitzungen`). Im Bearbeiten-Modus steht unter dem Editor die Karte „Nächste Sitzung“
  (`protokoll/NaechsteSitzungKarte.tsx`, nicht Teil des Dokuments): Wert „Di, 10.11.2026, 20:00 · Sitzung (aus dem Kalender)“ mit „Im Kalender
  öffnen“ (neuer Tab); „Ändern“ blendet eine Auswahl der kommenden Sitzungen oder Datum und Uhrzeit ein, „Automatisch“ setzt zurück.
- **Schnappschuss:** „Abschließen“ friert Teilnahme, gewählte EMs, den Mitglieds-Status aller Teilnehmenden, die Art der Sitzung und den
  automatischen Vorschlag für die nächste Sitzung ein
  (`schnappschuss`, `emsSchnappschuss`, `statusSchnappschuss`, `artSchnappschuss`, `naechsteSitzungSchnappschuss`). Danach zeigt
  das Protokoll genau diese Personen und Werte; spätere Zu- oder Absagen, Statuswechsel oder Deaktivierungen ändern sie nicht.
  „Wieder öffnen“ verwirft den Schnappschuss, der Entwurf folgt wieder dem Event. Den Schnappschuss setzt nur die API, ein
  Speichern des Entwurfs löscht ihn.

## Dokument und Bausteine

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

| Baustein (Knoten)                              | Felder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event (`bausteinEvent`)                        | Vorlage (`vorlageId`, optional), Name, Datum (bei mehreren Tagen von/bis), Beginn und Ende, Dienste (Schichten im Format der Vorlage), Verantwortliche:r, Kategorie (`kategorieId`, nötig zum Anlegen, Standard `null`), Kalender-Event (`eventId`, mit Link „Im Kalender öffnen“ in neuem Tab, auch bei Vergangenes Event)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Anwesenheit (`bausteinAnwesenheit`)            | Art (`erscheint`/`geht`), Mitglied (`sub`), Uhrzeit (`HH:MM`, optional); ohne Freitext (Atom, kein `content`; alte Bausteine mit Absatz werden beim Laden bereinigt); kommt nicht in den Vorschlag fürs nächste Protokoll                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Thema (`bausteinThema`)                        | Titel (`titel`, höchstens 200 Zeichen, Standard leer). Allgemeiner Punkt ohne weitere Felder; auf oberster Ebene oder verschachtelt (siehe unten), in den Notizen sind Abstimmung, Meinungsbild und Wahl möglich; kommt nicht in den Vorschlag fürs nächste Protokoll, keine Aktionen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Vergangenes Event (`bausteinVergangenesEvent`) | Kalender-Event (`eventId`) oder Name und Datum von Hand                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Anwärter:in (`bausteinAnwaerter`)              | Vorname, Nachname, E-Mail (optional), `sub` (das Konto nach der Einladung, Standard `null`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Abstimmung (`bausteinBeschluss`)               | Antrag, Ja / Nein / Enthaltung (`ZahlFeld`), Ergebnis `angenommen`/`abgelehnt` (aus den Stimmen vorgeschlagen, überschreibbar; Gleichstand = abgelehnt, ohne Ja- und Nein-Stimmen kein Vorschlag); nur Mitglieder stimmen, verbindlich. Der Knotenname bleibt `bausteinBeschluss` (alte Daten gelten weiter)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Neues EM (`bausteinEm`)                        | Person (`sub`) oder Name als Freitext (`name`, nur ohne `sub`), optional Abstimmung (`abstimmung`: Ja / Nein / Enthaltung und Ergebnis wie bei der Abstimmung, sonst `null`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Aufnahme (`bausteinAufnahme`)                  | Person (`sub`, zuerst die Anwärter:innen der Teilnahmeliste) oder Name als Freitext (`name`, nur ohne `sub`), `abstimmung` immer vorhanden (Ja / Nein / Enthaltung und Ergebnis wie bei der Abstimmung, Beschlussfähigkeit wie dort)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Meinungsbild (`bausteinMeinungsbild`)          | Frage (`frage`, höchstens 500 Zeichen), Optionen (`optionen`: Text höchstens 100 Zeichen und Stimmen, höchstens 12; neu: Ja / Nein / Enthaltung). Unverbindlich, alle Anwesenden stimmen, keine Beschlussfähigkeit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Wahl (`bausteinWahl`)                          | Posten (`posten`, höchstens 200 Zeichen: Auswahl aus den nicht archivierten Posten der App oder Freitext; passt der Text zu einem Posten, steht dessen Id in `postenId`, sonst `null`), „Gilt ab“ (`gueltigAb`, `YYYY-MM-DD` oder leer; neu vorbelegt mit `wahlGueltigAbVorschlag`: nach dem 01.11. der 01.01. des nächsten Jahres, sonst der heutige Tag), Anzahl zu wählen (`anzahl`, 1–20, Standard 1), Stimmen pro Person (`stimmenProPerson`, 1–20 oder `null` = wie `anzahl`; alte Daten ohne das Feld gelten weiter), Kandidat:innen (`kandidaten`, höchstens 30: `id`, Person `sub`, Stimmen; nur Personen der App, alte Daten mit Freitext-`name` ohne `sub` werden weiter angezeigt), `enthaltung`, Stichwahlen (`stichwahlen`, höchstens 10: Stimmen je Kandidat:in und Enthaltung), `nichtAngetreten` (Personen der App, die vorgeschlagen wurden, aber nicht antreten; höchstens 30, nur Anzeige; Mehrfachauswahl „Vorgeschlagen, tritt nicht an“) und `annahme` (je Kandidat-Id `false`, wenn die gewählte Person die Wahl nicht annimmt; fehlt der Eintrag, nimmt sie an). Nur Mitglieder stimmen, Beschlussfähigkeit wie bei der Abstimmung (`anwesenheitsVerlauf`), Ergebnis siehe unten |

Alte Wahlen ohne `postenId`, `gueltigAb`, `stimmenProPerson`, `nichtAngetreten` und `annahme` bleiben gültig (Standard `null`, leer bzw. `[]`/`{}`).

**Wiederholung (`wiederholung`):** Abstimmung, Neues EM (mit Abstimmung), Aufnahme und Wahl haben das optionale Feld
`wiederholung` (`{ datum, sitzung }` oder `null`, Standard `null`, alte Daten bleiben gültig). Es steht an Abstimmungen, die
`protokollVorschlag` aus einer nicht beschlussfähigen Sitzung übernommen hat (siehe [Vorbelegung](#vorbelegung-eines-neuen-protokolls)).
Der Editor zeigt oben im Baustein den Hinweis „Wiederholung der Abstimmung vom 05.11.2026 (Sitzung), damals nicht
beschlussfähig.“ (Wahl: „… der Wahl …“, Aufnahme: „… der Aufnahme-Abstimmung …“), die Dokumentansicht dieselbe Zeile klein im Block.

**Stimmen müssen zur Anwesenheit passen (`stimmenPruefen` in `protokollStimmen.ts`):** Jede Abstimmung, die Abstimmung eines
Neuen EM (falls vorhanden), jede Aufnahme und jede Wahl braucht **genau so viele Stimmen, wie Mitglieder an der Stelle anwesend
sind** (dieselbe Zahl wie „Anwesend: x von y Mitgliedern“, `anwesenheitsVerlauf`). Abstimmung: Ja + Nein + Enthaltung = x. Wahl,
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

**Wahl, Annahme:** Nach dem Ergebnis hat jede gewählte Person im Editor einen Schalter „<Name> nimmt die Wahl an“ (Standard: an).
Schaltet man ihn aus (`annahme[id] = false`), wird das Ergebnis so berechnet, als stünde die Person nicht auf der Liste: gleiche
Stimmen, gleiche Stichwahl-Regeln, die Nächstplatzierte rückt nach (ein Gleichstand an der neuen Grenze braucht wie üblich eine
Stichwahl). Das wiederholt sich, bis keine gewählte Person mehr abgelehnt hat. `wahlErgebnis` liefert dann nur die Annehmenden in
`gewaehlt` und die Übersprungenen in `abgelehnt` (ihr Schalter bleibt, aus, und lässt sich wieder einschalten). Absagen von nicht
gewählten Personen haben keine Wirkung. Gespeicherte Stichwahlen gehören zur Runde `i` und gelten dafür per Kandidat-Id weiter;
`wahlRunden` zeigt und prüft zuerst die Runden, wie sie ohne Absagen stattfanden (die Stimmen wurden dafür abgegeben), danach nur
durch Absagen nötig gewordene. Die Stimmen-Prüfung, die Dokumentansicht und die Aktion `wahl.posten` nutzen dieses Ergebnis.

**Abstimmung, Meinungsbild und Wahl in anderen Bausteinen:** Diese drei (`BAUSTEINE_IN_NOTIZEN`) lassen sich auch in den Notizen
eines anderen Bausteins (z. B. eines Events oder Themas) an der Cursor-Stelle einfügen, nicht ineinander. Alle anderen Bausteine bleiben
auf oberster Ebene. Im Editor erlaubt das die Knotengruppe `innerbaustein` (`BausteinKnoten.tsx`); steht so ein Baustein am
Ende der Notizen, kommt ein leerer Absatz dahinter. `protokollVorschlag` übernimmt sie nicht ins nächste Protokoll.

**Verschachtelte Themen:** Ein Thema darf in den Notizen jedes Bausteins mit Notizen stehen, der kein Abstimmungs-Baustein ist
(Event, Vergangenes Event, Anwärter:in, Aufnahme, Neues EM) und in den Notizen eines anderen Themas, beliebig tief
(`kannBausteineEnthalten`, `istVerschachtelbar`, `darfInNotizen` in `protokolle.ts`). Abstimmung, Meinungsbild und Wahl bleiben in jedem
(auch verschachtelten) Thema erlaubt. Alle anderen Bausteine bleiben auf oberster Ebene. Im Editor ist das die Knotengruppe `thema`
(Thema ist kein `block`, steht also nicht in Listen oder Zitaten). Alte Dokumente bleiben gültig. Im Vorschlag fürs nächste
Protokoll entfallen verschachtelte Themen samt Inhalt aus den Notizen übernommener Events; Beschlussfähigkeit, Stimmen-Prüfung,
Wiederholung und Aktionen finden Abstimmungen und Wahlen in beliebiger Tiefe. Mit dem Cursor in den Notizen fügt `/thema` (oder
der Baustein-Button) das Thema dort ein, im innersten Baustein, der es aufnehmen kann; sonst steht es auf oberster Ebene.

Die Feld-Schemata (`BAUSTEIN_DATEN_SCHEMAS`) prüft die API streng, im Entwurf dürfen Felder leer sein. Das übrige Dokument
prüft sie nur in der Struktur (Knotentypen, Tiefe höchstens 30, höchstens 500 KB).

**Einschränkungen der Dienste** im Event-Baustein: Sie sind eine Planung, kein Eintrag im Kalender. Je Dienst lassen sich nur
Zeiten und Anzahlen (Minimum, Wunsch) ändern, Schichten lassen sich nicht hinzufügen oder entfernen (höchstens 20), und die
Vorlage bestimmt die Dienstformen. Die Uhrzeitfelder entfallen bei ganztägigen Kategorien, das Bis-Datum erscheint bei
mehrtägigen.

## Gliederung (Verschieben)

Im Bearbeiten-Modus zeigt die **Gliederung** (`protokoll/GliederungBaum.tsx`, Logik und Tests in `protokoll/gliederung.ts`) alle
Bausteine als Baum: die vier Abschnitte, darunter ihre Bausteine in Dokument-Reihenfolge (Freitext fehlt), darunter die
Bausteine in den Notizen eines Bausteins (Abstimmung, Meinungsbild, Wahl, Themen – diese mehrstufig), je Tiefe eingerückt (höchstens vier Stufen). Jeder Eintrag zeigt Symbol und Kurztitel
(z. B. „11.02. Superbowl“, bei einem Thema dessen Titel, „Abstimmung: …“, „Wahl: …“, „<Name> erscheint“). Ein Tipp scrollt den Editor zum Baustein.

- **Layout:** Ab `lg` steht die Gliederung als mitlaufende Spalte rechts neben dem Editor. Darunter gibt es in der Werkzeugleiste
  den Knopf „Gliederung“; er öffnet sie als Schublade von rechts (ein Wisch vom rechten Rand ist nicht eingebaut).
- **Verschieben:** Am Griff ziehen (am Handy lange drücken, dann ziehen). Ein Baustein darf in jeden Abschnitt (auch in einen
  leeren) und an jede Stelle der Liste. Abstimmung, Meinungsbild, Wahl und Thema dürfen zusätzlich in die Notizen eines anderen
  Bausteins (nicht in eine Abstimmung, ein Meinungsbild oder eine Wahl; auch in die Notizen verschachtelter Themen) und von dort
  wieder auf Abschnittsebene. Alle anderen Bausteine lassen sich nicht in Notizen ablegen. Ein Baustein nimmt seine Notizen samt
  verschachtelten Bausteinen mit; ein Thema in sein eigenes Thema (oder dessen Nachfahren) zu legen geht nicht (diese Zeilen sind beim Ziehen eingeklappt).
- **Technik:** Die Gliederung ist **eine** flache Liste (ein `Droppable`): Abschnittskopf (nicht ziehbar), Baustein, verschachtelter
  Baustein (nach Tiefe eingerückt, Tiefe-zuerst-Reihenfolge, „In die Notizen“ hinter den Kindern jedes Bausteins mit Notizen). Die Menge der Zeilen ist immer gleich (pangea erlaubt kein Hinzufügen/Entfernen während des Ziehens); nicht nutzbare Zeilen
  haben Höhe 0 (`inert`). Hinter jedem Baustein mit Notizen (nicht Abstimmung/Meinungsbild/Wahl/Anwesenheit) steht eine Zeile „In die
  Notizen“, die nur beim Ziehen eines verschachtelbaren Bausteins aufgeklappt ist; die verschachtelten Zeilen eines gezogenen
  Bausteins sind eingeklappt. Das Ziel
  ergibt sich aus der ersten aufgeklappten Zeile **darunter** (`gliederungZiel` in `gliederung.ts`, getestet): ist es ein verschachtelter
  Baustein, kommt der gezogene davor in dessen Notizen (bei „In die Notizen“ ans Ende); nicht verschachtelbare Bausteine landen
  stattdessen direkt hinter dem Eltern-Baustein. Sonst steht er auf Abschnittsebene in dem Abschnitt der Zeile darüber (direkt
  unter dem Abschnittskopf: an erster Stelle), vor dem nächsten Baustein. Schlägt der Zug fehl, erscheint „Verschieben hat nicht
  geklappt.“ und die Gliederung bleibt bedienbar.
- **Position:** „Als i-ter“ heißt direkt vor dem i-ten Baustein der Liste, am Ende hinter dem letzten Baustein bzw. (leere
  Liste) vor dem leeren Schluss-Absatz. Freitext bleibt, wo er ist. Der Zug ist **eine** Transaktion (Einfügen + Löschen):
  Rückgängig macht ihn in einem Schritt rückgängig, das Autospeichern greift wie sonst; die vier Abschnitte bleiben intakt.
- `Alt`+`↑` / `Alt`+`↓` verschiebt weiterhin den Block am Cursor um einen Platz (`protokoll/verschieben.ts`).

## Dokumentansicht

Das fertige Protokoll wie früher in Word (`ProtokollDokumentAnsicht`, Ableitung in `protokoll/dokumentDaten.ts`, getestet).
Schreibende sehen im Entwurf den Umschalter „Bearbeiten“ / „Dokument“ (der Editor bleibt dabei erhalten, die Ansicht zeigt den
aktuellen, auch ungespeicherten Stand von Kopf und Editor); Lesende und abgeschlossene Protokolle zeigen nur das Dokument.
Das Dokument ist höchstens etwa so breit wie eine A4-Seite (21 cm) und steht mittig.

**Gliederung der Dokumentansicht** (`DokumentGliederung`, Ableitung `dokumentUeberschriften` in `protokoll/dokumentUeberschriften.ts`,
getestet): nur Überschriften – die Abschnitte, Bausteine, die als Überschrift stehen (Event, Thema, Vergangenes Event, Anwärter:in,
Aufnahme, Neues EM) und im Freitext getippte Überschriften; keine Abstimmungen, Meinungsbilder, Wahlen, Anwesenheitszeilen oder
Kopf. Verschachtelt nach Ebene (Abschnitt > Überschrift > verschachteltes Thema / Zwischenüberschrift > …, bis `h6`); jede Überschrift trägt einen Anker (`id`), den
die Ansicht setzt. Ab `lg` steht sie als sticky Seitenleiste rechts neben dem Dokument, darunter öffnet der Button „Gliederung“ eine
Schublade von rechts; Antippen scrollt weich zur Überschrift (unter dem Header) und schließt sie. Für alle sichtbar (auch
Lesende und abgeschlossene Protokolle), ohne Überschriften entfällt sie, gedruckt wird sie nicht (`data-druck="aus"`).

- **Titel:** `<Titel der Sitzung> TT.MM.JJJJ` (Datum in Berlin).
- **Kopfzeilen:** „Anwesende Mitglieder“ (alle „da“, auch die aus Erscheint/Geht-Bausteinen, mit „(ab 21:00 Uhr)“, „(bis 22:10 Uhr)“
  oder „(ab 21:00 Uhr, bis 22:10 Uhr)“ aus den Bausteinen; wer fehlt, aber einen Baustein hat, zählt auch hier; gleich bei
  den Anwärter:innen), „Fehlende
  Mitglieder (entschuldigt)“, „(unentschuldigt)“ (immer sichtbar), „EMs“, „Anwärter:innen“ und „Gäste“ (nur wenn gefüllt),
  „Sitzungsleitung“, „Protokoll“. Namen: Benutzername, fett in der Farbe des Status (`StatusName`).
- **Eröffnung:** „<Leitung> eröffnet die Sitzung um 20:04 Uhr.“ (Mitgliederversammlung entsprechend), nur mit Uhrzeit „Die Sitzung
  wird um 20:04 Uhr eröffnet.“, ohne beides entfällt der Satz. Danach die **Beschlussfähigkeit** („13 von 25 Mitgliedern
  anwesend, nötig sind mindestens 13 (mehr als die Hälfte)“); „nicht beschlussfähig“ steht rot.
- **Abschnitte** als große Überschrift in der Primärfarbe (leere zeigen nur die Überschrift, ein leeres Sonstiges entfällt ganz), darin Text mit Absätzen,
  Überschriften, Listen (zweite Ebene „○“), fett, kursiv, Links. Ein **Zitat** ist rechtsbündig und kursiv, eine Zeile mit
  „–“/„—“ davor (Quelle) steht aufrecht.
- **Event:** Überschrift `11.02. Superbowl` (bei mehreren Tagen von–bis), dann der Punkt „Verantwortlich: @Name“ (nur wenn
  gesetzt; steht als erster Punkt in der Aufzählung der Notizen), dann die Notizen. **Vergangenes Event:** Überschrift, Notizen.
  **Thema:** Überschrift mit dem Titel (leer: „Thema“) auf Ebene der Events, in der Gliederung, dann die Notizen. **Anwärter:in:** „Neue:r Anwärter:in: Vorname Nachname“ (ohne E-Mail). **Neues EM:** Überschrift „Neues EM: <Name>“ (Person als
  `StatusName`, sonst der Freitext-Name); mit Abstimmung die Zeile „Abstimmung: Ja 8 · Nein 3 · Enthaltung 2 – angenommen (13 von
  25 Mitgliedern anwesend)“ (rot „nicht beschlussfähig“, wenn zu diesem Zeitpunkt nicht beschlussfähig), ohne Abstimmung keine Zeile;
  danach die Notizen.
- **Abstimmung:** auf oberster Ebene mit Überschrift „Abstimmung: Antrag“ (nicht in der Gliederung), darunter ein Block; in den Notizen eines anderen Bausteins steht „Abstimmung: Antrag“ im Block. Der Block zeigt „Ja 8 · Nein 3 · Enthaltung 2 – angenommen“ und „(13 von 25
  Mitgliedern anwesend)“ (rot „nicht beschlussfähig“, wenn zu diesem Zeitpunkt nicht beschlussfähig).
- **Aufnahme:** Überschrift „Aufnahme: <Name>“ (Person als `StatusName`, sonst Freitext oder nur „Aufnahme“), dann die
  Stimmzeilen genau wie bei der Abstimmung, dann die Notizen.
- **Meinungsbild:** Block „Meinungsbild: Frage“, „Ja 4 · Nein 3 · Enthaltung 2“ (Optionen ohne Text entfallen), klein „(nicht
  bindend)“, dann die Notizen.
- **Wahl:** auf oberster Ebene mit Überschrift „Wahl: Posten (2 Plätze)“ (nicht in der Gliederung; bei einem Platz ohne Anzahl), in Notizen steht diese Zeile im Block. **Reihenfolge:** zuerst die Notizen (die Aussprache davor), zuletzt der blaue Ergebnis-Block, in dem die Abstimmung abschließt; der Block enthält bei gesetztem „Gilt ab“ die Zeile „Gilt ab 01.01.2027“, „Kandidat:innen: A 5 · B 3 · C 3 · Enthaltung 1“, je Stichwahl „Stichwahl: B 4 ·
  C 2 · Enthaltung 0“, dann „Nicht angetreten: X, Y“ (nur wenn gesetzt), „Gewählt: A, B“ (nur Annehmende; oder rot „Noch offen: Stichwahl nötig“), „Nimmt die Wahl nicht an: Z“ (nur wenn jemand abgelehnt hat), „(x von y Mitgliedern anwesend)“ (rot
  „nicht beschlussfähig“). Personen als `StatusName`.
- **Verschachtelt:** Eine Abstimmung, ein Meinungsbild oder eine Wahl in den Notizen eines anderen Bausteins steht dort, eingerückt wie die
  übrigen Notizen, an der Stelle im Text (bei einer Wahl: erst deren Notizen, dann der Block mit der Zeile „Wahl: Posten“).
- **Nächste Sitzung:** letzte Zeile nach allen Abschnitten: „Die nächste Sitzung findet am Dienstag, 10.11.2026 um 20:00 Uhr statt.“
  (ohne Uhrzeit „… am Dienstag, 10.11.2026 statt.“, Berliner Zeit, Wochentag ausgeschrieben; ist nichts bekannt, entfällt sie).
  Es gilt der Wert von Hand aus dem Kopf, sonst der automatische Vorschlag (`naechsteSitzungWert`).
- **Anwesenheit:** rechtsbündige, kursive Zeile wie ein Zitat: „Julia erscheint um 21:00 Uhr.“ / „Strobi geht um 22:10 Uhr.“ (ohne Uhrzeit „Strobi geht.“, ohne Person entfällt sie); ändert
  sich dadurch die Beschlussfähigkeit, steht im selben rechtsbündigen, kursiven Zitat darunter (nicht fett) „Die Sitzung ist jetzt beschlussfähig (…)“ bzw. „… nicht mehr …“.

## Slash-Befehle und Button „Baustein“

- `/` im Dokument öffnet das Menü der Bausteine; Weitertippen filtert (`/ev`, auch Aliasse wie `/rueckblick`, Umlaute
  schreibt man aus oder normal). Pfeiltasten, Enter, Tab, Escape und Antippen funktionieren.
- **Zweite Stufe:** `/event` + Enter zeigt „Ohne Vorlage“ und alle nicht archivierten Vorlagen (filterbar: `/event bar`).
  Die Vorlage füllt Name, Uhrzeiten, Dauer und Dienste, das Datum bleibt leer. `/vergangenes` + Enter zeigt „Ohne
  Kalender-Event“ und die vergangenen, nicht abgesagten Events der letzten rund drei Monate vor der Sitzung (die Sitzung selbst
  nicht).
- Thema (`/thema`, Aliasse `/punkt`, `/top`, `/tagesordnungspunkt`; Cursor ins Feld „Titel“), Anwärter:in, Aufnahme, Abstimmung (`/abstimmung`, Alias `/beschluss`), Meinungsbild (`/meinungsbild`, Alias `/stimmungsbild`),
  Wahl (`/wahl`, Aliasse `/waehlen`, `/wahlen`, `/postenwahl`; Cursor ins Feld „Posten“) und Neues EM (`/em`, `/ehrenmitglied`) werden direkt eingefügt. Bei der Aufnahme springt der Cursor ins Feld „Person“, beim
  Meinungsbild ins Feld „Frage“; das Meinungsbild zeigt „Anwesend: x Personen (ohne Gäste)“ (nur Info). Innerhalb einer
  Abstimmung, eines Meinungsbilds oder einer Wahl bietet das Menü diese drei nicht an. Beim Neuen EM springt der Cursor ins Feld
  „Person“ (durchsuchbar, Teilnahmeliste und EMs; ohne Person erscheint „Name (falls nicht in der App)“); der Schalter „Abstimmung“
  blendet Ja / Nein / Enthaltung und Ergebnis wie bei der Abstimmung samt Hinweis zur Beschlussfähigkeit ein.
- **Erscheint / Geht** (`/erscheint`, `/kommt`, `/geht`, `/verlaesst`): Enter öffnet die zweite Stufe mit den Personen der
  Teilnahmeliste, filterbar (`/erscheint jul`). Bei Erscheint stehen zuerst die, die zu Beginn nicht da waren, bei Geht die
  Anwesenden; dann Mitglieder vor den übrigen, nach Name. Das Auswählen fügt den Baustein Anwesenheit ein (Uhrzeit = aktuelle
  Berliner Zeit, immer; wählt man die Person erst im Baustein und die Uhrzeit ist noch leer, wird sie ebenso gefüllt); der Cursor springt dahinter in den nächsten Absatz (bei Bedarf wird einer angelegt). Der Baustein ist eine Zeile (Person, erscheint/geht,
  Uhrzeit) mit „12 von 25 Mitgliedern anwesend“ und bei Wechsel „→ Jetzt beschlussfähig“ bzw. „→ Nicht mehr beschlussfähig“
  ohne Freitext. Eine **Abstimmung** (und eine Aufnahme, Wahl) zeigt „Anwesend: x von y Mitgliedern“, bei fehlender
  Beschlussfähigkeit rot „Nicht beschlussfähig“ und die Zeile „Stimmen: 4 von 5“ (Wahl: „Stimmen: 7 von 10 (5 × 2)“, je Stichwahl eine
  Zeile), bei Abweichung orange.
  **Erscheint und Geht setzen den Kopf:** Bekommt ein solcher Baustein eine Person (beim Einfügen oder später im Formular) und gilt sie im
  Kopf nicht als `anwesend`, setzt das die Überschreibung `anwesend` (`kopfNachAnwesenheit` in `protokoll/anwesenheit.ts`); die Person ist
  danach gesperrt (siehe Kopf). Entfernen aller Bausteine löst die Sperre, die Überschreibung bleibt „da“.
- **Notizen** neuer Event-, Thema- und Vergangenes-Event-Bausteine beginnen mit einer leeren Aufzählung.
- **Zitat** (`/zitat`, `/quote`) ist kein Baustein: Es macht den aktuellen Absatz am Cursor zum Zitat (Knoten `blockquote`,
  nur Absätze darin) und lässt den Cursor darin. Das geht überall, auch im Freitext („Notizen“) eines Bausteins; „— Name“ ist
  einfach eine weitere Zeile. Derselbe Eintrag steht im Menü „Baustein“, dazu der Zitat-Button der Werkzeugleiste. Die API
  prüft `blockquote` wie jeden anderen Knoten (Struktur, Tiefe).
- Der Baustein kommt hinter den aktuellen Block (ein leerer Absatz wird ersetzt, im Freitext eines Bausteins dahinter; keine
  Verschachtelung). Abstimmung und Meinungsbild kommen dagegen in die Notizen am Cursor (leerer Absatz ersetzt, sonst hinter
  dem aktuellen Block dort).
  `/` öffnet das Menü auch in Listenpunkten (Aufzählung und nummerierte Liste, auch in den Notizen eines Bausteins), nicht in
  Zitaten; der Eintrag „Zitat“ entfällt dort. Ein leerer letzter Listenpunkt (der Rest des getippten `/…`) wird vor dem Einfügen
  entfernt, bei einem einzigen Punkt die ganze Liste (in den Notizen bleibt dann ein leerer Absatz, es sei denn Abstimmung oder
  Meinungsbild ersetzen die Liste). Abstimmung und Meinungsbild kommen direkt hinter die Liste, alle anderen Bausteine nach
  den üblichen Regeln hinter den Block des Abschnitts. Der **Cursor springt ins erste leere Feld** (Event: Name, dann Datum, Abstimmung: Antrag, Meinungsbild: Frage, Wahl: Posten, Aufnahme: Person, sonst der
  Freitext).
- Auf dem Handy ist `/` umständlich: Die Werkzeugleiste (klebt unter dem Header) hat den Button **„Baustein“** mit demselben
  Menü, dazu fett, kursiv, Überschriften, Listen, Link, Rückgängig/Wiederholen.

## Vorbelegung eines neuen Protokolls

`protokollVorschlag` (Shared, getestet) baut das Dokument aus dem **Kalender** und dem Protokoll der letzten **früheren** Sitzung;
Kopf und Gegenwärtiges starten leer, Sonstiges wird nie übernommen. Die API (`protokollVorschlagFuer`) lädt dafür die Events ab
dem Tag der letzten Sitzung (ohne Vorgänger ab 92 Tage vor der neuen Sitzung) bis drei Jahre nach der neuen Sitzung, dazu die
Events, auf die das alte Protokoll zeigt.

- **Vergangenes:** Jedes Event, das nach dem Beginn der letzten Sitzung begann (ohne Vorgänger: in den letzten 92 Tagen) und vor
  dem Tag der neuen Sitzung endet, wird ein Baustein **Vergangenes Event** (Name, Datum, `eventId`, leerer Text). Dazu kommen
  die vergangenen Event-Bausteine des alten Protokolls. Nach Datum sortiert.
- **Zukünftiges:** Jedes Event, das am Tag der Sitzung oder später endet (keine Zeitgrenze), wird ein Event-Baustein mit leerer
  Aufzählung, dazu die zukünftigen Event-Bausteine des alten Protokolls samt Freitext (ohne Abstimmungen, Meinungsbilder,
  Wahlen). Nach Datum und Beginn sortiert; Bausteine ohne `eventId` aus dem alten Protokoll bleiben wie geschrieben am Ende.
- **Ausgelassen** werden abgesagte Events, Serien-Events (`serie` gesetzt) und Sitzungen. Steht ein Event schon im alten
  Protokoll, kommt es trotzdem (auch als Serien-Event) mit seinen Notizen. Jede `eventId` erscheint einmal; Events, die es im
  Kalender nicht mehr gibt, bleiben wie geschrieben.
- **Wiederholung nicht beschlussfähiger Abstimmungen:** War die Sitzung bei einer Abstimmung, einem Neuen EM mit Abstimmung, einer
  Aufnahme oder Wahl des alten Protokolls nicht beschlussfähig (`nichtBeschlussfaehigeAbstimmungen` in `protokollAnwesenheit.ts`, nach
  `anwesenheitsVerlauf` an der Stelle des Bausteins; ein Meinungsbild zählt nie), kommt derselbe Baustein ins **Gegenwärtiges** der
  neuen Sitzung, auch wenn er in den Notizen eines anderen Bausteins stand (er steht dann oben im Abschnitt, in Dokument-Reihenfolge).
  Antrag, Person bzw. Posten, „Gilt ab“, Anzahl, Stimmen pro Person, Kandidat:innen und „Nicht angetreten“ bleiben, alle Stimmen sind 0, `annahme` leer, Ergebnis `null`,
  Stichwahlen und Notizen leer, neue Id, `wiederholung` zeigt auf Datum und Titel der alten Sitzung. Nur das neue Ergebnis zählt. Ist die
  Wiederholung wieder nicht beschlussfähig, kommt sie in der nächsten Sitzung erneut. Die API ermittelt die Ids aus Teilnahme, EMs und
  Art des alten Protokolls (live im Entwurf, Schnappschuss wenn abgeschlossen) und gibt sie als `wiederholen` mit.
- **Der Kalender gewinnt:** Name, Datum, Uhrzeiten, Kategorie, Verantwortliche:r und Dienste (`schichtenAusEvent`, Umkehrung der
  Vorlage-Umrechnung `ausVorlage`) kommen aus dem Kalender, die Notizen aus dem alten Protokoll. Alle Bausteine bekommen neue Ids.

## Speichern

- **Autosave** 2 Sekunden nach der letzten Änderung (Dokument und Kopf); Statuszeile „Gespeichert · 20:14“ bzw. „Wird
  gespeichert …“. Speichern überlappt nie, jedes sendet den neuesten Stand. Beim Verlassen der Seite wird zuletzt gespeichert,
  beim Schließen des Tabs warnt der Browser.
- **Versionskonflikt:** `PUT` trägt die geladene `version`; hat jemand anderes inzwischen gespeichert, antwortet die API mit 409
  (und der aktuellen `version`). Die Seite zeigt „Jemand anderes hat das Protokoll inzwischen geändert.“ mit **Neu laden**,
  ungespeicherte Änderungen gehen dabei verloren.
- **Abschließen / Wieder öffnen:** Der Dialog erklärt das Einfrieren der Teilnahme und listet die [Aktionen](#aktionen-beim-abschließen). Vorher wird gespeichert. Passen Stimmen nicht zur
  Anwesenheit (siehe oben, mit den Live-Daten der Seite), listet der Dialog jede Stelle als Link, der zum Baustein scrollt, und
  „Abschließen“ ist gesperrt. Ein
  abgeschlossenes Protokoll ist schreibgeschützt (409 bei `PUT`/`DELETE`).
- **Löschen** nur im Entwurf (Menü „Weitere Aktionen“ mit Bestätigung).
- **Drucken:** Button für alle; druckt die [Dokumentansicht](#dokumentansicht) (Schreibende wechseln dafür automatisch dorthin).
  Während des Druckens heißt die Seite „YYYY-MM-DD_Sitzungsname“ (`druckTitel`, Berliner Datum der Sitzung, in Dateinamen
  verbotene Zeichen entfernt); das schlägt der Browser als Dateinamen vor und schreibt es als Titel ins PDF. Die Überschriften
  sind echte Ebenen (Titel `h1`, Abschnitte `h2`, Events und andere Bausteine `h3`, verschachtelte Themen `h4`, `h5`, `h6` (tiefer bleibt `h6`); eigene Überschriften stehen relativ zur umgebenden Überschrift eine und zwei Ebenen darunter, höchstens `h6`; direkt im Abschnitt also `h3`/`h4`), Abstimmungen
  und Wahlen nur wie Überschriften gestaltet. Chrome und Edge erzeugen daraus beim „Als PDF speichern“ Lesezeichen (Option
  „Dokumentgliederung“ unter „Weitere Einstellungen“), die der Gliederung der App entsprechen.
  Das Druck-CSS blendet Bedienelemente und Seitentitel aus (`PROTOKOLL_DRUCK_CSS`, `data-druck="aus"`); Überschriften behalten
  ihre Farbe und stehen nie allein am Seitenende (`break-after: avoid`).

## Seiten

| Seite              | Recht                  | Inhalt                                                                                                                                                        |
| ------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/protokolle`      | `protokolle:lesen`     | Nach Jahr gruppiert, Karten (Handy) bzw. Tabelle (ab `sm`), ganze Karte/Zeile klickbar; Badge „Entwurf“; Button „Neues Protokoll“ nur mit Schreibrecht        |
| `/protokolle/neu`  | `protokolle:schreiben` | Sitzung wählen (Events mit Sitzungs-Kategorie ohne Protokoll, bis morgen, höchstens 20, jüngste vorgewählt), „Protokoll anlegen“ mit Vorbelegung              |
| `/protokolle/<id>` | `protokolle:lesen`     | Schreibende eines Entwurfs wechseln zwischen „Bearbeiten“ (Kopf und Editor) und „Dokument“; alle anderen und abgeschlossene Protokolle sehen nur das Dokument |

## PDF und OneDrive

Beim **Abschließen** erzeugt die App aus dem abgeschlossenen Protokoll ein PDF und legt es in OneDrive ab (sofern eingerichtet,
siehe [bilder.md](./bilder.md)): `Cloud4/Sitzungen/C4/Protokolle/<Jahr>/<Datum>_<Sitzung>.pdf` (Name wie `druckTitel`, das Jahr aus dem Datum; fehlende Ordner legt OneDrive an, ein vorhandenes
gleichnamiges PDF wird ersetzt). Eine Meldung nennt den Pfad, einen Link gibt es nicht. Klappt OneDrive nicht (nicht
verbunden, nicht erreichbar, Fehler), lädt der Browser das PDF stattdessen direkt herunter und die Meldung sagt das
(„OneDrive nicht erreichbar – das PDF wurde stattdessen heruntergeladen.“). Scheitert schon die PDF-Erstellung, erscheint eine
Fehlermeldung; das Protokoll bleibt abgeschlossen. Im Menü „Weitere Aktionen“ eines abgeschlossenen Protokolls wiederholt
„PDF erneut in OneDrive speichern“ den Ablauf (inkl. Download-Ausweichlösung).

- **Erzeugung im Browser** mit `@react-pdf/renderer` (`protokoll/pdf/`, per dynamischem Import erst beim Bedarf geladen).
  `ProtokollPdf` zeigt denselben Inhalt wie die [Dokumentansicht](#dokumentansicht) und nutzt dieselben Ableitungen
  (`dokumentDaten`, `dokumentUeberschriften`, `anwesenheitsVerlauf`): A4, Fußzeile „Seite x von y“, Namen fett in der Statusfarbe
  (`STATUS_FARBE`), Abstimmungs-/Wahl-Kästen mit Randlinie, rechtsbündige Zitate und Erscheint/Geht-Zeilen. Es ist nicht
  pixelgleich zur HTML-Ansicht. Schrift: Noto Sans (Latin, 400/700, auch kursiv) aus `@fontsource/noto-sans`, per Vite als
  Asset eingebunden (`schriften.ts`; Zeichen außerhalb von Latin, z. B. polnische Buchstaben, fehlen).
- **Lesezeichen** (PDF-Gliederung) entsprechen der Gliederung der Dokumentansicht: Abschnitt > Event/Thema/Baustein-Überschrift >
  verschachtelte Themen (eingerückt unter dem Eltern-Thema) > eigene Überschriften, keine Abstimmungen. Ab Ebene 5 (`h6`) stehen Einträge gleichrangig nebeneinander. Die Wahl steht im PDF wie in der Dokumentansicht: Überschrift, Notizen, Ergebnis-Block. `pdfBloecke` liefert die Blöcke flach mit Überschriftsebene, `blockBaum` verschachtelt
  sie; verschachtelte Views tragen `bookmark`. Der PDF-Titel ist der Dateiname ohne `.pdf`.
- **Daten:** Der Ablauf (`usePdfSpeichern`, `pdfAblauf`) lädt das Protokoll nach dem Abschließen neu, damit der eingefrorene Stand
  (Teilnahme, Status) und die Aktions-Ergebnisse im PDF stehen.
- **Upload als JSON** `{ dateiname, base64 }` statt roher Bytes: API Gateway und der Lambda-Adapter reichen Binär-Bodies nur mit
  zusätzlicher Konfiguration unverändert durch, JSON kommt immer heil an. Grenze 4 MB (`PROTOKOLL_PDF_MAX_BYTES`; Graph-Direktupload
  und Lambda-Payload). Der Server prüft Dateiname (bereinigt, `.pdf`), Base64, `%PDF-`-Kopf und Größe.

## API

| Route                               | Recht                  | Inhalt                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/protokolle`               | `protokolle:lesen`     | Liste: Id, Sitzung (Titel, Beginn), Status, zuletzt geändert (neueste Sitzung zuerst)                                                                                                                                                                                                                                                                                      |
| `GET /api/protokolle/:id`           | `protokolle:lesen`     | Inhalt, Kopf, `version`, Teilnahme- und EM-Listen (live abgeleitet, abgeschlossen aus Schnappschuss), `naechsteSitzungVorschlag` (`{ eventId, titel, beginn }` oder `null`; live, abgeschlossen eingefroren), `naechsteSitzungen` (kommende Sitzungen zur Auswahl, höchstens 10, nur im Entwurf)                                                                           |
| `GET /api/protokolle/sitzungen`     | `protokolle:schreiben` | Sitzungen ohne Protokoll                                                                                                                                                                                                                                                                                                                                                   |
| `GET /api/protokolle/vorschlag`     | `protokolle:schreiben` | `?eventId=` → vorbelegtes `{ inhalt, kopf }`                                                                                                                                                                                                                                                                                                                               |
| `POST /api/protokolle`              | `protokolle:schreiben` | `{ eventId, inhalt?, kopf? }` → 201 `{ id }`; ohne `inhalt`/`kopf` gilt die Vorbelegung; 409 bei zweitem Protokoll                                                                                                                                                                                                                                                         |
| `PUT /api/protokolle/:id`           | `protokolle:schreiben` | `{ inhalt, kopf, version }` → `{ version, geaendertAm }`; 409 bei veralteter Version oder abgeschlossen                                                                                                                                                                                                                                                                    |
| `PUT /api/protokolle/:id/status`    | `protokolle:schreiben` | `{ status, aktionen? }` (`entwurf`/`abgeschlossen`, `aktionen` = gewählte Aktions-Ids): Abschließen friert die Teilnahme ein (400 mit allen Stimmen-Fehlern auf Deutsch, wenn Stimmen nicht zur Anwesenheit passen) und führt die gewählten Aktionen aus, Wieder öffnen löst die Teilnahme. Antwort `{ status, version, geaendertAm, aktionen: ProtokollAktionAusgang[] }` |
| `PUT /api/protokolle/:id/pdf`       | `protokolle:schreiben` | `{ dateiname, base64 }` speichert das PDF eines **abgeschlossenen** Protokolls in OneDrive (409 sonst, 413 über 4 MB, 503 wenn OneDrive nicht verbunden oder nicht erreichbar) → `{ gespeichert: true, pfad }`                                                                                                                                                             |
| `GET /api/protokolle/:id/aktionen`  | `protokolle:schreiben` | `{ aktionen: ProtokollAktionDto[] }`, live aus dem gespeicherten Inhalt berechnet (auch erledigte und gescheiterte)                                                                                                                                                                                                                                                        |
| `POST /api/protokolle/:id/aktionen` | `protokolle:schreiben` | `{ aktionen: string[] }` führt Aktionen eines **abgeschlossenen** Protokolls (erneut) aus (409 im Entwurf); Antwort `{ version, ergebnisse, aktionen }`                                                                                                                                                                                                                    |
| `DELETE /api/protokolle/:id`        | `protokolle:schreiben` | nur im Entwurf (409 sonst)                                                                                                                                                                                                                                                                                                                                                 |

`DELETE /api/kalender/events/:id` antwortet 409, solange das Event ein Protokoll hat.

## Aktionen beim Abschließen

Aus den Bausteinen leitet die App Aktionen ab, die beim Abschließen nach Bestätigung laufen. `protokollAktionen(dokument,
kontext)` (`packages/shared/src/protokollAktionen.ts`, rein, getestet) liefert die Liste in Dokumentreihenfolge, auch für
Bausteine in den Notizen anderer Bausteine. Eine Aktion hat `id` (`bausteinId:art`), `bausteinId`, `art`, `text`,
`ausfuehrbar`, `grund`, `erledigt`, `eventId` und `subs` (betroffene Personen). Das Ausführen übernimmt
`packages/api/src/protokollAktionen.ts`.

| Art                  | Baustein und Bedingung                                | Wirkung                                                                                                                                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event.anlegen`      | Event ohne `eventId`                                  | Event im Kalender anlegen (Name, Kategorie, Zeiten, Dienste, Verantwortliche:r), danach `eventId` in den Baustein schreiben. Ohne Datum, Kategorie oder (nicht ganztägig) Uhrzeit nicht ausführbar                                                                                                |
| `event.aendern`      | Event mit `eventId`, Felder weichen vom Kalender ab   | Das Event mit den Feldern des Bausteins aktualisieren; Beschreibung, Teilnahme und Eingeladene bleiben, Dienste behalten ihre Ids der Reihe nach. Fielen Dienste mit Eintragungen weg, schlägt die Aktion mit Hinweis fehl (kein Erzwingen). Gelöschte und abgesagte Events erzeugen keine Aktion |
| `anwaerter.einladen` | Anwärter:in mit E-Mail, noch ohne `sub`               | Einladung per Cognito (`createUser(email, [])`), Profil als Anwärter:in mit Start am Sitzungsdatum, `sub` in den Baustein schreiben. Bestehende Adresse: „E-Mail-Adresse bereits vergeben“. Ohne gültige E-Mail oder Namen nicht ausführbar                                                       |
| `aufnahme.status`    | Aufnahme mit `sub` und Ergebnis                       | angenommen → Status `mitglied`, abgelehnt → `extern`, jeweils ab Sitzungsdatum                                                                                                                                                                                                                    |
| `em.status`          | Neues EM mit `sub`                                    | ohne Abstimmung oder angenommen → `em`, abgelehnt → `extern`, ab Sitzungsdatum; laufende Abstimmung ohne Ergebnis nicht ausführbar                                                                                                                                                                |
| `wahl.posten`        | Wahl mit Posten aus der Liste, „Gilt ab“ und Ergebnis | Für jede gewählte Person (die die Wahl annimmt) ohne laufende Besetzung eine Besetzung ab „Gilt ab“; die offenen Besetzungen Nicht-Wiedergewählter enden am Vortag (`ablosung`), Wiedergewählte behalten ihre. Offene Stichwahl oder fehlendes Ergebnis: nicht ausführbar                         |

- **Kategorie-Fallback:** Hat ein Event-Baustein keine `kategorieId` (Altdaten), aber eine `vorlageId`, gilt die Kategorie der
  Vorlage: in `event.anlegen` (Kontext `vorlageKategorien`), beim Übernehmen aus dem vorigen Protokoll (`protokollVorschlag`) und
  als angezeigter Wert im Event-Formular (die Hilfe unter „Kategorie“ erscheint nur ohne Kategorie).
- **Sitzungsdatum:** Liegt die Sitzung in der Zukunft, gilt heute (Statusdatum darf nicht in der Zukunft liegen).
- **Vorläufig:** Eine Aktion einer Aufnahme, eines Neuen EM oder einer Wahl, die in einer **nicht beschlussfähigen** Sitzung stand
  (`kontext.nichtBeschlussfaehig`, Ids aus `nichtBeschlussfaehigeAbstimmungen`), bleibt ausführbar, bekommt aber `vorlaeufig: true`. Der
  Dialog und die Karte zeigen ein Badge „vorläufig“ und „Vorläufig – nicht beschlussfähig, wird in der nächsten Sitzung wiederholt.“.
  Fällt die Wiederholung anders aus, greifen die Aktionen der neuen Sitzung (z. B. Aufnahme abgelehnt → Extern) oder man korrigiert von Hand.
- **Schon erledigt:** Hat die Aktion keine Wirkung mehr (Status schon erreicht, Besetzung schon da, Event entspricht dem Baustein),
  ist sie nicht ausführbar mit dem Grund „Bereits erledigt“ (`erledigt: true`). Das macht Wieder öffnen und erneutes Abschließen
  idempotent.
- **Rechte:** Die beiden Routen brauchen nur `protokolle:schreiben`. Die Stores (Kalender, Mitglieder, Cognito, Posten) werden
  direkt aufgerufen, also ohne `users:manage`, `events:verwalten` oder `posten:bearbeiten`. Das gilt bewusst nur für diesen Weg;
  der Akteur (aktuelle Person) wird als Ersteller des Events und im Ergebnis (`von`) festgehalten.
- **Abschließen:** Erst die Stimmenprüfung (400 bei Fehlern), dann die gewählten ausführbaren Aktionen nacheinander, jede für sich
  (ein Fehler stoppt die anderen nicht), dann werden Inhalt (mit den zurückgeschriebenen `eventId`/`sub`), Kopf und Status in
  **einem** Schritt gespeichert (eine Version). Der Schnappschuss der Teilnahme zeigt den Stand vor den Aktionen. Das Protokoll wird
  auch geschlossen, wenn Aktionen scheitern. Hat jemand dazwischen gespeichert, wird auf dem neueren Stand erneut geschrieben,
  damit die Rückschreibungen nicht verloren gehen. Unbekannte, nicht ausführbare und erledigte Ids ergeben `uebersprungen`.
- **Ergebnisse:** `kopf.aktionen` (Standard `{}`) hält je Id `{ status: 'erledigt'|'fehler', text, am, von, aktionText, bausteinId, art, eventId, subs }`
  (`aktionText` = Text der Aktion beim Ausführen; ältere Einträge ohne diese Felder bleiben gültig); `PUT /protokolle/:id`
  behält die gespeicherten Ergebnisse, egal was der Editor sendet. `GET .../aktionen` liefert je Aktion `zustand` (`offen`,
  `erledigt`, `fehler`, `nicht_ausfuehrbar`), `ergebnis` und `personen` (für `StatusName`); gespeicherte Ergebnisse von Aktionen,
  die nicht mehr berechnet werden (z. B. das angelegte Event), erscheinen mit ihrem ursprünglichen Text als „erledigt“ (Ergebnis als
  Nebentext, Event-Link, Personen) an der Stelle ihres Bausteins in der Dokumentreihenfolge; ist der Baustein weg, stehen sie am Ende.
- **Erneut versuchen:** `POST .../aktionen` für ein abgeschlossenes Protokoll wiederholt gescheiterte oder offene Aktionen; die
  Rückschreibung in den Inhalt ist serverseitig erlaubt.
- **Abschließen-Dialog (Web):** Nach dem Speichern des Entwurfs lädt der Dialog `GET .../aktionen` (Ladeanzeige, „Abschließen“ so lange
  gesperrt; scheitert das Laden, erscheint ein Hinweis und das Abschließen ohne Aktionen bleibt möglich). Unter den Stimmenproblemen
  steht der Abschnitt „Aktionen“ (`protokoll/AktionenAnsicht.tsx`): je Aktion eine Checkbox (vorgewählt: ausführbar und offen), Text,
  betroffene Personen (`StatusName`, verlinkt) und Link zum Event; nicht ausführbare sind abgeblendet mit Grund, erledigte zeigen
  „erledigt“. Die angehakten Ids gehen im `PUT .../status` mit. Danach meldet eine Benachrichtigung das Ergebnis („3 Aktionen
  erledigt, 1 fehlgeschlagen“; nichts, wenn keine lief), und Protokoll, Kalender, Mitglieder und Posten werden neu geladen.
  Die reine Logik (Vorauswahl, Zusammenfassung) steht in `protokoll/aktionenLogik.ts`.
- **Karte „Aktionen“ (Web):** Über dem Dokument eines abgeschlossenen Protokolls, nur mit `protokolle:schreiben` und nur, wenn es
  Aktionen gibt. Je Aktion der Zustand (erledigt, fehlgeschlagen mit Text des Ergebnisses, offen, nicht ausführbar mit Grund) und
  „Ausführen“ (offen) bzw. „Erneut versuchen“ (fehlgeschlagen) per `POST .../aktionen`, danach Neuladen.
- **Event-Baustein:** Das Feld „Kategorie“ (nicht archivierte Kategorien) steht neben der Vorlage; wird im Feld „Im Kalender“ ein
  Event gewählt, übernimmt der Baustein dessen Angaben (Kalender gewinnt: Name, Datum, Zeiten, Kategorie, Verantwortliche:r, Dienste
  über `eventDatenAusKalender`), die Notizen bleiben. Beim Anwärter:in-Baustein zeigt ein gesetztes `sub` „Eingeladen“ mit Link zum
  Mitglied, und die E-Mail ist nicht mehr änderbar.
- Der Hinweis auf Event-Änderungen (Benachrichtigung) geht wie im Kalender raus. Einladungen verschicken auf dev eine echte Mail.
