import {
  bausteinEventDatenSchema,
  bausteinTodoDatenSchema,
  ERWAEHNUNG_GRUPPEN,
  ERWAEHNUNG_TYP,
  erwaehnungAttrs,
  erwaehnungBetrifft,
  type ErwaehnungAttrs,
  type ErwaehnungGruppe,
  type MitgliedStatus,
  type ProtokollDokument,
  type ProtokollKnoten,
} from '@c4/shared';
import { MITGLIED_STATUS_MEHRZAHL } from '../i18n';
import { dokumentUeberschriften } from './dokumentUeberschriften';
import { knotenText } from './dokumentDaten';
import { normalisieren, type ListenEintrag } from './slashLogik';

// @mentions of members and groups in the free text: entries of the suggestion list, the text of a
// mention and the "Meine Erwähnungen" overview. Pure, no TipTap/React.

/** Label of a group as typed and shown: `@Mitglieder`. */
export const GRUPPE_TITEL: Record<ErwaehnungGruppe, string> = {
  anwaerter: MITGLIED_STATUS_MEHRZAHL.anwaerter,
  mitglieder: MITGLIED_STATUS_MEHRZAHL.mitglied,
  ems: MITGLIED_STATUS_MEHRZAHL.em,
  aktive: 'Aktive',
  alle: 'Alle',
};

const GRUPPE_BESCHREIBUNG: Record<ErwaehnungGruppe, string> = {
  anwaerter: 'Alle Anwärter:innen',
  mitglieder: 'Alle Mitglieder',
  ems: 'Alle EMs',
  aktive: 'Anwärter:innen und Mitglieder',
  alle: 'Anwärter:innen, Mitglieder und EMs',
};

/** A member that can be mentioned. */
export interface ErwaehnungPerson {
  sub: string;
  username: string | null;
  vorname: string;
  nachname: string;
  status: MitgliedStatus;
}

/** An entry of the @ list; `attrs` are the attributes of the node it inserts. */
export interface ErwaehnungEintrag extends ListenEintrag {
  attrs: ErwaehnungAttrs;
}

const vollerName = (p: Pick<ErwaehnungPerson, 'vorname' | 'nachname'>) =>
  `${p.vorname} ${p.nachname}`.trim();

/** Username, else "Vorname Nachname" ('–' for nobody). */
export const erwaehnungPersonName = (
  p: Pick<ErwaehnungPerson, 'username' | 'vorname' | 'nachname'>,
): string => p.username ?? (vollerName(p) || '–');

/** The text of a mention: `@Mitglieder`, `@username` (`@Unbekannt` for somebody who is not known). */
export function erwaehnungText(
  attrs: ErwaehnungAttrs,
  name: (sub: string) => string | null | undefined,
): string {
  if (attrs.art === 'gruppe') return `@${attrs.gruppe ? GRUPPE_TITEL[attrs.gruppe] : ''}`;
  return `@${(attrs.sub ? name(attrs.sub) : null) ?? 'Unbekannt'}`;
}

/**
 * Entries for what was typed after the "@": the groups first, then the members (Externe last, then
 * by name), shown as "username (Vorname Nachname)". Filtered like the other slash lists (umlauts
 * spelled out, case ignored).
 */
export function erwaehnungEintraege(
  query: string,
  personen: readonly ErwaehnungPerson[],
): ErwaehnungEintrag[] {
  const filter = normalisieren(query).trim();
  const passt = (text: string) => filter === '' || normalisieren(text).includes(filter);
  const gruppen: ErwaehnungEintrag[] = ERWAEHNUNG_GRUPPEN.filter((g) =>
    passt(`${GRUPPE_TITEL[g]} ${GRUPPE_BESCHREIBUNG[g]}`),
  ).map((g) => ({
    schluessel: `gruppe-${g}`,
    titel: GRUPPE_TITEL[g],
    beschreibung: GRUPPE_BESCHREIBUNG[g],
    symbol: 'gruppe',
    attrs: { art: 'gruppe', gruppe: g },
  }));
  const leute = personen
    .map((p) => {
      const voll = vollerName(p);
      const titel = p.username ? (voll ? `${p.username} (${voll})` : p.username) : voll || '–';
      return { p, titel };
    })
    .filter(({ titel }) => passt(titel))
    .sort(
      (a, b) =>
        Number(a.p.status === 'extern') - Number(b.p.status === 'extern') ||
        a.titel.localeCompare(b.titel, 'de'),
    )
    .map(({ p, titel }): ErwaehnungEintrag => ({
      schluessel: `person-${p.sub}`,
      titel,
      beschreibung: '',
      symbol: 'person',
      person: {
        name: erwaehnungPersonName(p),
        zusatz: p.username && vollerName(p) ? vollerName(p) : undefined,
        status: p.status,
      },
      attrs: { art: 'person', sub: p.sub },
    }));
  return [...gruppen, ...leute];
}

/**
 * Whether the "@" list may open in a text block of this node type: paragraphs only (sections, notes of
 * a Baustein, list items, quotes), not headings (the outline takes their text).
 */
export const erwaehnungErlaubt = (eltern: string): boolean => eltern === 'paragraph';

// ---------------------------------------------------------------------------------------------
// Meine Erwähnungen
// ---------------------------------------------------------------------------------------------

