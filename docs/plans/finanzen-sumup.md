# Finanzen Scheibe 7: SumUp

> Umgesetzt (Doku: [finanzen.md](../finanzen.md), „SumUp“). Abweichungen: Das Konto „SumUp-Guthaben“ gab es schon als `sumup` (Migration 0256), neu sind `kartenerloese` und `sumup-gebuehren`; die Migrationen sind 0272–0279; statt Zeilensperren dienen `sperreBeruehren`-Schlüssel; der Auszahlungs-Abgleich ist nicht gebaut (Scheibe 6 hängt ihn an), Auszahlungen erscheinen nur als „offen“.

## Context

Kartenzahlungen laufen über SumUp; in Access fehlten Gebühren ganz. Scheibe 7 holt Transaktionen und
Auszahlungen per SumUp-API (API-Schlüssel in Secrets Manager), bucht Kartenumsätze brutto als Erlös
auf ein Durchlaufkonto „SumUp-Guthaben" (mit Event) und gleicht das Guthaben bei der Auszahlung gegen
den Bankumsatz aus (Gebühr als Aufwand). Scheibe 6 (Konto) läuft parallel in eigener Session; die
Schnittstelle ist mit ihr abgestimmt (siehe unten). Größe ~50+ Schritte → laut `CLAUDE.md` erst
`docs/plans/finanzen-sumup.md` schreiben, Umsetzung in neuer Session.

## Entscheidungen (mit dir geklärt)

- Ein festes Erlöskonto **„Kartenerlöse"** mit 19 %, Steuer aus dem Brutto (`nettoSteuer`,
  `packages/shared/src/kassen.ts:394`), wie Barkassen. Keine Aufteilung 19/7.
- **Prüfliste, dann buchen:** Job legt Umsätze nur ab; Finanzer prüft je Gruppe (Event bzw.
  Geschäftstag), korrigiert das Event, bucht gesammelt: **eine Buchung je Gruppe**.
- **Event-Vorschlag:** Zeitpunkt in [Beginn, Ende + 3 h] eines nicht abgesagten Events; bei
  Überlappung das zuletzt begonnene; sonst ohne Event (markiert).
- **Kein Trinkgeld**: Betrag komplett Erlös; `tip_amount ≠ 0` → Hinweis in der Prüfliste.
- Gebühren SumUp: umsatzsteuerfrei → `steuer_art 'keine'`.

## Schnittstelle zu Scheibe 6 (abgestimmt mit Session „Finanzplan Scheibe 6")

- Scheibe 6 baut `fin_bank_umsaetze`, `fin_bank_zuordnungen(umsatz_id, buchung_id, art, ziel_id)`,
  `planeBankZuordnung(umsatz, eingabe, kontext)` und `bankVorschlaege()` in
  `packages/shared/src/finanzenBank.ts`; Typ `BankVorschlag = { art, zielId?, kontoId?, text, punkte }`.
  Finanzer bestätigt immer.
- Scheibe 7 liefert in `packages/shared/src/finanzenSumup.ts`:
  - `sumupAuszahlungFuerUmsatz(umsatz, offeneAuszahlungen) → BankVorschlag | null`
    (art `'sumup_auszahlung'`, zielId = Auszahlungsdatum; gleicher Betrag + „SumUp" in
    `gegen_name`/`verwendungszweck` → hohe punkte; Datum ±5 Tage).
  - `planeSumupAuszahlung(umsatz, auszahlung) → zeilen`: Bank `+netto`, „SumUp-Gebühren" `+Σgebühr`,
    SumUp-Guthaben `−(netto+Σgebühr)`; Differenz Betrag ≠ Auszahlung → Fehler.
- Verdrahtung des Zweigs in `planeBankZuordnung`/`bankVorschlaege` macht die Scheibe, die **später**
  merged. Store-Methode `offeneSumupAuszahlungen()` liefert Scheibe 7.
- Migrationen: Scheibe 6 reserviert 0254–0269, **Scheibe 7 nimmt ab 0270**.
- Konto „SumUp-Guthaben" legt Scheibe 7 an.

## Datenmodell (Migrationen ab 0270, je Statement + Down-Datei, Muster `0149_fin_grundkonten.sql`)

