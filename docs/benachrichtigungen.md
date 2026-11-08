# Benachrichtigungen (Web Push)

Allgemeines Modul für Push-Nachrichten. Es kennt keinen Feature-Bereich; Nutzer sind der Kalender, Geburtstage, die
Schlüssel und die Umfragen. Einstellungen liegen auf der Seite `/benachrichtigungen` (Profilmenü, Eintrag „Benachrichtigungen“).

Tabellen (`push_abos`, `benachrichtigung_einstellungen`, `push_versand`, `push_schluessel`): Migrationen `0066`–`0070`.

## Konzept

- **Arten** stehen in der Registry `BENACHRICHTIGUNGS_ARTEN` (`packages/shared/src/benachrichtigungen.ts`):
  `key` (`<bereich>.<name>`), `bereich`, `standardAktiv` (`boolean` oder je Status `Record<MitgliedStatus, boolean>`),
  `minuten` (`{ standard, optionen }` oder `null`), optional `abschaltbar` (Standard `true`).
- **Nicht abschaltbar** (`abschaltbar: false`): die Art ist immer aktiv, gespeicherte Zeilen werden ignoriert,
  `PUT /api/me/benachrichtigungen` mit `aktiv: false` gibt 400; die Seite `/benachrichtigungen` zeigt den Schalter gesperrt („Immer aktiv.“).
- **Pro Person** wird je Art gespeichert, ob sie aktiv ist (und ggf. wie viele Minuten). Fehlt eine Zeile, gilt der
  Standard (`effektiveEinstellung(art, status, gespeichert)`).
- **Push pro Gerät**: jedes Gerät muss Push selbst aktivieren (Berechtigungsabfrage des Browsers); die Arten-Einstellungen
  gelten für alle Geräte der Person.
- Deaktivierte Mitglieder bekommen keine Pushes (siehe [members.md](./members.md)).
- Aktuelle Arten:

| Art                             | Wann                                                                                                                                                                                                                     | Standard                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `kalender.erinnerung`           | X Minuten vor Beginn der eigenen Schicht (15/30/60/120/1440)                                                                                                                                                             | an, 30 Minuten                   |
| `kalender.fehlende_dienste`     | Globaler Zeitpunkt (`/kalender/einrichtung` → Erinnerungen) erreicht und Event noch rot; je Event und Zeitpunkt einmal, an alle außer Personen, die für das Event nicht verfügbar sind (auch die verantwortliche Person) | an, **für EM aus** (Externe: an) |
| `kalender.aenderung`            | Eigener Dienst betroffen: Event verschoben/abgesagt/wieder aktiv, Schicht geändert/entfernt, von anderen ein- oder ausgetragen; auch Teilnehmende und Verantwortliche bei Verschiebung/Absage; neu Verantwortliche       | an                               |
| `kalender.teilnahme_erinnerung` | X Minuten vor Beginn eines Events, an dem man teilnimmt (15/30/60/120/1440)                                                                                                                                              | an, 60 Minuten                   |
| `geburtstag.erinnerung`         | Ein Mitglied hat Geburtstag: am Tag selbst oder 1/2/3/5/7 Tage vorher (`minuten` = Tage in Minuten: 0/1440/2880/4320/7200/10080), ab 9 Uhr (Berlin)                                                                      | an, am Tag selbst                |
| `schluessel.uebergabe`          | Jemand anderes trägt eine Übergabe an dich oder von dir ein (siehe [schluessel.md](./schluessel.md))                                                                                                                     | an, nicht abschaltbar            |
| `umfrage.neu`                   | Eine Umfrage wurde erstellt, bei der du abstimmen musst oder darfst (siehe [umfragen.md](./umfragen.md))                                                                                                                 | an                               |
| `umfrage.erinnerung`            | Ab 9 Uhr an den gewählten Tagen vor Ende einer Umfrage, ohne gültige Stimme; im Pflicht-Kreis unabhängig von der Einstellung                                                                                             | an                               |
| `umfrage.erneut_abstimmen`      | Eine Änderung an der Umfrage macht deine Stimme ungültig                                                                                                                                                                 | an, nicht abschaltbar            |
| `umfrage.termin`                | Aus einer Terminumfrage wurde ein Event angelegt; sagt, ob du eingetragen bist                                                                                                                                           | an                               |
| `todo.frist`                    | Ein offenes Todo ist heute oder in den nächsten 2 Tagen fällig; ab 9 Uhr (Berlin), einmal je Todo, Deadline und Person (siehe [todos.md](./todos.md))                                                                    | an, nicht abschaltbar            |

