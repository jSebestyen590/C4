import {
  ergebnisseSichtbar,
  kreisVon,
  umfrageLaeuft,
  type KreisRolle,
  type MitgliedStatus,
  type Anrede,
  type UmfrageDetailDto,
  type UmfrageListeDto,
  type UmfragePerson,
} from '@c4/shared';
import type { UmfrageDaten, UmfrageDetails } from './umfragen';

// Builds the poll DTOs for one caller. Anonymous polls never reveal who voted or what.

export interface UmfrageKontext {
  mitglieder: readonly {
    sub: string;
    status: MitgliedStatus;
    vorname: string;
    nachname: string;
    anrede: Anrede | null;
    /** Set for deactivated members: they keep their name in old entries but drop out of all circles. */
    deaktiviertAm?: Date | null;
  }[];
  usernames: ReadonlyMap<string, string | null>;
  /** Current holders per Posten id. */
  postenInhaber: ReadonlyMap<string, readonly string[]>;
  jetzt: Date;
}

export interface Aufrufer {
  sub: string;
  /** Has `umfragen:verwalten`. */
  verwaltung: boolean;
  /** Has `privatpartys:verwalten` and the poll belongs to a Privatparty: may handle this poll. */
  privatpartys?: boolean;
}

export function personVon(k: UmfrageKontext, sub: string): UmfragePerson {
  const m = k.mitglieder.find((r) => r.sub === sub);
  return {
    sub,
    username: k.usernames.get(sub) ?? null,
    vorname: m?.vorname ?? '',
    nachname: m?.nachname ?? '',
    status: m?.status ?? 'anwaerter',
    anrede: m?.anrede ?? 'neutral',
  };
}

export const kreisDerUmfrage = (u: UmfrageDaten, k: UmfrageKontext): Map<string, KreisRolle> =>
  kreisVon(
    u,
    k.mitglieder.filter((m) => !m.deaktiviertAm),
    k.postenInhaber,
  );

/** Subs with a vote that still counts. */
export const gueltigAbgestimmt = (u: UmfrageDaten): Set<string> =>
  new Set(u.abgaben.filter((a) => !a.erneutNoetig).map((a) => a.sub));

/** Whether the caller may see the poll at all: in a circle, voted, creator or Verwaltung. */
export function darfSehen(u: UmfrageDaten, kreis: Map<string, KreisRolle>, a: Aufrufer): boolean {
  return (
    a.verwaltung ||
    u.erstellerSub === a.sub ||
    kreis.has(a.sub) ||
    u.abgaben.some((x) => x.sub === a.sub)
  );
}

export const darfBearbeiten = (u: UmfrageDaten, a: Aufrufer) =>
  a.verwaltung || a.privatpartys === true || u.erstellerSub === a.sub;

export function alsListeDto(
  u: UmfrageDaten,
  k: UmfrageKontext,
  a: Aufrufer,
  kreis = kreisDerUmfrage(u, k),
): UmfrageListeDto {
  const gueltig = gueltigAbgestimmt(u);
  const eigene = u.abgaben.find((x) => x.sub === a.sub);
  return {
    id: u.id,
    titel: u.titel,
    endetAm: u.endetAm,
    beendetAm: u.beendetAm?.toISOString() ?? null,
    laeuft: umfrageLaeuft(u, k.jetzt),
    anonym: u.anonym,
    ersteller: k.mitglieder.some((m) => m.sub === u.erstellerSub)
      ? personVon(k, u.erstellerSub)
      : null,
    meinKreis: kreis.get(a.sub) ?? null,
    abgestimmt: gueltig.has(a.sub),
    erneutNoetig: eigene?.erneutNoetig ?? false,
    darfBearbeiten: darfBearbeiten(u, a),
    darfLoeschen: a.verwaltung,
    abgaben: gueltig.size,
    kreisGroesse: new Set([...kreis.keys(), ...gueltig]).size,
    terminumfrage: u.termin !== null || u.terminFrei,
    terminFrei: u.terminFrei,
  };
}

