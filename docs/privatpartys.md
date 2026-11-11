# Privatpartys

Privatpersonen mieten den Club für private Feiern. Die Anfragen werden hier verwaltet: Person, Wunschtermine mit Stufe, Notizen.
Eine Terminumfrage klärt, wer übernehmen kann, und aus der Zusage entsteht ein Event. Alles braucht das Recht
**`privatpartys:verwalten`** (Admins und Posten, vergeben über [posten.md](./posten.md); Vorstand o. ä. trägt es der Admin dort ein).
Navigation „Privatpartys“ (`IconConfetti`) nur mit dem Recht; Seiten unter `/privatpartys`.

## Datenmodell

Migrationen `0120`–`0129` (siehe [datenbank.md](./datenbank.md)); Text-IDs, keine Fremdschlüssel, Bezüge prüft die API.

- `privatparty_personen`: `name`, `email`, `kontakt` (Freitext, z. B. Telefon), `notizen`. Externe Personen, keine Mitglieder; sie
  werden nicht als Mitglied dargestellt (kein `StatusName`). Eine Person kann mehrere Privatpartys haben.
- `privatpartys`: `person_id` (leer bei Einträgen ohne Person), `anlass`, `notizen`, `status` (`offen`, `zugesagt`, `abgesagt`),
  `termin_id` (zugesagter Wunschtermin), `umfrage_id`, `event_id`, `mail_adresse`, `letzte_nachricht_am`, `angelegt_von/am`,
  `aktualisiert_am`.
- `privatparty_termine`: `datum`, `beginn`/`ende` (Berliner „HH:MM“, `ende` vor `beginn` = Folgetag), `stufe`
  (`bevorzugt` „Bevorzugt“, `moeglich` „Möglich“, `notfalls` „Nur notfalls“), `position` (Eingabereihenfolge). Derselbe Tag mit
  denselben Zeiten darf nur einmal vorkommen.
- `privatparty_nachrichten`: Mails einer Anfrage (`richtung` `ein`/`aus`, `message_id` eindeutig, `in_reply_to`, `referenzen`, `von_adresse`
  (bei eingehenden die Antwortadresse: Reply-To, sonst From), `von_name`, `an_adresse`, `betreff`, `text`, `anhaenge` (nur Dateinamen),
  `zeitpunkt`, `mitglied_sub` (Absender:in bei `aus`)). `mail_abruf`: eine Zeile `partymail` mit `uid_validity`, `letzte_uid`,
  `letzter_abruf`, `fehler`. Die Liste zeigt „Unbeantwortet“, wenn die letzte Nachricht eingehend ist (`unbeantwortet` im DTO).
- Shared: `packages/shared/src/privatpartys.ts` (Schemas, DTOs, `privatpartyOptionName`). Store `packages/api/src/privatpartys.ts`
  (+ `.fake.ts`), DTOs `privatpartyAnsicht.ts`.

## Ablauf

1. **Anlegen** (`/privatpartys/neu`, optional `?person=<id>`): Person wählen oder „Neue Person“, Anlass, Wunschtermine (Datum, Von, Bis,
   Stufe), Notizen. Person und mindestens ein Termin sind Pflicht; die Store-Methode erlaubt auch leere Einträge (Grundlage für
   Anfragen aus Mails).
2. **Umfrage erstellen** („Umfrage erstellen“ auf der Detailseite, `POST /api/privatpartys/:id/umfrage { vorlageId, endetAm, pflicht }`):
   Die API legt eine Terminumfrage mit Vorlage an (Titel „Privatparty“ bzw. „Privatparty: Anlass“, eine Antwort je Wunschtermin,
   Name „19:00–02:00 · Bevorzugt“). Der Kreis sind alle Status, bei `pflicht` als Pflicht-, sonst als optionaler Kreis. Danach
   kommt `umfrage.neu`. Geht nur, solange keine laufende verknüpfte Umfrage existiert (409). Siehe [umfragen.md](./umfragen.md).
