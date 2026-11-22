# Protokolle

Sitzungsprotokolle der Mitgliederversammlungen und Sitzungen. Ein Protokoll gehört zu genau einem Sitzungs-Event und besteht
aus dem **Kopf** (Teilnahme, EMs, Gäste) und einem **Dokument** mit vier festen Abschnitten (Vergangenes, Gegenwärtiges,
Zukünftiges, Sonstiges), in dem Text und **Bausteine** stehen. Rechte: `protokolle:lesen` (alle Status: ansehen, drucken),
`protokolle:schreiben` (anlegen, bearbeiten, abschließen, löschen). Das Schreibrecht geben Admins immer, sonst ein Posten
(`POSTEN_RECHTE`, siehe [posten.md](./posten.md)).

Unterseiten (Teil dieses Features):

- [protokolle/bausteine.md](./protokolle/bausteine.md): Dokument, die Bausteine einzeln, Regeln für Stimmen und Wahlen,
  Slash-Befehle, Erwähnungen.
- [protokolle/aktionen.md](./protokolle/aktionen.md): Aktionen beim Abschließen (Events, Status, Posten, Todos).
- [protokolle/ansicht-pdf.md](./protokolle/ansicht-pdf.md): Gliederung, Dokumentansicht, Autosave-Oberfläche, Drucken, PDF, Bilder.

## Überblick

Sitzungsprotokolle der Mitgliederversammlungen und Sitzungen: Ein Protokoll gehört zu genau einem Sitzungs-Event und besteht aus dem Kopf (Teilnahme, EMs, Gäste) und einem Dokument mit vier festen Abschnitten und Bausteinen. Rechte: `protokolle:lesen` (ansehen, drucken) und `protokolle:schreiben` (anlegen, bearbeiten, abschließen, löschen; Admins immer, sonst über einen Posten). Details zu Bausteinen, Abschluss-Aktionen und Ansicht/PDF stehen auf den Unterseiten in `docs/protokolle/`.

Abschnitte: Invarianten, Seiten, Datenmodell, Dateien, Sitzungen, Kopf, Vorbelegung eines neuen Protokolls, Aktionen beim Abschließen, Offizielles Protokoll, Speichern, Bearbeitungssperre, API

## Invarianten

