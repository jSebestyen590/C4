# Waren (Mini-Warensystem)

Lagerorte (Baum), Warengruppen (Baum), Gebinde, Waren, Bestandsbuchungen und Inventur. Fachlogik
(Bestand, FIFO, Verlauf, Inventurabgleich) liegt in `packages/shared/src/waren.ts`, Speicherung und
Validierung in `packages/api/src/waren.ts`, Routen in `packages/api/src/app.ts`.

## Rechte

- `waren:lesen` und `bestand:buchen` haben alle Status. Buchen umfasst Einlagerung, Entnahme, Inventur
  (starten, zählen, abschließen, verwerfen) und das endgültige Löschen eines Vorgangs.
- `waren:verwalten` (Stammdaten: Lagerorte samt Reihenfolge und Warenliste, Warengruppen, Gebinde, Waren) haben Admins und
  die Vorstandsposten (Migration `0024`); es lässt sich über `POSTEN_RECHTE` auch weiteren Posten geben.

## Datenmodell

Migrationen `0010`–`0023`. Bestand ist die Summe der `bestandsbuchungen.menge` je Ware, Lagerort, Gebinde und MHD;
ein `bestandsvorgang` (Einlagerung, Entnahme, Inventur) hat viele Zeilen. `erstellt_von` ist die Cognito-`sub` ohne
Fremdschlüssel. Entnahmen werden beim Buchen FIFO geplant (Bestand zum gewählten Zeitpunkt, Teilbaum des Lagerorts) und
nie neu berechnet; negativer Bestand ist erlaubt.

Stammdaten werden nur gelöscht, wenn nichts darauf verweist (sonst 409), ansonsten archiviert
(`PUT …/:id/archiv { archiviert }`). Ein Lagerort lässt sich nur archivieren, wenn der Bestand seines ganzen Teilbaums 0 ist;
dabei wird der Teilbaum archiviert. Auf archivierte Einträge lässt sich nicht buchen oder sie auswählen (400); Listen
zeigen sie nur mit `?archiv=1`.

## API

| Route                                                                                                                                                                                | Recht             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `GET /api/lagerorte`, `/warengruppen`, `/gebinde`, `/waren`, `/waren/:id[/bestand\|verlauf\|vorgaenge]`, `/lagerorte/:id/waren`                                                      | `waren:lesen`     |
| `POST/PUT/DELETE` auf `/lagerorte`, `/warengruppen`, `/gebinde`, `/waren`; `PUT …/:id/archiv`; `PUT /lagerorte/:id/reihenfolge` (`root` = oberste Ebene); `PUT /lagerorte/:id/waren` | `waren:verwalten` |
| `POST /api/bestand/einlagerung`, `POST /api/bestand/entnahme`, `DELETE /api/bestand/vorgaenge/:id`                                                                                   | `bestand:buchen`  |
| `GET /api/inventuren[?status=offen]`, `GET /api/inventuren/:id`, `GET …/:id/zusammenfassung[?zeitpunkt=]`                                                                            | `waren:lesen`     |
| `POST /api/inventuren`, `PUT …/:id/knoten/:lid`, `POST …/:id/abschluss`, `DELETE …/:id`                                                                                              | `bestand:buchen`  |

Inventur: pro Lagerort höchstens eine offene (409). Der Entwurf liegt auf dem Server; beim Abschluss entsteht ein
Vorgang (`typ=inventur`, `quelle=inventur`) mit den Korrekturen gegenüber dem Soll zum gewählten Zeitpunkt. Nicht gezählte
Knoten gelten als 0.

## Oberfläche

- `/lager` (`waren:lesen`): Lagerort-Baum als einklappbare Liste. Mit `waren:verwalten` gibt es je Knoten ein Menü
  (Unterebene anlegen, Bearbeiten, Nach oben/unten, Warenliste bearbeiten, Archivieren, Löschen; bei 409 wird
  stattdessen Archivieren angeboten). Mit `bestand:buchen` startet oder setzt man eine Inventur fort (`/lager/inventur/:id`);
  oberste Knoten zeigen die Schaltfläche direkt. Die Reihenfolge der Warenliste ist die Zählreihenfolge der Inventur.
- `/lager/stammdaten`: Tabs „Warengruppen“ (Baum, nach Name sortiert, verschiebbar über die übergeordnete Gruppe) und
  „Gebinde“ (Karten auf dem Handy, Tabelle ab `sm`; Pfand, Untergebinde, Gesamtpfand).
- `WareFelder.tsx`: wiederverwendbares Formular für Waren (Name, Warengruppe, MHD-Art, Gebinde, Aliase).