- Konten mit fester ID (`INSERT … ON CONFLICT (id) DO NOTHING`): `sumup-guthaben` (durchlauf),
  `kartenerloese` (erloes, `steuersatz_standard` 1900), `sumup-gebuehren` (aufwand).
- `fin_sumup_transaktionen` (nur INSERT): `id` (SumUp-id, PK), `transaction_code`, `zeitpunkt
timestamptz`, `betrag_cent` (REFUND/CHARGE_BACK negativ), `typ`, `status`, `trinkgeld_cent`,
  `sumup_benutzer`, `roh jsonb`, `abgerufen_am`. Nur `SUCCESSFUL`/`REFUNDED`-Endstände importieren;
  `ON CONFLICT DO NOTHING`.
- `fin_sumup_auszahlungen` (nur INSERT): `id` (SumUp-Payout-Zeilen-id, PK), `datum date`, `typ`
  (PAYOUT, *_DEDUCTION), `betrag_cent`, `gebuehr_cent`, `transaction_code`, `referenz`, `status`,
  `abgerufen_am`. Auszahlung = Summe aller Zeilen eines `datum`.
- `fin_sumup_zuordnungen` (nur INSERT): `transaktion_id`, `buchung_id`. Status „offen" = keine
  Zuordnung mit nicht stornierter Buchung (gleiches Muster wie Scheibe 6). Storno der Buchung →
  wieder offen.
- Drizzle in `packages/api/src/db/schema.ts`; `finanzenNurInsert.test.ts` um die Tabellen ergänzen.
- `QUELLE_TYPEN` + Labels (`packages/shared/src/finanzen.ts:25,70`): `sumup` (Umsatzbuchung).
  Auszahlung bucht Scheibe 6 als `bankumsatz`.

## Abruf (Job + Knopf)

- Secret `c4-<env>-sumup` (JSON `{ apiKey, merchantCode, abDatum }`; abDatum dev frei, prod
  `2027-01-01`), Leser nach `createKonfigLeser` (`packages/api/src/partymail.ts:30-58`), Env
  `SUMUP_SECRET_ARN` (`config.ts`, `bootstrap.ts`), Terraform in `infra/modules/app/main.tf`
  (Secret wie Z. 195-203, Policy wie 168-173, Env wie 223). Bootstrap-Rechte reichen schon.
- Client `packages/api/src/sumup.ts` (+ `sumup.fake.ts`), `fetch` als Dep wie
  `onedrive.ts:315`; `Authorization: Bearer`:
  - `GET /v2.1/merchants/{code}/transactions/history?oldest_time=…&limit=100&order=ascending`,
    Paging über `links[rel=next]`. Start = max(`zeitpunkt`) − 3 Tage (kein Stand-Tabelle),
    mindestens `abDatum`. `PENDING` überspringen (kommt beim nächsten Lauf).
  - `GET /v1.0/merchants/{code}/payouts?start_date=…&end_date=heute` ab max(`datum`) − 7 Tage.
  - Antworten mit zod prüfen (Felder unsicher → `roh` behalten, unbekannte Felder erlauben).
  - Zeitbudget: Lambda-Timeout 15 s → max. ~8 Seiten je Lauf, Rest beim nächsten.
- `lambda.ts`: Zweig `{ c4: 'sumup-job' }`; Job in `createProduction()` (`bootstrap.ts:121`);
  Schedule `aws_scheduler_schedule.sumup_job` nach `mail_job` (`main.tf:381`), Variable
  `sumup_job_rate = "rate(1 hour)"`. Kein Secret → Job loggt und endet.
- Route `POST /api/finanzen/sumup/abruf` (`finanzen:buchen`) für „Jetzt abrufen".

## Reine Logik (`packages/shared/src/finanzenSumup.ts`, Unit-Tests)

- `sumupEventVorschlag(zeitpunkt, events)` (Regel oben).
- `sumupGruppen(transaktionen, events)` → Gruppen je vorgeschlagenem Event bzw. Geschäftstag
  (Europe/Berlin, Tag endet 6 Uhr), mit Summe, Anzahl, Hinweisen (Trinkgeld, ohne Event).
- `planeSumupBuchung(gruppe, eventId)` → Zeilen: SumUp-Guthaben `+brutto`, Kartenerlöse `−brutto`
  (netto/steuer via `nettoSteuer`, `ust`, 1900); Datum = Geschäftstag; Text „SumUp <Event/Tag>".
