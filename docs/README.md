# Dokumentation

Dokumentation der Features von C4. Sie soll kurz und aktuell bleiben: Wer ein Feature ändert,
aktualisiert die zugehörige Seite im selben Change.

| Seite                                            | Inhalt                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| [members.md](./members.md)                       | Mitglieder: Profil, Status, Rechte, Kontaktkanäle, Profilbilder, Mitgliederliste |
| [posten.md](./posten.md)                         | Posten: Verantwortlichkeiten, Besetzungen, Rechte über Posten, Archiv            |
| [waren.md](./waren.md)                           | Waren: Lagerorte, Gebinde, Bestandsbuchungen (FIFO), Inventur, Rechte            |
| [inventar.md](./inventar.md)                     | Inventar: Gegenstände, Kategorien, IFCOs, Plätze, Ausleihen, Rechte              |
| [kalender.md](./kalender.md)                     | Kalender: Events, Schichten, Dienste, Dienstschwein, Teilnahme, ICS-Abo          |
| [benachrichtigungen.md](./benachrichtigungen.md) | Benachrichtigungen: Web Push, Arten, Einstellungen, Job                          |
| [datenbank.md](./datenbank.md)                   | Datenbank: Migrationen, Rollback mit Down-Dateien, Reset (nur dev)               |

## Allgemein

- Als App vom Homescreen gestartet (`display: standalone`, v. a. iOS) bietet der Browser kein Neuladen durch Herunterziehen.
  `PullToRefresh` (in `AppLayout`) ergänzt das nur in diesem Modus: oben auf der Seite herunterziehen, ab 80 px loslassen lädt
  die Seite neu. Gesten in Dialogen, Drawern, Menüs und beim Ziehen per Drag-and-drop zählen nicht.

Architektur, Einrichtung und Deployment stehen in der `README.md` im Repository-Root.
