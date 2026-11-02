# Historie

Die Seite `/historie` (Menü „Historie“, Recht `mitglieder:lesen`) zeigt Zeitstrahlen (Gantt-artig, ohne Diagramm-Bibliothek).
Code: `packages/web/src/pages/HistoriePage.tsx`, `Zeitstrahl.tsx`, Hilfsfunktionen in `zeitstrahlLogik.ts`.

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
- Achse mit Jahresmarken (Monatsmarken bei Bereichen unter zwei Jahren). Positionen sind Prozent des Bereichs. Auf dem Handy scrollt nur der Zeitstrahl
  waagerecht (Namensspalte bleibt stehen), nicht die Seite.

## Drucken

„Drucken“ ruft `window.print()` auf. Das Druck-CSS (`ZEITSTRAHL_CSS`) setzt A4 quer mit 10 mm Rand, blendet Kopfzeile, Menü und alles mit
`data-druck="aus"` aus, hebt Scrollbereich und Mindestbreite auf (der Zeitstrahl füllt die Seitenbreite), erhält Farben und vermeidet Seitenumbrüche in Blöcken.
