import { benachrichtigungsArt, heuteBerlin, type EventDto } from '@c4/shared';
import type { Benachrichtigungen } from './benachrichtigungen';
import type { BetroffenerDienst, DienstInfo, EventAenderung, KalenderStore } from './kalender';

// Calendar side of the notification module: job tasks (reminders, missing Dienste) and the
// messages for changes that are sent directly from the routes. The module itself is generic.

const ERINNERUNG = 'kalender.erinnerung';
const FEHLENDE_DIENSTE = 'kalender.fehlende_dienste';
const AENDERUNG = 'kalender.aenderung';

/** Events further ahead than this are not checked for missing Dienste. */
const FEHLT_VORLAUF_TAGE = 31;

type Sender = Pick<Benachrichtigungen, 'senden'>;

const eventUrl = (eventId: string) => `/app/kalender/events/${eventId}`;

// ----- Formatting (Berlin wall time)

function berlinTeile(iso: string) {
  const teile = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const wert = (typ: string) => teile.find((t) => t.type === typ)?.value ?? '';
  return {
    wochentag: wert('weekday').replace(/\.$/, ''),
    tag: wert('day'),
    monat: wert('month'),
    zeit: `${wert('hour')}:${wert('minute')}`,
  };
}

/** `Fr, 23.10.` */
function tagText(iso: string): string {
  const t = berlinTeile(iso);
  return `${t.wochentag}, ${t.tag}.${t.monat}.`;
}

/** `Fr 20:00` */
function wochentagZeit(iso: string): string {
  const t = berlinTeile(iso);
  return `${t.wochentag} ${t.zeit}`;
}

export function minutenText(minuten: number): string {
  if (minuten % 1440 === 0) return minuten === 1440 ? '1 Tag' : `${minuten / 1440} Tagen`;
  if (minuten % 60 === 0) return minuten === 60 ? '1 Stunde' : `${minuten / 60} Stunden`;
  return `${minuten} Minuten`;
}

// ----- Job tasks

/** Registers the calendar's tasks with the generic job runner. */
export function registriereKalenderAufgaben(
  benachrichtigungen: Benachrichtigungen,
  kalender: Pick<KalenderStore, 'events' | 'erinnerungsDienste'>,
): void {
  benachrichtigungen.registriereAufgabe('kalender.erinnerungen', (jetzt) =>
    erinnerungen(benachrichtigungen, kalender, jetzt),
  );
  benachrichtigungen.registriereAufgabe('kalender.fehlende_dienste', (jetzt) =>
    fehlendeDienste(benachrichtigungen, kalender, jetzt),
  );
}

/** Reminder `minuten` before the start of the member's Schicht (their own setting). */
export async function erinnerungen(
  benachrichtigungen: Benachrichtigungen,
  kalender: Pick<KalenderStore, 'erinnerungsDienste'>,
  jetzt: Date,
): Promise<void> {
  const art = benachrichtigungsArt(ERINNERUNG);
  const optionen = art?.minuten?.optionen ?? [];
  const fenster = Math.max(0, ...optionen) * 60_000;
  const kandidaten = await kalender.erinnerungsDienste(jetzt, new Date(jetzt.getTime() + fenster));
  if (kandidaten.length === 0) return;
  const einstellungen = new Map(
    (
      await benachrichtigungen.empfaengerEinstellungen(ERINNERUNG, [
        ...new Set(kandidaten.map((k) => k.mitgliedSub)),
      ])
    ).map((e) => [e.sub, e]),
  );
  for (const k of kandidaten) {
    const e = einstellungen.get(k.mitgliedSub);
    if (!e?.aktiv || e.minuten === null) continue;
    const beginn = new Date(k.beginn).getTime();
    if (beginn - e.minuten * 60_000 > jetzt.getTime() || beginn <= jetzt.getTime()) continue;
    try {
      await benachrichtigungen.senden({
        subs: [k.mitgliedSub],
        art: ERINNERUNG,
        titel: `${k.dienstformName}-Dienst in ${minutenText(e.minuten)}`,
        text: `${k.eventTitel} (${wochentagZeit(k.beginn)})`,
        url: eventUrl(k.eventId),
        dedupeSchluessel: `${ERINNERUNG}:${k.dienstId}:${k.beginn}`,
      });
    } catch (err) {
      console.error('Reminder failed', err);
    }
  }
}

/** Once per event: the hint time is reached and the event is still red. */
export async function fehlendeDienste(
  benachrichtigungen: Benachrichtigungen,
  kalender: Pick<KalenderStore, 'events'>,
  jetzt: Date,
): Promise<void> {
  const bis = heuteBerlin(new Date(jetzt.getTime() + FEHLT_VORLAUF_TAGE * 24 * 3600_000));
  const events = await kalender.events(heuteBerlin(jetzt), bis);
  for (const event of events) {
    if (event.abgesagt || event.fehltHinweisStunden === null) continue;
    const beginn = new Date(event.beginn).getTime();
    if (jetzt.getTime() >= beginn) continue;
    if (beginn - event.fehltHinweisStunden * 3600_000 > jetzt.getTime()) continue;
    if (event.bewertung !== 'rot') continue;
    try {
      await benachrichtigungen.senden({
        subs: 'alle',
        art: FEHLENDE_DIENSTE,
        titel: 'Es fehlen noch Dienste',
        text: `Für „${event.titel}“ am ${tagText(event.beginn)} fehlen noch Dienste.`,
        url: eventUrl(event.id),
        dedupeSchluessel: `${FEHLENDE_DIENSTE}:${event.id}`,
      });
    } catch (err) {
      console.error('Missing-Dienste notification failed', err);
    }
  }
}

