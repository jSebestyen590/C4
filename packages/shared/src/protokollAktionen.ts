import { datumAnzeigen } from './datum';
import {
  ausVorlage,
  eventDauerFehler,
  eventSpanne,
  eventZeitenAus,
  schichtAlsEingabe,
  schichtenAusEvent,
  type EventArt,
  type EventDauer,
  type EventEingabe,
  type SchichtDto,
  type SchichtEingabe,
  type TeilnahmeKreis,
  type VorlageSchicht,
} from './kalender';
import {
  bausteinAnwaerterDatenSchema,
  bausteinAufnahmeDatenSchema,
  bausteinEmDatenSchema,
  bausteinEventDatenSchema,
  bausteinTodoDatenSchema,
  bausteinWahlDatenSchema,
  protokollNotizenText,
  todoZustaendigeAufloesen,
  wahlErgebnis,
  type BausteinEventDaten,
  type BausteinTodoDaten,
  type ProtokollAktionErgebnis,
  type ProtokollDokument,
  type ProtokollKnoten,
  type ProtokollMitgliedDto,
} from './protokolle';
import type { MitgliedStatus } from './status';
import type { TodoModus } from './todos';

// Actions that closing a protocol can run in the app (see docs/protokolle.md): create or change
// events, invite Anwärter:innen, change member status, occupy Posten. `protokollAktionen` only
// derives the list from the document and the current state of the app; the API runs the plans.

export const AKTION_ARTEN = [
  'event.anlegen',
  'event.aendern',
  'anwaerter.einladen',
  'aufnahme.status',
  'em.status',
  'wahl.posten',
  'todo.anlegen',
  'todo.aendern',
] as const;
export type AktionArt = (typeof AKTION_ARTEN)[number];

/** `grund` of an Aktion whose effect is there already. */
export const AKTION_BEREITS_ERLEDIGT = 'Bereits erledigt';

/** An event of the calendar as the Aktionen need it. */
export interface AktionEventKontext {
  id: string;
  /** What the calendar shows (the title, else the Kategorie's name). */
  titel: string;
  /** The title as entered (may be empty). */
  titelEingegeben: string;
  beschreibung: string | null;
  kategorieId: string | null;
  dauer: EventDauer;
  beginn: string;
  ende: string;
  abgesagt: boolean;
  verantwortlichSub: string | null;
  teilnahmeStatus: TeilnahmeKreis;
  /** Subs of the members invited individually. */
  eingeladen: string[];
  schichten: SchichtDto[];
}

export interface AktionKategorieKontext {
  art: EventArt;
  dauer: EventDauer;
  teilnahmeStatus: TeilnahmeKreis;
}

export interface AktionPersonKontext {
  status: MitgliedStatus;
  deaktiviert: boolean;
}

export interface AktionBesetzungKontext {
  id: string;
  mitgliedSub: string;
  start: string;
  ende: string | null;
}

export interface AktionPostenKontext {
  name: string;
  besetzungen: AktionBesetzungKontext[];
}

/** A Todo as the Aktionen need it (to tell whether `todo.aendern` changes anything). */
export interface AktionTodoKontext {
  titel: string;
  notizen: string | null;
  faelligAm: string;
  modus: TodoModus;
  /** Subs of the people it is for. */
  subs: string[];
}

export interface ProtokollAktionenKontext {
  /** Id of the protocol (stored with a created Todo as its source). */
  protokollId?: string;
  /** Berlin date (`YYYY-MM-DD`) of the Sitzung. */
  sitzungDatum: string;
  /** Today (`YYYY-MM-DD`): status changes and Besetzungen of a Sitzung in the future start today. */
  heute: string;
  /** The events the Event blocks point to, by id (missing = deleted). */
  events: Readonly<Record<string, AktionEventKontext>>;
  kategorien: Readonly<Record<string, AktionKategorieKontext>>;
  /** Kategorie of the Vorlagen by id: the fallback for Event blocks without `kategorieId` (old data). */
  vorlageKategorien?: Readonly<Record<string, string>>;
  /** Status of the people the blocks mention, by sub. */
  personen: Readonly<Record<string, AktionPersonKontext>>;
  /** The Posten the Wahl blocks pick, by id. */
  posten: Readonly<Record<string, AktionPostenKontext>>;
  /** The Todos the Todo blocks point to, by id (missing = deleted). Without it every Todo block with an id changes its Todo. */
  todos?: Readonly<Record<string, AktionTodoKontext>>;
  /**
   * Ids of the votes at which the Sitzung was not beschlussfähig (`nichtBeschlussfaehigeAbstimmungen`):
   * their Aktionen still run, but provisionally (`vorlaeufig`), the next Sitzung repeats the vote.
   */
  nichtBeschlussfaehig?: readonly string[];
}

