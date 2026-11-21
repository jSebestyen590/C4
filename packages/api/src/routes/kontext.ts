import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { type Mitglied, bezeichnungFuer, umfrageEingabeSchema } from '@c4/shared';
import { type Konto } from '../admin';
import { type MitgliedRow } from '../db/schema';
import { type AktuellerPosten } from '../posten';
import { KalenderKonflikt, KalenderUngueltig } from '../kalender';
import {
  NichtKonfiguriert,
  NichtVerbunden,
  OneDriveFehler,
  OrdnerExistiert,
  OrdnerFehlt,
  type OneDriveOrdner,
} from '../onedrive';
import { WarenKonflikt, WarenUngueltig } from '../waren';
import { type ProtokollMitglied } from '../protokolleAnsicht';
import { type UmfragenCursor } from '../umfragen';
import { ladeKontext } from '../umfrageAnsicht';
import { kanaeleLesen, istDeaktiviert } from '../mitglieder';
import { kleinKey } from '../profilbilder';
import {
  terminVorbereiten as terminVorbereitenModul,
  umfrageSpeichern as umfrageSpeichernModul,
} from '../umfrageSpeichern';
import { authenticate, requireAnyPermission, requirePermission } from '../auth';
import type { AppDeps } from '../app';

/** "2026-11-01T09:00:00.000Z_<id>" */
export const cursorSchreiben = (c: UmfragenCursor) => `${c.erstelltAm.toISOString()}_${c.id}`;
export function cursorLesen(wert: string | undefined): UmfragenCursor | undefined {
  if (!wert) return undefined;
  const trenner = wert.indexOf('_');
  const erstelltAm = new Date(wert.slice(0, trenner));
  if (trenner < 0 || Number.isNaN(erstelltAm.getTime())) {
    throw new HTTPException(400, { message: 'Ungültige Position.' });
  }
  return { erstelltAm, id: wert.slice(trenner + 1) };
}
export const MITGLIED_DEAKTIVIERT = 'Das Mitglied ist deaktiviert.';

