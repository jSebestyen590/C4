import { Fragment, type ReactElement, type ReactNode } from 'react';
import { Image, Link, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  anwesenheitsVerlauf,
  bausteinAnwaerterDatenSchema,
  bausteinEventDatenSchema,
  bausteinThemaDatenSchema,
  bausteinVergangenesEventDatenSchema,
  BAUSTEIN_TYPEN,
  BILD_AUSRICHTUNGEN,
  BILD_BREITEN,
  erwaehnungAttrs,
  eventUeberschrift,
  istBausteinInNotizen,
  vergangenesUeberschrift,
  type MitgliedStatus,
  type ProtokollKnoten,
} from '@c4/shared';
import { erwaehnungText } from '../erwaehnungLogik';
import {
  alleMitglieder,
  anwesenheitZeile,
  aufnahmeZeilen,
  beschlussfaehigkeitText,
  beschlussZeilen,
  dokumentKopf,
  emZeilen,
  eroeffnungSatz,
  istLeererAbsatz,
  istQuellenzeile,
  meinungsbildZeilen,
  naechsteSitzungSatz,
  naechsteSitzungWert,
  ohneLeereEnden,
  personName,
  wahlZeilen,
  type DokumentEingabe,
  type Person,
  type WahlKandidat,
} from '../dokumentDaten';
import {
  dokumentUeberschriften,
  eigeneUeberschriftSchritte,
  unterEbene,
} from '../dokumentUeberschriften';
import { ABSCHNITT_TITEL } from '../schema';
import { hatBilder, notizAbschnitte } from '../notizAbschnitte';
import { PDF_SCHRIFT } from './schriften';

// The document of the minutes as a flat list of blocks (heading blocks know their level), derived from
// the same data helpers as the HTML view (ProtokollDokumentAnsicht). `blockBaum` nests them by heading
// level for the PDF outline: section > heading > sub-heading, like the app's Gliederung.

/** Colors (hex): Mantine indigo.6 / indigo.0 (primary), red.7 (warning), gray.6 (dimmed). */
const PRIMAER = '#4c6ef5';
const PRIMAER_HELL = '#edf2ff';
const WARNUNG = '#e03131';
const GEDAEMPFT = '#868e96';
/** Username colors per status, the light-mode shades of `StatusName` (green.9, orange.9, gray.7, blue.9). */
export const STATUS_FARBE: Record<MitgliedStatus, string> = {
  anwaerter: '#d9480f',
  mitglied: '#2b8a3e',
  em: '#495057',
  extern: '#1864ab',
};

export const stile = StyleSheet.create({
  // No lineHeight here: on the Page it blanks out `render` texts (the page numbers).
  seite: {
    fontFamily: PDF_SCHRIFT,
    fontSize: 10.5,
    paddingTop: 54,
    paddingBottom: 66,
    paddingHorizontal: 56,
  },
  fuss: {
    position: 'absolute',
    bottom: 30,
    left: 56,
    right: 56,
  },
  fussText: { textAlign: 'center', fontSize: 9, color: GEDAEMPFT },
  titel: { fontSize: 20, fontWeight: 700, lineHeight: 1.2, marginBottom: 12 },
  absatz: { marginBottom: 5 },
  zeile: { marginBottom: 2 },
  luecke: { height: 12 },
  fett: { fontWeight: 700 },
  h1: { fontSize: 17, color: PRIMAER, lineHeight: 1.25, marginTop: 18, marginBottom: 6 },
  h2: { fontSize: 13.5, color: PRIMAER, lineHeight: 1.25, marginTop: 12, marginBottom: 4 },
  h3: { fontSize: 11.5, color: PRIMAER, lineHeight: 1.25, marginTop: 9, marginBottom: 3 },
  h4: {
    fontSize: 10.5,
    fontWeight: 700,
    color: PRIMAER,
    lineHeight: 1.25,
    marginTop: 7,
    marginBottom: 2,
  },
  h5: {
    fontSize: 9.5,
    fontWeight: 700,
    color: PRIMAER,
    lineHeight: 1.25,
    marginTop: 6,
    marginBottom: 2,
  },
  zitat: { marginVertical: 5, textAlign: 'right', fontStyle: 'italic' },
  quelle: { fontStyle: 'normal' },
  anwesenheit: { marginTop: 4, marginBottom: 2, textAlign: 'right', fontStyle: 'italic' },
  kasten: {
    marginVertical: 8,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderLeftWidth: 3,
    borderLeftColor: PRIMAER,
    borderLeftStyle: 'solid',
    backgroundColor: PRIMAER_HELL,
  },
  klein: { fontSize: 9, color: GEDAEMPFT },
  warnung: { color: WARNUNG, fontWeight: 700 },
  eintrag: { flexDirection: 'row', marginBottom: 2 },
  marke: { width: 15 },
  eintragInhalt: { flexGrow: 1, flexShrink: 1 },
  liste: { marginBottom: 5 },
  punkt: {
    width: 4,
    height: 4,
    marginTop: 5,
    marginLeft: 1,
    borderWidth: 0.8,
    borderColor: '#212529',
    borderStyle: 'solid',
    borderRadius: 2,
  },
  innen: { marginLeft: 15 },
});

