import { datumAnzeigen, erinnerungHeute, heuteBerlin, stundeBerlin, tagNachher } from '@c4/shared';
import type { Benachrichtigungen } from './benachrichtigungen';
import { gueltigAbgestimmt, kreisDerUmfrage, type UmfrageKontext } from './umfrageAnsicht';
import type { UmfrageDaten, UmfragenStore } from './umfragen';

// Poll messages: a new poll, reminders in the morning for everyone who has not voted yet and the
// request to vote again after an edit. See docs/umfragen.md and docs/benachrichtigungen.md.

/** Berlin local hour from which reminders go out. */
const AB_UHR = 9;

type Sender = Pick<Benachrichtigungen, 'senden'>;

const url = (u: { id: string }) => `/app/umfragen/${u.id}`;

function wannText(endetAm: string, heute: string): string {
  if (endetAm === heute) return 'heute';
  if (endetAm === tagNachher(heute, 1)) return 'morgen';
  return `am ${datumAnzeigen(endetAm)}`;
}

export const neuText = (name: string, titel: string, endetAm: string, pflicht: boolean) =>
  `${name} fragt: „${titel}“. ${
    pflicht ? 'Bitte stimme' : 'Du kannst'
  } bis ${datumAnzeigen(endetAm)} ab${pflicht ? '' : 'stimmen'}.`;

export const erinnerungText = (titel: string, endetAm: string, heute: string, pflicht: boolean) =>
  `„${titel}“ endet ${wannText(endetAm, heute)}. ${
    pflicht ? 'Bitte stimme noch ab.' : 'Du kannst noch abstimmen.'
  }`;

/**
 * Tells the members of the circles about a new poll (or those newly added by an edit, `nur`). The
 * acting member gets nothing.
 */
export async function meldeNeueUmfrage(
  sender: Sender,
  u: UmfrageDaten,
  k: UmfrageKontext,
  akteur: { sub: string; name: string },
  nur?: ReadonlySet<string>,
): Promise<void> {
  const kreis = kreisDerUmfrage(u, k);
  const gruppen = { pflicht: [] as string[], optional: [] as string[] };
  for (const [sub, rolle] of kreis) {
    if (sub !== akteur.sub && (!nur || nur.has(sub))) gruppen[rolle].push(sub);
  }
  await Promise.all(
    (['pflicht', 'optional'] as const).map((rolle) =>
      sender.senden({
        subs: gruppen[rolle],
        art: 'umfrage.neu',
        titel: 'Neue Umfrage',
        text: neuText(akteur.name, u.titel, u.endetAm, rolle === 'pflicht'),
        url: url(u),
      }),
    ),
  );
}

/** Asks members whose vote an edit invalidated to vote again (cannot be switched off). */
export async function meldeErneutAbstimmen(
  sender: Sender,
  u: { id: string; titel: string },
  subs: readonly string[],
): Promise<void> {
  await sender.senden({
    subs,
    art: 'umfrage.erneut_abstimmen',
    titel: 'Bitte stimme erneut ab',
    text: `„${u.titel}“ wurde geändert, deine Stimme zählt so nicht mehr.`,
    url: url(u),
  });
}

/**
 * The dates of a running Privatparty poll changed: members whose vote became invalid are asked to
 * vote again, everybody else involved (`uebrige`) is told that the dates changed. Both use the
 * `umfrage.erneut_abstimmen` type; `aenderung` identifies the change for the dedupe key.
 */
export async function meldeTermineGeaendert(
  sender: Sender,
  u: { id: string; titel: string },
  aenderung: string,
  erneut: readonly string[],
  uebrige: readonly string[],
): Promise<void> {
  const art = 'umfrage.erneut_abstimmen';
  const schluessel = (art2: string) => `${art}:${art2}:${u.id}:${aenderung}`;
  await Promise.all([
    sender.senden({
      subs: erneut,
      art,
      titel: 'Bitte stimme erneut ab',
      text: `Die Termine von „${u.titel}“ haben sich geändert. Bitte stimme erneut ab.`,
      url: url(u),
      dedupeSchluessel: schluessel('erneut'),
    }),
    sender.senden({
      subs: uebrige.filter((s) => !erneut.includes(s)),
      art,
      titel: u.titel,
      text: 'Die Termine haben sich geändert.',
      url: url(u),
      dedupeSchluessel: schluessel('geaendert'),
    }),
  ]);
}

/**
 * Tells the circles of a scheduling poll which date became the event; those who agreed to it are
 * entered in the event.
 */
export async function meldeTermin(
  sender: Sender,
  t: { titel: string; eventId: string; text: string },
  subs: readonly string[],
  eingetragen: ReadonlySet<string>,
): Promise<void> {
  const nachricht = (dabei: boolean) => ({
    art: 'umfrage.termin',
    titel: 'Termin steht fest',
    text: `„${t.titel}“: ${t.text}.${dabei ? ' Du bist eingetragen.' : ''}`,
    url: `/app/kalender/events/${t.eventId}`,
  });
  await Promise.all([
    sender.senden({ subs: subs.filter((s) => eingetragen.has(s)), ...nachricht(true) }),
    sender.senden({ subs: subs.filter((s) => !eingetragen.has(s)), ...nachricht(false) }),
  ]);
}

/** Registers the reminder task with the generic job runner. */
export function registriereUmfrageAufgaben(
  benachrichtigungen: Benachrichtigungen,
  store: Pick<UmfragenStore, 'laufende'>,
  kontext: (jetzt: Date) => Promise<UmfrageKontext>,
): void {
  benachrichtigungen.registriereAufgabe('umfrage.erinnerungen', (jetzt) =>
    umfrageErinnerungen(benachrichtigungen, store, kontext, jetzt),
  );
}

/**
 * From 09:00 Berlin time: on the days chosen for each circle, reminds every member without a valid
 * vote. The mandatory circle gets them regardless of the member's setting.
 */
export async function umfrageErinnerungen(
  sender: Sender,
  store: Pick<UmfragenStore, 'laufende'>,
  kontext: (jetzt: Date) => Promise<UmfrageKontext>,
  jetzt: Date,
): Promise<void> {
  if (stundeBerlin(jetzt) < AB_UHR) return;
  const heute = heuteBerlin(jetzt);
  const faellig = await store.laufende(heute);
  if (faellig.length === 0) return;
  const k = await kontext(jetzt);

  for (const u of faellig) {
    const erstellt = heuteBerlin(u.erstelltAm);
    const tage = {
      pflicht: erinnerungHeute(u.endetAm, u.erinnerungenPflicht, erstellt, heute),
      optional: erinnerungHeute(u.endetAm, u.erinnerungenOptional, erstellt, heute),
    };
    if (tage.pflicht === null && tage.optional === null) continue;
    const abgestimmt = gueltigAbgestimmt(u);
    for (const [sub, rolle] of kreisDerUmfrage(u, k)) {
      const n = tage[rolle];
      if (n === null || abgestimmt.has(sub)) continue;
      try {
        await sender.senden({
          subs: [sub],
          art: 'umfrage.erinnerung',
          titel: 'Erinnerung: Umfrage',
          text: erinnerungText(u.titel, u.endetAm, heute, rolle === 'pflicht'),
          url: url(u),
          // The end date is part of the key, so a postponed poll reminds again.
          dedupeSchluessel: `umfrage.erinnerung:${u.id}:${u.endetAm}:${n}:${sub}`,
          ohneEinstellung: rolle === 'pflicht',
        });
      } catch (err) {
        console.error('Poll reminder failed', err);
      }
    }
  }
}