export function baueKontext(deps: AppDeps) {
  const auth = authenticate(
    deps.verifyToken,
    async (sub) => {
      const row = await deps.mitglieder.holen(sub);
      return row && { status: row.status, deaktiviert: istDeaktiviert(row) };
    },
    (sub) => deps.posten.rechteVon(sub),
  );
  const adminOnly = requirePermission('users:manage');
  const mitgliederLesen = requirePermission('mitglieder:lesen');
  const profilBearbeiten = requirePermission('profil:bearbeiten');
  const postenLesen = requirePermission('posten:lesen');
  const postenBearbeiten = requirePermission('posten:bearbeiten');
  const warenLesen = requirePermission('waren:lesen');
  const bestandBuchen = requirePermission('bestand:buchen');
  const warenVerwalten = requirePermission('waren:verwalten');
  const inventarLesen = requirePermission('inventar:lesen');
  const inventarUmraeumen = requirePermission('inventar:umraeumen');
  const inventarVerwalten = requirePermission('inventar:verwalten');
  const kalenderLesen = requirePermission('kalender:lesen');
  const eventsVerwalten = requirePermission('events:verwalten');
  const kalenderEinrichten = requirePermission('kalender:einrichten');
  const schluesselLesen = requirePermission('schluessel:lesen');
  const schluesselVerwalten = requirePermission('schluessel:verwalten');
  const umfragenLesen = requirePermission('umfragen:lesen');
  const umfragenVerwalten = requirePermission('umfragen:verwalten');
  const trichterLesen = requirePermission('trichter:lesen');
  const trichterVerwalten = requirePermission('trichter:verwalten');
  const buchLesen = requirePermission('buch:lesen');
  const kasseZaehlen = requirePermission('kasse:zaehlen');
  const finanzenLesen = requirePermission('finanzen:lesen');
  const finanzenBuchen = requirePermission('finanzen:buchen');
  const belegeEinreichen = requirePermission('belege:einreichen');
  const finanzenVerwalten = requirePermission('finanzen:verwalten');
  const finanzenPruefen = requirePermission('finanzen:pruefen');
  const abgleichLesen = requireAnyPermission('finanzen:lesen', 'waren:verwalten');
  const abgleichSchreiben = requireAnyPermission('finanzen:buchen', 'waren:verwalten');
  const bilderLesen = requirePermission('bilder:lesen');
  const protokolleLesen = requirePermission('protokolle:lesen');
  const protokolleSchreiben = requirePermission('protokolle:schreiben');
  const privatpartysVerwalten = requirePermission('privatpartys:verwalten');

  /** Merges the profile row with the Cognito account; either side may be missing. */
  const alsMitglied = async (
    sub: string,
    row: MitgliedRow | undefined,
    konto: Konto | undefined,
    rollen?: string[],
    posten: AktuellerPosten[] = [],
  ): Promise<Mitglied> => ({
    sub,
    vorname: row?.vorname ?? '',
    nachname: row?.nachname ?? '',
    anrede: row?.anrede ?? 'neutral',
    kontaktkanaele: kanaeleLesen(row?.kontaktkanaele ?? null),
    discordName: row?.discordName ?? null,
    username: konto?.username ?? null,
    status: row?.status ?? 'anwaerter',
    deaktiviert: istDeaktiviert(row),
    email: konto?.email ?? null,
    aktiviert: konto?.aktiviert ?? true,
    adresse: row?.adresse ?? null,
    telefon: row?.telefon ?? null,
    ueberMich: row?.ueberMich ?? null,
    profilbildKey: row?.profilbildKey ?? null,
    profilbildUrl: row?.profilbildKey
      ? await deps.profilbilder.anzeigeUrl(kleinKey(row.profilbildKey))
      : null,
    profilbildGrossUrl: row?.profilbildKey
      ? await deps.profilbilder.anzeigeUrl(row.profilbildKey)
      : null,
    // Always visible; `geburtstagImKalender` only controls calendar and notifications.
    geburtsdatum: row?.geburtsdatum ?? null,
    geburtstagImKalender: row?.geburtstagImKalender ?? true,
    wohnheim: row?.wohnheim ?? false,
    posten: posten.map((p) => ({
      id: p.id,
      name: p.name,
      bezeichnung: bezeichnungFuer(p, row?.anrede ?? 'neutral'),
    })),
    ...(rollen && { rollen }),
  });

  /** Adds the Cognito username to the `ersteller` of Vorgänge/Inventuren (the store only knows the profile row). */
  const mitErstellerUsernames = async <
    T extends { ersteller: { sub: string; username: string | null } | null },
  >(
    liste: T[],
  ): Promise<T[]> => {
    if (!liste.some((e) => e.ersteller)) return liste;
    const konten = await deps.userAdmin.konten();
    return liste.map((e) =>
      e.ersteller
        ? {
            ...e,
            ersteller: {
              ...e.ersteller,
              username: konten.get(e.ersteller.sub)?.username ?? null,
            },
          }
        : e,
    );
  };

  /** Maps the Waren store's domain errors to 400 (invalid) and 409 (conflict). */
  const warenFehler = (err: unknown): never => {
    if (err instanceof WarenUngueltig)
      throw new HTTPException(400, {
        message: err.message,
        // `onError` adds it to the body as `feld`, so a form can show the message at the field.
        cause: err.feld ? { feld: err.feld } : undefined,
      });
    if (err instanceof WarenKonflikt) throw new HTTPException(409, { message: err.message });
    throw err;
  };

  /** Maps the Kalender store's domain errors to 400 (invalid) and 409 (conflict). */
  const kalenderFehler = (err: unknown): never => {
    if (err instanceof KalenderUngueltig) throw new HTTPException(400, { message: err.message });
    if (err instanceof KalenderKonflikt) throw new HTTPException(409, { message: err.message });
    throw err;
  };

  /** Maps OneDrive errors to HTTP statuses for routes that talk to OneDrive directly. */
  const onedriveFehler = (err: unknown): never => {
    if (err instanceof NichtVerbunden)
      throw new HTTPException(503, { message: 'OneDrive ist nicht verbunden.' });
    if (err instanceof OrdnerExistiert) throw new HTTPException(409, { message: err.message });
    if (err instanceof OrdnerFehlt) throw new HTTPException(404, { message: err.message });
    if (err instanceof NichtKonfiguriert || err instanceof OneDriveFehler)
      throw new HTTPException(400, { message: err.message });
    console.error('OneDrive request failed', err);
    throw new HTTPException(502, { message: 'OneDrive ist gerade nicht erreichbar.' });
  };

  /** Creates the folder's anonymous sharing link (Microsoft returns the existing one) and caches it. */
  const freigabeErstellen = async (ordnerId: string): Promise<string> => {
    const url = await deps.onedrive.freigabeLink(ordnerId);
    await deps.freigaben.setzen(ordnerId, url);
    return url;
  };

  /** Like `freigabeErstellen`, but a failure is only logged and gives null. */
  const freigabeVersuchen = async (ordnerId: string): Promise<string | null> => {
    try {
      return await freigabeErstellen(ordnerId);
    } catch (err) {
      console.error(`OneDrive sharing link of folder ${ordnerId} failed`, err);
      return null;
    }
  };

  /**
   * Changes the stored folder list snapshot (add, rename, remove an entry) so it stays current without a
   * live load. Keeps its `stand`; without a snapshot nothing is stored (it would look complete). Never throws.
   */
  const ordnerCacheAendern = async (
    aendern: (liste: OneDriveOrdner[]) => OneDriveOrdner[],
  ): Promise<void> => {
    try {
      const snapshot = await deps.ordnerCache.lesen();
      if (snapshot) await deps.ordnerCache.schreiben(aendern(snapshot.ordner), snapshot.stand);
    } catch (err) {
      console.error('Updating the folder list cache failed', err);
    }
  };

  const ordnerCacheEinfuegen = (ordner: OneDriveOrdner) =>
    ordnerCacheAendern((liste) => [...liste.filter((o) => o.id !== ordner.id), ordner]);

  /** Deletes the folders of removed events if they are empty; errors are only logged. */
  const bilderOrdnerAufraeumen = async (ordnerIds: readonly string[]) => {
    for (const id of ordnerIds) {
      try {
        const ergebnis = await deps.onedrive.loeschenWennLeer(id);
        if (ergebnis !== 'nicht-leer') {
          await deps.freigaben.loeschen(id);
          await ordnerCacheAendern((liste) => liste.filter((o) => o.id !== id));
        }
      } catch (err) {
        console.error(`OneDrive folder ${id} could not be cleaned up`, err);
      }
    }
  };

  /**
   * Runs a change that may delete events (event delete, series changes) and cleans up the folders of
   * the events that are gone afterwards.
   */
  const mitOrdnerAufraeumen = async <T>(aktion: () => Promise<T>): Promise<T> => {
    const vorher = await deps.kalender.bilderOrdnerZuordnung();
    const ergebnis = await aktion();
    if (vorher.length > 0) {
      const nachher = new Set((await deps.kalender.bilderOrdnerZuordnung()).map((z) => z.eventId));
      await bilderOrdnerAufraeumen(
        vorher.filter((z) => !nachher.has(z.eventId)).map((z) => z.ordnerId),
      );
    }
    return ergebnis;
  };

  const umfrageKontext = () => ladeKontext(deps);

  const umfrageSpeichern = umfrageSpeichernModul;

  const terminVorbereiten = (e: z.output<typeof umfrageEingabeSchema>) =>
    terminVorbereitenModul(deps.kalender, e);

  /** Deletes an event like `DELETE /kalender/events/:id`; false when it is already gone. */
  const eventLoeschenMitPruefung = async (eventId: string): Promise<boolean> => {
    if (await deps.protokolle.nachEvent(eventId)) {
      throw new HTTPException(409, { message: 'Zu dieser Sitzung gibt es ein Protokoll.' });
    }
    return mitOrdnerAufraeumen(() => deps.kalender.eventLoeschen(eventId).catch(kalenderFehler));
  };

  /** All members as the minutes show them (usernames come from Cognito). */
  const protokollMitglieder = async (): Promise<ProtokollMitglied[]> => {
    const [rows, konten] = await Promise.all([deps.mitglieder.alle(), deps.userAdmin.konten()]);
    return rows.map((r) => ({
      sub: r.sub,
      username: konten.get(r.sub)?.username ?? null,
      vorname: r.vorname,
      nachname: r.nachname,
      status: r.status,
      anrede: r.anrede ?? 'neutral',
      deaktiviert: istDeaktiviert(r),
    }));
  };

  /** Dienste and Externe reference the entering member's profile row. */
  const eigenesProfilMussExistieren = async (sub: string) => {
    if (!(await deps.mitglieder.holen(sub))) {
      throw new HTTPException(400, { message: 'Bitte lege zuerst dein Profil an.' });
    }
  };

  /** 404 unless the store found the entry (`false` / `undefined` mean it does not exist). */
  const gefunden = <T>(wert: T | false | undefined, meldung: string): T => {
    if (wert === false || wert === undefined) throw new HTTPException(404, { message: meldung });
    return wert;
  };

  /** The acting member for push texts: username, else Vorname. */
  const akteurMitName = async (sub: string): Promise<{ sub: string; name: string }> => {
    const [konten, profil] = await Promise.all([
      deps.userAdmin.konten(),
      deps.mitglieder.holen(sub),
    ]);
    return { sub, name: konten.get(sub)?.username || profil?.vorname || 'Jemand' };
  };

  /** Besetzungen may only name members that already have a profile row. */
  const mitgliedMussExistieren = async (sub: string) => {
    const row = await deps.mitglieder.holen(sub);
    if (!row) throw new HTTPException(400, { message: 'Mitglied hat noch kein Profil' });
    if (istDeaktiviert(row)) throw new HTTPException(400, { message: MITGLIED_DEAKTIVIERT });
  };

  /** All members: every profile row plus every enabled account that has no profile yet. */
  const alleMitglieder = async (
    mitRollen: boolean,
    mitDeaktivierten: boolean,
  ): Promise<Mitglied[]> => {
    const [rows, konten, rollen, posten] = await Promise.all([
      deps.mitglieder.alle(),
      deps.userAdmin.konten(),
      mitRollen ? deps.userAdmin.rollen() : undefined,
      deps.posten.aktuelleNachMitglied(),
    ]);
    const nachSub = new Map(rows.map((r) => [r.sub, r]));
    const subs = [
      ...rows.filter((r) => mitDeaktivierten || !istDeaktiviert(r)).map((r) => r.sub),
      ...[...konten.values()].filter((k) => k.enabled && !nachSub.has(k.sub)).map((k) => k.sub),
    ];
    const liste = await Promise.all(
      subs.map((s) =>
        alsMitglied(
          s,
          nachSub.get(s),
          konten.get(s),
          rollen && (rollen.get(s) ?? []),
          posten.get(s),
        ),
      ),
    );
    const sortKey = (m: Mitglied) =>
      `${m.nachname || '\uffff'} ${m.vorname} ${m.username ?? m.email ?? ''}`.toLowerCase();
    return liste.sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'de'));
  };

  return {
    deps,
    auth,
    adminOnly,
    mitgliederLesen,
    profilBearbeiten,
    postenLesen,
    postenBearbeiten,
    warenLesen,
    bestandBuchen,
    warenVerwalten,
    inventarLesen,
    inventarUmraeumen,
    inventarVerwalten,
    kalenderLesen,
    eventsVerwalten,
    kalenderEinrichten,
    schluesselLesen,
    schluesselVerwalten,
    umfragenLesen,
    umfragenVerwalten,
    trichterLesen,
    trichterVerwalten,
    buchLesen,
    kasseZaehlen,
    finanzenLesen,
    finanzenBuchen,
    belegeEinreichen,
    finanzenVerwalten,
    finanzenPruefen,
    abgleichLesen,
    abgleichSchreiben,
    bilderLesen,
    protokolleLesen,
    protokolleSchreiben,
    privatpartysVerwalten,
    alsMitglied,
    mitErstellerUsernames,
    warenFehler,
    kalenderFehler,
    onedriveFehler,
    freigabeErstellen,
    freigabeVersuchen,
    ordnerCacheAendern,
    ordnerCacheEinfuegen,
    bilderOrdnerAufraeumen,
    mitOrdnerAufraeumen,
    umfrageKontext,
    umfrageSpeichern,
    terminVorbereiten,
    eventLoeschenMitPruefung,
    protokollMitglieder,
    eigenesProfilMussExistieren,
    gefunden,
    akteurMitName,
    mitgliedMussExistieren,
    alleMitglieder,
  };
}

export type RoutenKontext = ReturnType<typeof baueKontext>;
