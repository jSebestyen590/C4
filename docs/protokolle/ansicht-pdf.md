# Protokolle: Ansicht, Gliederung, PDF, Bilder

Teil von [protokolle.md](../protokolle.md): die Darstellung des Protokolls (Editor-Gliederung, Dokumentansicht, Drucken, PDF),
die Bilder und die Oberfläche des Autosave. Bausteine: [bausteine.md](./bausteine.md).

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
Aufnahme, Neues EM) und im Freitext getippte Überschriften; keine Abstimmungen, Meinungsbilder, Wahlen, Todos, Anwesenheitszeilen oder
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
- **Todo:** ein gewöhnlicher Aufzählungspunkt in den Notizen, in denen es steht, kein farbiger Block, keine Überschrift und nicht in der
  Gliederung: „• **Todo:** Titel – Anna, Ben, @Alle (bis 14.11.2026)“. Seine Notizen folgen als Aufzählungspunkte eine Ebene tiefer. Steht das
  Todo direkt hinter einer Aufzählung (oder weiteren Todos), ist es deren nächster Punkt; hinter einem Absatz beginnt eine eigene Aufzählung.
  Personen als `StatusName`, Gruppen mit ihrem Titel und „@“; ohne Zuständige entfällt „ – …“, ohne Deadline „(bis …)“. Bist du zuständig
  (als Person oder über eine Gruppe deines aktuellen Status), hat der Name bzw. die Gruppe den Textmarker (`pk-dok-erw-ich`), sonst nichts
  Hervorgehobenes. Das PDF zeigt dieselbe Aufzählung (ohne Textmarker). Ableitung `todoZeile` in `dokumentDaten.ts`, Darstellung `TodoPunkt`
  in `ProtokollDokumentAnsicht.tsx` und `todoPunkt` in `pdf/pdfBloecke.tsx`.
- **Verschachtelt:** Eine Abstimmung, ein Meinungsbild oder eine Wahl in den Notizen eines anderen Bausteins steht dort, eingerückt wie die
  übrigen Notizen, an der Stelle im Text (bei einer Wahl: erst deren Notizen, dann der Block mit der Zeile „Wahl: Posten“).
- **Auswahl:** auf oberster Ebene mit Überschrift „Abstimmung: Frage“ (nicht in der Gliederung, wie die Abstimmung), in Notizen steht „Abstimmung: Frage“ im Block. Reihenfolge wie bei der Wahl: zuerst die Notizen, zuletzt der blaue Block mit (bei mehreren Plätzen) „Anzahl zu wählen: 2“, „Möglichkeiten: A 5 · B 3 · C 3 · Enthaltung 1“ (Möglichkeit ohne Text: „–“), je Stichwahl „Stichwahl: B 4 · C 2 · Enthaltung 0“, „Ergebnis: A, B“ oder rot „Noch offen: Stichwahl nötig“ und „(x von y Mitgliedern anwesend)“ (rot „nicht beschlussfähig“); davor bei einer Wiederholung die kleine Zeile „Wiederholung der Abstimmung vom …“. Das PDF zeigt dieselben Zeilen.
- **Nächste Sitzung:** letzte Zeile nach allen Abschnitten: „Die nächste Sitzung findet am Dienstag, 10.11.2026 um 20:00 Uhr statt.“
  (ohne Uhrzeit „… am Dienstag, 10.11.2026 statt.“, Berliner Zeit, Wochentag ausgeschrieben; ist nichts bekannt, entfällt sie).
  Es gilt der Wert von Hand aus dem Kopf, sonst der automatische Vorschlag (`naechsteSitzungWert`).
- **Anwesenheit:** rechtsbündige, kursive Zeile wie ein Zitat: „Julia erscheint um 21:00 Uhr.“ / „Strobi geht um 22:10 Uhr.“ (ohne Uhrzeit „Strobi geht.“, ohne Person entfällt sie); ändert
  sich dadurch die Beschlussfähigkeit, steht im selben rechtsbündigen, kursiven Zitat darunter (nicht fett) „Die Sitzung ist jetzt beschlussfähig (…)“ bzw. „… nicht mehr …“.

