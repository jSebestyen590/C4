# Protokolle: Aktionen beim Abschließen

Teil von [protokolle.md](../protokolle.md).

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
| `todo.anlegen`       | Todo ohne `todoId`                                    | Todo anlegen (Titel, Notizen als Text, Deadline, Modus, Quelle = Protokoll und Baustein) für die aufgelösten Zuständigen, danach `todoId` in den Baustein schreiben. Ohne Titel, Deadline oder aktive Zuständige nicht ausführbar. Vorschau: „Todo „Titel“ für 12 Personen, bis 14.11.2026“       |
| `todo.aendern`       | Todo mit `todoId`, Felder weichen vom Todo ab         | Titel, Notizen, Deadline, Modus und Zuständige aktualisieren (hinzufügen und entfernen); Häkchen bleibender Personen bleiben                                                                                                                                                                      |

- **Todo:** Beide Aktionen sind wie die Event-Aktionen vorgewählt. Die Notizen werden als Text übernommen (eine Zeile je Stichpunkt,
  `protokollNotizenText`). Gruppen (`@Alle` …) löst `todoZustaendigeAufloesen` **beim Abschließen** nach dem aktuellen Status auf
  (`ERWAEHNUNG_GRUPPE_STATI`, ohne Duplikate und ohne deaktivierte Mitglieder); wer später in die Gruppe kommt, bekommt das Todo nicht. Beim
  **Wieder öffnen und erneuten Abschließen** erzeugt der Baustein mit `todoId` `todo.aendern` (ist nichts anders, „Bereits erledigt“):
  Häkchen bleibender Personen bleiben erhalten, ein geänderter Modus setzt alle Häkchen zurück, entfernte Personen verlieren das Todo, neue
  kommen dazu. Wird der Baustein entfernt, bleibt das Todo bestehen (es lässt sich nicht von Hand löschen, weil es aus einem Protokoll stammt);
  ein gelöschtes Todo erzeugt keine Aktion. Siehe [todos.md](../todos.md).
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
- Der Hinweis auf Event-Änderungen (Benachrichtigung) geht wie im Kalender raus. Einladungen verschicken auf dev eine echte Mail.

## Belegen vor dem Ausführen

- `PUT /status` (Abschließen) setzt Status und Schnappschuss mit **einem** bedingten `UPDATE` (`version` und Status passen,
  `statusBelegen`), **bevor** die Aktionen laufen. `POST /aktionen` zählt die Version vorher hoch (`aktionenBelegen`). Wer zu spät
  kommt, bekommt 409 „Das Protokoll wurde inzwischen geändert. Bitte lade es neu.“; die Aktionen laufen so nie doppelt.
- Scheitert danach eine Aktion, bleibt das Protokoll abgeschlossen (kein Zurückrollen). Das Ergebnis je Aktion steht in
  `kopf.aktionen` (mit neuer Version geschrieben), gescheiterte lassen sich über „Ausführen“ wiederholen.
- Je Abschluss mit Wirkung zählt die Version zweimal hoch (Belegen, Ergebnisse schreiben).