export interface Block {
  /** Heading level (see `MAX_EBENE`); only set for blocks that appear in the outline. */
  ebene?: number;
  /** Outline title of a heading block. */
  titel?: string;
  element: ReactElement;
}

interface Kontext {
  eingabe: DokumentEingabe;
  verlauf: ReturnType<typeof anwesenheitsVerlauf>;
  person: (sub: string) => Person | null;
  ids: Map<ProtokollKnoten, string>;
  titel: Map<string, string>;
  /** Level of the enclosing heading (1 = section, 2 = top-level Baustein, ...). */
  ebene: number;
}

/** PDF style of a heading level (the deepest levels share the smallest). */
const ueberschriftStil = (ebene: number) =>
  [stile.h1, stile.h1, stile.h2, stile.h3, stile.h4, stile.h5][Math.min(ebene, 5)]!;

const SICHERE_LINKS = /^(https?:|mailto:|tel:)/i;

const Name = ({ p }: Readonly<{ p: Person }>) => (
  <Text style={{ fontWeight: 700, color: STATUS_FARBE[p.status] }}>{p.name}</Text>
);

/** An @mention: "@username" bold in the color of the status, "@Mitglieder" as plain text (no highlighter). */
function erwaehnung(k: ProtokollKnoten, person: (sub: string) => Person | null): ReactNode {
  const attrs = erwaehnungAttrs(k.attrs);
  if (!attrs) return <Text>@</Text>;
  const p = attrs.art === 'person' && attrs.sub ? person(attrs.sub) : null;
  if (p) return <Name p={{ ...p, name: `@${p.name}` }} />;
  return <Text>{erwaehnungText(attrs, () => null)}</Text>;
}

/** Text, marks and hard breaks of a paragraph. */
function inline(
  liste: readonly ProtokollKnoten[] | undefined,
  person: (sub: string) => Person | null,
): ReactNode[] {
  return (liste ?? []).map((k, i) => {
    if (k.type === 'hardBreak') return <Text key={i}>{'\n'}</Text>;
    if (k.type === 'erwaehnung') return <Fragment key={i}>{erwaehnung(k, person)}</Fragment>;
    if (k.type !== 'text') return <Fragment key={i}>{inline(k.content, person)}</Fragment>;
    const marks = k.marks ?? [];
    const fett = marks.some((m) => m.type === 'bold');
    const kursiv = marks.some((m) => m.type === 'italic');
    const text = (
      <Text
        style={{
          ...(fett && { fontWeight: 700 }),
          ...(kursiv && { fontStyle: 'italic' as const }),
        }}
      >
        {k.text ?? ''}
      </Text>
    );
    const link = marks.find((m) => m.type === 'link');
    const href = typeof link?.attrs?.href === 'string' ? link.attrs.href : '';
    if (link && SICHERE_LINKS.test(href)) {
      return (
        <Link key={i} src={href} style={{ color: PRIMAER, textDecoration: 'underline' }}>
          {text}
        </Link>
      );
    }
    return <Fragment key={i}>{text}</Fragment>;
  });
}

const Absatz = ({ children, stil }: Readonly<{ children: ReactNode; stil?: object }>) => (
  <Text style={{ ...stile.absatz, ...stil }}>{children}</Text>
);

