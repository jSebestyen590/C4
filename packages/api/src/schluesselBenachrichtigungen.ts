import {
  erwarteteHalter,
  heuteBerlin,
  stundeBerlin,
  zeitBerlin,
  zeitfensterAnzeigen,
  type AnfrageArt,
  type Halter,
} from '@c4/shared';
import type { UserAdmin } from './admin';
import type { Benachrichtigungen } from './benachrichtigungen';
import type { MitgliederStore } from './mitglieder';
import type { SchluesselStore } from './schluessel';
import type {
  AnfrageMitAntworten,
  PlanungDaten,
  SchluesselAnfragenStore,
  Zeitfenster,
} from './schluesselAnfragen';

// Key side of the notification module: Übergaben, requests (Bedarf / Abgabe), answers and planned
// handovers. None of the types can be switched off (see BENACHRICHTIGUNGS_ARTEN).

const UEBERGABE = 'schluessel.uebergabe';

type Sender = Pick<Benachrichtigungen, 'senden'>;

export interface UebergabeMeldung {
  schluessel: { id: string; name: string };
  von: Halter;
  an: Halter;
  /** Sub of the member who recorded the Übergabe; they get no message. */
  akteur: string;
  /** Display name (username, else full name) of a member. */
  name: (sub: string) => string;
}

const istMitglied = (h: Halter, sub: string) => h?.art === 'mitglied' && h.sub === sub;

/** Message texts per recipient; members without the app and the acting member get none. */
export function uebergabeTexte(m: UebergabeMeldung): { sub: string; text: string }[] {
  const { von, an, akteur, name } = m;
  const halterName = (h: NonNullable<Halter>) => (h.art === 'mitglied' ? name(h.sub) : h.name);
  const texte: { sub: string; text: string }[] = [];
  if (an?.art === 'mitglied' && an.sub !== akteur) {
    texte.push({
      sub: an.sub,
      text: istMitglied(von, akteur)
        ? `${name(akteur)} hat dir den Schlüssel übergeben.`
        : von
          ? `${name(akteur)} hat eingetragen, dass du den Schlüssel von ${halterName(von)} bekommen hast.`
          : `${name(akteur)} hat dir den Schlüssel zugewiesen.`,
    });
  }
  if (von?.art === 'mitglied' && von.sub !== akteur) {
    texte.push({
      sub: von.sub,
      text: istMitglied(an, akteur)
        ? `${name(akteur)} hat den Schlüssel von dir bekommen.`
        : an
          ? `${name(akteur)} hat eingetragen, dass du den Schlüssel an ${halterName(an)} weitergegeben hast.`
          : `${name(akteur)} hat eingetragen, dass du den Schlüssel abgegeben hast.`,
    });
  }
  return texte;
}