- Je Event höchstens ein normales Protokoll (eindeutiger Index `protokolle_event_fassung_idx` auf `(event_id, fassung)`, Migration 0248; ein zweites gibt 409), dazu höchstens eine offizielle Kopie je Sitzung und damit je Protokoll (siehe [Offizielles Protokoll](#offizielles-protokoll)). Ein Event
  mit Protokoll lässt sich nicht löschen (409).
- Das Dokument hat immer vier Abschnitte in fester Reihenfolge; Editor und API (`protokollDokumentPruefen`) lehnen andere Formen ab.
- Ein abgeschlossenes Protokoll ist schreibgeschützt (`PUT`, `DELETE`, Bilder-Upload geben 409); gelöscht wird nur im Entwurf.
- `version` zählt bei jeder Änderung hoch; `PUT` mit veralteter `version` gibt 409 (kein Überschreiben fremder Änderungen).
- Den Schnappschuss (`schnappschuss`, `emsSchnappschuss`, `statusSchnappschuss`, `artSchnappschuss`, `naechsteSitzungSchnappschuss`)
  und die Ergebnisse der Aktionen (`kopf.aktionen`) setzt nur die API: `PUT /api/protokolle/:id` verwirft den Schnappschuss
  aus dem gesendeten Kopf (`kopfOhneSchnappschuss`) und behält die gespeicherten Aktions-Ergebnisse.
- Abschließen ist nur möglich, wenn bei jeder verbindlichen Abstimmung die Zahl der Stimmen zur Zahl der anwesenden Mitglieder passt
  (`stimmenPruefen`, sonst 400).
- Ein Protokoll lässt sich schon vor der Sitzung anlegen und bearbeiten, abgeschlossen wird es erst ab deren Beginn (400 sonst; die
  Schaltfläche ist bis dahin deaktiviert).
- Aktionen sind idempotent: Hat eine Aktion keine Wirkung mehr, gilt sie als „Bereits erledigt“; ein Fehler einer Aktion stoppt weder die
  anderen noch das Abschließen. Der Status wird **vor** den Aktionen belegt (bedingtes Update auf die Version, paralleler Aufruf: 409);
  scheitert eine Aktion, bleibt das Protokoll abgeschlossen und sie lässt sich über „Ausführen“ wiederholen
  ([protokolle/aktionen.md](./protokolle/aktionen.md#belegen-vor-dem-ausführen)).
- Die Aktionen beim Abschließen laufen bewusst nur mit `protokolle:schreiben` (ohne `users:manage`, `events:verwalten`,
  `posten:bearbeiten`), siehe [protokolle/aktionen.md](./protokolle/aktionen.md).

## Seiten

| Seite              | Recht                  | Inhalt                                                                                                                                                                                                   |
| ------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/protokolle`      | `protokolle:lesen`     | Nach Jahr gruppiert, Karten (Handy) bzw. Tabelle (ab `sm`), ganze Karte/Zeile klickbar; Badge „Entwurf“; Button „Neues Protokoll“ nur mit Schreibrecht                                                   |
| `/protokolle/neu`  | `protokolle:schreiben` | Sitzung wählen (Events mit Sitzungs-Kategorie ohne Protokoll: bis zu 20 vergangene und die nächsten 5 kommenden, Badge „Kommend“, die dem Jetzt nächste vorgewählt), „Protokoll anlegen“ mit Vorbelegung |
| `/protokolle/<id>` | `protokolle:lesen`     | Schreibende eines Entwurfs wechseln zwischen „Bearbeiten“ (Kopf und Editor) und „Dokument“; alle anderen und abgeschlossene Protokolle sehen nur das Dokument                                            |

## Datenmodell

Tabelle `protokolle`: `id`, `event_id` (zusammen mit `fassung` eindeutig), `fassung` (`normal`/`offiziell`, schreibt immer die API), `offiziell_von` (Id des normalen Quell-Protokolls, `NULL` = normales Protokoll; ohne Fremdschlüssel, DSQL; Migrationen 0245–0249), `inhalt` (Text, TipTap-JSON), `kopf` (Text, JSON), `status`
(`entwurf`/`abgeschlossen`), `version` (zählt bei jeder Änderung hoch), `erstellt_von/_am`, `geaendert_von/_am`. Migrationen
`0110`–`0113` und `0163`–`0165` (Sperre; siehe [datenbank.md](./datenbank.md)); `event_kategorien.protokoll` ist das Sitzungs-Häkchen, `event_kategorien.protokoll_art` die Art der Sitzung.

## Dateien

| Bereich | Dateien                                                                                                                                                                                                                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API     | `packages/api/src/protokolle.ts` (Store, Versionsprüfung), `protokolleAnsicht.ts` (Listen, Teilnahme, Schnappschuss), `protokollAktionen.ts` (Aktionen ausführen), `protokollbilder.ts` (S3), `protokolle.fake.ts`, Routen in `routes/protokolle.ts` (`/api/protokolle…`)                                            |
| Shared  | `packages/shared/src/protokolle.ts` (Typen, Prüfung, Vorbelegung, Wahl-Ergebnis; kennt TipTap nicht, nur die Knotenformen), `protokollAnwesenheit.ts`, `protokollStimmen.ts`, `protokollAktionen.ts`                                                                                                                 |
| Web     | Seiten `pages/ProtokollePage.tsx`, `ProtokollNeuPage.tsx`, `ProtokollPage.tsx`; `ProtokollKopf.tsx`, `protokollDaten.ts`, `useProtokollAutosave.ts`; Editor, Ansicht und PDF unter `protokoll/` (u. a. `ProtokollEditor.tsx`, `BausteinFormulare.tsx`, `slashLogik.ts`, `gliederung.ts`, `dokumentDaten.ts`, `pdf/`) |
| Tests   | Shared: `protokolle.test.ts`, `protokollAnwesenheit.test.ts`, `protokollStimmen.test.ts`, `protokollAktionen.test.ts`, `protokollThemen.test.ts`; Web: `protokoll/*.test.ts(x)`; API: Protokoll-Abschnitte in `app.test.ts`                                                                                          |

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
  Aufnahme, Wahl oder Auswahl des alten Protokolls nicht beschlussfähig (`nichtBeschlussfaehigeAbstimmungen` in `protokollAnwesenheit.ts`, nach
  `anwesenheitsVerlauf` an der Stelle des Bausteins; ein Meinungsbild zählt nie), kommt derselbe Baustein ins **Gegenwärtiges** der
  neuen Sitzung, auch wenn er in den Notizen eines anderen Bausteins stand (er steht dann oben im Abschnitt, in Dokument-Reihenfolge).
  Antrag, Person bzw. Posten, „Gilt ab“, Anzahl, Stimmen pro Person, Kandidat:innen und „Nicht angetreten“ bleiben, alle Stimmen sind 0, `annahme` leer, Ergebnis `null`,
  Stichwahlen und Notizen leer, neue Id, `wiederholung` zeigt auf Datum und Titel der alten Sitzung. Nur das neue Ergebnis zählt. Ist die
  Wiederholung wieder nicht beschlussfähig, kommt sie in der nächsten Sitzung erneut. Die API ermittelt die Ids aus Teilnahme, EMs und
  Art des alten Protokolls (live im Entwurf, Schnappschuss wenn abgeschlossen) und gibt sie als `wiederholen` mit.
- **Der Kalender gewinnt:** Name, Datum, Uhrzeiten, Kategorie, Verantwortliche:r und Dienste (`schichtenAusEvent`, Umkehrung der
  Vorlage-Umrechnung `ausVorlage`) kommen aus dem Kalender, die Notizen aus dem alten Protokoll. Alle Bausteine bekommen neue Ids.

## Aktionen beim Abschließen

Beim Abschließen führt das Protokoll die Aktionen seiner Bausteine aus (Events, Status, Posten, Todos). Regeln und Ablauf
stehen in [protokolle/aktionen.md](./protokolle/aktionen.md).

## Offizielles Protokoll

Das normale Protokoll nennt Spitznamen und enthält viel Unsinn. Aus einem **abgeschlossenen** normalen Protokoll legt die Protokollant:in
eine offizielle Kopie an (`POST /api/protokolle/:id/offiziell`, Recht `protokolle:schreiben`): `inhalt` und `kopf` (samt
Schnappschuss) werden kopiert, Status `entwurf`, gleiche `event_id`, `offiziell_von` = Id der Quelle. Die Kopie wird danach wie ein
Protokoll bearbeitet (Sperre, Autosave, Version); Echtnamen und Farblosigkeit im Dokument/PDF sind Sache der Web-Oberfläche.

- 400, wenn die Quelle selbst offiziell oder nicht abgeschlossen ist; 409 mit `offiziellId`, wenn es schon eine Kopie gibt (je Sitzung
  genau eine, über den Index auf `(event_id, fassung)`).
- **Bilder:** Schlüssel gehören zum Präfix ihres Protokolls (`protokollbilder/<id>/`, das `PUT` prüft das). Die Kopie bekommt deshalb
  eigene S3-Objekte (`Protokollbilder.kopieren`), die Schlüssel im Inhalt werden umgeschrieben; Löschen der Kopie löscht nur deren Bilder.
- **Keine Aktionen:** Abschließen und Wieder öffnen der Kopie setzen nur den Status (Schnappschuss bleibt, keine Prüfung von Beginn und
  Stimmen, `aktionen` wird ignoriert). `GET …/aktionen` liefert eine leere Liste, `POST …/aktionen` gibt 409. Die Ansicht der Kopie
  zeigt immer den Schnappschuss der Quelle, nie Live-Daten.
- **Zuordnung zum Event:** `nachEvent` (Kalender-Löschschutz, „schon ein Protokoll“), Vorbelegung neuer Protokolle und die Sitzungsauswahl
  kennen nur das normale Protokoll; die Kopie zählt nicht als eigenes Protokoll der Sitzung.
- **Löschen:** Die Quelle lässt sich nicht löschen, solange es eine Kopie gibt (409 mit `offiziellId`); die Kopie lässt sich im Entwurf
  löschen. Die Quelle bleibt wieder öffnenbar, die Kopie ändert sich dadurch nicht.
- `ProtokollDto` und der Listeneintrag tragen `offiziellVon` (Kopie → Quelle) und `offiziellId` (Quelle → Kopie).

## Speichern

- **Autosave** 2 Sekunden nach der letzten Änderung (Dokument und Kopf), Speichern überlappt nie. Nach einem **fehlgeschlagenen**
  Speichern versucht er es bis zu dreimal von selbst erneut (nach 2, 5 und 10 Sekunden); danach bleibt es bei „Nicht gespeichert.“
  bis zur nächsten Änderung oder „Erneut versuchen“ in der Statuszeile. Details:
  [protokolle/ansicht-pdf.md](./protokolle/ansicht-pdf.md#autosave-oberfläche).
- **Versionskonflikt:** `PUT` trägt die geladene `version`; hat jemand anderes inzwischen gespeichert, antwortet die API mit 409
  (und der aktuellen `version` sowie `geaendertVon`, wer zuletzt gespeichert hat). Die Seite zeigt „<Name> hat das Protokoll
  inzwischen geändert.“ (Name als `StatusName`; ohne bekannte Person „Jemand anderes …“) mit **Neu laden**.
  Der Autosave sendet danach nichts mehr; „Neu laden“ lädt den Server-Stand und **verwirft den lokalen, ungespeicherten Stand**.
- **Bearbeitungssperre:** siehe [Bearbeitungssperre](#bearbeitungssperre); ohne Sperre geben `PUT` und Abschließen 409.
- **Abschließen / Wieder öffnen:** Der Dialog erklärt das Einfrieren der Teilnahme und listet die [Aktionen](./protokolle/aktionen.md). Vorher wird gespeichert. Passen Stimmen nicht zur
  Anwesenheit (siehe oben, mit den Live-Daten der Seite), listet der Dialog jede Stelle als Link, der zum Baustein scrollt, und
  „Abschließen“ ist gesperrt. Ein
  abgeschlossenes Protokoll ist schreibgeschützt (409 bei `PUT`/`DELETE`).
- **Löschen** nur im Entwurf (Menü „Weitere Aktionen“ mit Bestätigung).
- **Drucken und PDF:** siehe [protokolle/ansicht-pdf.md](./protokolle/ansicht-pdf.md#drucken).

## Bearbeitungssperre

Einen Entwurf bearbeitet immer nur **ein Tab** (Seite im Browser) gleichzeitig; so überschreiben sich zwei Schreibende nicht mehr
(zusätzlich zur Versionsprüfung).

- **Eine Sperre je Tab:** Jeder Tab erzeugt beim Laden eine zufällige Kennung (`TAB_ID` in `protokollDaten.ts`, nur im Speicher) und
  sendet sie als Header `X-Tab-Id`. Dieselbe Person in einem zweiten Tab oder auf einem zweiten Gerät ist ebenfalls gesperrt.
- **Dauer:** Die Bearbeiten-Seite schickt alle 30 s einen Herzschlag (`POST /api/protokolle/:id/sperre`); ohne Herzschlag läuft die
  Sperre 2 Minuten nach dem letzten ab (`PROTOKOLL_SPERRE_MS`). Verlassen der Seite (Unmount, `pagehide`) gibt sie frei
  (`DELETE`, mit `keepalive`). Es gibt **keine Übernahme**: Auch Admins brechen eine Sperre nicht; andere warten auf Ablauf oder Freigabe.
- **Nur Entwürfe:** Abgeschlossene Protokolle sind nicht sperrbar (409 „abgeschlossen“) und unverändert. Abschließen oder Wieder
  öffnen löscht die Sperre. Wieder öffnen braucht keine Sperre (es gibt keine zu halten).
- **Server:** `PUT /api/protokolle/:id` und `PUT …/status` (Abschließen) verlangen die Sperre mit passender Tab-Kennung. Sonst 409
  `{ error: 'Das Protokoll wird gerade von jemand anderem bearbeitet.', sperre: { von: <Mitglied mit username und status | null>, eigene } }`;
  `eigene` ist wahr, wenn dieselbe Person in einem anderen Tab sperrt. Die Sperre ändert `version` nicht.
- **Race-Sicherheit (DSQL):** Nehmen und Verlängern ist ein einziges bedingtes `UPDATE` der Zeile (frei, abgelaufen oder derselbe
  Tab); bei gleichzeitigen Versuchen entsteht ein Konflikt (40001), den der bestehende Retry wiederholt.
- **Oberfläche:** Ohne Sperre sehen alle das Dokument schreibgeschützt mit dem Hinweis „<Name> bearbeitet das Protokoll gerade.“
  (bzw. „Du bearbeitest das Protokoll gerade in einem anderen Tab oder auf einem anderen Gerät.“); „Abschließen“ ist gesperrt.
  Die Seite prüft alle 30 s erneut; ist die Sperre frei, nimmt sie sie, lädt die neueste Version und wird bearbeitbar mit dem Hinweis
  „Das Protokoll ist jetzt frei, du kannst es bearbeiten.“ Bekommt der Autosave die Sperr-409, hört er auf zu speichern und die Seite
  wechselt in diese Ansicht (nicht gespeicherte lokale Änderungen gehen beim Neuladen verloren). Code: `useProtokollSperre.ts`
  (Hook, in `ProtokollPage`), `protokoll/SperreHinweis.tsx`, `useProtokollAutosave.ts`.
- **Löschen:** `DELETE /api/protokolle/:id` gibt 409 (gleiche Form wie oben), solange ein anderer Tab eine gültige Sperre hält; der eigene Tab, eine freie oder abgelaufene Sperre erlauben es.
- **Verlorene Änderungen:** Wer die Sperre verliert, verliert beim Neuladen lokale, noch nicht gespeicherte Änderungen (bewusst so entschieden).
- **Speicher:** Spalten `sperre_sub`, `sperre_tab`, `sperre_bis` an `protokolle` (Migrationen 0163–0165).

## API

| Route                                | Recht                  | Inhalt                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/protokolle`                | `protokolle:lesen`     | Liste: Id, Sitzung (Titel, Beginn), Status, zuletzt geändert (neueste Sitzung zuerst)                                                                                                                                                                                                                                                                                                                                                                                        |
| `GET /api/protokolle/:id`            | `protokolle:lesen`     | Inhalt, Kopf, `version`, Teilnahme- und EM-Listen (live abgeleitet, abgeschlossen aus Schnappschuss), `naechsteSitzungVorschlag` (`{ eventId, titel, beginn }` oder `null`; live, abgeschlossen eingefroren), `naechsteSitzungen` (kommende Sitzungen zur Auswahl, höchstens 10, nur im Entwurf)                                                                                                                                                                             |
| `POST /api/protokolle/:id/offiziell` | `protokolle:schreiben` | legt die offizielle Kopie eines abgeschlossenen normalen Protokolls an → 201 `{ id }`; 400/409 siehe [Offizielles Protokoll](#offizielles-protokoll)                                                                                                                                                                                                                                                                                                                         |
| `GET /api/protokolle/sitzungen`      | `protokolle:schreiben` | Sitzungen ohne Protokoll (bis zu 20 vergangene und die nächsten 5 kommenden)                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GET /api/protokolle/vorschlag`      | `protokolle:schreiben` | `?eventId=` → vorbelegtes `{ inhalt, kopf }`                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `POST /api/protokolle`               | `protokolle:schreiben` | `{ eventId, inhalt?, kopf? }` → 201 `{ id }`; ohne `inhalt`/`kopf` gilt die Vorbelegung; 409 bei zweitem Protokoll                                                                                                                                                                                                                                                                                                                                                           |
| `POST /api/protokolle/:id/sperre`    | `protokolle:schreiben` | Header `X-Tab-Id`: Bearbeitungssperre nehmen oder verlängern → `{ bis }`; 409 mit `sperre` (siehe [Bearbeitungssperre](#bearbeitungssperre)) oder bei abgeschlossenem Protokoll                                                                                                                                                                                                                                                                                              |
| `DELETE /api/protokolle/:id/sperre`  | `protokolle:schreiben` | Header `X-Tab-Id`: gibt die Sperre frei, nur für den haltenden Tab (sonst ohne Wirkung)                                                                                                                                                                                                                                                                                                                                                                                      |
| `PUT /api/protokolle/:id`            | `protokolle:schreiben` | `{ inhalt, kopf, version }` → `{ version, geaendertAm }`; 409 bei veralteter Version, abgeschlossen oder ohne Sperre                                                                                                                                                                                                                                                                                                                                                         |
| `PUT /api/protokolle/:id/status`     | `protokolle:schreiben` | `{ status, aktionen? }` (`entwurf`/`abgeschlossen`, `aktionen` = gewählte Aktions-Ids): Abschließen braucht die Sperre (409 sonst), geht erst ab Beginn der Sitzung (400 sonst; Wieder öffnen immer), friert die Teilnahme ein (400 mit allen Stimmen-Fehlern auf Deutsch, wenn Stimmen nicht zur Anwesenheit passen) und führt die gewählten Aktionen aus, Wieder öffnen löst die Teilnahme. Antwort `{ status, version, geaendertAm, aktionen: ProtokollAktionAusgang[] }` |
| `POST /api/protokolle/:id/bilder`    | `protokolle:schreiben` | `{ groesse }` (1 Byte bis 5 MB) → `{ uploadUrl, schluessel }`, nur im Entwurf (409 sonst), siehe [Bilder](./protokolle/ansicht-pdf.md#bilder)                                                                                                                                                                                                                                                                                                                                |
| `PUT /api/protokolle/:id/pdf`        | `protokolle:schreiben` | `{ dateiname, base64 }` speichert das PDF eines **abgeschlossenen** Protokolls in OneDrive (409 sonst, 413 über 4 MB, 503 wenn OneDrive nicht verbunden oder nicht erreichbar) → `{ gespeichert: true, pfad }`                                                                                                                                                                                                                                                               |
| `GET /api/protokolle/:id/aktionen`   | `protokolle:schreiben` | `{ aktionen: ProtokollAktionDto[] }`, live aus dem gespeicherten Inhalt berechnet (auch erledigte und gescheiterte)                                                                                                                                                                                                                                                                                                                                                          |
| `POST /api/protokolle/:id/aktionen`  | `protokolle:schreiben` | `{ aktionen: string[] }` führt Aktionen eines **abgeschlossenen** Protokolls (erneut) aus (409 im Entwurf); Antwort `{ version, ergebnisse, aktionen }`                                                                                                                                                                                                                                                                                                                      |
| `DELETE /api/protokolle/:id`         | `protokolle:schreiben` | nur im Entwurf (409 sonst, auch bei fremder Sperre)                                                                                                                                                                                                                                                                                                                                                                                                                          |

`GET /api/protokolle/:id` liefert zusätzlich `bilder` (Schlüssel → URL, siehe [Bilder](./protokolle/ansicht-pdf.md#bilder)). `DELETE /api/protokolle/:id` löscht auch die Bilder des Protokolls.

`DELETE /api/kalender/events/:id` antwortet 409, solange das Event ein Protokoll hat.