/** What a Todo Aktion writes: the notes as plain text, the people resolved (groups by current status). */
export interface TodoPlan {
  titel: string;
  notizen: string | null;
  faelligAm: string;
  modus: TodoModus;
  subs: string[];
  /** Source (the protocol and the Baustein); null when the context has no protocol id. */
  protokollId: string | null;
  bausteinId: string;
}

/** What the API has to do for an Aktion. */
export type AktionPlan =
  | { art: 'event.anlegen'; eingabe: EventEingabe }
  | { art: 'event.aendern'; eventId: string; eingabe: EventEingabe }
  | { art: 'anwaerter.einladen'; email: string; vorname: string; nachname: string; ab: string }
  | { art: 'aufnahme.status' | 'em.status'; sub: string; status: MitgliedStatus; ab: string }
  | { art: 'wahl.posten'; postenId: string; start: string; subs: string[]; ablosung: string[] }
  | { art: 'todo.anlegen'; todo: TodoPlan }
  | { art: 'todo.aendern'; todoId: string; todo: TodoPlan };

export interface ProtokollAktion {
  /** `bausteinId:art` */
  id: string;
  bausteinId: string;
  art: AktionArt;
  /** German description without the name of members (they are in `subs`, shown with their status). */
  text: string;
  ausfuehrbar: boolean;
  /** Why it cannot run (also `AKTION_BEREITS_ERLEDIGT`). */
  grund?: string;
  /** The effect is there already. */
  erledigt: boolean;
  /** The calendar event concerned (`event.aendern`), else null. */
  eventId: string | null;
  /** The members concerned (`aufnahme.status`, `em.status`, `wahl.posten`: the elected). */
  subs: string[];
  /** The vote was not beschlussfähig: the Aktion runs provisionally, the vote is repeated next time. Only set when true. */
  vorlaeufig?: boolean;
  /** Null when the Aktion cannot run. */
  plan: AktionPlan | null;
}

const STATUS_TEXT: Record<MitgliedStatus, string> = {
  anwaerter: 'Anwärter:in',
  mitglied: 'Mitglied',
  em: 'EM',
  extern: 'Extern',
};

const istObjekt = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const tage = (von: string, bis: string): number =>
  Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / 86_400_000);

const schichtSchluessel = (s: VorlageSchicht): string =>
  JSON.stringify(
    s.art === 'betrieb'
      ? {
          ...s,
          bedarfe: [...s.bedarfe].sort((a, b) => a.dienstformId.localeCompare(b.dienstformId)),
        }
      : s,
  );

/** Whether two Schicht lists (Vorlage format) are the same, ignoring the order. */
export function schichtenGleich(
  a: readonly VorlageSchicht[],
  b: readonly VorlageSchicht[],
): boolean {
  if (a.length !== b.length) return false;
  const x = a.map(schichtSchluessel).sort();
  const y = b.map(schichtSchluessel).sort();
  return x.every((v, i) => v === y[i]);
}

/** Gives the new Schichten the ids of the existing ones of the same art, in order of their begin. */
function schichtIdsUebernehmen(
  neu: readonly SchichtEingabe[],
  alt: readonly SchichtDto[],
): SchichtEingabe[] {
  const frei = [...alt].sort((a, b) => Date.parse(a.beginn) - Date.parse(b.beginn));
  return [...neu]
    .sort((a, b) => Date.parse(a.beginn) - Date.parse(b.beginn))
    .map((s) => {
      const i = frei.findIndex((f) => f.art === s.art);
      if (i < 0) return s;
      const [treffer] = frei.splice(i, 1);
      return { ...s, id: treffer!.id };
    });
}