/** Id prefix of the anchors of mentions in the document view. */
export const ERWAEHNUNG_ID_PREFIX = 'dok-erw-';

/** Characters of text kept on each side of a mention in the overview. */
const AUSZUG_RAND = 40;

/** One mention that concerns the viewer, for the overview. */
export interface MeineErwaehnung {
  /** Anchor id of the mention in the document view. */
  id: string;
  /** Text of the nearest heading before the mention. */
  ueberschrift: string;
  /** Anchor id of that heading (the section's or Baustein's). */
  ueberschriftId: string | null;
  /** Short text around the mention. */
  auszug: string;
}

export interface MeineErwaehnungen {
  eintraege: MeineErwaehnung[];
  /** Anchor id per mention node that concerns the viewer. */
  ids: Map<ProtokollKnoten, string>;
}

/** Text of the line with the mention at `[von, bis)` cut to a few words around it. */
export function auszugAus(text: string, von: number, bis: number): string {
  const links = Math.max(0, von - AUSZUG_RAND);
  const rechts = Math.min(text.length, bis + AUSZUG_RAND);
  const stueck = text.slice(links, rechts).replace(/\s+/g, ' ').trim();
  return `${links > 0 ? '… ' : ''}${stueck}${rechts < text.length ? ' …' : ''}`;
}

/**
 * The mentions in the document that concern `ich` (the person or a group of their current status), in
 * document order, each with the nearest heading before it and an excerpt of its line. `personName`
 * resolves members for the text of other mentions in the excerpt.
 */
export function meineErwaehnungen(
  dokument: ProtokollDokument,
  ich: { sub: string; status: MitgliedStatus } | null | undefined,
  personName: (sub: string) => string | null = () => null,
): MeineErwaehnungen {
  const ids = new Map<ProtokollKnoten, string>();
  const eintraege: MeineErwaehnung[] = [];
  if (!ich) return { eintraege, ids };
  const { eintraege: ueberschriften, ids: ueberschriftIds } = dokumentUeberschriften(
    dokument,
    personName,
  );
  const titel = new Map(ueberschriften.map((u) => [u.id, u.text]));
  let aktuell: { id: string; text: string } | null = null;

  const gehe = (k: ProtokollKnoten) => {
    const uid = ueberschriftIds.get(k);
    const utext = uid ? titel.get(uid) : undefined;
    if (uid && utext) aktuell = { id: uid, text: utext };
    // The lead of an event is a mention of that person too (shown without "@" in the document).
    if (k.type === 'bausteinEvent') {
      const d = bausteinEventDatenSchema.safeParse(k.attrs?.daten);
      if (d.success && d.data.verantwortlichSub === ich.sub) {
        const id = `${ERWAEHNUNG_ID_PREFIX}${eintraege.length}`;
        ids.set(k, id);
        const ue = aktuell as { id: string; text: string } | null;
        eintraege.push({
          id,
          ueberschrift: ue?.text ?? '',
          ueberschriftId: ue?.id ?? null,
          auszug: `Verantwortlich: ${personName(ich.sub) ?? 'du'}`,
        });
      }
    }
    // Zuständig for a Todo (as a person or through a group of the current status) is a mention too.
    if (k.type === 'bausteinTodo') {
      const d = bausteinTodoDatenSchema.safeParse(k.attrs?.daten);
      if (d.success && d.data.zustaendig.some((z) => erwaehnungBetrifft(z, ich))) {
        const id = `${ERWAEHNUNG_ID_PREFIX}${eintraege.length}`;
        ids.set(k, id);
        const ue = aktuell as { id: string; text: string } | null;
        const titel = d.data.titel.trim();
        eintraege.push({
          id,
          ueberschrift: ue?.text ?? '',
          ueberschriftId: ue?.id ?? null,
          auszug: titel ? `Todo: ${titel}` : 'Todo',
        });
      }
    }
    const kinder = k.content ?? [];
    if (!kinder.some((c) => c.type === ERWAEHNUNG_TYP)) {
      for (const c of kinder) gehe(c);
      return;
    }
    // A text block with mentions: its line, with `@name` for every mention.
    let zeile = '';
    const stellen: [ProtokollKnoten, number, number][] = [];
    for (const c of kinder) {
      const von = zeile.length;
      if (c.type === ERWAEHNUNG_TYP) {
        const attrs = erwaehnungAttrs(c.attrs);
        zeile += attrs ? erwaehnungText(attrs, personName) : '@';
        stellen.push([c, von, zeile.length]);
      } else {
        zeile += c.type === 'hardBreak' ? ' ' : knotenText(c);
      }
    }
    for (const [c, von, bis] of stellen) {
      const attrs = erwaehnungAttrs(c.attrs);
      if (!attrs || !erwaehnungBetrifft(attrs, ich)) continue;
      const id = `${ERWAEHNUNG_ID_PREFIX}${eintraege.length}`;
      ids.set(c, id);
      const ue = aktuell as { id: string; text: string } | null;
      eintraege.push({
        id,
        ueberschrift: ue?.text ?? '',
        ueberschriftId: ue?.id ?? null,
        auszug: auszugAus(zeile, von, bis),
      });
    }
  };
  for (const a of dokument.content) gehe(a);
  return { eintraege, ids };
}
