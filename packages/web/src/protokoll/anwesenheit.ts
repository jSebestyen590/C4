import {
  anwesenheitsVerlauf,
  type ProtokollArt,
  type ProtokollDokument,
  type ProtokollDto,
  type ProtokollKopf,
  type ProtokollMitgliedDto,
  type ProtokollTeilnahmeWert,
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
