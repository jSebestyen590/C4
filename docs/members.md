# Mitglieder

Ein Mitglied ist eine Person mit einem Cognito-Konto **und** einer Profilzeile in der Datenbank.
Cognito verwaltet die Anmeldedaten (Username, E-Mail, Passwort), die Datenbank alles andere.

## Datenmodell

Tabelle `mitglieder`, Schlüssel ist die Cognito-`sub` (Migrationen `0002`–`0005`). Aurora DSQL erlaubt
pro Migration nur ein DDL-Statement und kein `ALTER ... SET NOT NULL`. Fremdschlüssel sind erlaubt. Später
hinzugefügte Spalten sind deshalb nullable.

| Spalte                             | Hinweise                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `vorname`, `nachname`              | Pflicht (bei eingeladenen Mitgliedern leer, bis sie ihr Profil ausfüllen). |
| `status`                           | `anwaerter` (Standard), `mitglied`, `em`. Nur Admins ändern ihn.           |
| `anrede`                           | `maennlich`, `weiblich`, `neutral`; null gilt als neutral.                 |
| `adresse`, `telefon`, `ueber_mich` | Optionaler Freitext.                                                       |
| `kontaktkanaele`                   | Kommaseparierte Kanäle, z. B. `whatsapp,mail` (siehe unten).               |
| `discord_name`                     | Discord-Username, nur zur Anzeige.                                         |
| `profilbild_key`                   | S3-Key des großen Bildes; null ohne Bild.                                  |

**Username** (Cognito `preferred_username`) und **E-Mail** kommen aus Cognito und werden nicht
gespeichert. Die Mitgliederliste ist die Vereinigung aller Profilzeilen und aller aktivierten
Cognito-Konten. Mitglieder, die ihre Aktivierung noch nicht abgeschlossen haben oder noch keine Zeile
haben, erscheinen also ebenfalls.

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
- Aktuell bekommen alle Status dieselben Rechte. Sobald Features unterschiedliche Rechte brauchen,
  trägt man sie in `STATUS_PERMISSIONS` ein.
- Zusätzliche Rechte kommen über Posten: Wer einen Posten aktuell innehat, erhält dessen Rechte
  (siehe [posten.md](./posten.md)).

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

Discord lässt sich nicht über den Username verlinken. Ein Bot auf dem Vereinsserver könnte Namen in
User-IDs auflösen (`GET /guilds/{id}/members/search`). Das ist nicht gebaut und braucht ein Bot-Token
sowie den Server Members Intent.

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
`/mitglieder/<username>`. Mitglieder ohne Username sind über ihre `sub` erreichbar. Ändert man auf der
eigenen Detailseite den Username, zieht die URL mit.

## E-Mail ändern

`PUT /api/me/email` startet die Änderung mit dem Access-Token des Nutzers (Cognito
`UpdateUserAttributes`), `POST /api/me/email/bestaetigen` bestätigt den per E-Mail gesendeten Code.
Dafür braucht es den Scope `aws.cognito.signin.user.admin`. Wer sich vor dessen Einführung angemeldet
hat, muss sich neu anmelden.

## Seiten und API

| Seite                | Wer                | Zweck                                                                                                                            |
| -------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `/profil`            | jedes Mitglied     | Eigenes Profil bearbeiten (auch Gate beim ersten Login)                                                                          |
| `/mitglieder`        | `mitglieder:lesen` | Liste (Kacheln auf dem Handy, sortierbare Tabelle ab `sm`) mit den aktuellen Posten als Links; Admins sehen Rollen und laden ein |
| `/mitglieder/<name>` | `mitglieder:lesen` | Detail; die eigene Seite ist bearbeitbar; Admins ändern Status und Rollen                                                        |

| Route                                                                         | Hinweise                                      |
| ----------------------------------------------------------------------------- | --------------------------------------------- |
| `GET/PUT /api/me/mitglied`                                                    | Eigenes Profil                                |
| `PUT /api/me/username`, `PUT /api/me/email`, `POST /api/me/email/bestaetigen` | Über Cognito                                  |
| `POST /api/me/profilbild`                                                     | Presigned Upload-URLs (groß und klein)        |
| `GET /api/mitglieder`, `GET /api/mitglieder/:kennung`                         | `rollen` nur für Admins; `posten` für alle    |
| `PUT /api/admin/mitglieder/:sub/status`                                       | Admin                                         |
| `PUT /api/admin/mitglieder/:sub/rollen`                                       | Admin; die eigene Admin-Rolle bleibt erhalten |
| `POST /api/admin/users`                                                       | Admin; Einladung samt Profilzeile             |

Die Lambda braucht die Cognito-Berechtigungen aus `infra/modules/app/main.tf`, darunter
`ListUsersInGroup` für die Rollenspalte.

## Datenbank zurücksetzen (nur dev)

`pnpm db:reset` löscht alle Tabellen (braucht `CONFIRM_DB_RESET=yes`). Der Deploy-Workflow hat dafür
die Eingabe `reset_db`, die nur für `dev` funktioniert.