export function alsDetailDto(u: UmfrageDetails, k: UmfrageKontext, a: Aufrufer): UmfrageDetailDto {
  const kreis = kreisDerUmfrage(u, k);
  const liste = alsListeDto(u, k, a, kreis);
  const gueltig = gueltigAbgestimmt(u);
  const sichtbar = ergebnisseSichtbar({
    ergebnisse: u.ergebnisse,
    laeuft: liste.laeuft,
    verwaltet: liste.darfBearbeiten,
    abgestimmt: liste.abgestimmt,
  });
  // Only valid votes count; answers kept from an invalidated vote are shown to their owner only.
  const zaehlend = u.stimmen.filter((s) => gueltig.has(s.sub));
  const namen = sichtbar && !u.anonym;
  return {
    ...liste,
    beschreibung: u.beschreibung,
    erstelltAm: u.erstelltAm.toISOString(),
    ergebnisse: u.ergebnisse,
    ergebnisseSichtbar: sichtbar,
    pflicht: u.pflicht,
    optional: u.optional,
    erinnerungenPflicht: u.erinnerungenPflicht,
    erinnerungenOptional: u.erinnerungenOptional,
    fragen: u.fragen.map((f) => ({
      id: f.id,
      text: f.text,
      freitext: f.freitext,
      maxAntworten: f.maxAntworten,
      optionen: f.optionen.map((o) => {
        const stimmen = zaehlend.filter((s) => s.optionId === o.id);
        return {
          id: o.id,
          text: o.text,
          termin: o.termin,
          stimmen: sichtbar ? stimmen.length : null,
          personen: namen ? stimmen.map((s) => personVon(k, s.sub)) : null,
        };
      }),
      keiner:
        (u.termin || u.terminFrei) && sichtbar
          ? (() => {
              const subs = [...gueltig].filter(
                (sub) => !u.stimmen.some((s) => s.sub === sub && s.frageId === f.id),
              );
              return {
                anzahl: subs.length,
                personen: namen ? subs.map((sub) => personVon(k, sub)) : null,
              };
            })()
          : null,
      freitexte: sichtbar
        ? zaehlend
            .filter((s) => s.frageId === f.id && s.freitext !== null)
            .map((s) => ({ text: s.freitext!, person: u.anonym ? null : personVon(k, s.sub) }))
            // Stored order follows the votes; for anonymous polls sort so it cannot reveal who voted last.
            .sort((x, y) => (u.anonym ? x.text.localeCompare(y.text, 'de') : 0))
        : null,
    })),
    meineAntworten: u.fragen.map((f) => {
      const eigene = u.stimmen.filter((s) => s.sub === a.sub && s.frageId === f.id);
      return {
        frageId: f.id,
        optionIds: eigene.flatMap((s) => (s.optionId ? [s.optionId] : [])),
        freitext: eigene.find((s) => s.freitext !== null)?.freitext ?? null,
      };
    }),
    hatStimmen: u.abgaben.length > 0,
    termin: u.termin,
    terminDauer: null,
    terminBedarf: null,
    eventId: u.eventId,
    eventOptionId: u.eventOptionId,
    darfEventAnlegen:
      u.termin !== null && u.eventId === null && !liste.laeuft && liste.darfBearbeiten,
    teilnehmende: u.anonym
      ? null
      : [...kreis.entries()].map(([sub, rolle]) => ({
          person: personVon(k, sub),
          rolle,
          abgestimmt: gueltig.has(sub),
        })),
  };
}

/** Loads members, usernames and current Posten holders for evaluating circles. */
export async function ladeKontext(
  deps: {
    mitglieder: { alle(): Promise<UmfrageKontext['mitglieder']> };
    userAdmin: { konten(): Promise<Map<string, { username?: string | null }>> };
    posten: { aktuelleNachMitglied(): Promise<Map<string, readonly { id: string }[]>> };
  },
  jetzt = new Date(),
): Promise<UmfrageKontext> {
  const [mitglieder, konten, posten] = await Promise.all([
    deps.mitglieder.alle(),
    deps.userAdmin.konten(),
    deps.posten.aktuelleNachMitglied(),
  ]);
  const postenInhaber = new Map<string, string[]>();
  for (const [sub, liste] of posten) {
    for (const p of liste) postenInhaber.set(p.id, [...(postenInhaber.get(p.id) ?? []), sub]);
  }
  return {
    mitglieder,
    usernames: new Map([...konten].map(([sub, k]) => [sub, k.username ?? null])),
    postenInhaber,
    jetzt,
  };
}
