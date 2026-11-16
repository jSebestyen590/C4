# Querschnittsthemen

Was für alle Features gilt: Anmeldung, Rechteberechnung, Fehlerantworten und der Umgang mit DSQL-Konflikten.

## Auth-Modell

- **Anmeldung:** Cognito-Hosted-UI mit Code-Flow (`oidc-client-ts`, `packages/web/src/auth.tsx`). Das Web hält den Access-Token
  im `localStorage` und erneuert ihn mit dem Refresh-Token automatisch vor Ablauf (`automaticSilentRenew`).
  Wer einen Link ohne Anmeldung öffnet, landet nach dem Login wieder auf der aufgerufenen Seite (OIDC-`state`, geprüft in `ruecksprung.ts`).
- **Token-Laufzeiten** (`infra/modules/app/main.tf`): Access- und ID-Token 60 Minuten, Refresh-Token 30 Tage (jede Erneuerung
  liefert einen neuen Refresh-Token).
- **Prüfung:** Der API-Gateway-Authorizer (JWT) und `authenticate` in `packages/api/src/auth.ts` prüfen den **Access-Token**
  (`createCognitoVerifier`: Signatur, Issuer, `token_use = access`, `client_id`). Öffentlich ohne Authorizer sind nur
  `GET /api/health`, `GET /api/kalender/feed/:token` und `GET /api/vcard/:token/:datei`.
- **Default-Deny:** `createApp` (`app.ts`) hängt vor alle Routen ein Middleware, das `authenticate` verlangt, außer für die
  Allowlist `OEFFENTLICH` (`/api/health`, `/api/kalender/feed/`, `/api/vcard/`). Auch unbekannte Pfade liefern ohne Token 401.
  Die per-Route-`auth` bleibt (sie hält die Typen des Web-Clients), überspringt sich aber, wenn der Nutzer schon gesetzt ist;
  das Profil wird also nur einmal geladen. Eine neue öffentliche Route muss in `OEFFENTLICH` **und** als Route ohne Authorizer
  im API Gateway stehen; der Test in `app.test.ts` prüft alle registrierten Routen.
- **Health:** `GET /api/health` antwortet öffentlich mit `{ ok: true }` ohne Datenbankzugriff. Die DB-Prüfung ist das
  Lambda-Event `{ "c4": "health" }` (`lambda.ts`, ruft `pingDb`, wirft bei Fehler); der Deploy ruft es per `aws lambda invoke` auf.
