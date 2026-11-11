# Historie

Die Seite `/historie` (Menü „Historie“, Recht `mitglieder:lesen`) zeigt Zeitstrahlen (Gantt-artig, ohne Diagramm-Bibliothek).

## Dateien

| Bereich | Dateien                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| API     | keine eigene Route: `GET /api/mitglieder/:kennung/historie` (in `app.ts`), `GET /api/posten`; Status-Verlauf siehe [members.md](./members.md)    |
| Shared  | `packages/shared/src/statusVerlauf.ts` (`statusZeitraeume`)                                                                                      |
| Web     | `packages/web/src/pages/HistoriePage.tsx`, `Zeitstrahl.tsx`, `zeitstrahlLogik.ts`, `historieDaten.ts`, `StatusHistorie.tsx` (Timeline im Profil) |
| Tests   | `packages/web/src/zeitstrahlLogik.test.ts`, `packages/shared/src/statusVerlauf.test.ts`                                                          |

## URL

`/historie?ansicht=mitglieder&mitglieder=a,b` bzw. `/historie?ansicht=posten&posten=x,y`. Mitglieder stehen mit Username
(ohne Username mit `sub`), Posten mit ihrer Id, kommagetrennt. Ohne `ansicht` gilt „Mitglieder“. Die Auswahl liegt nur in der URL und
lässt sich so teilen. Oben wechselt ein Umschalter zwischen den Ansichten, darunter wählt ein Suchfeld (Mehrfachauswahl) aus; ohne Auswahl
steht ein Hinweis da und „Drucken“ ist deaktiviert. Admins können auch Deaktivierte wählen, wer `posten:bearbeiten` hat auch archivierte Posten.

## Ansicht „Mitglieder“

Pro Person ein Block mit dem Namen (`StatusName`, Link zur Detailseite) und diesen Zeilen:

- **Status:** ein Balken je Zeitraum (`statusZeitraeume`), in der Farbe des Status (`BADGE_FARBE`, Ton 6). Einträge ohne Datum werden nicht gezeichnet.
- **Je Posten**, den die Person je hatte: die Besetzungen, am Statuswechsel zerteilt, sodass ein Balken mit dem Status die Farbe wechselt.
  Zeiträume ohne datierten Status sind grau und schraffiert („Status unbekannt“).

Offene Enden laufen bis heute, bei Deaktivierten bis zum Deaktivierungsdatum. Alle Blöcke teilen sich einen Bereich: frühestes Datum
aller gewählten Personen bis heute. Die Legende zeigt die Statusfarben. Daten: `GET /api/mitglieder/:kennung/historie` je Person (Query-Key `['historie', kennung]`).

## Ansicht „Posten“

Pro gewähltem Posten ein Zeitstrahl, eine Zeile je Person (mehrere Besetzungen derselben Person in einer Zeile), die am längsten zurückliegende
zuerst. Die Farbe gehört zur Person und gilt über alle gewählten Posten (`MITGLIED_PALETTE`, vergeben nach erstem Start, dann Username;
nach zwölf Personen beginnt die Palette von vorn). Gemeinsamer Bereich für alle Posten, darunter die Legende der Personen. Daten: `GET /api/posten`
(Besetzungen sind enthalten).

## Bedienung

- Jeder Balken hat einen Tooltip (Hover, Fokus, Berühren), z. B. „Kassenwart · Mitglied · 06.11.2012 – 31.12.2019“ oder „… · seit 06.11.2012“;
  derselbe Text ist das `aria-label` des fokussierbaren Balkens.
- Achse mit Jahresmarken (Monatsmarken unter zwei Jahren, Marken am 1. und 15. unter vier Monaten). Positionen sind Prozent des Bereichs. Auf dem
  Handy scrollt nur der Zeitstrahl waagerecht (Namensspalte bleibt stehen), nicht die Seite. `overscroll-behavior: contain` verhindert,
  dass ein schwungvolles Wischen an den Anfang die Seite neu lädt oder zurück navigiert.
- Die Namensspalte ist so breit wie der längste Name aller Diagramme der Ansicht (damit die Zeitachsen untereinander stehen), höchstens 96 px auf dem Handy und 200 px ab `sm`; längere Namen brechen um.

## Drucken

„Drucken“ ruft `window.print()` auf. Das Druck-CSS (`ZEITSTRAHL_CSS`) setzt A4 quer ohne Seitenrand (dann lassen Browser ihre eigene
Kopf- und Fußzeile mit URL und Seitenzahl weg) und 10 mm Innenabstand, blendet Kopfzeile, Menü, Seitentitel und alles mit `data-druck="aus"` aus, hebt Scrollbereich und Mindestbreite auf (der Zeitstrahl füllt die Seitenbreite), erhält Farben und vermeidet Seitenumbrüche in Blöcken.