export async function meldeUebergabe(sender: Sender, m: UebergabeMeldung): Promise<void> {
  await Promise.all(
    uebergabeTexte(m).map(({ sub, text }) =>
      sender.senden({
        subs: [sub],
        art: UEBERGABE,
        titel: `Schlüssel „${m.schluessel.name}“`,
        text,
        url: `/app/schluessel/${m.schluessel.id}`,
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Requests, answers and plans

const BEDARF = 'schluessel.bedarf';
const ABGABE = 'schluessel.abgabe';
const ANTWORT = 'schluessel.antwort';
const PLANUNG = 'schluessel.planung';

/** Repeats go out at most once per hour, never during these quiet hours (Berlin). */
export const ERINNERUNG_INTERVALL_MS = 60 * 60 * 1000;
export const RUHE_AB_UHR = 22;
export const RUHE_BIS_UHR = 8;

/** Everything needed to tell who may answer a request. */
export interface AnfrageKontext {
  /** Non-archived keys with their current member holder (null = person without app or nobody). */
  schluessel: { id: string; halterSub: string | null }[];
  planungen: Pick<PlanungDaten, 'schluesselId' | 'anSub' | 'datum' | 'ab'>[];
  /** Active members who live in the Wohnheim. */
  wohnheimSubs: string[];
}

type AnfrageZiel = Pick<Zeitfenster, 'datum' | 'ab'> & {
  art: AnfrageArt;
  erstellerSub: string;
  schluesselId: string | null;
};

/**
 * Per key of a Bedarf (the named one, or all for "irgendeiner"): who is expected to hold it at the
 * request's time (see `erwarteteHalter`). The creator is not part of it.
 */
export function erwarteteHalterJeSchluessel(
  anfrage: AnfrageZiel,
  kontext: AnfrageKontext,
): Map<string, string[]> {
  const ergebnis = new Map<string, string[]>();
  for (const k of kontext.schluessel) {
    if (anfrage.schluesselId && k.id !== anfrage.schluesselId) continue;
    const subs = erwarteteHalter(
      k,
      kontext.planungen.filter((p) => p.schluesselId === k.id),
      anfrage,
    ).filter((s) => s !== anfrage.erstellerSub);
    ergebnis.set(k.id, subs);
  }
  return ergebnis;
}

/**
 * Who is asked: for a Bedarf the members expected to hold the named key (or any key) at the
 * request's time, for an Abgabe the Wohnheim members. The creator is never asked.
 */
export function antwortBerechtigte(anfrage: AnfrageZiel, kontext: AnfrageKontext): string[] {
  const subs = new Set<string>();
  if (anfrage.art === 'abgabe') {
    kontext.wohnheimSubs.forEach((s) => subs.add(s));
  } else {
    for (const liste of erwarteteHalterJeSchluessel(anfrage, kontext).values()) {
      liste.forEach((s) => subs.add(s));
    }
  }
  subs.delete(anfrage.erstellerSub);
  return [...subs];
}

export async function ladeAnfrageKontext(deps: {
  schluessel: Pick<SchluesselStore, 'alle'>;
  anfragen: Pick<SchluesselAnfragenStore, 'planungen'>;
  mitglieder: Pick<MitgliederStore, 'alle'>;
}): Promise<AnfrageKontext> {
  const [keys, planungen, mitglieder] = await Promise.all([
    deps.schluessel.alle(false),
    deps.anfragen.planungen(),
    deps.mitglieder.alle(),
  ]);
  return {
    schluessel: keys.map((k) => ({
      id: k.id,
      halterSub: k.halter?.art === 'mitglied' ? k.halter.sub : null,
    })),
    planungen,
    wohnheimSubs: mitglieder
      .filter((m) => m.wohnheim === true && m.deaktiviertAm === null)
      .map((m) => m.sub),
  };
}

/** Display name (username, else full name) of a member, for message texts. */
export async function ladeNamen(deps: {
  mitglieder: Pick<MitgliederStore, 'alle'>;
  userAdmin: Pick<UserAdmin, 'konten'>;
}): Promise<(sub: string) => string> {
  const [rows, konten] = await Promise.all([deps.mitglieder.alle(), deps.userAdmin.konten()]);
  const zeilen = new Map(rows.map((r) => [r.sub, r]));
  return (sub) => {
    const z = zeilen.get(sub);
    return (
      konten.get(sub)?.username ?? (`${z?.vorname ?? ''} ${z?.nachname ?? ''}`.trim() || 'Jemand')
    );
  };
}

const anfrageUrl = (id: string) => `/app/schluessel/anfragen/${id}`;

/** Push text and title of a request for the people who are asked. */
export function anfrageText(
  a: { art: AnfrageArt } & Pick<Zeitfenster, 'datum' | 'ab' | 'bis'>,
  ersteller: string,
  schluesselName: string | null,
  heute: string = heuteBerlin(),
): { titel: string; text: string } {
  const wann = zeitfensterAnzeigen(a, heute);
  return a.art === 'bedarf'
    ? {
        titel: 'Schlüssel gesucht',
        text: `${ersteller} braucht ${schluesselName ? `den Schlüssel „${schluesselName}“` : 'einen Schlüssel'} ${wann}.`,
      }
    : {
        titel: 'Schlüssel wird abgegeben',
        text: `${ersteller} möchte den Schlüssel „${schluesselName ?? ''}“ ${wann} abgeben. Kannst du ihn nehmen?`,
      };
}

/** Tells everybody who may answer a new request (also used for the hourly repeat). */
export async function meldeAnfrage(
  sender: Sender,
  m: {
    anfrage: { id: string; art: AnfrageArt } & Pick<Zeitfenster, 'datum' | 'ab' | 'bis'>;
    empfaenger: readonly string[];
    ersteller: string;
    schluesselName: string | null;
  },
): Promise<void> {
  if (m.empfaenger.length === 0) return;
  const { titel, text } = anfrageText(m.anfrage, m.ersteller, m.schluesselName);
  await sender.senden({
    subs: m.empfaenger,
    art: m.anfrage.art === 'bedarf' ? BEDARF : ABGABE,
    titel,
    text,
    url: anfrageUrl(m.anfrage.id),
  });
}

/**
 * An answer: the creator hears about every one; on a Zusage the others who answered are told that
 * the request is settled.
 */
export async function meldeAntwort(
  sender: Sender,
  m: {
    anfrageId: string;
    art: 'zusage' | 'ablehnung' | 'gegenvorschlag';
    erstellerSub: string;
    ersteller: string;
    antwortender: { sub: string; name: string };
    /** Time window of a Gegenvorschlag. */
    vorschlag?: Pick<Zeitfenster, 'datum' | 'ab' | 'bis'>;
    /** Subs of everybody else who answered before. */
    andereAntworter: readonly string[];
  },
): Promise<void> {
  const wer = m.antwortender.name;
  const text =
    m.art === 'zusage'
      ? `${wer} hat zugesagt.`
      : m.art === 'ablehnung'
        ? `${wer} kann leider nicht.`
        : `${wer} schlägt ${m.vorschlag ? zeitfensterAnzeigen(m.vorschlag) : 'einen anderen Zeitpunkt'} vor.`;
  const url = anfrageUrl(m.anfrageId);
  await sender.senden({
    subs: [m.erstellerSub],
    art: ANTWORT,
    titel: 'Schlüssel-Anfrage',
    text,
    url,
  });
  if (m.art === 'zusage') {
    const andere = m.andereAntworter.filter((s) => s !== m.antwortender.sub);
    if (andere.length > 0) {
      await sender.senden({
        subs: andere,
        art: ANTWORT,
        titel: 'Schlüssel-Anfrage',
        text: `Die Anfrage von ${m.ersteller} hat sich erledigt.`,
        url,
      });
    }
  }
}

/** The creator accepted a Gegenvorschlag: tell its author, and the others that it is settled. */
export async function meldeGegenvorschlagAngenommen(
  sender: Sender,
  m: {
    anfrageId: string;
    ersteller: string;
    vorschlagSub: string;
    andereAntworter: readonly string[];
  },
): Promise<void> {
  const url = anfrageUrl(m.anfrageId);
  await sender.senden({
    subs: [m.vorschlagSub],
    art: ANTWORT,
    titel: 'Schlüssel-Anfrage',
    text: `${m.ersteller} hat deinen Vorschlag angenommen.`,
    url,
  });
  const andere = m.andereAntworter.filter((s) => s !== m.vorschlagSub);
  if (andere.length > 0) {
    await sender.senden({
      subs: andere,
      art: ANTWORT,
      titel: 'Schlüssel-Anfrage',
      text: `Die Anfrage von ${m.ersteller} hat sich erledigt.`,
      url,
    });
  }
}

/**
 * A plan was created, changed or deleted: tells the current holder, the previous holder in the
 * chain and the recipient (not the acting member). `plaene` is the chain including the plan, in
 * time order.
 */
export async function meldePlanung(
  sender: Sender,
  m: {
    schluessel: { id: string; name: string };
    halter: Halter;
    plaene: Pick<PlanungDaten, 'id' | 'anSub'>[];
    planungId: string;
    aktion: 'angelegt' | 'geaendert' | 'geloescht';
    zeitfenster: Pick<Zeitfenster, 'datum' | 'ab' | 'bis'>;
    akteur: string;
    name: (sub: string) => string;
  },
): Promise<void> {
  const i = m.plaene.findIndex((p) => p.id === m.planungId);
  const plan = m.plaene[i];
  if (!plan) return;
  const halterSub = m.halter?.art === 'mitglied' ? m.halter.sub : null;
  const vorher = i > 0 ? m.plaene[i - 1]!.anSub : halterSub;
  const subs = [...new Set([plan.anSub, vorher, halterSub])].filter(
    (s): s is string => !!s && s !== m.akteur,
  );
  const wann = zeitfensterAnzeigen(m.zeitfenster);
  const verb =
    m.aktion === 'angelegt' ? 'geplant' : m.aktion === 'geaendert' ? 'geändert' : 'abgesagt';
  await sender.senden({
    subs,
    art: PLANUNG,
    titel: `Schlüssel „${m.schluessel.name}“`,
    text:
      m.aktion === 'geloescht'
        ? `${m.name(m.akteur)} hat die Übergabe an ${m.name(plan.anSub)} (${wann}) abgesagt.`
        : `${m.name(m.akteur)} hat ${verb}: Der Schlüssel geht ${wann} an ${m.name(plan.anSub)}.`,
    url: `/app/schluessel/${m.schluessel.id}`,
  });
}

/** Whether the request's time window is over (a day in the past, or today's `bis` has passed). */
export function anfrageVorbei(a: Pick<Zeitfenster, 'datum' | 'bis'>, jetzt: Date): boolean {
  const heute = heuteBerlin(jetzt);
  if (a.datum < heute) return true;
  return a.datum === heute && !!a.bis && a.bis < zeitBerlin(jetzt.toISOString());
}

export interface ErinnerungsDeps {
  sender: Sender;
  schluessel: Pick<SchluesselStore, 'alle'>;
  anfragen: Pick<SchluesselAnfragenStore, 'anfragen' | 'planungen' | 'erinnertSetzen'>;
  mitglieder: Pick<MitgliederStore, 'alle'>;
  userAdmin: Pick<UserAdmin, 'konten'>;
}

/**
 * Hourly repeat of the Bedarf / Abgabe push to everybody who has not answered yet, while the
 * request is open, its time window has not passed and not everybody declined. Not between 22:00
 * and 08:00 Berlin time.
 */
export async function schluesselErinnerungen(deps: ErinnerungsDeps, jetzt: Date): Promise<void> {
  const stunde = stundeBerlin(jetzt);
  if (stunde >= RUHE_AB_UHR || stunde < RUHE_BIS_UHR) return;
  const faellig = (await deps.anfragen.anfragen()).filter(
    (a: AnfrageMitAntworten) =>
      a.status === 'offen' &&
      !anfrageVorbei(a, jetzt) &&
      jetzt.getTime() - a.erinnert.getTime() >= ERINNERUNG_INTERVALL_MS,
  );
  if (faellig.length === 0) return;
  const [kontext, name, keys] = await Promise.all([
    ladeAnfrageKontext(deps),
    ladeNamen(deps),
    deps.schluessel.alle(false),
  ]);
  for (const a of faellig) {
    try {
      const berechtigte = antwortBerechtigte(a, kontext);
      const geantwortet = new Set(a.antworten.map((x) => x.sub));
      const alleAbgelehnt =
        berechtigte.length > 0 &&
        berechtigte.every((s) => a.antworten.some((x) => x.sub === s && x.art === 'ablehnung'));
      const offen = berechtigte.filter((s) => !geantwortet.has(s));
      if (alleAbgelehnt || offen.length === 0) continue;
      await meldeAnfrage(deps.sender, {
        anfrage: a,
        empfaenger: offen,
        ersteller: name(a.erstellerSub),
        schluesselName: keys.find((k) => k.id === a.schluesselId)?.name ?? null,
      });
      await deps.anfragen.erinnertSetzen([a.id], jetzt);
    } catch (err) {
      console.error('Key request reminder failed', err);
    }
  }
}

/** Registers the hourly repeat with the generic job runner. */
export function registriereSchluesselAufgaben(
  benachrichtigungen: Pick<Benachrichtigungen, 'registriereAufgabe' | 'senden'>,
  deps: Omit<ErinnerungsDeps, 'sender'>,
): void {
  benachrichtigungen.registriereAufgabe('schluessel.anfragen', (jetzt) =>
    schluesselErinnerungen({ ...deps, sender: benachrichtigungen }, jetzt),
  );
}