function listenBlock(k: ProtokollKnoten, ctx: Kontext, tiefe: number, vorne?: ReactNode) {
  const geordnet = k.type === 'orderedList';
  const start = typeof k.attrs?.start === 'number' ? k.attrs.start : 1;
  const eintraege: ReactElement[] = [];
  const marke = (i: number): ReactNode => {
    if (geordnet) return <Text>{`${start + i}.`}</Text>;
    if (tiefe === 0) return <Text>{'•'}</Text>;
    if (tiefe === 1) return <View style={stile.punkt} />;
    return <Text>{'–'}</Text>;
  };
  let n = 0;
  if (vorne) {
    eintraege.push(
      <View key="vorne" style={stile.eintrag}>
        <View style={stile.marke}>{marke(n)}</View>
        <View style={stile.eintragInhalt}>
          <Text>{vorne}</Text>
        </View>
      </View>,
    );
    n += 1;
  }
  for (const [i, eintrag] of (k.content ?? []).entries()) {
    eintraege.push(
      <View key={i} style={stile.eintrag}>
        <View style={stile.marke}>{marke(n)}</View>
        <View style={stile.eintragInhalt}>
          {(eintrag.content ?? []).map((c, j) => knotenInListe(c, ctx, tiefe + 1, j))}
        </View>
      </View>,
    );
    n += 1;
  }
  return (
    <View style={stile.liste} key="liste">
      {eintraege}
    </View>
  );
}

/** A child of a list item: paragraph text or a nested list. */
function knotenInListe(k: ProtokollKnoten, ctx: Kontext, tiefe: number, key: number): ReactNode {
  if (k.type === 'bulletList' || k.type === 'orderedList') {
    return <Fragment key={key}>{listenBlock(k, ctx, tiefe)}</Fragment>;
  }
  if (k.type === 'paragraph') {
    return (
      <Text key={key} style={{ marginBottom: 1 }}>
        {inline(k.content, ctx.person)}
      </Text>
    );
  }
  return <Text key={key}>{inline(k.content, ctx.person)}</Text>;
}

const block = (element: ReactElement): Block => ({ element });

const BILD_AUSRICHTUNG = { links: 'flex-start', mitte: 'center', rechts: 'flex-end' } as const;
const BILD_TEXT_AUSRICHTUNG = { links: 'left', mitte: 'center', rechts: 'right' } as const;
const BILD_MAX_HOEHE = 640;
/** Width of the image column beside the notes (the text takes the rest). */
const BILD_SPALTE = '40%';
export const BILD_NICHT_VERFUEGBAR = '[Bild nicht verfügbar]';

/**
 * An image with its description. At section level: own row, full or half width, aligned like the node
 * says; `spalte`: in the column beside the notes. An image without a loadable URL is a placeholder text,
 * so a broken image never fails the PDF.
 */
function bildElement(k: ProtokollKnoten, ctx: Kontext, spalte: boolean): ReactElement {
  const schluessel = typeof k.attrs?.schluessel === 'string' ? k.attrs.schluessel : '';
  const beschreibung = typeof k.attrs?.beschreibung === 'string' ? k.attrs.beschreibung : '';
  const breite = (BILD_BREITEN as readonly unknown[]).includes(k.attrs?.breite)
    ? (k.attrs?.breite as string)
    : 'voll';
  const ausrichtung = (BILD_AUSRICHTUNGEN as readonly unknown[]).includes(k.attrs?.ausrichtung)
    ? (k.attrs?.ausrichtung as (typeof BILD_AUSRICHTUNGEN)[number])
    : 'mitte';
  const url = ctx.eingabe.bilder?.[schluessel];
  const inhalt = (
    <View wrap={false}>
      {url ? (
        <Image
          src={url}
          style={{ width: '100%', maxHeight: BILD_MAX_HOEHE, objectFit: 'contain' }}
        />
      ) : (
        <Text style={stile.klein}>{BILD_NICHT_VERFUEGBAR}</Text>
      )}
      {beschreibung ? (
        <Text
          style={{
            ...stile.klein,
            marginTop: 2,
            textAlign: spalte ? 'left' : BILD_TEXT_AUSRICHTUNG[ausrichtung],
          }}
        >
          {beschreibung}
        </Text>
      ) : null}
    </View>
  );
  if (spalte) return <View style={{ marginBottom: 6 }}>{inhalt}</View>;
  return (
    <View style={{ marginVertical: 6, alignItems: BILD_AUSRICHTUNG[ausrichtung] }} wrap={false}>
      <View style={{ width: breite === 'halb' ? '50%' : '100%' }}>{inhalt}</View>
    </View>
  );
}