3. **Event aus der Umfrage**: im Umfragedetail wie bei jeder Terminumfrage. Hängt die Umfrage an einer Privatparty, nimmt das Event die
   Wunschzeiten (`ausVorlageZuZeit`), die Privatparty wird „Zugesagt“ (mit `event_id`, `termin_id`), und Inhaber:innen des Rechts
   dürfen die Umfrage beenden und das Event anlegen. Ist die Privatparty schon abgesagt oder mit einem noch vorhandenen Event
   zugesagt, lehnt `POST /api/umfragen/:id/event` mit 409 ab (kein zweites Event).
4. **Direkt zusagen** (`POST /api/privatpartys/:id/zusage { terminId, vorlageId }`): Termin und Vorlage wählen, das Event entsteht sofort;
   eine laufende verknüpfte Umfrage wird beendet. Reicht mit dem Recht allein (ohne `events:verwalten`). Bereits zugesagt = 409.
5. **Status ändern** (`PUT /api/privatpartys/:id/status { status, terminId?, vorlageId? }`): jederzeit. Verlässt die Privatparty
   `zugesagt`, wird das Event gelöscht wie bei `DELETE /kalender/events/:id` (gibt es ein Protokoll dazu: 409; Bilder-Ordner werden
   aufgeräumt); `event_id` und `termin_id` werden geleert. War das Event schon gelöscht, wird nur geleert. „Zugesagt“ braucht
   Termin und Vorlage und läuft wie `/zusage`. Bei „Abgesagt“ wird eine laufende verknüpfte Umfrage beendet (wie bei der Zusage). Die Absage auf der Seite fragt bei bestehendem Event vorher nach.

## Event

`ausVorlageZuZeit(vorlage, datum, beginn, ende, kategorie)` (`packages/shared/src/kalender.ts`): Basis ist `ausVorlage`, dann
läuft das Event von `beginn` bis `ende` (Berliner Zeit inkl. Sommer-/Winterzeit; Ende vor Beginn = Folgetag). Betrieb-Schichten
werden auf diese Spanne gedehnt (höchstens 24 h; bei mehreren nur der erste Beginn und das letzte Ende), Aufbau verschiebt sich um
die Differenz des Beginns, Putzen um die des Endes. Der Event-Titel ist der Titel der Vorlage, sonst „Privatparty“; Kontaktdaten und
Notizen stehen nie im Kalender. Wer das Recht hat, sieht auf dem Event „Zur Privatparty“ (`EventDto.privatpartyId`, nur im
Detail `GET /api/kalender/events/:id` und nur mit dem Recht gefüllt).

## Seiten

Mobile first; Karten auf dem Handy, ab `sm` eine Tabelle (ganze Karte bzw. Zeile klickbar).

- `/privatpartys`: Filter Offen (Standard), Zugesagt, Abgesagt, Alle (`?status=`), „Neu“, „Personen“. Eintrag: Person (bzw. Antwortadresse),
  Anlass, Termine (bis 3), Status, Punkt „Unbeantwortet“. Sortiert nach letzter Nachricht bzw. Anlegedatum.
- `/privatpartys/:id`: Status, Aktionen (Zusagen, Umfrage erstellen, Absagen, Wieder öffnen; Menü: Bearbeiten, Löschen), Links zu Umfrage
  und Event, Person (mit E-Mail und Kontakt), Wunschtermine mit Stufe, Notizen. Löschen geht nur ohne Event und Nachrichten (409).
  Bearbeiten kann den zugesagten Termin nicht entfernen (409).
- `/privatpartys/:id/bearbeiten`, `/privatpartys/neu`: `PrivatpartyFormularPage`.
- `/privatpartys/personen`, `/privatpartys/personen/:id`: Liste mit Suche, Detail mit Kontakt, Notizen und ihren Privatpartys.
  Löschen nur ohne Privatpartys (409).