- **Gruppen:** Die Cognito-Gruppen stehen im Claim `cognito:groups` des Access-Tokens. Es gibt nur die Gruppe `admin`
  (`ROLES` in `packages/shared/src/roles.ts`). Die API liest die Gruppen **aus dem Token, nicht aus Cognito**: Wer aus der
  Gruppe entfernt wird, behält die Admin-Rechte, bis der Token abläuft (bis zu 60 Minuten; `setGroups` in `admin.ts` meldet
  niemanden ab). Status und Posten sind davon nicht betroffen, sie kommen bei jedem Request aus der Datenbank. Offener Punkt:
  [Issue 37](https://github.com/jSebestyen590/C4/issues/37).
- **Deaktivierte Konten:** `authenticate` antwortet mit 403 `{ error, deaktiviert: true }`, wenn die Profilzeile deaktiviert ist
  (der Access-Token bliebe sonst noch bis zu eine Stunde gültig). Das Web ersetzt dann die App durch die Sperrseite
  (`kontoDeaktiviert` in `api.ts`).
- **401 im Web:** `useApi` (`packages/web/src/api.ts`) erneuert bei 401 einmal den Token (parallele Anfragen teilen sich eine
  Erneuerung) und wiederholt die Anfrage.

## Rechteberechnung

`authenticate` berechnet bei jedem Request `permissionsFor(groups, status, extra)` (`packages/shared/src/roles.ts`) als Vereinigung
aus:

1. den Rechten des **Status** (`STATUS_PERMISSIONS`; Status aus der Profilzeile, ohne Profilzeile `anwaerter`),
2. den Rechten der **Gruppen** aus dem Token (`ROLE_PERMISSIONS`, derzeit nur `admin`),
3. den Rechten der **Posten**, die die Person gerade innehat (`extra`, aus `posten.rechteVon`; nur Rechte aus `POSTEN_RECHTE`).

`requirePermission(recht)` prüft das Ergebnis je Route und antwortet sonst mit 403. Das Web fragt die Liste einmal je neuem Token
über `GET /api/me` ab (`auth.tsx`); `can()` liest daraus. Eine Rechteänderung wirkt dort also erst nach dem nächsten Token oder
Neuladen, in der API sofort. Details zu Status und Posten: [members.md](./members.md), [posten.md](./posten.md).

## Routen und Routentests

`createApp` (`packages/api/src/app.ts`) setzt die API aus einem Sub-Router je Feature zusammen (`packages/api/src/routes/<feature>.ts`, exportiert `<feature>Routes(ctx)`), verbunden per `.route('/', …)` unter `basePath('/api')`. `routes/kontext.ts` baut den `RoutenKontext` (`auth`, die `requirePermission`-Konstanten und Helfer, die mehrere Features brauchen, z. B. `alsMitglied`, `alleMitglieder`); Helfer, die nur ein Feature nutzt, stehen in dessen Datei. Neue Routen kommen in die Datei ihres Features (neues Feature = neue Datei samt `.route()` in `createApp`); bei sich überlappenden Pfaden zählt die Reihenfolge der Registrierung (`/x/neu` vor `/x/:id`).

Die Routentests liegen neben den Routen als `routes/<feature>.test.ts`; `makeApp`, die Fakes und `bearer` kommen aus `packages/api/src/test/appTestHelfer.ts`. Allgemeine Tests (Health, Fehler-Mapping, Anmeldung) stehen in `app.test.ts`.

## Fehler-Mapping

`onError` in `createApp` (`packages/api/src/app.ts`, gilt für alle Sub-Router):

| Fehler                                                    | Antwort                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `HTTPException`                                           | Status der Ausnahme, Body `{ error: message }`; bei Deaktivierung zusätzlich `deaktiviert: true`     |
| DSQL-Konflikt (SQLSTATE `40001`, `OC000`/`OC001`)         | 409 „Jemand anderes hat gerade dasselbe geändert. Bitte versuch es noch einmal.“                     |
| Unique- oder Fremdschlüssel-Verletzung (`23505`, `23503`) | 409 „Das passt nicht mehr zum aktuellen Stand. Bitte lade die Seite neu und versuch es noch einmal.“ |
| alles andere                                              | 500 „Internal server error“ (der Fehler wird mit `console.error` geloggt)                            |

Fachliche Fehler werfen die Stores als eigene Klassen, die die Routen in `HTTPException` (400/404/409) übersetzen. Im Web macht
`unwrap` (`api.ts`) bzw. `pruefen` (`warenApi.ts`) aus jeder Nicht-2xx-Antwort einen `ApiFehler(status, meldung)`; `meldung` ist
das Feld `error` der Antwort, sonst ein allgemeiner deutscher Text. Dialoge fangen `ApiFehler` ab und lesen `status`, z. B.
`LoeschenDialog` bei 409.

## DSQL-Wiederholung

Aurora DSQL löst gleichzeitige Änderungen optimistisch auf: Eine der Transaktionen scheitert mit `40001`. `packages/api/src/db/wiederholung.ts`:

- `transaktionenWiederholen` (in `createDb`, `db/client.ts`) lässt jede Transaktion auf oberster Ebene bis zu 3-mal laufen, Wartezeit
  ab 100 ms, je Versuch verdoppelt, mit Jitter (50–100 %). Die Callback-Funktion kann daher mehrfach laufen und darf nur
  Datenbankarbeit enthalten (kein S3, Mail, Push). Savepoints (`tx.transaction`) bleiben unberührt.
- `mitWiederholung(aktion, versuche = 5, …, basisMs = 500)` wiederholt eine eigene Aktion (Migrationen, Rollback, Finanzen-Buchung).
  Eine Transaktion darin läuft nur einmal je Versuch (`inWiederholung`), die Versuche vervielfachen sich nicht.
- `istKonflikt` und `istDatenAbweichung` (SQLSTATE aus `err` oder dem ersten `cause`, Drizzle verpackt Treiberfehler) sind die
  Grundlage von `onError`.

Mehr dazu und zu den Migrationen: [datenbank.md](./datenbank.md#gleichzeitige-zugriffe).