/** Blocks of free text; unknown nodes contribute their children. */
function textBloecke(k: ProtokollKnoten, ctx: Kontext): Block[] {
  switch (k.type) {
    case 'paragraph':
      return istLeererAbsatz(k) ? [] : [block(<Absatz>{inline(k.content, ctx.person)}</Absatz>)];
    case 'heading': {
      // Relative to the enclosing heading, like the document view.
      const stufe = unterEbene(ctx.ebene, eigeneUeberschriftSchritte(k.attrs?.level));
      const id = ctx.ids.get(k);
      const titel = id ? ctx.titel.get(id) : undefined;
      return [
        {
          ebene: titel ? stufe : undefined,
          titel,
          element: (
            <Text style={ueberschriftStil(stufe)} minPresenceAhead={50}>
              {inline(k.content, ctx.person)}
            </Text>
          ),
        },
      ];
    }
    case 'bulletList':
    case 'orderedList':
      return [block(listenBlock(k, ctx, 0))];
    case 'blockquote':
      return [
        block(
          <View style={{ marginVertical: 5 }} wrap={false}>
            {(k.content ?? []).map((c, i) =>
              c.type === 'paragraph' ? (
                <Text
                  key={i}
                  style={{
                    textAlign: 'right',
                    fontStyle: istQuellenzeile(c) ? 'normal' : 'italic',
                  }}
                >
                  {inline(c.content, ctx.person)}
                </Text>
              ) : null,
            )}
          </View>,
        ),
      ];
    case 'protokollBild':
      // Only reached at section level: images in notes are set beside the text (see `notizen`).
      return [block(bildElement(k, ctx, false))];
    case 'bausteinThema':
      // A Thema inside the notes of another Baustein: a heading one level below it, not indented.
      return bausteinBloecke(k, ctx, true);
    case 'bausteinBeschluss':
    case 'bausteinMeinungsbild':
    case 'bausteinWahl':
      return bausteinBloecke(k, ctx, true).map((b) => ({
        ...b,
        element: <View style={stile.innen}>{b.element}</View>,
      }));
    default:
      return (k.content ?? []).flatMap((c) => textBloecke(c, ctx));
  }
}

/** Blocks of a list of text nodes; `vorne` is an item merged into a leading bullet list. */
function textMitVorne(liste: ProtokollKnoten[], ctx: Kontext, vorne?: ReactNode): Block[] {
  const [erstes, ...rest] = liste;
  if (vorne && erstes?.type === 'bulletList') {
    return [block(listenBlock(erstes, ctx, 0, vorne)), ...rest.flatMap((k) => textBloecke(k, ctx))];
  }
  return [
    ...(vorne ? [block(listenBlock({ type: 'bulletList', content: [] }, ctx, 0, vorne))] : []),
    ...liste.flatMap((k) => textBloecke(k, ctx)),
  ];
}

/**
 * The free text of a Baustein or section; `vorne` is an item merged into a leading bullet list. With
 * images the notes are split at nested Bausteine (`notizAbschnitte`): a piece of text with images is a
 * row, text left and the images stacked in a column right, like the document view. Headings at the start
 * of such a piece stay separate blocks (they keep their bookmark); later ones lose it inside the row.
 */
function notizen(knoten: ProtokollKnoten[] | undefined, ctx: Kontext, vorne?: ReactNode): Block[] {
  const liste = ohneLeereEnden(knoten);
  if (!hatBilder(liste)) return textMitVorne(liste, ctx, vorne);
  const abschnitte = notizAbschnitte(liste);
  const bloecke: Block[] = [];
  if (vorne && abschnitte[0]?.art !== 'text') bloecke.push(...textMitVorne([], ctx, vorne));
  for (const [i, a] of abschnitte.entries()) {
    if (a.art === 'baustein') {
      bloecke.push(...textBloecke(a.knoten, ctx));
      continue;
    }
    const text = textMitVorne(ohneLeereEnden(a.knoten), ctx, i === 0 ? vorne : undefined);
    if (a.bilder.length === 0) {
      bloecke.push(...text);
      continue;
    }
    const kopf = text.findIndex((b) => !b.ebene);
    const vorweg = kopf === -1 ? text.length : kopf;
    bloecke.push(...text.slice(0, vorweg));
    bloecke.push(
      block(
        <View style={{ flexDirection: 'row', marginBottom: 5 }}>
          <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
            {text.slice(vorweg).map((b, j) => (
              <Fragment key={j}>{b.element}</Fragment>
            ))}
          </View>
          <View style={{ width: BILD_SPALTE, marginLeft: 8 }}>
            {a.bilder.map((b, j) => (
              <Fragment key={j}>{bildElement(b, ctx, true)}</Fragment>
            ))}
          </View>
        </View>,
      ),
    );
  }
  return bloecke;
}

