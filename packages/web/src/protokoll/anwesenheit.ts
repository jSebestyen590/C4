import {
  anwesenheitsVerlauf,
  teilnahmeNormalisiert,
  type ProtokollArt,
  type ProtokollDokument,
  type ProtokollDto,
  type ProtokollKopf,
  type ProtokollMitgliedDto,
  type AnwesenheitsZeit,
  type ProtokollTeilnahmeWert,
  zeitBerlin,
} from '@c4/shared';
import { MITGLIED_STATUS_LABELS, labelFuer } from '../i18n';
import { mitgliedOptionen } from '../organisator';
import type { SlashPerson } from './slashLogik';

// Who is in the attendance list and what that means for the quorum (no React).

/** A person of the attendance list with the attendance that currently counts. */
export interface AnwesenheitPerson extends ProtokollMitgliedDto {
  wert: ProtokollTeilnahmeWert;
}

/**
 * The effective attendance: a draft follows the Sitzung unless overridden; a closed protocol is
 * frozen. Old `verspaetet` counts as `anwesend`; people with an Anwesenheit block (`zeiten`) are "da".
 */
export function wertVon(
  t: ProtokollDto['teilnahme'][number],
  kopf: ProtokollKopf,
  entwurf: boolean,
  zeiten: Readonly<Record<string, AnwesenheitsZeit>> = {},
): ProtokollTeilnahmeWert {
  if (t.sub in zeiten) return 'anwesend';
  return teilnahmeNormalisiert(entwurf ? (kopf.teilnahme[t.sub] ?? t.abgeleitet) : t.wert);
}

/**
 * The attendance list with the values that count right now (including local Kopf overrides and the
 * lock to "da" of people in Erscheint / Geht blocks).
 */
export function effektiveTeilnahme(
  dto: ProtokollDto,
  kopf: ProtokollKopf,
  zeiten: Readonly<Record<string, AnwesenheitsZeit>> = {},
): AnwesenheitPerson[] {
  const entwurf = dto.status === 'entwurf';
  return dto.teilnahme.map((t) => ({
    sub: t.sub,
    username: t.username,
    vorname: t.vorname,
    nachname: t.nachname,
    status: t.status,
    anrede: t.anrede,
    wert: wertVon(t, kopf, entwurf, zeiten),
  }));
}

/** Quorum at the opening (before any Erscheint / Geht block; those who arrive later are not counted). */
export function quorumBeiEroeffnung(
  art: ProtokollArt,
  personen: readonly AnwesenheitPerson[],
  inhalt: ProtokollDokument = { type: 'doc', content: [] },
) {
  return anwesenheitsVerlauf(inhalt, { art, teilnahme: personen }).start;
}

/** "von 25 Mitgliedern" after "12 von …": "1 Mitglied" / "25 Mitgliedern". */
export const mitgliedernText = (n: number): string =>
  `${n} ${n === 1 ? 'Mitglied' : 'Mitgliedern'}`;

/** Select options `username (Vorname Nachname)`, sorted. */
export function personenOptionen(
  personen: readonly ProtokollMitgliedDto[],
): { value: string; label: string }[] {
  return mitgliedOptionen(personen.map((p) => ({ ...p, email: '' })));
}

/** Persons selectable in a Neues EM block: the attendance list plus the EMs, each person once. */
export function emKandidaten(
  teilnahme: readonly ProtokollMitgliedDto[],
  ems: readonly ProtokollMitgliedDto[],
): ProtokollMitgliedDto[] {
  const gesehen = new Set<string>();
  return [...teilnahme, ...ems].filter((p) => !gesehen.has(p.sub) && gesehen.add(p.sub));
}

/**
 * Options of the person select of an Aufnahme: the Anwärter:innen of the attendance list first, then
 * everybody else (members, EMs), each group sorted; empty groups are left out.
 */
export function aufnahmeOptionen(
  personen: readonly ProtokollMitgliedDto[],
): { group: string; items: { value: string; label: string }[] }[] {
  const optionen = personenOptionen(personen);
  const status = new Map(personen.map((p) => [p.sub, p.status]));
  const anwaerter = optionen.filter((o) => status.get(o.value) === 'anwaerter');
  const weitere = optionen.filter((o) => status.get(o.value) !== 'anwaerter');
  return [
    { group: 'Anwärter:innen', items: anwaerter },
    { group: 'Weitere Personen', items: weitere },
  ].filter((g) => g.items.length > 0);
}

/** The persons as the second stage of /erscheint and /geht lists them. */
export function slashPersonen(personen: readonly AnwesenheitPerson[]): SlashPerson[] {
  return personen.map((p) => {
    const voll = `${p.vorname} ${p.nachname}`.trim();
    const neben = p.username ? voll : '';
    const status = labelFuer(MITGLIED_STATUS_LABELS, p.status, p.anrede);
    return {
      sub: p.sub,
      titel: p.username ?? (voll || '–'),
      beschreibung: [neben, status].filter(Boolean).join(' · '),
      mitglied: p.status === 'mitglied',
      da: p.wert === 'anwesend',
    };
  });
}

/** Current Berlin time `HH:MM`: the default of a new Erscheint / Geht block. */
export function anwesenheitUhrzeit(jetzt: Date = new Date()): string {
  return zeitBerlin(jetzt.toISOString());
}

/** Whether somebody with this attendance counts as absent at the opening. */
export const fehltZuBeginn = (wert: ProtokollTeilnahmeWert): boolean =>
  wert === 'entschuldigt' || wert === 'unentschuldigt';

/**
 * The Kopf after somebody got an Erscheint / Geht block: a person who is not "da" gets the override
 * `anwesend` (blocks lock the person to "da"). Returns `null` when nothing changes (unknown person,
 * already present, closed protocol).
 */
export function kopfNachAnwesenheit(
  dto: ProtokollDto,
  kopf: ProtokollKopf,
  sub: string,
): ProtokollKopf | null {
  if (dto.status !== 'entwurf') return null;
  const person = dto.teilnahme.find((t) => t.sub === sub);
  if (!person || wertVon(person, kopf, true) === 'anwesend') return null;
  return { ...kopf, teilnahme: { ...kopf.teilnahme, [sub]: 'anwesend' } };
}