- `sumupAuszahlungen(zeilen)` → je Datum Netto, Gebühr, Brutto; plus die zwei Scheibe-6-Funktionen oben.

## API (`packages/api/src/finanzen.ts` Store + Fake, Routen `routes/finanzen.ts`)

- `GET /api/finanzen/sumup` (`finanzen:lesen`): offene Gruppen inkl. Transaktionen, Auszahlungen
  (offen/zugeordnet), letzter Abruf, Saldo SumUp-Guthaben.
- `POST /api/finanzen/sumup/buchen` (`finanzen:buchen`, Idempotenz-Schlüssel):
  `{ transaktionIds[], eventId|null }` → prüft „alle noch offen" in der Transaktion, bucht über
  `einfuegen` + `mitWiederholung` (Muster `buchenTx`, `finanzen.ts:653`), schreibt Zuordnungen,
  `quelle_typ 'sumup'`, `erstellt_von` = Benutzer. Festgeschriebene Periode → Fehler.
- Store `offeneSumupAuszahlungen()` für Scheibe 6.

## Web (desktop first, `/finanzen/sumup`)

- Kachel in `FinanzenPage.tsx`, Route in `routes/finanzenRouten.tsx` (`finanzen:lesen`), Keys in
  `queryKeys.ts` (`finanzenKeys.sumup`) + Test.
- Kopf: letzter Abruf, Saldo SumUp-Guthaben, „Jetzt abrufen".
- **Prüfliste:** Tabelle je Gruppe (Tag, Event als suchbares Select vorbelegt, Anzahl, Summe,
  Hinweise), aufklappbar mit Einzelzahlungen (Zeit, Betrag, Typ, Gerät/Benutzer). Einzelne Zahlung
  in andere Gruppe verschieben = abwählen + eigene Gruppe buchen. „Buchen" → Bestätigungsdialog mit
  Zusammenfassung (Erlös brutto/netto/USt, Event) → Fokus auf nächste Gruppe. Tastatur: Enter bucht
  nach Bestätigung.
- **Auszahlungen:** je Datum Brutto, Gebühr, Netto, Status „offen" / „zugeordnet (Bankumsatz …)".
- Handy: Karten statt Tabelle, kein horizontales Scrollen. `InfoHinweis`-Texte in
  `finanzenHilfe.ts` (SumUp-Guthaben, Event-Regel). Alles Deutsch.

## Doku

- `docs/finanzen.md`: neuer Abschnitt „SumUp" (Konten, Tabellen, Ablauf, Event-Regel, Schnittstelle
  Bank) + Zeilen in „Seiten" und „API"; `docs/plans/finanzen.md`: Scheibe 7 + Stand;
  `README.md`: Secret einrichten (wie Partymail, Z. 43/98).

## Umsetzung

1. Diesen Plan als `docs/plans/finanzen-sumup.md` ablegen (inkl. Schnittstelle Scheibe 6), commit
   auf Branch `finanzen-sumup`.
2. Neue Session setzt in Phasen um, je frischer `implementer`:
   a) shared (Logik + Tests, Quelle-Typ) + Migrationen + Schema;
   b) SumUp-Client, Secret, Job, Terraform, Store/Fake, Routen + Tests;
   c) Web-Seite; d) Doku.
3. Scheibe-6-Session über `finanzenSumup.ts`-Signaturen informieren, wenn Phase a steht.

## Verifikation

- `tester`: `pnpm lint`, `pnpm typecheck`, `pnpm test` (Event-Regel inkl. Toleranz/Überlappung/
  abgesagt, Gruppen über Mitternacht, nettoSteuer bei Refunds, Auszahlung mit Abzügen, Paging/
  Zeitbudget im Fake-Client, Idempotenz + „schon gebucht" in Routen-Tests).
- Secret auf dev per Hand mit echtem Schlüssel und `abDatum` in der Vergangenheit befüllen;
  Deploy dev, Job per `aws lambda invoke` (`AWS_PROFILE=C4`, `{"c4":"sumup-job"}`) → Feldnamen der
  echten Antworten gegen zod-Schemas prüfen.
- `browser-check` auf dev `/finanzen/sumup`: 1440×900 nur Tastatur (Gruppe buchen, Event ändern),
  dann 375×812; Journal zeigt Buchung mit Event.
