import {
  teilnahmeAbleiten,
  type Anrede,
  type MitgliedStatus,
  type ProtokollArt,
  type ProtokollEmDto,
  type ProtokollKopf,
  type ProtokollMitgliedDto,
  type ProtokollStatus,
  type ProtokollTeilnahmeDto,
  type ProtokollTeilnahmeWert,
  type TeilnahmeAntwort,
} from '@c4/shared';

// Attendance and EM list of a protocol (see docs/protokolle.md): derived live from the answers to the
// Sitzung event in a draft, taken from the snapshot once closed.

/** A member as the lists need them. */
export interface ProtokollMitglied extends ProtokollMitgliedDto {
  deaktiviert: boolean;
  anrede: Anrede;
}

export const mitgliedDto = (m: ProtokollMitglied): ProtokollMitgliedDto => ({
  sub: m.sub,
  username: m.username,
  vorname: m.vorname,
  nachname: m.nachname,
  status: m.status,
  anrede: m.anrede,
});

/** Name to sort by: the username, else "Vorname Nachname". */
const sortName = (m: ProtokollMitgliedDto) => m.username || `${m.vorname} ${m.nachname}`.trim();
const nachName = (a: ProtokollMitgliedDto, b: ProtokollMitgliedDto) =>
  sortName(a).localeCompare(sortName(b), 'de');

const TEILNEHMENDE_STATI: readonly MitgliedStatus[] = ['anwaerter', 'mitglied'];

export interface ProtokollListen {
  teilnahme: ProtokollTeilnahmeDto[];
  ems: ProtokollEmDto[];
}

/**
 * Who took part and which EMs were there. A draft lists the active Anwärter:innen and Mitglieder
 * (attendance: override, else derived from the answer) and the active EMs (chosen in the Kopf, else
 * those who said yes). A closed protocol lists exactly the people of the snapshot with the frozen
 * values; `abgeleitet` always shows what the answers say now.
 */
export function protokollListen(
  kopf: ProtokollKopf,
  status: ProtokollStatus,
  mitglieder: readonly ProtokollMitglied[],
  antworten: Readonly<Record<string, TeilnahmeAntwort>>,
): ProtokollListen {
  const geschlossen = status === 'abgeschlossen' && kopf.schnappschuss !== null;
  const aktiv = mitglieder.filter((m) => !m.deaktiviert);

  const teilnehmende = geschlossen
    ? mitglieder.filter((m) => m.sub in kopf.schnappschuss!)
    : aktiv.filter((m) => TEILNEHMENDE_STATI.includes(m.status));
  const teilnahme = teilnehmende
    .map((m): ProtokollTeilnahmeDto => {
      const abgeleitet = teilnahmeAbleiten(antworten[m.sub]);
      const ueberschreibung = kopf.teilnahme[m.sub];
      const wert: ProtokollTeilnahmeWert = geschlossen
        ? (kopf.schnappschuss![m.sub] ?? abgeleitet)
        : (ueberschreibung ?? abgeleitet);
      return {
        ...mitgliedDto(m),
        status: geschlossen ? (kopf.statusSchnappschuss?.[m.sub] ?? m.status) : m.status,
        abgeleitet,
        wert,
        ueberschrieben: ueberschreibung !== undefined && ueberschreibung !== abgeleitet,
      };
    })
    .sort(nachName);

  const gewaehlt = geschlossen ? kopf.emsSchnappschuss : null;
  const ems = (
    gewaehlt
      ? mitglieder.filter((m) => gewaehlt.includes(m.sub))
      : aktiv.filter((m) => m.status === 'em')
  )
    .map((m): ProtokollEmDto => {
      const abgeleitet = antworten[m.sub] === 'teilnahme';
      return {
        ...mitgliedDto(m),
        abgeleitet,
        ausgewaehlt: gewaehlt ? true : kopf.ems === null ? abgeleitet : kopf.ems.includes(m.sub),
      };
    })
    .sort(nachName);

  return { teilnahme, ems };
}

/** Art of the Sitzung: frozen once closed, else the current one of the Kategorie. */
export const protokollArtVon = (
  kopf: ProtokollKopf,
  status: ProtokollStatus,
  aktuell: ProtokollArt,
): ProtokollArt => (status === 'abgeschlossen' ? (kopf.artSchnappschuss ?? aktuell) : aktuell);

/**
 * The kopf of a protocol that is being closed: the current lists frozen into the snapshot, together
 * with the member status of everybody in the attendance and the art of the Sitzung.
 */
export function kopfAbschliessen(
  kopf: ProtokollKopf,
  mitglieder: readonly ProtokollMitglied[],
  antworten: Readonly<Record<string, TeilnahmeAntwort>>,
  art: ProtokollArt,
): ProtokollKopf {
  const entwurf = {
    ...kopf,
    schnappschuss: null,
    emsSchnappschuss: null,
    statusSchnappschuss: null,
    artSchnappschuss: null,
  };
  const { teilnahme, ems } = protokollListen(entwurf, 'entwurf', mitglieder, antworten);
  return {
    ...entwurf,
    schnappschuss: Object.fromEntries(teilnahme.map((t) => [t.sub, t.wert])),
    emsSchnappschuss: ems.filter((e) => e.ausgewaehlt).map((e) => e.sub),
    statusSchnappschuss: Object.fromEntries(teilnahme.map((t) => [t.sub, t.status])),
    artSchnappschuss: art,
  };
}

/** Kopf without any snapshot (a draft never carries one). */
export const kopfOhneSchnappschuss = (kopf: ProtokollKopf): ProtokollKopf => ({
  ...kopf,
  schnappschuss: null,
  emsSchnappschuss: null,
  statusSchnappschuss: null,
  artSchnappschuss: null,
});

/** The kopf of a reopened protocol: the snapshot is dropped, the draft follows the event again. */
export const kopfWiederOeffnen = kopfOhneSchnappschuss;