## Tabellen

| Tabelle                          | Inhalt                                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `push_abos`                      | Ein Abo je Gerät (`endpoint` eindeutig, `p256dh`, `auth`, `mitglied_sub`).                                                                                                                                                           |
| `benachrichtigung_einstellungen` | `(mitglied_sub, art)` → `aktiv`, `minuten`.                                                                                                                                                                                          |
| `push_versand`                   | Dedupe-Schlüssel bereits gesendeter Nachrichten.                                                                                                                                                                                     |
| `push_schluessel`                | VAPID-Schlüsselpaar (eine Zeile). Wird beim ersten Gebrauch von der API erzeugt (`generateVAPIDKeys`); gleichzeitige Kaltstarts einigen sich per `insert … on conflict do nothing` + erneutes Lesen. Kein Secret in Terraform/State. |

## API

- `GET /api/push/schluessel` → `{ publicKey }`; `POST /api/push/abos` (Abo des Browsers, Upsert per `endpoint`);
  `DELETE /api/push/abos` `{ endpoint }`; `GET /api/push/abos/status?endpoint=` → `{ registriert }` (nur eigene Abos).
- `GET /api/me/benachrichtigungen` → alle Arten mit `bereich`, wirksamem `aktiv`/`minuten`, `abschaltbar` und `minutenOptionen`;
  `PUT /api/me/benachrichtigungen` `{ art, aktiv, minuten? }`.
- `POST /api/push/test` → `{ geraete, ok, fehler }`: Testnachricht an die eigenen Geräte (ohne Dedupe und ohne
  Einstellungsfilter).
- Alle brauchen `profil:bearbeiten` und eine Profilzeile.

## Versand und Job

`packages/api/src/benachrichtigungen.ts`:

- `senden({ subs | 'alle', art, titel, text, url, dedupeSchluessel? })` filtert Empfänger nach ihrer wirksamen
  Einstellung, versendet an alle Geräte (`web-push`, VAPID-Subject = App-URL), löscht Abos bei 404/410 und
  belegt den Dedupe-Schlüssel. Ohne Gerät der Empfänger wird nichts gesendet und der Schlüssel **nicht** belegt (sonst
  käme eine Erinnerung nie mehr, wenn Push erst später aktiviert wird); bei reinem Übertragungsfehler wird er wieder
  freigegeben. Push-Fehler werden mit Statuscode und Body geloggt (CloudWatch).
- `registriereAufgabe(name, fn)` / `pushJob(jetzt)`: der Job führt alle registrierten Aufgaben aus; eine fehlerhafte
  Aufgabe stoppt die anderen nicht.
- `bestEffort(fn)`: für direkten Versand in Routen; Fehler und Timeout (5 s) machen den Request nie kaputt.
- Der Job läuft alle 5 Minuten: EventBridge Scheduler `c4-<env>-push-job` ruft die API-Lambda mit
  `{"c4":"push-job"}` auf (`lambda.ts`).

### Neue Art ergänzen