// ----- Changes, sent directly from the routes

interface Zeile {
  titel: string;
  text: string;
}

/** Sends one notification per person; several changes for one person are combined. */
async function proPersonSenden(
  sender: Sender,
  eventId: string,
  eventTitel: string,
  proSub: Map<string, Zeile[]>,
  akteur: string,
): Promise<void> {
  await Promise.allSettled(
    [...proSub]
      .filter(([sub]) => sub !== akteur)
      .map(([sub, zeilen]) =>
        sender.senden({
          subs: [sub],
          art: AENDERUNG,
          titel: zeilen.length === 1 ? zeilen[0]!.titel : `${eventTitel}: Änderungen`,
          text: zeilen.map((z) => z.text).join('\n'),
          url: eventUrl(eventId),
        }),
      ),
  );
}

const hinzu = (m: Map<string, Zeile[]>, sub: string, zeile: Zeile) =>
  m.set(sub, [...(m.get(sub) ?? []), zeile]);

/**
 * After an event update: time changes, changed or removed Schichten. `event` is the state after
 * the update. The acting person is never notified.
 */
export async function meldeEventAenderung(
  sender: Sender,
  event: EventDto,
  aenderung: EventAenderung,
  akteur: string,
): Promise<void> {
  const proSub = new Map<string, Zeile[]>();
  if (aenderung.zeitGeaendert) {
    for (const sub of aenderung.mitgliedSubs) {
      hinzu(proSub, sub, {
        titel: 'Event verschoben',
        text: `„${event.titel}“ ist jetzt am ${tagText(event.beginn)} um ${berlinTeile(event.beginn).zeit} Uhr.`,
      });
    }
  }
  for (const s of aenderung.geaenderteSchichten) {
    const schicht = event.schichten.find((x) => x.id === s.schichtId);
    for (const sub of s.mitgliedSubs) {
      // The event-level message already tells about the new time.
      if (aenderung.zeitGeaendert) continue;
      hinzu(proSub, sub, {
        titel: 'Schicht geändert',
        text: schicht
          ? `Deine Schicht „${s.name}“ bei „${event.titel}“ ist jetzt ${wochentagZeit(schicht.beginn)}–${berlinTeile(schicht.ende).zeit} Uhr.`
          : `Deine Schicht „${s.name}“ bei „${event.titel}“ wurde geändert.`,
      });
    }
  }
  for (const d of aenderung.entfernteDienste as readonly BetroffenerDienst[]) {
    if (d.person.art !== 'mitglied') continue;
    hinzu(proSub, d.person.sub, {
      titel: 'Dienst entfernt',
      text: `Dein Dienst in „${d.schichtName}“ bei „${event.titel}“ entfällt.`,
    });
  }
  await proPersonSenden(sender, event.id, event.titel, proSub, akteur);
}

/** Cancellation or reinstatement of an event, for everybody with a Dienst except the actor. */
export async function meldeAbsage(
  sender: Sender,
  event: Pick<EventDto, 'id' | 'titel' | 'beginn'>,
  abgesagt: boolean,
  mitgliedSubs: readonly string[],
  akteur: string,
): Promise<void> {
  const zeile: Zeile = abgesagt
    ? {
        titel: 'Event abgesagt',
        text: `„${event.titel}“ am ${tagText(event.beginn)} wurde abgesagt. Dein Dienst entfällt.`,
      }
    : {
        titel: 'Event findet statt',
        text: `„${event.titel}“ am ${tagText(event.beginn)} findet doch statt. Dein Dienst gilt wieder.`,
      };
  await proPersonSenden(
    sender,
    event.id,
    event.titel,
    new Map(mitgliedSubs.map((sub) => [sub, [zeile]])),
    akteur,
  );
}

/** A member was removed from a Dienst by somebody else. */
export async function meldeDienstEntfernt(
  sender: Sender,
  dienst: DienstInfo,
  akteur: string,
): Promise<void> {
  if (!dienst.mitgliedSub || dienst.mitgliedSub === akteur) return;
  await sender.senden({
    subs: [dienst.mitgliedSub],
    art: AENDERUNG,
    titel: 'Dienst entfernt',
    text: `Du wurdest aus „${dienst.schichtName}“ bei „${dienst.eventTitel}“ (${tagText(dienst.schichtBeginn)}) ausgetragen.`,
    url: eventUrl(dienst.eventId),
  });
}