- Code: `pages/Privatparty*.tsx`, `pages/PrivatpartysPage.tsx`, `PrivatpartyAnzeige.tsx`, `PrivatpartyDialoge.tsx`,
  `PrivatpartyPersonFormular.tsx`, `privatpartyDaten.ts`; Labels in `i18n.ts`.

## API

Alle Routen mit `privatpartys:verwalten`: `GET/POST /api/privatpartys/personen`, `GET/PUT/DELETE /api/privatpartys/personen/:id`,
`GET /api/privatpartys?status=offen|zugesagt|abgesagt|alle`, `POST /api/privatpartys`, `GET/PUT/DELETE /api/privatpartys/:id`,
`POST /api/privatpartys/:id/umfrage`, `POST /api/privatpartys/:id/zusage`, `PUT /api/privatpartys/:id/status`,
`POST /api/privatpartys/:id/nachrichten`, `POST /api/privatpartys/nachrichten/:id/zuordnen`, `GET /api/privatpartys/mail-status`,
`POST /api/privatpartys/mail/abrufen`.

## Party-Mail

Die Anfragen kommen per Mail an die Party-Mail. Die App ruft das Postfach per IMAP ab und antwortet per SMTP.

- **Zugangsdaten** liegen im AWS Secrets Manager: Terraform legt nur das leere Secret `c4-<env>-partymail` an (ohne Version), die
  Werte trägt man von Hand in der Konsole ein (Plaintext, JSON), damit sie nie im Terraform-State stehen:
  `adresse`, `absenderName`, `benutzer`, `passwort`, `imapHost`, `imapPort`, `imapTls`, `smtpHost`, `smtpPort`, `smtpSecure`,
  `ordnerEingang` (z. B. `INBOX`), `ordnerGesendet` (z. B. `Sent`). Die Lambda liest es über `PARTYMAIL_SECRET_ARN` (5 Minuten
  Cache). Die Deploy-Rollen brauchen `secretsmanager:*` auf `c4-<env>-*`: dafür **einmal `infra/bootstrap` neu anwenden** (siehe README).
- **Nicht eingerichtet** (kein Secret, leer oder unvollständig, auch lokal und in Tests): der Job tut nichts, die Seiten zeigen
  „Party-Mail ist nicht eingerichtet.“ und das Antwortfeld fehlt; Senden und Abrufen antworten 409.
- **Abruf-Job** (`packages/api/src/privatpartyMail.ts`, Zweig `{c4:"mail-job"}` in `lambda.ts`, Schedule `c4-<env>-mail-job` alle 2 Minuten,
  Variable `mail_job_rate`; ein eigener Schedule, damit der Push-Job seine 15 s behält). Abgerufen wird über die UID, nicht über
  das Seen-Flag, damit das Postfach in normalen Mail-Programmen benutzbar bleibt. Je Lauf höchstens 20 Mails, Verbindungs-Timeouts
  und eine Gesamtfrist von 9 s.
  - Erster Lauf und geänderte `uidValidity`: nur auf die aktuelle UID setzen, nichts importieren.
  - Doppelte (gleiche `Message-ID`) werden übersprungen.
  - Zuordnung nur über den Thread: steht eine ID aus `In-Reply-To`/`References` schon in den Nachrichten, kommt die Mail zu dieser
    Anfrage (`threadIds`). Sonst entsteht ein leerer Eintrag (`offen`, ohne Person und Termine).
  - `mail_adresse` und `letzte_nachricht_am` werden gesetzt; die Benachrichtigung geht an alle mit dem Recht
    (`mitgliederMitRecht`): `privatpartys.anfrage` für einen neuen Eintrag, `privatpartys.nachricht` für eine Folgemail, mit der
    `Message-ID` als Dedupe-Schlüssel und der URL `/app/privatpartys/<id>`.
  - Fehler stehen in `mail_abruf.fehler` (die Liste zeigt sie), der Stand rückt dann nicht vor.
  - Eine Mail, die sich nicht parsen lässt (oder über 10 MB groß ist; sie wird dann gar nicht geladen), wird übersprungen und geloggt;
    `mail_abruf.fehler` nennt „n Mail(s) konnten nicht verarbeitet werden …“ bis zum nächsten sauberen Lauf. Scheitert dagegen das
    Speichern einer Mail (z. B. kurzer Datenbankfehler), bricht der Lauf dort ab, der Stand bleibt vor dieser Mail, `fehler` sagt, dass
    der nächste Abruf es erneut versucht, und eine dafür neu angelegte leere Anfrage wird wieder gelöscht. Der Text einer Mail wird auf 20.000 Zeichen gekürzt.
  - `POST /api/privatpartys/mail/abrufen` („Jetzt abrufen“ auf der Liste) startet einen Lauf; `GET /api/privatpartys/mail-status`
    liefert `eingerichtet`, `letzterAbruf`, `fehler`.
