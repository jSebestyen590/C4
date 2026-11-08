# Mitglieder

Ein Mitglied ist eine Person mit einem Cognito-Konto **und** einer Profilzeile in der Datenbank.
Cognito verwaltet die Anmeldedaten (Username, E-Mail, Passwort), die Datenbank alles andere.

## Datenmodell

Tabelle `mitglieder`, Schlüssel ist die Cognito-`sub` (Migrationen `0002`–`0005`). Aurora DSQL erlaubt
pro Migration nur ein DDL-Statement und kein `ALTER ... SET NOT NULL`. Fremdschlüssel sind erlaubt. Später
hinzugefügte Spalten sind deshalb nullable.

| Spalte                             | Hinweise                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `vorname`, `nachname`              | Pflicht (bei eingeladenen Mitgliedern leer, bis sie ihr Profil ausfüllen).       |
| `status`                           | `anwaerter` (Standard), `mitglied`, `em`, `extern`. Nur Admins ändern ihn.       |
| `anrede`                           | `maennlich`, `weiblich`, `neutral`; null gilt als neutral.                       |
| `adresse`, `telefon`, `ueber_mich` | Optionaler Freitext.                                                             |
| `kontaktkanaele`                   | Kommaseparierte Kanäle, z. B. `whatsapp,mail` (siehe unten).                     |
| `discord_name`                     | Discord-Username, nur zur Anzeige.                                               |
| `profilbild_key`                   | S3-Key des großen Bildes; null ohne Bild.                                        |
| `geburtsdatum`                     | Optional, `YYYY-MM-DD` (Migration `0071`); nicht in der Zukunft, nicht vor 1900. |
| `geburtstag_im_kalender`           | Boolean, null = an (Migration `0072`). Aus: nicht im Kalender, keine Erinnerung. |
| `deaktiviert_am`                   | Zeitstempel, null = aktiv (Migration `0097`), siehe „Accounts deaktivieren“.     |

**Geburtstag:** Im Profil (`/profil`, `DatumFeld` + Schalter „Geburtstag im Kalender anzeigen“, ohne Datum
deaktiviert) pflegbar. `PUT /api/me/mitglied` muss immer beide Felder senden, sonst werden sie zurückgesetzt. Andere
Mitglieder bekommen `geburtsdatum` immer (Profil und Detailseite zeigen „Geburtstag“, sobald gesetzt);
`geburtstag_im_kalender` steuert nur Kalender und Erinnerung. Drei Stufen: kein Datum / nur im Profil / Profil, Kalender
und Erinnerung. Kalender und Erinnerung:
`docs/kalender.md`, `docs/benachrichtigungen.md`.

**Username** (Cognito `preferred_username`) und **E-Mail** kommen aus Cognito und werden nicht
gespeichert. Die Mitgliederliste ist die Vereinigung aller Profilzeilen und aller aktivierten
Cognito-Konten. Mitglieder, die ihre Aktivierung noch nicht abgeschlossen haben oder noch keine Zeile
haben, erscheinen also ebenfalls.

## Statuswechsel

Üblich ist Anwärter:in → Mitglied → EM, Schritt für Schritt. Zu Externe:r kann man jederzeit wechseln, und Externe
können als Anwärter:in einsteigen (`statusUebergangUeblich` in `packages/shared/src/status.ts`). Jeder andere Wechsel
(Stufe übersprungen, zurück) ist erlaubt, aber das Statusfeld fragt vorher mit einer Warnung nach. Das API prüft die
Reihenfolge nicht.