## Autosave (Oberfläche)

- **Autosave** 2 Sekunden nach der letzten Änderung (Dokument und Kopf); Statuszeile „Gespeichert · 20:14“ bzw. „Wird
  gespeichert …“. Speichern überlappt nie, jedes sendet den neuesten Stand. Beim Verlassen der Seite wird zuletzt gespeichert,
  beim Schließen des Tabs warnt der Browser.
- **Fehler:** Scheitert ein Speichern (Netz, Serverfehler), versucht der Autosave es bis zu dreimal von selbst erneut (Wartezeit 2 s, 5 s, 10 s;
  `AUTOSAVE_WIEDERHOLUNG_MS`). Die Statuszeile zeigt dabei rot „Nicht gespeichert. Neuer Versuch folgt gleich …“. Sind die
  Versuche aufgebraucht, steht dort „Nicht gespeichert.“ mit dem Link „Erneut versuchen“ (`jetzt()`); sonst wird erst bei der
  nächsten Änderung (die die Versuche von vorn beginnt) wieder gespeichert (`useProtokollAutosave.ts`, `SpeicherZeile` in `pages/ProtokollPage.tsx`).
- **Versionskonflikt (409):** Der Autosave sendet danach nichts mehr; „Neu laden“ lädt den Server-Stand und verwirft den lokalen,
  ungespeicherten Stand (siehe [protokolle.md](../protokolle.md#speichern)).

## Drucken

- **Drucken:** Button für alle; druckt die [Dokumentansicht](#dokumentansicht) (Schreibende wechseln dafür automatisch dorthin).
  Während des Druckens heißt die Seite „YYYY-MM-DD_Sitzungsname“ (`druckTitel`, Berliner Datum der Sitzung, in Dateinamen
  verbotene Zeichen entfernt); das schlägt der Browser als Dateinamen vor und schreibt es als Titel ins PDF. Die Überschriften
  sind echte Ebenen (Titel `h1`, Abschnitte `h2`, Events und andere Bausteine `h3`, verschachtelte Themen `h4`, `h5`, `h6` (tiefer bleibt `h6`); eigene Überschriften stehen relativ zur umgebenden Überschrift eine und zwei Ebenen darunter, höchstens `h6`; direkt im Abschnitt also `h3`/`h4`), Abstimmungen
  und Wahlen nur wie Überschriften gestaltet. Chrome und Edge erzeugen daraus beim „Als PDF speichern“ Lesezeichen (Option
  „Dokumentgliederung“ unter „Weitere Einstellungen“), die der Gliederung der App entsprechen.
  Das Druck-CSS blendet Bedienelemente und Seitentitel aus (`PROTOKOLL_DRUCK_CSS`, `data-druck="aus"`); Überschriften behalten
  ihre Farbe und stehen nie allein am Seitenende (`break-after: avoid`).

## PDF und OneDrive

Beim **Abschließen** erzeugt die App aus dem abgeschlossenen Protokoll ein PDF und legt es in OneDrive ab (sofern eingerichtet,
siehe [bilder.md](../bilder.md)): `Cloud4/Sitzungen/C4/Protokolle/<Jahr>/<Datum>_<Sitzung>.pdf` (Name wie `druckTitel`, das Jahr aus dem Datum; fehlende Ordner legt OneDrive an, ein vorhandenes
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

## Bilder

Ein Protokoll kann Fotos und Bilder enthalten (Knoten `protokollBild`, Block und Atom).

- **Knoten:** `schluessel` (`protokollbilder/<Protokoll-Id>/<uuid>.jpg`), `breite` (`voll`/`halb`), `ausrichtung`
  (`links`/`mitte`/`rechts`), `beschreibung` (höchstens 300 Zeichen, auch Alt-Text). Erlaubt auf Abschnittsebene und in den Notizen
  aller Bausteine mit Freitext, auch in Abstimmung, Meinungsbild und Wahl; nicht in Zitaten und Listen. `knotenFehler` prüft die Form des
  Schlüssels, die API beim Speichern zusätzlich, dass er zu diesem Protokoll gehört (400 sonst); beim Anlegen (`POST /api/protokolle`) ist jeder Bildschlüssel im Inhalt ein 400, weil es die Protokoll-Id noch nicht gibt. `protokollVorschlag` übernimmt keine Bilder
  ins nächste Protokoll.
- **Speicher:** Derselbe S3-Bucket wie die Profilbilder (`PROFILBILD_BUCKET`), Präfix `protokollbilder/<Protokoll-Id>/`
  (`packages/api/src/protokollbilder.ts`). `POST /api/protokolle/:id/bilder` gibt eine presigned PUT-URL (feste Größe, `image/jpeg`, 5 MB)
  und den Schlüssel. `GET /api/protokolle/:id` gibt `bilder` (Schlüssel → presigned GET-URL, 1 Stunde) für die Schlüssel mit dem Präfix des
  Protokolls, die im Inhalt vorkommen. Beim Löschen des Protokolls werden alle Objekte unter dem Präfix gelöscht (Fehler dabei werden nur
  protokolliert). Terraform: die Lambda darf auf `protokollbilder/*` lesen, schreiben und löschen und im Bucket mit diesem Präfix auflisten.
- **Hochladen** (Slash `/bild`, auch `/foto`, `/image`, und Button „Baustein“): Dateiauswahl mit `image/*` (am Handy auch Kamera). Der
  Browser verkleinert das Bild über Canvas auf höchstens 2000 px an der langen Seite und macht immer ein JPEG (Qualität 0,85; das PDF kann
  kein WebP/HEIC) (`bildLogik.ts`). Währenddessen steht an der Einfügestelle ein Platzhalter mit Fortschritt (`BildHochladen.ts`, nicht Teil
  des Dokuments); bei einem Fehler erscheint eine Meldung. Erst danach kommt der Knoten ins Dokument.
- **Editor:** Karte mit Vorschau und „Beschreibung“; auf oberster Ebene zusätzlich „Breite“ (Voll/Halb) und „Position“
  (Links/Mitte/Rechts). In Notizen gibt es beides nicht. Die URLs kommen aus `bilder` des Protokolls (frische Uploads zeigen eine lokale
  Vorschau); schlägt das Laden fehl, holt die Seite einmal (höchstens alle 30 s) neue URLs (`useProtokollBilder`, eigene Anfrage, damit der
  Editor nicht neu aufgebaut wird).
- **Dokumentansicht:** Oberste Ebene: eigene Zeile, `voll` 100 %, `halb` 50 % ab `sm` (am Handy 100 %), links/mittig/rechts, kein
  Textumfluss, Beschreibung als kleine Unterschrift. In Notizen teilt `notizAbschnitte(kinder)` die Notizen an verschachtelten Bausteinen
  (Abstimmung, Meinungsbild, Wahl, Thema). Ein Textabschnitt mit Bildern ist ein Grid: Text links, rechts eine Bildspalte (40 %, am Handy
  38 %) mit den Bildern untereinander; verschachtelte Bausteine stehen in voller Breite dazwischen, Abschnitte ohne Bild bleiben unverändert.
- **PDF:** Gleiches Layout (`pdfBloecke.tsx`, Notiz-Abschnitte als Zeile). `usePdfSpeichern` lädt das Protokoll neu und holt die Bilder vorab
  (`pdfBilder.ts`, als Data-URL); ein Bild, das nicht lädt, wird im PDF zum Platzhaltertext „[Bild nicht verfügbar]“, das PDF entsteht
  trotzdem. Überschriften am Anfang eines Notiz-Abschnitts mit Bildern behalten ihr Lesezeichen, spätere in derselben Zeile nicht.
- **Bekannter Rest:** Bilder, die aus dem Text entfernt werden, bleiben in S3 liegen, bis das Protokoll gelöscht wird.
