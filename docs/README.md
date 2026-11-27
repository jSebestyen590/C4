# Dokumentation

Dokumentation der Features von C4. Sie soll kurz und aktuell bleiben: Wer ein Feature ändert,
aktualisiert die zugehörige Seite im selben Change.

Jede Seite beginnt direkt unter dem Titel mit einem `## Überblick` (kurze Zusammenfassung und Abschnittsliste), damit man erst nur den Anfang liest und dann gezielt zum passenden Abschnitt springt; neue Seiten brauchen ebenfalls einen.

| Seite                                            | Inhalt                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| [members.md](./members.md)                       | Mitglieder: Profil, Status, Rechte, Kontaktkanäle, Profilbilder, Mitgliederliste                          |
| [posten.md](./posten.md)                         | Posten: Verantwortlichkeiten, Besetzungen, Rechte über Posten, Archiv                                     |
| [historie.md](./historie.md)                     | Historie: Zeitstrahl von Status und Posten je Mitglied bzw. Posten, Drucken                               |
| [waren.md](./waren.md)                           | Waren: Lagerorte, Gebinde, Bestandsbuchungen (FIFO), Inventur, Rechte                                     |
| [inventar.md](./inventar.md)                     | Inventar: Gegenstände, Kategorien, IFCOs, Plätze, Ausleihen, Rechte                                       |
| [kalender.md](./kalender.md)                     | Kalender: Events, Schichten, Dienste, Dienstschwein, Teilnahme, ICS-Abo                                   |
| [protokolle.md](./protokolle.md)                 | Protokolle: Sitzungen, Kopf mit Teilnahme, Dokument mit Bausteinen, Autosave                              |
| [todos.md](./todos.md)                           | Todos: Aufgaben aus Protokollen und eigene, Modi Gemeinsam/Einzeln, Seite, Erinnerung                     |
| [bilder.md](./bilder.md)                         | Bilder: OneDrive-Ordner der Events, Suche, Ordner anlegen, Verbindung                                     |
| [schluessel.md](./schluessel.md)                 | Schlüssel: wer welchen Schlüssel hat, Übergaben, Verlauf, Verwaltung                                      |
| [umfragen.md](./umfragen.md)                     | Umfragen: Fragen, Pflicht- und optionale Kreise, Anonymität, Erinnerungen                                 |
| [privatpartys.md](./privatpartys.md)             | Privatpartys: Anfragen, Personen, Wunschtermine, Umfrage, Zusage mit Event, Absage                        |
| [trichter.md](./trichter.md)                     | Trichter: Durchgänge, geteiltes Volumen, Trichterkönig:in, Rangliste, Verwaltung                          |
| [benachrichtigungen.md](./benachrichtigungen.md) | Benachrichtigungen: Web Push, Arten, Einstellungen, Job                                                   |
| [buch.md](./buch.md)                             | Buch: Strichlisten-Seiten, Tarife, Abrechnung, Storno, eigene Seite, Rangliste, Push                      |
| [finanzen.md](./finanzen.md)                     | Finanzen: Kontenplan, Journal, Hash-Kette, Rechte; Plan in `plans/finanzen.md`                            |
| [datenbank.md](./datenbank.md)                   | Datenbank: Migrationen, Rollback mit Down-Dateien, Reset (nur dev)                                        |
| [querschnitt.md](./querschnitt.md)               | Querschnitt: Auth-Modell, Rechteberechnung, Fehler-Mapping, DSQL-Wiederholung, PWA-Icons, Offline-Hinweis |
| [e2e.md](./e2e.md)                               | E2E-Tests: Playwright-Setup, Layout-Smoke-Test über alle Routen, Routen und Ausnahmen pflegen             |
| [refactoring.md](./refactoring.md)               | Review 11/2026: geprüft, erledigt, offen (vor jedem Refactoring lesen)                                    |

## Allgemein

- Als App vom Homescreen gestartet (`display: standalone`, v. a. iOS) bietet der Browser kein Neuladen durch Herunterziehen.
  `PullToRefresh` (in `AppLayout`) ergänzt das nur in diesem Modus: oben auf der Seite herunterziehen, ab 80 px loslassen lädt
  die Seite neu. Gesten in Dialogen, Drawern, Menüs und beim Ziehen per Drag-and-drop zählen nicht.
- **Zurück-Links** oben auf Unterseiten (`ZurueckLink`) führen dorthin zurück, wo man herkam (Browser-History, Filter und
  Scrollposition bleiben), z. B. vom Teil zum Obergegenstand. `AppLayout` merkt sich je History-Eintrag die Vorseite
  (`zurueckVerlauf.ts`, in `sessionStorage`, übersteht Neuladen). Einträge derselben Seite werden übersprungen. Ohne Vorseite
  in der App (Deep-Link, neuer Tab) gilt das feste Ziel der Seite, z. B. die Liste bzw. beim Teil der Obergegenstand. Das Label
  nennt das feste Ziel, wenn die Vorseite genau dieses ist, sonst lautet es „Zurück“. Formulare ersetzen sich nach dem
  Speichern per `replace` durch die gespeicherte Seite, damit „Zurück“ nicht ins Formular führt.

Architektur, Einrichtung und Deployment stehen in der `README.md` im Repository-Root.
