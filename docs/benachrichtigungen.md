# Benachrichtigungen (Web Push)

Allgemeines Modul für Push-Nachrichten. Es kennt keinen Feature-Bereich; der Kalender ist nur der erste
Nutzer. Einstellungen liegen auf der Profilseite (`/profil`, Abschnitt „Benachrichtigungen“).

## Konzept

- **Arten** stehen in der Registry `BENACHRICHTIGUNGS_ARTEN` (`packages/shared/src/benachrichtigungen.ts`):
  `key` (`<bereich>.<name>`), `bereich`, `standardAktiv` (`boolean` oder je Status `Record<MitgliedStatus, boolean>`),
  `minuten` (`{ standard, optionen }` oder `null`).
- **Pro Person** wird je Art gespeichert, ob sie aktiv ist (und ggf. wie viele Minuten). Fehlt eine Zeile, gilt der
  Standard (`effektiveEinstellung(art, status, gespeichert)`).
- **Push pro Gerät**: jedes Gerät muss Push selbst aktivieren (Berechtigungsabfrage des Browsers); die Arten-Einstellungen
  gelten für alle Geräte der Person.
- Aktuelle Arten:

| Art                         | Wann                                                                                                     | Standard           |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------ |
| `kalender.erinnerung`       | X Minuten vor Beginn der eigenen Schicht (15/30/60/120/1440)                                             | an, 30 Minuten     |
| `kalender.fehlende_dienste` | `beginn − fehltHinweisStunden` erreicht und Event noch rot; einmal je Event, an alle                     | an, **für EM aus** |
| `kalender.aenderung`        | Eigener Dienst betroffen: Event verschoben/abgesagt/wieder aktiv, Schicht geändert/entfernt, ausgetragen | an                 |

## Tabellen

| Tabelle                          | Inhalt                                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `push_abos`                      | Ein Abo je Gerät (`endpoint` eindeutig, `p256dh`, `auth`, `mitglied_sub`).                                                                                                                                                           |
| `benachrichtigung_einstellungen` | `(mitglied_sub, art)` → `aktiv`, `minuten`.                                                                                                                                                                                          |
| `push_versand`                   | Dedupe-Schlüssel bereits gesendeter Nachrichten.                                                                                                                                                                                     |
| `push_schluessel`                | VAPID-Schlüsselpaar (eine Zeile). Wird beim ersten Gebrauch von der API erzeugt (`generateVAPIDKeys`); gleichzeitige Kaltstarts einigen sich per `insert … on conflict do nothing` + erneutes Lesen. Kein Secret in Terraform/State. |

## API

- `GET /api/push/schluessel` → `{ publicKey }`; `POST /api/push/abos` (Abo des Browsers, Upsert per `endpoint`);
  `DELETE /api/push/abos` `{ endpoint }`.
- `GET /api/me/benachrichtigungen` → alle Arten mit `bereich`, wirksamem `aktiv`/`minuten` und `minutenOptionen`;
  `PUT /api/me/benachrichtigungen` `{ art, aktiv, minuten? }`.
- Alle brauchen `profil:bearbeiten` und eine Profilzeile.

## Versand und Job

`packages/api/src/benachrichtigungen.ts`:

- `senden({ subs | 'alle', art, titel, text, url, dedupeSchluessel? })` filtert Empfänger nach ihrer wirksamen
  Einstellung, versendet an alle Geräte (`web-push`, VAPID-Subject = App-URL), löscht Abos bei 404/410 und
  belegt den Dedupe-Schlüssel (bei reinem Übertragungsfehler wird er wieder freigegeben).
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
Minutenangabe; Schlüssel `kalender.erinnerung:<dienstId>:<beginn>`), fehlende Dienste (Events der nächsten 31 Tage;
Schlüssel `kalender.fehlende_dienste:<eventId>`) und die Änderungsmeldungen aus den Routen (Event ändern, Absage,
Dienst durch andere entfernt).

## Web

`public/sw.js` (Scope `/app/`, in `main.tsx` nur in Produktions-Builds registriert) zeigt Nachrichten an und öffnet
bei Klick die App (`url` der Nachricht). `deploy-env.yml` lädt `sw.js` mit `Cache-Control: no-cache` hoch.
`Benachrichtigungen.tsx` / `pushGeraet.ts` steuern Aktivieren/Deaktivieren je Gerät.

## iOS

Push geht auf iPhone/iPad erst ab iOS 16.4 und nur, wenn C4 über „Zum Home-Bildschirm“ hinzugefügt und von dort
geöffnet wurde. Die Profilseite zeigt dazu einen Hinweis. Ist Benachrichtigungen im Browser blockiert, muss das in den
Browser-/Geräteeinstellungen wieder erlaubt werden.

## Kosten und Betrieb

≈ 0 €: EventBridge Scheduler alle 5 Minuten ≈ 8.600 Aufrufe/Monat (Free Tier), Push-Dienste der Browser sind kostenlos.
Vor dem ersten Deploy einmal `infra/bootstrap` neu anwenden (`scheduler:*` für die Deploy-Rolle).
