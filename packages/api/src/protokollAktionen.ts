import {
  protokollAktionen,
  protokollEventIds,
  type AktionEventKontext,
  type ProtokollAktion,
  type ProtokollAktionAusgang,
  type ProtokollAktionErgebnis,
  type ProtokollAktionenKontext,
  type ProtokollDokument,
  type ProtokollKnoten,
} from '@c4/shared';
import type { UserAdmin } from './admin';
import {
  EntfernungBestaetigen,
  KalenderKonflikt,
  KalenderUngueltig,
  type EventAenderung,
  type KalenderStore,
} from './kalender';
import { istDeaktiviert, type MitgliederStore } from './mitglieder';
import { AblosungUngueltig, BesetzungUeberschneidung, type PostenStore } from './posten';

// Runs the Aktionen of a protocol (see docs/protokolle.md, `protokollAktionen` in shared). The
// stores are called directly: the routes only need `protokolle:schreiben`, not the rights of the
// areas the Aktionen touch. That is deliberate and limited to the protocol routes.

export interface AktionenDeps {
  kalender: Pick<KalenderStore, 'event' | 'kategorien' | 'eventAnlegen' | 'eventAktualisieren'>;
  mitglieder: Pick<MitgliederStore, 'alle' | 'holen' | 'speichern' | 'statusSetzen'>;
  userAdmin: Pick<UserAdmin, 'createUser'>;
  posten: Pick<PostenStore, 'holen' | 'besetzungAnlegen'>;
  /** Called after an event was changed (notifications); failures must not matter. */
  eventGeaendert?: (eventId: string, aenderung: EventAenderung, akteur: string) => Promise<void>;
}

/** A value an Aktion wrote back into a Baustein (`eventId` of a created event, `sub` of an invited person). */
export interface Rueckschreibung {
  bausteinId: string;
  feld: 'eventId' | 'sub';
  wert: string;
}

/** The document with the values written back; the input is not changed. */
export function rueckschreiben(
  dokument: ProtokollDokument,
  patches: readonly Rueckschreibung[],
): ProtokollDokument {
  if (patches.length === 0) return dokument;
  const kopie = JSON.parse(JSON.stringify(dokument)) as ProtokollDokument;
  const gehe = (knoten: ProtokollKnoten) => {
    const attrs = knoten.attrs as { id?: unknown; daten?: Record<string, unknown> } | undefined;
    if (attrs && typeof attrs.id === 'string' && attrs.daten) {
      for (const p of patches) {
        if (p.bausteinId === attrs.id) attrs.daten[p.feld] = p.wert;
      }
    }
    for (const kind of knoten.content ?? []) gehe(kind);
  };
  gehe(kopie);
  return kopie;
}

/** Ids of the Posten the Wahl blocks of the document pick. */
function postenIdsVon(dokument: ProtokollDokument): string[] {
  const ids = new Set<string>();
  const gehe = (knoten: ProtokollKnoten) => {
    if (knoten.type === 'bausteinWahl') {
      const id = (knoten.attrs?.daten as { postenId?: unknown } | undefined)?.postenId;
      if (typeof id === 'string') ids.add(id);
    }
    for (const kind of knoten.content ?? []) gehe(kind);
  };
  gehe(dokument);
  return [...ids];
}

const namensName = (err: unknown): string => (err instanceof Error ? err.name : '');

/** German message for an error of an Aktion; unknown errors are logged and reported generally. */
function fehlerText(err: unknown): string {
  if (err instanceof EntfernungBestaetigen) {
    return 'Dabei würden Dienste oder Teilnahmen entfernt. Bitte ändere das Event direkt im Kalender.';
  }
  if (err instanceof KalenderUngueltig || err instanceof KalenderKonflikt) return err.message;
  if (err instanceof AblosungUngueltig) return 'Ungültige Ablösung';
  if (err instanceof BesetzungUeberschneidung) return 'Besetzung überschneidet sich';
  if (['AliasExistsException', 'UsernameExistsException'].includes(namensName(err))) {
    return 'E-Mail-Adresse bereits vergeben';
  }
  if (err instanceof Error && err.name === 'InvalidParameterException') {
    return 'Die E-Mail-Adresse ist ungültig.';
  }
  console.error('Protokoll-Aktion fehlgeschlagen', err);
  return 'Unerwarteter Fehler';
}

