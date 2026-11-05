import {
  anwesenheitsVerlauf,
  type ProtokollArt,
  type ProtokollDokument,
  type ProtokollDto,
  type ProtokollKopf,
  type ProtokollMitgliedDto,
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

/** The effective attendance: a draft follows the Sitzung unless overridden; a closed protocol is frozen. */
export function wertVon(
  t: ProtokollDto['teilnahme'][number],
  kopf: ProtokollKopf,
  entwurf: boolean,
): ProtokollTeilnahmeWert {
  return entwurf ? (kopf.teilnahme[t.sub] ?? t.abgeleitet) : t.wert;
}

/** The attendance list with the values that count right now (including local Kopf overrides). */
export function effektiveTeilnahme(dto: ProtokollDto, kopf: ProtokollKopf): AnwesenheitPerson[] {
  const entwurf = dto.status === 'entwurf';
  return dto.teilnahme.map((t) => ({
    sub: t.sub,
    username: t.username,
    vorname: t.vorname,
    nachname: t.nachname,
    status: t.status,
    anrede: t.anrede,
    wert: wertVon(t, kopf, entwurf),
  }));
}

/** Quorum at the opening (before any Erscheint / Geht block). */
export function quorumBeiEroeffnung(art: ProtokollArt, personen: readonly AnwesenheitPerson[]) {
  const leer: ProtokollDokument = { type: 'doc', content: [] };
  return anwesenheitsVerlauf(leer, { art, teilnahme: personen }).start;
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
      da: p.wert === 'anwesend' || p.wert === 'verspaetet',
    };
  });
}

/** Current Berlin time `HH:MM`: the default of a new Erscheint / Geht block. */
export function anwesenheitUhrzeit(jetzt: Date = new Date()): string {
  return zeitBerlin(jetzt.toISOString());
}

/** Whether somebody with this attendance counts as absent at the opening (so an arrival makes them late). */
export const fehltZuBeginn = (wert: ProtokollTeilnahmeWert): boolean =>
  wert === 'entschuldigt' || wert === 'unentschuldigt';

/**
 * The Kopf after somebody arrived (Erscheint block with this person): a person who is absent at the
 * opening gets the override `verspaetet`. Returns `null` when nothing changes (unknown person, already
 * present or late, closed protocol).
 */
export function kopfNachErscheinen(
  dto: ProtokollDto,
  kopf: ProtokollKopf,
  sub: string,
): ProtokollKopf | null {
  if (dto.status !== 'entwurf') return null;
  const person = dto.teilnahme.find((t) => t.sub === sub);
  if (!person || !fehltZuBeginn(wertVon(person, kopf, true))) return null;
  return { ...kopf, teilnahme: { ...kopf.teilnahme, [sub]: 'verspaetet' } };
}
