import {
  benachrichtigungsArt,
  geburtstageZwischen,
  heuteBerlin,
  stundeBerlin,
  tagNachher,
} from '@c4/shared';
import type { Konto } from './admin';
import type { Benachrichtigungen } from './benachrichtigungen';
import { geburtstagSichtbar, type MitgliederStore } from './mitglieder';

// Birthday reminders: "<name> wird morgen 30 Jahre alt." See docs/benachrichtigungen.md.

const ART = 'geburtstag.erinnerung';
/** Berlin local hour from which reminders go out. */
const AB_UHR = 9;
const TAG_MINUTEN = 1440;

function wannText(tage: number): string {
  if (tage === 0) return 'heute';
  if (tage === 1) return 'morgen';
  return `in ${tage} Tagen`;
}

export const geburtstagText = (name: string, tage: number, alter: number): string =>
  `${name} wird ${wannText(tage)} ${alter} ${alter === 1 ? 'Jahr' : 'Jahre'} alt.`;

/** Registers the birthday reminder task with the generic job runner. */
export function registriereGeburtstagAufgaben(
  benachrichtigungen: Benachrichtigungen,
  mitglieder: Pick<MitgliederStore, 'alle'>,
  userAdmin: { konten(): Promise<Map<string, Pick<Konto, 'username'>>> },
): void {
  benachrichtigungen.registriereAufgabe('geburtstag.erinnerungen', (jetzt) =>
    geburtstagErinnerungen(benachrichtigungen, mitglieder, userAdmin, jetzt),
  );
}

/**
 * From 09:00 Berlin time: tells every member whose setting is active about the birthdays that are
 * their chosen number of days away (0 = today). Never about their own birthday, and never about
 * members who hide their birthday in the calendar.
 */
export async function geburtstagErinnerungen(
  benachrichtigungen: Benachrichtigungen,
  mitglieder: Pick<MitgliederStore, 'alle'>,
  userAdmin: { konten(): Promise<Map<string, Pick<Konto, 'username'>>> },
  jetzt: Date,
): Promise<void> {
  if (stundeBerlin(jetzt) < AB_UHR) return;
  const optionen = benachrichtigungsArt(ART)?.minuten?.optionen ?? [];
  const maxTage = Math.floor(Math.max(0, ...optionen) / TAG_MINUTEN);
  const heute = heuteBerlin(jetzt);

  const rows = await mitglieder.alle();
  const sichtbar = rows.flatMap((r) =>
    r.geburtsdatum !== null && geburtstagSichtbar(r)
      ? [{ ...r, geburtsdatum: r.geburtsdatum }]
      : [],
  );
  const kandidaten = geburtstageZwischen(sichtbar, heute, tagNachher(heute, maxTage));
  if (kandidaten.length === 0) return;

  const einstellungen = await benachrichtigungen.empfaengerEinstellungen(ART);
  const konten = await userAdmin.konten();

  for (const e of einstellungen) {
    if (!e.aktiv || e.minuten === null) continue;
    const tage = Math.floor(e.minuten / TAG_MINUTEN);
    const datum = tagNachher(heute, tage);
    for (const k of kandidaten) {
      if (k.datum !== datum || k.person.sub === e.sub) continue;
      const name =
        konten.get(k.person.sub)?.username ||
        `${k.person.vorname} ${k.person.nachname}`.trim() ||
        'Jemand';
      try {
        await benachrichtigungen.senden({
          subs: [e.sub],
          art: ART,
          titel: 'Geburtstag',
          text: geburtstagText(name, tage, k.alter),
          url: `/app/kalender?monat=${datum.slice(0, 7)}`,
          dedupeSchluessel: `${ART}:${k.person.sub}:${datum}:${e.sub}`,
        });
      } catch (err) {
        console.error('Birthday reminder failed', err);
      }
    }
  }
}