- **Antworten** (`POST /api/privatpartys/:id/nachrichten { text }`): eigene `Message-ID` (`<uuid@Domain der Party-Mail>`), `In-Reply-To`
  und `References` aus der letzten Nachricht, Betreff „Re: …“ (ohne doppeltes „Re:“) bzw. „Deine Anfrage beim C4“ ohne Nachricht.
  Ziel ist `mail_adresse`, sonst die E-Mail der Person (sonst 400). Danach wird die Mail per IMAP APPEND im Gesendet-Ordner abgelegt
  (best effort) und mit `mitglied_sub` gespeichert. Antworten lösen keine Benachrichtigung aus.
- **Umhängen** (`POST /api/privatpartys/nachrichten/:id/zuordnen`, Body `{ privatpartyId }` oder `{ neu: true }`, Antwort `{ ok, geloescht, id }`
  mit der Ziel-Id): die Ziel-Anfrage muss `offen` sein; beide Einträge berechnen `letzte_nachricht_am` und `mail_adresse` neu.
  `neu: true` legt vorher einen leeren Eintrag an (wie der Mail-Job bei einer nicht zuordenbaren Mail: offen, ohne Person und Termine,
  `mail_adresse` vom Absender) und hängt die Nachricht dorthin, z. B. wenn jemand auf eine alte Mail antwortet, um eine neue Party
  anzufragen. Keine Benachrichtigung. Ein Eintrag ohne Person, Termine, Nachrichten, Umfrage und Event wird gelöscht.
- **Seite**: „Korrespondenz“ auf der Detailseite, chronologisch, eingehende links, eigene rechts mit „gesendet von“ (`StatusName`, Link
  zum Mitglied); Zitate (`>`-Zeilen, „Am … schrieb …:“) hinter „Zitat anzeigen“ (`zitatTrennen`); Menü „Andere Anfrage zuordnen“ (Dialog ohne Tastatur: Liste antippbarer Karten, zuerst „Neue Anfrage“, danach die anderen offenen Anfragen; nach „Neue Anfrage“ öffnet sich der neue Eintrag);
  darunter Antwortfeld. Ein Eintrag ohne Person zeigt den Absender und „Person zuordnen“ (vorhandene Person, Vorschlag bei
  passender E-Mail, oder neue Person mit Name und Adresse vorbelegt) und öffnet danach das Formular für die Wunschtermine.
- Module: `partymail.ts` (IMAP/SMTP mit `imapflow`, `nodemailer`; Secret), `partymailParsen.ts` (`mailparser`, `html-to-text`, Thread-Zuordnung),
  `partymailTypen.ts`, `partymail.fake.ts` (Tests). Anhänge werden nicht gespeichert, nur ihre Namen angezeigt.

## Benachrichtigungen

Arten `privatpartys.anfrage` und `privatpartys.nachricht` an alle mit dem Recht, siehe [benachrichtigungen.md](./benachrichtigungen.md).