class AktionFehler extends Error {}

export function createProtokollAktionen(deps: AktionenDeps) {
  /** The state of the app the Aktionen of the document depend on. */
  async function kontextLesen(
    dokument: ProtokollDokument,
    sitzungDatum: string,
    heute: string,
  ): Promise<ProtokollAktionenKontext> {
    const postenIds = postenIdsVon(dokument);
    const [events, kategorien, personen, posten] = await Promise.all([
      Promise.all(protokollEventIds(dokument).map((id) => deps.kalender.event(id))),
      deps.kalender.kategorien(true),
      deps.mitglieder.alle(),
      Promise.all(postenIds.map((id) => deps.posten.holen(id))),
    ]);
    return {
      sitzungDatum,
      heute,
      events: Object.fromEntries(
        events.flatMap((e) =>
          e
            ? [
                [
                  e.id,
                  {
                    id: e.id,
                    titel: e.anzeigeTitel,
                    titelEingegeben: e.titel,
                    beschreibung: e.beschreibung,
                    kategorieId: e.kategorie?.id ?? null,
                    dauer: e.dauer,
                    beginn: e.beginn,
                    ende: e.ende,
                    abgesagt: e.abgesagt,
                    verantwortlichSub: e.verantwortlich?.sub ?? null,
                    teilnahmeStatus: e.teilnahmeStatus,
                    eingeladen: e.teilnahmen.filter((t) => t.eingeladen).map((t) => t.person.sub),
                    schichten: e.schichten,
                  } satisfies AktionEventKontext,
                ] as const,
              ]
            : [],
        ),
      ),
      kategorien: Object.fromEntries(
        kategorien.map((k) => [
          k.id,
          { art: k.art, dauer: k.dauer, teilnahmeStatus: k.teilnahmeStatus },
        ]),
      ),
      personen: Object.fromEntries(
        personen.map((r) => [r.sub, { status: r.status, deaktiviert: istDeaktiviert(r) }]),
      ),
      posten: Object.fromEntries(
        posten.flatMap((p) =>
          p
            ? [
                [
                  p.id,
                  {
                    name: p.name,
                    besetzungen: p.besetzungen.map((b) => ({
                      id: b.id,
                      mitgliedSub: b.mitgliedSub,
                      start: b.startDatum,
                      ende: b.endDatum,
                    })),
                  },
                ] as const,
              ]
            : [],
        ),
      ),
    };
  }

  /** Runs one Aktion; returns what was done. Writes back into `patches`. */
  async function ausfuehren(
    a: ProtokollAktion,
    akteur: string,
    patches: Rueckschreibung[],
  ): Promise<string> {
    const plan = a.plan!;
    switch (plan.art) {
      case 'event.anlegen': {
        const id = await deps.kalender.eventAnlegen(plan.eingabe, akteur);
        patches.push({ bausteinId: a.bausteinId, feld: 'eventId', wert: id });
        return 'Event im Kalender angelegt.';
      }
      case 'event.aendern': {
        const aenderung = await deps.kalender.eventAktualisieren(plan.eventId, plan.eingabe);
        if (!aenderung) throw new AktionFehler('Das Event gibt es nicht mehr.');
        if (deps.eventGeaendert) {
          await deps.eventGeaendert(plan.eventId, aenderung, akteur).catch(() => {});
        }
        return 'Event im Kalender geändert.';
      }
      case 'anwaerter.einladen': {
        const konto = await deps.userAdmin.createUser(plan.email, []);
        if (!konto.sub) throw new AktionFehler('Das Konto konnte nicht angelegt werden.');
        // Remember the account at once: a failure below must not lead to a second invitation.
        patches.push({ bausteinId: a.bausteinId, feld: 'sub', wert: konto.sub });
        await deps.mitglieder.speichern(
          konto.sub,
          {
            vorname: plan.vorname,
            nachname: plan.nachname,
            anrede: null,
            kontaktkanaele: null,
            discordName: null,
            adresse: null,
            telefon: null,
            ueberMich: null,
            profilbildKey: null,
            geburtsdatum: null,
            geburtstagImKalender: null,
          },
          'anwaerter',
          plan.ab,
        );
        return 'Einladung gesendet, Profil als Anwärter:in angelegt.';
      }
      case 'aufnahme.status':
      case 'em.status': {
        const row = await deps.mitglieder.holen(plan.sub);
        if (!row) throw new AktionFehler('Die Person hat noch kein Profil.');
        if (istDeaktiviert(row)) throw new AktionFehler('Der Account ist deaktiviert.');
        if (!(await deps.mitglieder.statusSetzen(plan.sub, plan.status, plan.ab))) {
          throw new AktionFehler('Die Person hat noch kein Profil.');
        }
        return 'Status geändert.';
      }
      case 'wahl.posten': {
        let ablosung = plan.ablosung;
        const fehler: string[] = [];
        let besetzt = 0;
        for (const sub of plan.subs) {
          try {
            const row = await deps.mitglieder.holen(sub);
            if (!row) throw new AktionFehler('Die Person hat noch kein Profil.');
            if (istDeaktiviert(row)) throw new AktionFehler('Der Account ist deaktiviert.');
            const id = await deps.posten.besetzungAnlegen(
              plan.postenId,
              { mitgliedSub: sub, start: plan.start, ende: null },
              ablosung,
            );
            if (id === undefined) throw new AktionFehler('Den Posten gibt es nicht mehr.');
            ablosung = [];
            besetzt++;
          } catch (err) {
            fehler.push(err instanceof AktionFehler ? err.message : fehlerText(err));
          }
        }
        if (fehler.length > 0) {
          throw new AktionFehler(
            `${besetzt} von ${plan.subs.length} Besetzungen angelegt. ${[...new Set(fehler)].join(' ')}`,
          );
        }
        return `${besetzt} ${besetzt === 1 ? 'Besetzung' : 'Besetzungen'} angelegt.`;
      }
    }
  }

  /**
   * Runs the asked Aktionen (`ids`) from the list one after the other; every Aktion is best effort
   * and a failure does not stop the others. Unknown, not executable and finished ones are skipped.
   */
  async function laufen(
    liste: readonly ProtokollAktion[],
    ids: readonly string[],
    akteur: string,
  ): Promise<{
    ausgaenge: ProtokollAktionAusgang[];
    patches: Rueckschreibung[];
    ergebnisse: Record<string, ProtokollAktionErgebnis>;
  }> {
    const gewollt = new Set(ids);
    const ausgaenge: ProtokollAktionAusgang[] = [];
    const patches: Rueckschreibung[] = [];
    const ergebnisse: Record<string, ProtokollAktionErgebnis> = {};
    for (const a of liste) {
      if (!gewollt.has(a.id)) continue;
      gewollt.delete(a.id);
      const kopf = { id: a.id, bausteinId: a.bausteinId, art: a.art };
      if (!a.ausfuehrbar || !a.plan) {
        ausgaenge.push({
          ...kopf,
          status: 'uebersprungen',
          meldung: a.grund ?? 'Nicht ausführbar',
        });
        continue;
      }
      let status: ProtokollAktionErgebnis['status'];
      let meldung: string;
      try {
        meldung = await ausfuehren(a, akteur, patches);
        status = 'erledigt';
      } catch (err) {
        meldung = err instanceof AktionFehler ? err.message : fehlerText(err);
        status = 'fehler';
      }
      ausgaenge.push({ ...kopf, ...{ status, meldung } });
      ergebnisse[a.id] = { status, text: meldung, am: new Date().toISOString(), von: akteur };
    }
    for (const id of gewollt) {
      const i = id.indexOf(':');
      ausgaenge.push({
        id,
        bausteinId: id.slice(0, i),
        art: id.slice(i + 1) as ProtokollAktionAusgang['art'],
        status: 'uebersprungen',
        meldung: 'Die Aktion gibt es nicht (mehr).',
      });
    }
    return { ausgaenge, patches, ergebnisse };
  }

  return { kontextLesen, laufen, aktionenVon: protokollAktionen };
}

export type ProtokollAktionenLaufer = ReturnType<typeof createProtokollAktionen>;