type Eintrag = Omit<ProtokollAktion, 'id' | 'bausteinId' | 'art' | 'erledigt'> &
  Partial<Pick<ProtokollAktion, 'erledigt'>>;

const nichtAusfuehrbar = (text: string, grund: string, rest: Partial<Eintrag> = {}): Eintrag => ({
  text,
  ausfuehrbar: false,
  grund,
  eventId: null,
  subs: [],
  plan: null,
  ...rest,
});

const bereitsErledigt = (text: string, rest: Partial<Eintrag> = {}): Eintrag => ({
  text,
  ausfuehrbar: false,
  grund: AKTION_BEREITS_ERLEDIGT,
  erledigt: true,
  eventId: null,
  subs: [],
  plan: null,
  ...rest,
});

/** Kategorie of an Event block: its own, else the one of its Vorlage (old data has none). */
function eventKategorieId(daten: BausteinEventDaten, k: ProtokollAktionenKontext): string | null {
  return (
    daten.kategorieId ?? (daten.vorlageId ? (k.vorlageKategorien?.[daten.vorlageId] ?? null) : null)
  );
}

function eventAnlegen(daten: BausteinEventDaten, k: ProtokollAktionenKontext): Eintrag {
  const name = daten.name.trim();
  const text = `Event${name ? ` „${name}“` : ''}${daten.datum ? ` am ${datumAnzeigen(daten.datum)}` : ''} im Kalender anlegen`;
  if (!daten.datum) return nichtAusfuehrbar(text, 'Das Datum fehlt.');
  const kategorieId = eventKategorieId(daten, k);
  if (!kategorieId) return nichtAusfuehrbar(text, 'Die Kategorie fehlt.');
  const kategorie = k.kategorien[kategorieId];
  if (!kategorie) return nichtAusfuehrbar(text, 'Die Kategorie gibt es nicht mehr.');
  if (kategorie.dauer !== 'ganztaegig' && (!daten.beginnZeit || !daten.endeZeit)) {
    return nichtAusfuehrbar(text, 'Die Uhrzeit fehlt.');
  }
  const bis = daten.bisDatum && daten.bisDatum >= daten.datum ? daten.bisDatum : daten.datum;
  const eingabe: EventEingabe = {
    ...ausVorlage(
      {
        titel: name,
        beschreibung: null,
        kategorieId,
        beginnZeit: daten.beginnZeit ?? '00:00',
        endeZeit: daten.endeZeit ?? '00:00',
        schichten: daten.schichten,
        teilnahmeStatus: null,
        tage: Math.max(1, tage(daten.datum, bis) + 1),
      },
      daten.datum,
      kategorie,
    ),
    verantwortlichSub: daten.verantwortlichSub,
  };
  const fehler = eventDauerFehler(kategorie.dauer, eingabe.beginn, eingabe.ende);
  if (fehler) return nichtAusfuehrbar(text, fehler);
  return {
    text,
    ausfuehrbar: true,
    eventId: null,
    subs: [],
    plan: { art: 'event.anlegen', eingabe },
  };
}