/** Heading block of a Baustein shown as a heading. */
function ueberschrift(k: ProtokollKnoten, ctx: Kontext, inhalt: ReactNode): Block {
  const id = ctx.ids.get(k);
  const titel = id ? ctx.titel.get(id) : undefined;
  const ebene = unterEbene(ctx.ebene);
  return {
    ebene: titel ? ebene : undefined,
    titel,
    element: (
      <Text style={ueberschriftStil(ebene)} minPresenceAhead={50}>
        {inhalt}
      </Text>
    ),
  };
}

/** Heading-like line of a top-level vote (not in the outline). */
const kopfzeile = (text: string, ctx: Kontext): Block =>
  block(
    <Text style={ueberschriftStil(unterEbene(ctx.ebene))} minPresenceAhead={50}>
      {text}
    </Text>,
  );

const Kasten = ({ children }: Readonly<{ children: ReactNode }>) => (
  <View style={stile.kasten} wrap={false}>
    {children}
  </View>
);

function Stimmzeilen({
  stimmen,
  anwesend,
  nicht,
}: Readonly<{ stimmen: string; anwesend: string; nicht: boolean }>) {
  return (
    <>
      {stimmen && <Text>{stimmen}</Text>}
      {(anwesend || nicht) && (
        <Text>
          {anwesend}
          {nicht && <Text style={stile.warnung}> – nicht beschlussfähig</Text>}
        </Text>
      )}
    </>
  );
}

const Klein = ({ children }: Readonly<{ children: ReactNode }>) => (
  <Text style={stile.klein}>{children}</Text>
);

function WahlName({ k, ctx }: Readonly<{ k: WahlKandidat; ctx: Kontext }>) {
  const p = k.sub ? ctx.person(k.sub) : null;
  return p ? <Name p={p} /> : <Text>{k.name || 'Person offen'}</Text>;
}

function WahlStimmen({
  kandidaten,
  enthaltung,
  ctx,
}: Readonly<{ kandidaten: WahlKandidat[]; enthaltung: number; ctx: Kontext }>) {
  return (
    <>
      {kandidaten.map((k, i) => (
        <Fragment key={k.id}>
          {i > 0 && ' · '}
          <WahlName k={k} ctx={ctx} />
          {` ${k.stimmen}`}
        </Fragment>
      ))}
      {kandidaten.length > 0 && ' · '}
      {`Enthaltung ${enthaltung}`}
    </>
  );
}

function Liste({ personen, ctx }: Readonly<{ personen: WahlKandidat[]; ctx: Kontext }>) {
  return (
    <>
      {personen.map((g, i) => (
        <Fragment key={g.id}>
          {i > 0 && ', '}
          <WahlName k={g} ctx={ctx} />
        </Fragment>
      ))}
    </>
  );
}

const BAUSTEINE = new Set<string>(BAUSTEIN_TYPEN);