1. Eintrag in `BENACHRICHTIGUNGS_ARTEN` (Standard, ggf. Minuten).
2. Deutsche Texte in `packages/web/src/i18n.ts` (`BENACHRICHTIGUNG_ART_LABELS`, ggf. `BENACHRICHTIGUNG_BEREICH_LABELS`).
3. Senden: direkt aus einer Route (`bestEffort(() => benachrichtigungen.senden(...))`, die handelnde Person nicht
   benachrichtigen) oder über eine Job-Aufgabe: eigene Datei mit `registriereAufgabe(...)`, in `bootstrap.ts`
   registrieren (Vorbild: `kalenderBenachrichtigungen.ts`). Für wiederholte Jobs einen `dedupeSchluessel` wählen,
   der sich ändert, wenn erneut benachrichtigt werden soll (z. B. neuer Beginn).
4. Tests mit `createFakeBenachrichtigungenStore` (`benachrichtigungen.fake.ts`) und einem Fake-Sender.

## Kalender-Arten

`packages/api/src/kalenderBenachrichtigungen.ts`: Erinnerungen (Schichten der nächsten 24 h, je Person nach ihrer
Minutenangabe; Schlüssel `kalender.erinnerung:<dienstId>:<beginn>`), Teilnahme-Erinnerungen (Events mit effektiver Teilnahme,
nicht abgesagt; Schlüssel `kalender.teilnahme_erinnerung:<eventId>:<sub>:<beginn>`), fehlende Dienste (Events bis zum größten globalen Zeitpunkt; je Event der kleinste bereits erreichte
Zeitpunkt `m` in Minuten, ältere werden nicht nachgeholt; Schlüssel `kalender.fehlende_dienste:<eventId>:<m>`; die verantwortliche Person bekommt den Hinweis unabhängig von ihrer Einstellung mit Schlüssel `…:<m>:verantwortlich`, siehe `Sendung.ohneEinstellung`/`ausser`) und die Änderungsmeldungen aus den Routen (Event ändern, Absage,
Dienst durch andere eingetragen oder entfernt, `meldeDienstDurchAndere`).

## Umfragen

`packages/api/src/umfrageBenachrichtigungen.ts`: neue Umfrage und erneut abstimmen direkt aus den Routen, Erinnerungen als
Job-Aufgabe (in `bootstrap.ts` registriert). Details in [umfragen.md](./umfragen.md).

## Privatpartys

Bereich „Privatpartys“, Arten `privatpartys.anfrage` (neue Anfrage) und `privatpartys.nachricht` (weitere Nachricht zu einer
bestehenden Privatparty); beide an alle mit dem Recht `privatpartys:verwalten`. Empfänger liefert `mitgliederMitRecht`
(`packages/api/src/privatpartyBenachrichtigungen.ts`): Inhaber:innen von Posten mit dem Recht (`PostenStore.inhaberMitRecht`,
gleiche Regeln wie `rechteVon`) plus Admins aus den Cognito-Rollen. Verschickt werden sie vom Mail-Abruf-Job
(siehe [privatpartys.md](./privatpartys.md)), Dedupe-Schlüssel ist die `Message-ID`. Die Nachricht beim Event aus der Umfrage ist `umfrage.termin` (alle Mitglieder
sind im Kreis der Umfrage).

## Todos

`packages/api/src/todoBenachrichtigungen.ts` (Job-Aufgabe `todo.erinnerungen`, in `bootstrap.ts` registriert): Bereich „Todos“, Art
`todo.frist` (`abschaltbar: false`, immer aktiv). Ab 09:00 Uhr Berliner Zeit bekommt jede Person, für die ein Todo noch offen ist und dessen
Deadline zwischen heute und heute + 2 Tagen liegt, die Nachricht „„Titel“ ist am Fr, 14.11. fällig.“ (Titel „Todo bald fällig“, öffnet
`/app/todos`). Auch ein erst kurz vor der Deadline angelegtes Todo wird erfasst. Dedupe-Schlüssel `todo.frist:<todoId>:<faelligAm>:<sub>`: einmal
je Todo, Deadline und Person; eine verschobene Deadline erinnert erneut. Push kommt nur auf Geräten an, auf denen Benachrichtigungen aktiviert
sind.

## Geburtstage