Statuswechsel und Einladungen entstehen auch aus **Protokollen**: Beim Abschließen laden Anwärter:in-Bausteine ein (Konto plus
Profil als Anwärter:in), Aufnahme und Neues EM setzen den Status (`mitglied`, `em` bzw. `extern`), jeweils ab dem Sitzungsdatum.
Das läuft mit dem Recht `protokolle:schreiben`, ohne `users:manage`; siehe [protokolle.md](./protokolle.md#aktionen-beim-abschließen).

## Status-Historie

Jeder Statuswechsel steht mit Datum in der Tabelle `mitglied_status_verlauf` (Migrationen `0098`–`0100`; Code in
`packages/shared/src/statusVerlauf.ts`). Die Spalte `mitglieder.status` ist davon **abgeleitet**: Sie zeigt den jüngsten
Eintrag und wird bei jeder Änderung des Verlaufs nachgezogen.

- **Altbestand:** Die Migration legt für jedes Mitglied einen Eintrag mit dem bisherigen Status ohne Datum an. Das Datum
  ist unbekannt und erscheint als „seit ?“; Admins können es nachtragen.
- **Anzeige:** Auf der Detailseite (und im eigenen Profil) zeigt „Status-Historie“ eine Timeline („ab 09.10.2012“ + Status)
  und die **Dauer der Mitgliedschaft**: alle Tage mit Status „Mitglied“ bis heute bzw. bis zur Deaktivierung (Zeiträume
  ohne Datum zählen nicht, „1 Tag“ im Singular). Der Link „Im Zeitstrahl ansehen“ öffnet [die Historie](./historie.md).
- **Bearbeiten (Admins, `users:manage`):** Je Eintrag Bearbeiten und Löschen, dazu „Eintrag hinzufügen“ (Status, Datum
  Pflicht und nicht in der Zukunft). Bei deaktivierten Accounts ist die Historie gesperrt (409). Das API lehnt ein
  doppeltes Datum ab (409) sowie das Löschen des letzten Eintrags (400).
- **Statusfeld:** Nach der Wahl eines neuen Status fragt der Dialog „Status ändern“ nach dem Datum „Ab“ (Standard heute)
  und zeigt dort auch die Warnung bei ungewöhnlichen Wechseln.

## Mitglieder anlegen

Ein Admin lädt ein Mitglied per E-Mail ein (`POST /api/admin/users`). Dabei entstehen das Cognito-Konto
**und** die Profilzeile mit dem gewählten Anfangsstatus. Beim ersten Login wird das Mitglied auf
`/profil` geleitet, bis Username und Name gesetzt sind. Eine Selbstregistrierung gibt es nicht.

## Rechte

Die effektiven Rechte berechnet das API bei jedem Request (`packages/shared/src/roles.ts`,
`packages/api/src/auth.ts`):

```
Rechte = STATUS_PERMISSIONS[Status]  ∪  ROLE_PERMISSIONS[Cognito-Gruppen]  ∪  Rechte der aktuellen Posten
```

- Der `status` kommt aus der Profilzeile. Ohne Zeile gilt `anwaerter`.
- Die einzige Cognito-Gruppe ist `admin` (`users:manage`). Alles andere folgt aus dem Status.
- Die Web-App liest das Ergebnis von `GET /api/me` (`can()` in `auth.tsx`). Die Gruppen aus dem
  Token werden für die Oberfläche nicht verwendet.
- **Externe** (`extern`) haben vorerst dieselben Rechte wie Anwärter:innen (eigene Liste in `STATUS_PERMISSIONS`, damit sie sich später ändern lässt).
- Aktuell bekommen alle Status dieselben Rechte (`content:read`, `mitglieder:lesen`, `profil:bearbeiten`, `posten:lesen`,
  `waren:lesen`, `bestand:buchen`, `inventar:lesen`, `inventar:umraeumen`, `kalender:lesen`, `schluessel:lesen`, `umfragen:lesen`, `trichter:lesen`, `bilder:lesen`, `protokolle:lesen`). Sobald Features unterschiedliche Rechte
  brauchen, trägt man sie in `STATUS_PERMISSIONS` ein. Die Verwaltungsrechte `waren:verwalten`,
  `inventar:verwalten`, `events:verwalten`, `kalender:einrichten`, `schluessel:verwalten`, `umfragen:verwalten`, `trichter:verwalten`, `protokolle:schreiben` und `privatpartys:verwalten` haben nur Admins und Posten (siehe
  [waren.md](./waren.md), [inventar.md](./inventar.md), [kalender.md](./kalender.md), [schluessel.md](./schluessel.md),
  [umfragen.md](./umfragen.md), [trichter.md](./trichter.md), [protokolle.md](./protokolle.md),
  [privatpartys.md](./privatpartys.md)).
- Zusätzliche Rechte kommen über Posten: Wer einen Posten aktuell innehat, erhält dessen Rechte
  (siehe [posten.md](./posten.md)).

## Accounts deaktivieren

Admins (`users:manage`) können Accounts deaktivieren und wieder aktivieren (Detailseite `/mitglieder/<name>`, Buttons
„Account deaktivieren“ / „Account wieder aktivieren“). Das eigene Konto lässt sich nicht deaktivieren (400).

- **Wahrheit ist die Spalte `deaktiviert_am`.** Das API prüft sie bei jedem Request, denn Cognito-Access-Tokens bleiben bis zu
  1 h gültig. Ein deaktivierter Account bekommt auf jeder Route 403 `{ error, deaktiviert: true }`; die Web-App zeigt dann
  statt der App die Seite „Account deaktiviert“ (`DeaktiviertSeite`, nur „Abmelden“).
- Zusätzlich wird der Cognito-Nutzer deaktiviert (`AdminDisableUser`) und überall abgemeldet (`AdminUserGlobalSignOut`);
  Aktivieren ruft `AdminEnableUser`.
- Der **Status** eines deaktivierten Accounts ist eingefroren: `PUT /api/admin/mitglieder/:sub/status` antwortet mit 409,
  das Statusfeld ist gesperrt, bis der Account wieder aktiv ist.
- **Herausgefiltert** werden Deaktivierte aus der Mitgliederliste (außer `?deaktivierte=1` für Admins, Schalter „Deaktivierte
  anzeigen“, ausgegraut mit Badge „Deaktiviert“), allen Auswahlfeldern, den Personenkreisen (Kalender, Umfragen), den
  Pushes und den Geburtstagen. `GET /api/mitglieder/:kennung` liefert sie weiter, damit Links aus der Historie funktionieren.
- Alte Einträge (Dienste, Trichter, Verlauf, Umfragen) behalten den Namen.
- Der Bestätigungsdialog lädt die Vorschau und listet „Noch offen“: künftige Dienste, Posten und gehaltene Schlüssel.
  **Automatisch ändert sich nichts**; die Admins räumen das selbst auf.
- Neue Einträge für Deaktivierte (Dienst, Trichter-Teilnahme, Schlüsselübergabe) lehnt das API mit 400 ab.

## Gegenderte Texte

Texte, die eine Person bezeichnen (Status, Rollen), gibt es in männlicher, weiblicher und neutraler
Form (`Gegendert` in `packages/web/src/i18n.ts`). Man wählt die Form mit
`labelFuer(labels, value, anrede)` und nimmt die `anrede` der Person, über die der Text spricht.

## Kontaktkanäle

Kanäle: WhatsApp, Telegram, Signal, Discord, Mail. Überall als Icons dargestellt (ausgegraut, wenn
nicht gewählt). Im Profil werden sie über Toggle-Buttons bearbeitet. Gewählte Kanäle verlinken auf die
App:

| Kanal    | Link                             | Quelle           |
| -------- | -------------------------------- | ---------------- |
| WhatsApp | `https://wa.me/<nummer>`         | Telefonnummer    |
| Signal   | `https://signal.me/#p/+<nummer>` | Telefonnummer    |
| Telegram | `https://t.me/+<nummer>`         | Telefonnummer    |
| Mail     | `mailto:<adresse>`               | E-Mail (Cognito) |
| Discord  | kein Link (Name nur angezeigt)   | `discord_name`   |

Die Telefonnummer ist Freitext und wird mit `telefonNormalisieren` umgewandelt (bei führender `0`
gilt `+49`, nicht lesbare Nummern ergeben keinen Link). Code: `packages/shared/src/kontakt.ts`.

Wer WhatsApp, Signal oder Telegram wählt, muss im Profil eine lesbare Telefonnummer angeben (Schema
`mitgliedAktualisierenSchema`, gilt auch im API: `PUT /api/me/mitglied` → 400). Bestehende Daten ohne
Nummer bleiben, die Prüfung greift beim nächsten Speichern.

**Als Kontakt speichern:** Auf der Detailseite (Button „Als Kontakt speichern“) und in der Mitgliederliste (Icon nach den
Kanal-Icons, in Karten und Tabelle) öffnet ein Link die vCard 3.0 des Mitglieds, sodass Handy-Kontakte-Apps „Neuer Kontakt“
anbieten (iOS öffnet Blob-Downloads der PWA nicht, deshalb eine echte URL). Nicht für deaktivierte Mitglieder und nicht für den eigenen Eintrag.

- `POST /api/me/vcard-token` (`mitglieder:lesen`) erzeugt einen Token für den Betrachter (24 h gültig, ersetzt den alten;
  Tabelle `vcard_tokens`, nur der SHA-256-Hash wird gespeichert). Der Hook `useVcardToken()` (`packages/web/src/vcard.ts`)
  holt ihn und erneuert ihn vor dem Ablauf; solange er fehlt, gibt es kein Icon bzw. der Button ist deaktiviert.
- `GET /api/vcard/:token/<username oder sub>.vcf` ist **öffentlich** (eigene API-Gateway-Route ohne Authorizer, Muster wie
  `GET /api/kalender/feed/:token`). Unbekannter oder abgelaufener Token, deaktivierter Token-Inhaber (oder ohne
  `mitglieder:lesen`) und deaktivierte oder unbekannte Mitglieder ergeben 404. Antwort: `Content-Type: text/vcard`,
  `Content-Disposition: inline`, `Cache-Control: no-store`.
- Inhalt (`vcardErstellen`, `packages/shared/src/kontakt.ts`): Name, Username (Nickname), Organisation C4, Telefon
  (normalisiert), E-Mail, Geburtstag, Adresse, Discord-Name (Notiz) und das kleine Profilbild (serverseitig über
  `Profilbilder.lesen`, bei Fehlern ohne Foto).

Discord lässt sich nicht über den Username verlinken. Ein Bot auf dem Vereinsserver könnte Namen in
User-IDs auflösen (`GET /guilds/{id}/members/search`). Das ist nicht gebaut und braucht ein Bot-Token
sowie den Server Members Intent.

## Benachrichtigungen im Profil

Die Profilseite enthält keine Benachrichtigungs-Einstellungen mehr. Sie liegen auf der eigenen Seite
`/benachrichtigungen` (Profilmenü, Eintrag „Benachrichtigungen“); siehe [benachrichtigungen.md](./benachrichtigungen.md).

## Ungespeicherte Änderungen

Das Profilformular merkt sich die zuletzt geladenen/gespeicherten Werte. Weicht es davon ab, fragt ein Dialog
„Änderungen verwerfen?“ („Verwerfen“ / „Weiter bearbeiten“) bei jeder Navigation (Menü, Links, Zurück), und der Browser
warnt beim Schließen/Neuladen. Nach dem Speichern (auch beim Wechsel des Benutzernamens) ist das Formular nicht mehr
„dirty“. Dafür läuft die App mit `createBrowserRouter` + `RouterProvider` (`useBlocker`).

## Profilbilder

Das Bild wird im Profil gewählt und im Browser auf ein Quadrat zugeschnitten (`react-easy-crop`).
Zwei Dateien gehen per Presigned URL direkt nach S3:

- **groß:** der gewählte Ausschnitt in voller Auflösung (PNG bleibt PNG, sonst JPEG mit 95 %), bis
  20 MB. Wird nur im vergrößerten Overlay der Detailseite gezeigt.
- **klein:** der Ausschnitt mit höchstens 256 px (JPEG), Key = Key des großen Bildes mit `-klein.jpg`.
  Wird überall sonst gezeigt.

Gespeichert wird nur `profilbild_key` (groß), der kleine Key wird abgeleitet (`kleinKey`). Beim Ersetzen
oder Entfernen werden beide Dateien gelöscht. Keys müssen unter `profilbilder/<eigene sub>/` liegen.

## Username und URLs

Der Username wird auf der Profilseite gewählt (Cognito-Alias, eindeutig, 3–64 Zeichen aus
`A-Za-z0-9._-`, darf nicht wie eine UUID aussehen). Die Detailseite liegt unter
`/mitglieder/<username>`. Wo ein Mitglied in anderen Seiten (Posten, Verlauf, Ausleihen) erwähnt wird, steht sein Username, fett in der Statusfarbe (`StatusName`) und möglichst verlinkt (`mitgliedLink`); nur ohne Username erscheint „Vorname Nachname“. Mitglieder ohne Username sind über ihre `sub` erreichbar. Ändert man auf der
eigenen Detailseite den Username, zieht die URL mit.

## E-Mail ändern

`PUT /api/me/email` startet die Änderung mit dem Access-Token des Nutzers (Cognito
`UpdateUserAttributes`), `POST /api/me/email/bestaetigen` bestätigt den per E-Mail gesendeten Code.
Dafür braucht es den Scope `aws.cognito.signin.user.admin`. Wer sich vor dessen Einführung angemeldet
hat, muss sich neu anmelden.

## Seiten und API

| Seite                | Wer                | Zweck                                                                                                                                                                                  |
| -------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/profil`            | jedes Mitglied     | Eigenes Profil bearbeiten (auch Gate beim ersten Login)                                                                                                                                |
| `/mitglieder`        | `mitglieder:lesen` | Übersicht „Anzahl je Status“ (ohne Deaktivierte), Liste (Kacheln auf dem Handy, sortierbare Tabelle ab `sm`) mit den aktuellen Posten als Links, ohne Berechtigungen; Admins laden ein |
| `/mitglieder/<name>` | `mitglieder:lesen` | Detail; die eigene Seite ist bearbeitbar; Admins ändern Status, Rollen, Account und die Status-Historie                                                                                |
| `/historie`          | `mitglieder:lesen` | Zeitstrahl von Status und Posten, siehe [historie.md](./historie.md)                                                                                                                   |

| Route                                                                         | Hinweise                                                                                      |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET/PUT /api/me/mitglied`                                                    | Eigenes Profil                                                                                |
| `PUT /api/me/username`, `PUT /api/me/email`, `POST /api/me/email/bestaetigen` | Über Cognito                                                                                  |
| `POST /api/me/vcard-token`, `GET /api/vcard/:token/:datei`                    | vCard-Link; die GET-Route ist öffentlich (Token in der URL), 404 bei ungültigem Token         |
| `POST /api/me/profilbild`                                                     | Presigned Upload-URLs (groß und klein)                                                        |
| `GET /api/mitglieder`, `GET /api/mitglieder/:kennung`                         | `rollen` nur für Admins; `posten` für alle; `?deaktivierte=1` (Admin) nimmt Deaktivierte dazu |
| `GET /api/admin/mitglieder/:sub/deaktivieren-vorschau`                        | Admin; offene Dienste, Posten, Schlüssel                                                      |
| `PUT /api/admin/mitglieder/:sub/aktiv`                                        | Admin; Body `{ aktiv }`, 400 bei sich selbst                                                  |
| `PUT /api/admin/mitglieder/:sub/status`                                       | Admin; Body `{ status, ab? }` (`ab` Standard heute, nicht in der Zukunft)                     |
| `GET /api/mitglieder/:kennung/historie`                                       | `mitglieder:lesen`; Status-Verlauf, Besetzungen, `deaktiviertAm` (auch für Deaktivierte)      |
| `POST /api/admin/mitglieder/:sub/status-verlauf`                              | Admin; `{ status, ab }`, 201 mit dem Verlauf                                                  |
| `PUT/DELETE /api/admin/mitglieder/:sub/status-verlauf/:id`                    | Admin; 409 bei deaktiviertem Account oder doppeltem Datum, 400 beim letzten Eintrag           |
| `PUT /api/admin/mitglieder/:sub/rollen`                                       | Admin; die eigene Admin-Rolle bleibt erhalten                                                 |
| `POST /api/admin/users`                                                       | Admin; Einladung samt Profilzeile                                                             |

Die Lambda braucht die Cognito-Berechtigungen aus `infra/modules/app/main.tf`, darunter
`ListUsersInGroup` für die Rollenspalte.

## Datenbank zurücksetzen (nur dev)

`pnpm db:reset` löscht alle Tabellen (braucht `CONFIRM_DB_RESET=yes`). Der Deploy-Workflow hat dafür
die Eingabe `reset_db`, die nur für `dev` funktioniert. Einzelne Migrationen zurückzunehmen steht in
[datenbank.md](./datenbank.md).