/** `innen`: inside the notes of another Baustein (Abstimmung / Wahl then get no heading line of their own). */
function bausteinBloecke(k: ProtokollKnoten, ctx: Kontext, innen = false): Block[] {
  const daten: unknown = k.attrs?.daten;
  const id = typeof k.attrs?.id === 'string' ? k.attrs.id : '';
  const art = ctx.eingabe.sitzung.art;
  // Level of this Baustein's heading; its notes sit below it (a nested vote has no heading of its own).
  const ctxIn: Kontext = {
    ...ctx,
    ebene: istBausteinInNotizen(k.type) && innen ? ctx.ebene : unterEbene(ctx.ebene),
  };

  switch (k.type) {
    case 'bausteinEvent': {
      const d = bausteinEventDatenSchema.safeParse(daten);
      const titel = d.success ? eventUeberschrift(d.data) : '';
      const verantwortlich =
        d.success && d.data.verantwortlichSub ? ctx.person(d.data.verantwortlichSub) : null;
      return [
        ueberschrift(k, ctx, titel || 'Event'),
        ...notizen(
          k.content,
          ctxIn,
          verantwortlich && (
            <>
              {'Verantwortlich: '}
              <Name p={verantwortlich} />
            </>
          ),
        ),
      ];
    }
    case 'bausteinThema': {
      const d = bausteinThemaDatenSchema.safeParse(daten);
      const titel = d.success ? d.data.titel.trim() : '';
      return [ueberschrift(k, ctx, titel || 'Thema'), ...notizen(k.content, ctxIn)];
    }
    case 'bausteinVergangenesEvent': {
      const d = bausteinVergangenesEventDatenSchema.safeParse(daten);
      const titel = d.success ? vergangenesUeberschrift(d.data) : '';
      return [ueberschrift(k, ctx, titel || 'Vergangenes Event'), ...notizen(k.content, ctxIn)];
    }
    case 'bausteinAnwaerter': {
      const d = bausteinAnwaerterDatenSchema.safeParse(daten);
      const name = d.success ? `${d.data.vorname} ${d.data.nachname}`.trim() : '';
      return [
        ueberschrift(k, ctx, `Neue:r Anwärter:in${name ? `: ${name}` : ''}`),
        ...notizen(k.content, ctxIn),
      ];
    }
    case 'bausteinBeschluss': {
      const z = beschlussZeilen(daten, ctx.verlauf.bausteine[id]);
      return [
        ...(innen ? [] : [kopfzeile(z.antrag ? `Abstimmung: ${z.antrag}` : 'Abstimmung', ctx)]),
        block(
          <Kasten>
            {z.wiederholung && <Klein>{z.wiederholung}</Klein>}
            {innen && (
              <Text>
                <Text style={stile.fett}>Abstimmung:</Text> {z.antrag}
              </Text>
            )}
            <Stimmzeilen stimmen={z.stimmen} anwesend={z.anwesend} nicht={z.nichtBeschlussfaehig} />
          </Kasten>,
        ),
        ...notizen(k.content, ctxIn),
      ];
    }
    case 'bausteinMeinungsbild': {
      const z = meinungsbildZeilen(daten);
      return [
        block(
          <Kasten>
            <Text>
              <Text style={stile.fett}>Meinungsbild:</Text> {z.frage}
            </Text>
            {z.optionen && <Text>{z.optionen}</Text>}
            <Klein>(nicht bindend)</Klein>
          </Kasten>,
        ),
        ...notizen(k.content, ctxIn),
      ];
    }
    case 'bausteinWahl': {
      const z = wahlZeilen(daten, ctx.verlauf.bausteine[id]);
      if (!z) return [];
      return [
        ...(innen
          ? []
          : [
              kopfzeile(
                `Wahl${z.posten ? `: ${z.posten}` : ''}${z.plaetze ? ` (${z.plaetze})` : ''}`,
                ctx,
              ),
            ]),
        // The notes are the discussion before; the vote concludes the point.
        ...notizen(k.content, ctxIn),
        block(
          <Kasten>
            {z.wiederholung && <Klein>{z.wiederholung}</Klein>}
            {innen && (
              <Text>
                <Text style={stile.fett}>Wahl:</Text> {z.posten}
                {z.plaetze && ` (${z.plaetze})`}
              </Text>
            )}
            {z.giltAb && <Text>{z.giltAb}</Text>}
            {z.kandidaten.length > 0 && (
              <Text>
                {'Kandidat:innen: '}
                <WahlStimmen kandidaten={z.kandidaten} enthaltung={z.enthaltung} ctx={ctx} />
              </Text>
            )}
            {z.stichwahlen.map((r, i) => (
              <Text key={i}>
                {'Stichwahl: '}
                <WahlStimmen kandidaten={r.kandidaten} enthaltung={r.enthaltung} ctx={ctx} />
              </Text>
            ))}
            {z.nichtAngetreten.length > 0 && (
              <Text>
                {'Nicht angetreten: '}
                {z.nichtAngetreten.map((sub, i) => {
                  const p = ctx.person(sub);
                  return (
                    <Fragment key={sub}>
                      {i > 0 && ', '}
                      {p ? <Name p={p} /> : 'Person offen'}
                    </Fragment>
                  );
                })}
              </Text>
            )}
            {z.offen ? (
              <Text style={stile.warnung}>Noch offen: Stichwahl nötig</Text>
            ) : (
              z.gewaehlt.length > 0 && (
                <Text>
                  {'Gewählt: '}
                  <Liste personen={z.gewaehlt} ctx={ctx} />
                </Text>
              )
            )}
            {z.abgelehnt.length > 0 && (
              <Text>
                {'Nimmt die Wahl nicht an: '}
                <Liste personen={z.abgelehnt} ctx={ctx} />
              </Text>
            )}
            {(z.anwesend || z.nichtBeschlussfaehig) && (
              <Text>
                {z.anwesend}
                {z.nichtBeschlussfaehig && (
                  <Text style={stile.warnung}> – nicht beschlussfähig</Text>
                )}
              </Text>
            )}
          </Kasten>,
        ),
      ];
    }
    case 'bausteinAufnahme': {
      const z = aufnahmeZeilen(daten, ctx.verlauf.bausteine[id]);
      const p = z.sub ? ctx.person(z.sub) : null;
      return [
        ueberschrift(
          k,
          ctx,
          <>
            {'Aufnahme'}
            {p ? (
              <>
                {': '}
                <Name p={p} />
              </>
            ) : (
              z.name && `: ${z.name}`
            )}
          </>,
        ),
        ...(z.wiederholung ? [block(<Klein>{z.wiederholung}</Klein>)] : []),
        block(
          <View style={stile.absatz}>
            <Stimmzeilen stimmen={z.stimmen} anwesend={z.anwesend} nicht={z.nichtBeschlussfaehig} />
          </View>,
        ),
        ...notizen(k.content, ctxIn),
      ];
    }
    case 'bausteinEm': {
      const z = emZeilen(daten, ctx.verlauf.bausteine[id]);
      const p = z.sub ? ctx.person(z.sub) : null;
      return [
        ueberschrift(
          k,
          ctx,
          <>
            {'Neues EM'}
            {p ? (
              <>
                {': '}
                <Name p={p} />
              </>
            ) : (
              z.name && `: ${z.name}`
            )}
          </>,
        ),
        ...(z.wiederholung ? [block(<Klein>{z.wiederholung}</Klein>)] : []),
        ...(z.abstimmung
          ? [
              block(
                <Absatz>
                  {z.abstimmung}
                  {z.nichtBeschlussfaehig && (
                    <Text style={stile.warnung}> – nicht beschlussfähig</Text>
                  )}
                </Absatz>,
              ),
            ]
          : []),
        ...notizen(k.content, ctxIn),
      ];
    }
    case 'bausteinAnwesenheit': {
      const z = anwesenheitZeile(daten, art, ctx.verlauf.bausteine[id]);
      if (!z) return [];
      const p = ctx.person(z.sub);
      return [
        block(
          <View style={stile.anwesenheit} wrap={false}>
            <Text>
              {p ? <Name p={p} /> : null}
              {z.nach}
            </Text>
            {z.wechsel && <Text>{z.wechsel}</Text>}
          </View>,
        ),
      ];
    }
    default:
      return (k.content ?? []).flatMap((c) => textBloecke(c, ctx));
  }
}