function eventAendern(daten: BausteinEventDaten, k: ProtokollAktionenKontext): Eintrag | null {
  const ev = daten.eventId ? k.events[daten.eventId] : undefined;
  // A deleted or cancelled event has nothing to change.
  if (!ev || ev.abgesagt) return null;
  const kategorieId = daten.kategorieId ?? ev.kategorieId;
  const kategorie = kategorieId ? k.kategorien[kategorieId] : undefined;
  const dauer = kategorie?.dauer ?? ev.dauer;
  const teilnahme =
    (kategorie?.art ?? (ev.teilnahmeStatus ? 'teilnahme' : 'dienste')) === 'teilnahme';

  const alt = eventZeitenAus(ev.dauer, ev.beginn, ev.ende);
  const datum = daten.datum ?? alt.datum;
  const bis = daten.datum
    ? daten.bisDatum && daten.bisDatum >= datum
      ? daten.bisDatum
      : datum
    : alt.bis;
  const beginnZeit = daten.beginnZeit ?? alt.beginnZeit;
  const endeZeit = daten.endeZeit ?? alt.endeZeit;
  const spanne = eventSpanne(dauer, { datum, bis, beginnZeit, endeZeit });
  const zeitGleich =
    Date.parse(spanne.beginn) === Date.parse(ev.beginn) &&
    Date.parse(spanne.ende) === Date.parse(ev.ende);

  const name = daten.name.trim();
  const unterschiede: string[] = [];
  if (name !== '' && name !== ev.titel) unterschiede.push('Name');
  if (kategorieId !== ev.kategorieId) unterschiede.push('Kategorie');
  if (!zeitGleich) unterschiede.push('Datum und Uhrzeit');
  if (daten.verantwortlichSub !== ev.verantwortlichSub) unterschiede.push('Verantwortliche:r');
  const schichtenGleichHier =
    teilnahme || schichtenGleich(daten.schichten, schichtenAusEvent(ev.beginn, ev.schichten));
  if (!schichtenGleichHier) unterschiede.push('Schichten');

  const text = `Event „${ev.titel}“ im Kalender ändern (${unterschiede.join(', ')})`;
  if (unterschiede.length === 0) return null;

  const fehler = eventDauerFehler(dauer, spanne.beginn, spanne.ende);
  if (fehler) return nichtAusfuehrbar(text, fehler, { eventId: ev.id });

  const neu = ausVorlage(
    {
      titel: '',
      beschreibung: null,
      kategorieId: kategorieId ?? '',
      beginnZeit,
      endeZeit,
      schichten: teilnahme ? [] : daten.schichten,
      teilnahmeStatus: null,
      tage: Math.max(1, tage(datum, bis) + 1),
    },
    datum,
    kategorie,
  );
  const schichten: SchichtEingabe[] =
    zeitGleich && schichtenGleichHier
      ? ev.schichten.map(schichtAlsEingabe)
      : schichtIdsUebernehmen(neu.schichten, ev.schichten);
  const eingabe: EventEingabe = {
    titel: name !== '' && name !== ev.titel ? name : ev.titelEingegeben,
    beschreibung: ev.beschreibung,
    kategorieId: kategorieId ?? '',
    beginn: spanne.beginn,
    ende: spanne.ende,
    schichten,
    teilnahmeStatus: kategorieId === ev.kategorieId ? ev.teilnahmeStatus : neu.teilnahmeStatus,
    eingeladen: ev.eingeladen,
    verantwortlichSub: daten.verantwortlichSub,
  };
  return {
    text,
    ausfuehrbar: true,
    eventId: ev.id,
    subs: [],
    plan: { art: 'event.aendern', eventId: ev.id, eingabe },
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function statusAktion(
  art: 'aufnahme.status' | 'em.status',
  sub: string | null,
  ziel: MitgliedStatus | null,
  keinErgebnis: string,
  k: ProtokollAktionenKontext,
): Eintrag {
  const ab = k.sitzungDatum < k.heute ? k.sitzungDatum : k.heute;
  const text = ziel
    ? `Status auf „${STATUS_TEXT[ziel]}“ setzen (ab ${datumAnzeigen(ab)})`
    : 'Status ändern';
  if (!sub) return nichtAusfuehrbar(text, 'Die Person ist nicht in der App angelegt (Freitext).');
  if (!ziel) return nichtAusfuehrbar(text, keinErgebnis, { subs: [sub] });
  const person = k.personen[sub];
  if (!person) return nichtAusfuehrbar(text, 'Die Person gibt es nicht.', { subs: [sub] });
  if (person.deaktiviert) {
    return nichtAusfuehrbar(text, 'Der Account ist deaktiviert.', { subs: [sub] });
  }
  if (person.status === ziel) return bereitsErledigt(text, { subs: [sub] });
  return {
    text,
    ausfuehrbar: true,
    eventId: null,
    subs: [sub],
    plan: { art, sub, status: ziel, ab },
  };
}

function wahlPosten(
  daten: ReturnType<typeof bausteinWahlDatenSchema.parse>,
  k: ProtokollAktionenKontext,
): Eintrag {
  const posten = daten.postenId ? k.posten[daten.postenId] : undefined;
  const name = posten?.name ?? daten.posten.trim();
  const text = `Posten${name ? ` „${name}“` : ''}${daten.gueltigAb ? ` ab ${datumAnzeigen(daten.gueltigAb)}` : ''} besetzen`;
  if (!daten.postenId) return nichtAusfuehrbar(text, 'Es ist kein Posten aus der Liste gewählt.');
  if (!daten.gueltigAb) return nichtAusfuehrbar(text, 'Das Datum „Gilt ab“ fehlt.');
  if (!posten) return nichtAusfuehrbar(text, 'Den Posten gibt es nicht mehr.');
  const ergebnis = wahlErgebnis(daten);
  if (ergebnis.offen) {
    return nichtAusfuehrbar(text, 'Die Wahl ist noch nicht entschieden (Stichwahl offen).');
  }
  if (ergebnis.gewaehlt.length === 0) return nichtAusfuehrbar(text, 'Es gibt noch kein Ergebnis.');
  const subs = ergebnis.gewaehlt
    .map((id) => daten.kandidaten.find((x) => x.id === id)?.sub ?? null)
    .filter((s): s is string => s !== null);
  if (subs.length === 0) {
    return nichtAusfuehrbar(text, 'Die Gewählten sind keine Personen der App.');
  }
  const start = daten.gueltigAb;
  const laeuft = (sub: string) =>
    posten.besetzungen.some((b) => b.mitgliedSub === sub && (b.ende === null || b.ende >= start));
  const neue = subs.filter((s) => !laeuft(s));
  if (neue.length === 0) return bereitsErledigt(text, { subs });
  const unbekannt = neue.find((s) => !k.personen[s]);
  if (unbekannt) {
    return nichtAusfuehrbar(text, 'Eine gewählte Person gibt es nicht.', { subs });
  }
  if (neue.some((s) => k.personen[s]!.deaktiviert)) {
    return nichtAusfuehrbar(text, 'Der Account einer gewählten Person ist deaktiviert.', { subs });
  }
  // Those not re-elected end the day before; the ones re-elected keep their Besetzung.
  const ablosung = posten.besetzungen
    .filter((b) => b.ende === null && b.start < start && !subs.includes(b.mitgliedSub))
    .map((b) => b.id);
  return {
    text,
    ausfuehrbar: true,
    eventId: null,
    subs,
    plan: { art: 'wahl.posten', postenId: daten.postenId!, start, subs: neue, ablosung },
  };
}

const personenText = (n: number): string => `${n} ${n === 1 ? 'Person' : 'Personen'}`;

/** Both Todo Aktionen: `todo.anlegen` without a `todoId`, else `todo.aendern`. */
function todoAktion(
  daten: BausteinTodoDaten,
  content: readonly ProtokollKnoten[] | undefined,
  bausteinId: string,
  k: ProtokollAktionenKontext,
): Eintrag | null {
  const titel = daten.titel.trim();
  const subs = todoZustaendigeAufloesen(
    daten.zustaendig,
    Object.entries(k.personen).map(([sub, p]) => ({
      sub,
      status: p.status,
      deaktiviert: p.deaktiviert,
    })),
  );
  const teile = [
    subs.length > 0 ? `für ${personenText(subs.length)}` : '',
    daten.faelligAm ? `bis ${datumAnzeigen(daten.faelligAm)}` : '',
  ].filter(Boolean);
  const beschreibung = `Todo${titel ? ` „${titel}“` : ''}${teile.length > 0 ? ` ${teile.join(', ')}` : ''}`;
  const aendern = daten.todoId !== null;
  const text = aendern ? `${beschreibung} ändern` : beschreibung;

  const notizen = protokollNotizenText(content);
  const todo: TodoPlan | null =
    titel !== '' && daten.faelligAm !== null && subs.length > 0
      ? {
          titel,
          notizen: notizen === '' ? null : notizen,
          faelligAm: daten.faelligAm,
          modus: daten.modus,
          subs,
          protokollId: k.protokollId ?? null,
          bausteinId,
        }
      : null;

  if (aendern) {
    const alt = k.todos?.[daten.todoId!];
    // A deleted Todo has nothing to change.
    if (k.todos && !alt) return null;
    if (todo && alt) {
      const gleich =
        alt.titel === todo.titel &&
        (alt.notizen ?? null) === todo.notizen &&
        alt.faelligAm === todo.faelligAm &&
        alt.modus === todo.modus &&
        alt.subs.length === todo.subs.length &&
        alt.subs.every((s) => todo.subs.includes(s));
      if (gleich) return null;
    }
  }
  if (titel === '') return nichtAusfuehrbar(text, 'Der Titel fehlt.', { subs });
  if (daten.faelligAm === null) return nichtAusfuehrbar(text, 'Die Deadline fehlt.', { subs });
  if (!todo) {
    return nichtAusfuehrbar(
      text,
      daten.zustaendig.length === 0
        ? 'Es ist niemand zuständig.'
        : 'Von den Zuständigen ist niemand aktiv.',
    );
  }
  return {
    text,
    ausfuehrbar: true,
    eventId: null,
    subs,
    plan: aendern
      ? { art: 'todo.aendern', todoId: daten.todoId!, todo }
      : { art: 'todo.anlegen', todo },
  };
}

const VOTE_AKTIONEN: readonly AktionArt[] = ['aufnahme.status', 'em.status', 'wahl.posten'];

/**
 * The Aktionen the Bausteine of a document imply, in document order (also Bausteine inside the free
 * text of other Bausteine). Each Aktion tells whether it can run and why not; the ones whose effect
 * is there already have `erledigt` and the reason `AKTION_BEREITS_ERLEDIGT`.
 */
export function protokollAktionen(
  dokument: ProtokollDokument,
  kontext: ProtokollAktionenKontext,
): ProtokollAktion[] {
  const liste: ProtokollAktion[] = [];
  const hinzu = (knoten: ProtokollKnoten, art: AktionArt, eintrag: Eintrag | null) => {
    if (!eintrag) return;
    const bausteinId = String((knoten.attrs as { id?: unknown }).id);
    const vorlaeufig =
      kontext.nichtBeschlussfaehig?.includes(bausteinId) === true && VOTE_AKTIONEN.includes(art);
    liste.push({
      erledigt: false,
      ...eintrag,
      ...(vorlaeufig ? { vorlaeufig: true } : {}),
      id: `${bausteinId}:${art}`,
      bausteinId,
      art,
    });
  };
  const ab = kontext.sitzungDatum < kontext.heute ? kontext.sitzungDatum : kontext.heute;

  const gehe = (knoten: ProtokollKnoten) => {
    const daten = istObjekt(knoten.attrs) ? knoten.attrs.daten : undefined;
    if (istObjekt(knoten.attrs) && typeof knoten.attrs.id === 'string') {
      switch (knoten.type) {
        case 'bausteinEvent': {
          const d = bausteinEventDatenSchema.safeParse(daten);
          if (!d.success) break;
          if (d.data.eventId === null)
            hinzu(knoten, 'event.anlegen', eventAnlegen(d.data, kontext));
          else hinzu(knoten, 'event.aendern', eventAendern(d.data, kontext));
          break;
        }
        case 'bausteinAnwaerter': {
          const d = bausteinAnwaerterDatenSchema.safeParse(daten);
          if (!d.success || d.data.sub !== null) break;
          const email = (d.data.email ?? '').trim();
          const vorname = d.data.vorname.trim();
          const nachname = d.data.nachname.trim();
          const text = `${[vorname, nachname].filter(Boolean).join(' ') || 'Person'}${email ? ` (${email})` : ''} einladen und als Anwärter:in anlegen`;
          hinzu(
            knoten,
            'anwaerter.einladen',
            email === ''
              ? nichtAusfuehrbar(text, 'Die E-Mail-Adresse fehlt.')
              : !EMAIL.test(email)
                ? nichtAusfuehrbar(text, 'Die E-Mail-Adresse ist ungültig.')
                : vorname === '' && nachname === ''
                  ? nichtAusfuehrbar(text, 'Der Name fehlt.')
                  : {
                      text,
                      ausfuehrbar: true,
                      eventId: null,
                      subs: [],
                      plan: { art: 'anwaerter.einladen', email, vorname, nachname, ab },
                    },
          );
          break;
        }
        case 'bausteinAufnahme': {
          const d = bausteinAufnahmeDatenSchema.safeParse(daten);
          if (!d.success) break;
          const e = d.data.abstimmung.ergebnis;
          hinzu(
            knoten,
            'aufnahme.status',
            statusAktion(
              'aufnahme.status',
              d.data.sub,
              e === 'angenommen' ? 'mitglied' : e === 'abgelehnt' ? 'extern' : null,
              'Es gibt noch kein Ergebnis der Abstimmung.',
              kontext,
            ),
          );
          break;
        }
        case 'bausteinEm': {
          const d = bausteinEmDatenSchema.safeParse(daten);
          if (!d.success) break;
          const a = d.data.abstimmung;
          const ziel: MitgliedStatus | null =
            a === null
              ? 'extern'
              : a.ergebnis === 'angenommen'
                ? 'em'
                : a.ergebnis === 'abgelehnt'
                  ? 'extern'
                  : null;
          hinzu(
            knoten,
            'em.status',
            statusAktion(
              'em.status',
              d.data.sub,
              ziel,
              'Es gibt noch kein Ergebnis der Abstimmung.',
              kontext,
            ),
          );
          break;
        }
        case 'bausteinWahl': {
          const d = bausteinWahlDatenSchema.safeParse(daten);
          if (d.success) hinzu(knoten, 'wahl.posten', wahlPosten(d.data, kontext));
          break;
        }
        case 'bausteinTodo': {
          const d = bausteinTodoDatenSchema.safeParse(daten);
          if (!d.success) break;
          hinzu(
            knoten,
            d.data.todoId === null ? 'todo.anlegen' : 'todo.aendern',
            todoAktion(d.data, knoten.content, knoten.attrs.id, kontext),
          );
          break;
        }
      }
    }
    for (const kind of knoten.content ?? []) gehe(kind);
  };
  gehe(dokument);
  return liste;
}

// ---------------------------------------------------------------------------------------------
// DTOs of the API
// ---------------------------------------------------------------------------------------------

/**
 * `offen` = can run, `fehler` = failed last time (can run again), `erledigt` = done,
 * `nicht_ausfuehrbar` = cannot run (see `grund`).
 */
export type AktionZustand = 'offen' | 'erledigt' | 'fehler' | 'nicht_ausfuehrbar';

export interface ProtokollAktionAnsicht extends Omit<ProtokollAktion, 'plan'> {
  zustand: AktionZustand;
  /** What the last run reported (kept in the Kopf); null = never run. */
  ergebnis: ProtokollAktionErgebnis | null;
}

/** An Aktion as the API delivers it: with the members concerned (for `StatusName`). */
export interface ProtokollAktionDto extends ProtokollAktionAnsicht {
  personen: ProtokollMitgliedDto[];
}

/** Ids of the Bausteine of a document in document order (also the ones inside other Bausteine). */
export function bausteinIdsInReihenfolge(dokument: ProtokollDokument): string[] {
  const ids: string[] = [];
  const gehe = (knoten: ProtokollKnoten) => {
    const id = istObjekt(knoten.attrs) ? knoten.attrs.id : undefined;
    if (typeof id === 'string' && knoten.type.startsWith('baustein')) ids.push(id);
    for (const kind of knoten.content ?? []) gehe(kind);
  };
  gehe(dokument);
  return ids;
}

/**
 * The computed Aktionen with the results stored in the Kopf. Results of Aktionen that are not
 * computed any more (their effect changed the document, e.g. a created event) are listed as well,
 * with the text they had when they ran, in the order of their Bausteine in `reihenfolge` (ids of the
 * Bausteine in document order); the ones whose Baustein is gone come last.
 */
export function aktionenMitZustand(
  liste: readonly ProtokollAktion[],
  gespeichert: Readonly<Record<string, ProtokollAktionErgebnis>>,
  reihenfolge: readonly string[] = liste.map((a) => a.bausteinId),
): ProtokollAktionAnsicht[] {
  const ansichten = liste.map((aktion): ProtokollAktionAnsicht => {
    const a: Omit<ProtokollAktion, 'plan'> & { plan?: unknown } = { ...aktion };
    delete a.plan;
    const ergebnis = gespeichert[a.id] ?? null;
    const zustand: AktionZustand = a.erledigt
      ? 'erledigt'
      : a.ausfuehrbar
        ? ergebnis?.status === 'fehler'
          ? 'fehler'
          : 'offen'
        : 'nicht_ausfuehrbar';
    return { ...a, zustand, ergebnis };
  });
  const bekannt = new Set(liste.map((a) => a.id));
  const weitere: ProtokollAktionAnsicht[] = [];
  for (const [id, ergebnis] of Object.entries(gespeichert)) {
    if (bekannt.has(id)) continue;
    const i = id.indexOf(':');
    const art = id.slice(i + 1);
    if (i < 0 || !(AKTION_ARTEN as readonly string[]).includes(art)) continue;
    weitere.push({
      id,
      bausteinId: ergebnis.bausteinId || id.slice(0, i),
      art: art as AktionArt,
      text: ergebnis.aktionText || ergebnis.text,
      ausfuehrbar: false,
      erledigt: ergebnis.status === 'erledigt',
      eventId: ergebnis.eventId,
      subs: ergebnis.subs,
      zustand: ergebnis.status,
      ergebnis,
    });
  }
  if (weitere.length === 0) return ansichten;
  // Merge: every stored one goes behind the last entry whose Baustein is not after its own.
  const platz = new Map(reihenfolge.map((id, i) => [id, i] as const));
  const position = (a: ProtokollAktionAnsicht): number => platz.get(a.bausteinId) ?? Infinity;
  const ergebnisListe = [...ansichten];
  for (const w of weitere) {
    let stelle = ergebnisListe.length;
    if (position(w) !== Infinity) {
      stelle = ergebnisListe.findIndex((a) => position(a) >= position(w));
      if (stelle < 0) stelle = ergebnisListe.length;
      // Entries of Bausteine that are gone stay at the end.
      const ende = ergebnisListe.findIndex((a) => position(a) === Infinity);
      if (ende >= 0 && stelle > ende) stelle = ende;
    }
    ergebnisListe.splice(stelle, 0, w);
  }
  return ergebnisListe;
}

/** Outcome of one Aktion that was asked to run. */
export interface ProtokollAktionAusgang {
  id: string;
  bausteinId: string;
  art: AktionArt;
  /** `uebersprungen`: unknown, not executable or done already. */
  status: 'erledigt' | 'fehler' | 'uebersprungen';
  /** What was done, or why it failed or was skipped. */
  meldung: string;
}

/** Answer of `PUT /protokolle/:id/status`. `aktionen` = outcome of the requested Aktionen (empty without any). */
export interface ProtokollStatusAntwort {
  status: 'entwurf' | 'abgeschlossen';
  version: number;
  geaendertAm: string;
  aktionen: ProtokollAktionAusgang[];
}

/** Answer of `GET /protokolle/:id/aktionen`. */
export interface ProtokollAktionenAntwort {
  aktionen: ProtokollAktionDto[];
}

/** Answer of `POST /protokolle/:id/aktionen`: the outcome and the list as it is afterwards. */
export interface ProtokollAktionenAusfuehrenAntwort extends ProtokollAktionenAntwort {
  version: number;
  ergebnisse: ProtokollAktionAusgang[];
}