`packages/api/src/geburtstagBenachrichtigungen.ts` (Job-Aufgabe, in `bootstrap.ts` registriert): Text „<Name> wird heute/morgen/in n
Tagen y Jahre alt.“, Dedupe-Schlüssel `geburtstag.erinnerung:<geburtstagsSub>:<datum>:<empfaengerSub>`. Keine Nachricht, wenn das Mitglied
seinen Geburtstag ausblendet (`geburtstag_im_kalender` aus), und nie an die Person selbst. Die Einstellung „Am Tag selbst“ ist `minuten` = 0.

## Web

`public/sw.js` (Scope `/app/`, in `main.tsx` nur in Produktions-Builds registriert) zeigt Nachrichten an und öffnet
bei Klick die App (`url` der Nachricht). `deploy-env.yml` lädt `sw.js` mit `Cache-Control: no-cache` hoch.
`pushGeraet.ts` (Browser-API) und der Hook `usePushGeraet` steuern Aktivieren/Deaktivieren je Gerät.

- Seite `pages/BenachrichtigungenPage.tsx`: Gerät aktivieren/deaktivieren, Button „Testbenachrichtigung senden“ (zeigt
  Erfolg, „Kein Gerät aktiviert“ oder Fehler), Schalter/Minuten je Art.
- Dialog nach dem Login (`PushAbfrage.tsx`, einmal in `App.tsx`): erscheint, wenn das Profil-Gate bestanden ist, auf
  diesem Gerät kein Push aktiv ist, die Erlaubnis nicht blockiert ist und nicht entschieden wurde. „Aktivieren“ fragt die
  Erlaubnis direkt im Klick (iOS braucht die Nutzergeste), „Später“ merkt sich das nur für die Sitzung
  (`sessionStorage`), „Nein danke“ dauerhaft (`localStorage`, `c4.push.nein`). Auf iOS außerhalb des Home-Bildschirm-Modus
  erscheint stattdessen der Hinweis „Zum Home-Bildschirm hinzufügen“ („Verstanden“ = Entscheidung). Nicht auf
  `/benachrichtigungen` selbst.

### Abgleich Gerät und Server

Das Browser-Abo kann den Server überleben (Datenbank zurückgesetzt, Abo nach 410 gelöscht, neue VAPID-Schlüssel). Darum:

- Einmal pro App-Start (nach dem Profil-Gate, `usePushAbgleichBeimStart`): gibt es lokal ein Abo und ist die Erlaubnis
  erteilt, wird der Server-Schlüssel mit `applicationServerKey` des Abos verglichen (`gleicherSchluessel`). Gleich: Abo
  erneut per `POST` senden (Upsert). Anders: altes Abo löschen, mit neuem Schlüssel abonnieren, senden. Scheitert das
  (z. B. iOS verlangt eine Geste), bleibt das Gerät ohne Abo und der Status zeigt „nicht aktiv“. Fehler werden nur geloggt.
- Der Status „aktiv“ gilt nur, wenn lokales Abo **und** Server-Eintrag (`/push/abos/status`) existieren.
- „Testbenachrichtigung senden“: meldet der Server 0 Geräte, obwohl lokal ein Abo existiert, läuft der Abgleich und der
  Test wird einmal wiederholt.

## iOS

Push geht auf iPhone/iPad erst ab iOS 16.4 und nur, wenn C4 über „Zum Home-Bildschirm“ hinzugefügt und von dort
geöffnet wurde. Die Seite „Benachrichtigungen“ und der Dialog zeigen dazu einen Hinweis. Ist Benachrichtigungen im Browser blockiert, muss das in den
Browser-/Geräteeinstellungen wieder erlaubt werden.

## Kosten und Betrieb

≈ 0 €: EventBridge Scheduler alle 5 Minuten ≈ 8.600 Aufrufe/Monat (Free Tier), Push-Dienste der Browser sind kostenlos.
Vor dem ersten Deploy einmal `infra/bootstrap` neu anwenden (`scheduler:*` für die Deploy-Rolle).