function Namen({ liste }: Readonly<{ liste: Person[] }>) {
  return (
    <>
      {liste.map((p, i) => (
        <Fragment key={p.sub}>
          {i > 0 && ', '}
          <Name p={p} />
          {p.zusatz && ` ${p.zusatz}`}
        </Fragment>
      ))}
    </>
  );
}

const Zeile = ({ label, children }: Readonly<{ label: string; children?: ReactNode }>) => (
  <Text style={stile.zeile}>
    <Text style={stile.fett}>{label}</Text>
    {children ? <> {children}</> : null}
  </Text>
);

/** The whole document as blocks in reading order. */
export function pdfBloecke(eingabe: DokumentEingabe): Block[] {
  const kopf = dokumentKopf(eingabe);
  const art = eingabe.sitzung.art;
  const verlauf = anwesenheitsVerlauf(eingabe.inhalt, {
    art,
    teilnahme: eingabe.teilnahme,
    ems: eingabe.ems.filter((m) => m.ausgewaehlt),
  });
  const alle = alleMitglieder(eingabe);
  const { eintraege, ids } = dokumentUeberschriften(eingabe.inhalt, (sub) => {
    const m = alle.find((x) => x.sub === sub);
    return m ? personName(m) : null;
  });
  const ctx: Kontext = {
    eingabe,
    verlauf,
    ids,
    titel: new Map(eintraege.map((e) => [e.id, e.text])),
    ebene: 1,
    person: (sub) => {
      const m = alle.find((x) => x.sub === sub);
      return m ? { sub, name: personName(m), status: m.status, zusatz: '' } : null;
    },
  };
  const satz = eroeffnungSatz(art, kopf.leitung !== null, kopf.eroeffnung);
  const bf = kopf.beschlussfaehigkeit
    ? beschlussfaehigkeitText(art, kopf.beschlussfaehigkeit)
    : null;
  const naechste = naechsteSitzungSatz(
    naechsteSitzungWert(eingabe.kopf, eingabe.naechsteSitzungVorschlag),
  );
  const emsVorhanden = kopf.ems.length > 0 || kopf.emsFreitext !== '';

  const bloecke: Block[] = [
    block(<Text style={stile.titel}>{kopf.titel}</Text>),
    block(
      <View>
        <Zeile label="Anwesende Mitglieder:">
          <Namen liste={kopf.anwesende} />
        </Zeile>
        <Zeile label="Fehlende Mitglieder (entschuldigt):">
          <Namen liste={kopf.entschuldigt} />
        </Zeile>
        <Zeile label="Fehlende Mitglieder (unentschuldigt):">
          <Namen liste={kopf.unentschuldigt} />
        </Zeile>
        {emsVorhanden && (
          <Zeile label="EMs:">
            <Namen liste={kopf.ems} />
            {kopf.ems.length > 0 && kopf.emsFreitext && ', '}
            {kopf.emsFreitext}
          </Zeile>
        )}
        {kopf.anwaerter.length > 0 && (
          <Zeile label="Anwärter:innen:">
            <Namen liste={kopf.anwaerter} />
          </Zeile>
        )}
        {kopf.gaeste && <Zeile label="Gäste:">{kopf.gaeste}</Zeile>}
        <View style={stile.luecke} />
        <Zeile label="Sitzungsleitung:">{kopf.leitung && <Name p={kopf.leitung} />}</Zeile>
        <Zeile label="Protokoll:">{kopf.protokoll && <Name p={kopf.protokoll} />}</Zeile>
        <View style={stile.luecke} />
        {satz && (
          <Text style={stile.zeile}>
            {kopf.leitung && <Name p={kopf.leitung} />}
            {satz}
          </Text>
        )}
        {bf && (
          <Text style={stile.zeile}>
            {`${bf.fakten} `}
            {kopf.beschlussfaehigkeit?.beschlussfaehig ? (
              bf.urteil
            ) : (
              <Text style={stile.warnung}>{bf.urteil}</Text>
            )}
          </Text>
        )}
      </View>,
    ),
  ];

  for (const a of eingabe.inhalt.content) {
    const abschnittArt = a.attrs?.art as keyof typeof ABSCHNITT_TITEL;
    const titel = ABSCHNITT_TITEL[abschnittArt] ?? '';
    const inhalt = ohneLeereEnden(a.content).filter(
      (c, i, alle2) => !(istLeererAbsatz(c) && alle2.length === 1),
    );
    // "Sonstiges" is optional: it only shows with content.
    if (abschnittArt === 'sonstiges' && inhalt.length === 0) continue;
    if (titel) {
      bloecke.push({
        ebene: 1,
        titel,
        element: (
          <Text style={stile.h1} minPresenceAhead={60}>
            {titel}
          </Text>
        ),
      });
    }
    for (const c of inhalt) {
      bloecke.push(...(BAUSTEINE.has(c.type) ? bausteinBloecke(c, ctx) : textBloecke(c, ctx)));
    }
  }
  if (naechste) bloecke.push(block(<Absatz stil={{ marginTop: 10 }}>{naechste}</Absatz>));
  return bloecke;
}

export interface BlockBaumKnoten {
  block: Block;
  kinder: BlockBaumKnoten[];
}

/** Nests the blocks by heading level: a heading contains the blocks up to the next heading of its level or higher. */
export function blockBaum(bloecke: readonly Block[]): BlockBaumKnoten[] {
  const wurzeln: BlockBaumKnoten[] = [];
  const stapel: BlockBaumKnoten[] = [];
  for (const b of bloecke) {
    const knoten: BlockBaumKnoten = { block: b, kinder: [] };
    if (b.ebene) {
      while (stapel.length > 0 && stapel[stapel.length - 1]!.block.ebene! >= b.ebene) stapel.pop();
    }
    const eltern = stapel[stapel.length - 1];
    (eltern ? eltern.kinder : wurzeln).push(knoten);
    if (b.ebene) stapel.push(knoten);
  }
  return wurzeln;
}

/** Outline of the blocks as nested titles (what the PDF bookmarks show). */
export interface Lesezeichen {
  titel: string;
  kinder: Lesezeichen[];
}

export function lesezeichen(baum: readonly BlockBaumKnoten[]): Lesezeichen[] {
  return baum.flatMap((k): Lesezeichen[] => {
    const kinder = lesezeichen(k.kinder);
    return k.block.ebene && k.block.titel ? [{ titel: k.block.titel, kinder }] : kinder;
  });
}
