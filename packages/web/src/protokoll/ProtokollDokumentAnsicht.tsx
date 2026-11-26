import { createElement, Fragment, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  anwesenheitsVerlauf,
  eventUeberschrift,
  bausteinAnwaerterDatenSchema,
  bausteinEventDatenSchema,
  bausteinThemaDatenSchema,
  bausteinVergangenesEventDatenSchema,
  BAUSTEIN_TYPEN,
  BILD_AUSRICHTUNGEN,
  BILD_BREITEN,
  erwaehnungAttrs,
  erwaehnungBetrifft,
  istBausteinInNotizen,
  vergangenesUeberschrift,
  type ProtokollKnoten,
} from '@c4/shared';
import { mitgliedLink } from '../mitglied';
import { Text } from '@mantine/core';
import { StatusName } from '../StatusAnzeige';
import './dokumentAnsicht.css';
import { erwaehnungText, meineErwaehnungen } from './erwaehnungLogik';
import {
  alleMitglieder,
  anwesenheitZeile,
  aufnahmeZeilen,
  beschlussZeilen,
  meinungsbildZeilen,
  emZeilen,
  auswahlZeilen,
  wahlAbschnitte,
  wahlZeilen,
  type WahlKandidat,
  beschlussfaehigkeitText,
  dokumentKopf,
  eroeffnungSatz,
  istBlockPunkt,
  istLeereListe,
  istLeererAbsatz,
  istLeererPunkt,
  istQuellenzeile,
  naechsteSitzungSatz,
  naechsteSitzungWert,
  ohneLeereEnden,
  personName,
  dokumentPerson,
  todoZeile,
  type DokumentEingabe,
  type Person,
} from './dokumentDaten';
import { ABSCHNITT_TITEL } from './schema';
import { bausteinKategorie } from './kategorieNamen';
import { bildNummern, bildUnterschrift } from './bildNummern';
import { hatBilder, notizAbschnitte } from './notizAbschnitte';
import { DokumentRahmen } from './DokumentGliederung';
import {
  dokumentUeberschriften,
  eigeneUeberschriftSchritte,
  ueberschriftTag,
  unterEbene,
} from './dokumentUeberschriften';

type Verlauf = ReturnType<typeof anwesenheitsVerlauf>;

interface Kontext {
  eingabe: DokumentEingabe;
  verlauf: Verlauf;
  person: (sub: string) => Person | null;
  /** Anchor ids of the headings (see `dokumentUeberschriften`). */
  ids: Map<ProtokollKnoten, string>;
  /** Anchor ids of the @mentions that concern the viewer (see `meineErwaehnungen`). */
  erwIds: Map<ProtokollKnoten, string>;
  /** Level of the enclosing heading (1 = section, 2 = top-level Baustein, ...; see `MAX_EBENE`). */
  ebene: number;
  /** Figure numbers of the images with a description (see `bildNummern`). */
  bildNr: ReadonlyMap<ProtokollKnoten, number>;
}

/** A heading element of the given level (`h2`..`h6`), styled by `pk-dok-h<level>`. */
function Ueberschrift({
  ebene,
  id,
  children,
}: Readonly<{ ebene: number; id: string | undefined; children: ReactNode }>) {
  return createElement(
    ueberschriftTag(ebene),
    { className: `pk-dok-h${Math.min(ebene, 5)}`, id },
    children,
  );
}

const SICHERE_LINKS = /^(https?:|mailto:|tel:)/i;

function Marken({ k }: Readonly<{ k: ProtokollKnoten }>) {
  let inhalt: ReactNode = k.text ?? '';
  for (const m of k.marks ?? []) {
    if (m.type === 'bold') inhalt = <strong>{inhalt}</strong>;
    else if (m.type === 'italic') inhalt = <em>{inhalt}</em>;
    else if (m.type === 'link') {
      const href = typeof m.attrs?.href === 'string' ? m.attrs.href : '';
      if (SICHERE_LINKS.test(href)) {
        inhalt = (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {inhalt}
          </a>
        );
      }
    }
  }
  return <>{inhalt}</>;
}

/**
 * The children of a node. A Todo has no block of its own: it is a bullet of the surrounding notes
 * (`TodoPunkt`). Todos directly behind a bullet list (or each other) join that list, so they look like
 * its further items; behind a paragraph they open a list of their own.
 */
function Kinder({ liste, ctx }: Readonly<{ liste: ProtokollKnoten[] | undefined; ctx: Kontext }>) {
  const alle = liste ?? [];
  const inhalt: ReactNode[] = [];
  for (let i = 0; i < alle.length; i++) {
    const k = alle[i]!;
    const schluessel = k.attrs?.id ? String(k.attrs.id) : i;
    const istListe = k.type === 'bulletList';
    if (!istListe && k.type !== 'bausteinTodo') {
      inhalt.push(<Knoten key={schluessel} k={k} ctx={ctx} />);
      continue;
    }
    // A bullet list and the Todos right behind it, or a run of Todos: one list.
    const todos: ProtokollKnoten[] = [];
    while (alle[i + 1]?.type === 'bausteinTodo') todos.push(alle[++i]!);
    if (!istListe || todos.length > 0) {
      inhalt.push(
        <ul key={schluessel}>
          {istListe ? <Kinder liste={k.content} ctx={ctx} /> : <TodoPunkt k={k} ctx={ctx} />}
          {todos.map((t, j) => (
            <TodoPunkt key={t.attrs?.id ? String(t.attrs.id) : `t${j}`} k={t} ctx={ctx} />
          ))}
        </ul>,
      );
    } else {
      inhalt.push(<Knoten key={schluessel} k={k} ctx={ctx} />);
    }
  }
  return <>{inhalt}</>;
}

/**
 * A Todo as a bullet of the surrounding notes: "Todo: Titel – Anna, Ben, @Alle (bis 14.11.2026)", its notes
 * as bullets one level deeper. No block or box; the highlighter on my name or group is the only emphasis.
 */
function TodoPunkt({ k, ctx }: Readonly<{ k: ProtokollKnoten; ctx: Kontext }>) {
  const daten: unknown = k.attrs?.daten;
  const z = todoZeile(daten);
  const notizen = ohneLeereEnden(k.content).filter(
    (c) => c.type !== 'paragraph' || (c.content?.length ?? 0) > 0,
  );
  return (
    <li>
      <strong>Todo:</strong> {z.titel || 'Ohne Titel'}
      {z.zustaendig.length > 0 && (
        <>
          {' – '}
          <TodoZustaendige k={k} daten={daten} ctx={ctx} />
        </>
      )}
      {z.bis && ` (bis ${z.bis})`}
      {notizen.length > 0 && (
        <ul>
          {notizen.map((c, i) => {
            if (c.type === 'bulletList' || c.type === 'orderedList') {
              return <Kinder key={i} liste={c.content} ctx={ctx} />;
            }
            return (
              <li key={i}>
                <Kinder liste={c.type === 'paragraph' ? c.content : [c]} ctx={ctx} />
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * An @mention: a person as a link in the color of their status, a group as text. When it concerns the
 * viewer (the person, or a group of their current status) it is highlighted and gets an anchor id.
 */
function Erwaehnung({ k, ctx }: Readonly<{ k: ProtokollKnoten; ctx: Kontext }>) {
  const attrs = erwaehnungAttrs(k.attrs);
  if (!attrs) return <>@</>;
  const ich = ctx.eingabe.ich;
  const betrifft = !!ich && erwaehnungBetrifft(attrs, ich);
  const m = attrs.art === 'person' && attrs.sub ? ctx.person(attrs.sub) : null;
  const mitglied = m ? alleMitglieder(ctx.eingabe).find((x) => x.sub === m.sub) : undefined;
  let inhalt: ReactNode;
  if (attrs.art === 'person') {
    if (m && mitglied) {
      inhalt = (
        <Link to={mitgliedLink(mitglied)} style={{ textDecoration: 'none' }}>
          {m.farblos ? `@${m.name}` : <StatusName status={m.status}>{`@${m.name}`}</StatusName>}
        </Link>
      );
    } else {
      inhalt = (
        <Text component="span" c="dimmed">
          {erwaehnungText(attrs, () => null)}
        </Text>
      );
    }
  } else {
    inhalt = erwaehnungText(attrs, () => null);
  }
  if (!betrifft) return <>{inhalt}</>;
  return (
    <mark className="pk-dok-erw-ich" id={ctx.erwIds.get(k)} data-testid="erwaehnung-ich">
      {inhalt}
    </mark>
  );
}

/** A block of free text; unknown nodes render their children. */
function Knoten({ k, ctx }: Readonly<{ k: ProtokollKnoten; ctx: Kontext }>) {
  switch (k.type) {
    case 'text':
      return <Marken k={k} />;
    case 'hardBreak':
      return <br />;
    case 'erwaehnung':
      return <Erwaehnung k={k} ctx={ctx} />;
    case 'paragraph':
      return (
        <p>
          <Kinder liste={k.content} ctx={ctx} />
        </p>
      );
    case 'heading': {
      // Relative to the enclosing heading: one and two levels below it.
      return (
        <Ueberschrift
          ebene={unterEbene(ctx.ebene, eigeneUeberschriftSchritte(k.attrs?.level))}
          id={ctx.ids.get(k)}
        >
          <Kinder liste={k.content} ctx={ctx} />
        </Ueberschrift>
      );
    }
    case 'bulletList':
      if (istLeereListe(k)) return null;
      return (
        <ul>
          <Kinder liste={k.content} ctx={ctx} />
        </ul>
      );
    case 'orderedList':
      if (istLeereListe(k)) return null;
      return (
        <ol>
          <Kinder liste={k.content} ctx={ctx} />
        </ol>
      );
    case 'listItem':
      // Empty items (the place to continue after a block) are never shown; a block-only item has no bullet.
      if (istLeererPunkt(k)) return null;
      if (istBlockPunkt(k)) {
        return (
          <li className="pk-dok-ohne-punkt">
            <Kinder liste={k.content?.slice(1)} ctx={ctx} />
          </li>
        );
      }
      return (
        <li>
          <Kinder liste={k.content} ctx={ctx} />
        </li>
      );
    case 'blockquote':
      return (
        <blockquote>
          {(k.content ?? []).map((c, i) =>
            c.type === 'paragraph' ? (
              <p key={i} className={istQuellenzeile(c) ? 'pk-dok-quelle' : undefined}>
                <Kinder liste={c.content} ctx={ctx} />
              </p>
            ) : (
              <Knoten key={i} k={c} ctx={ctx} />
            ),
          )}
        </blockquote>
      );
    case 'protokollBild':
      // Only reached at section level: images in notes are set beside the text (see `Notizen`).
      return <BildFigur k={k} ctx={ctx} />;
    case 'bausteinThema':
      // A Thema inside the notes of another Baustein (a heading one level below it).
      return <Baustein k={k} ctx={ctx} innen />;
    case 'bausteinBeschluss':
    case 'bausteinMeinungsbild':
    case 'bausteinWahl':
    case 'bausteinAuswahl':
      // An Abstimmung / Meinungsbild / Wahl inside the free text of another Baustein.
      return (
        <div className="pk-dok-innen">
          <Baustein k={k} ctx={ctx} innen />
        </div>
      );
    case 'bausteinAnwesenheit':
      // erscheint / geht inside the notes of a Baustein (or in a list item of them).
      return <Baustein k={k} ctx={ctx} innen />;
    case 'bausteinTodo':
      // A Todo is a bullet of the notes it stands in (see `Kinder`); alone it gets a list of its own.
      return (
        <ul>
          <TodoPunkt k={k} ctx={ctx} />
        </ul>
      );
    default:
      return <Kinder liste={k.content} ctx={ctx} />;
  }
}

/** A text block list with an optional item merged into a leading bullet list. */
function TextBloecke({
  liste,
  ctx,
  vorne,
}: Readonly<{ liste: ProtokollKnoten[]; ctx: Kontext; vorne?: ReactNode }>) {
  const [erstes, ...rest] = liste;
  if (vorne && erstes?.type === 'bulletList') {
    // Todos right behind the list are further items of it (see `Kinder`).
    const anzahl = rest.findIndex((k) => k.type !== 'bausteinTodo');
    const todos = anzahl < 0 ? rest : rest.slice(0, anzahl);
    return (
      <>
        <ul>
          <li>{vorne}</li>
          <Kinder liste={erstes.content} ctx={ctx} />
          {todos.map((t, j) => (
            <TodoPunkt key={t.attrs?.id ? String(t.attrs.id) : `t${j}`} k={t} ctx={ctx} />
          ))}
        </ul>
        <Kinder liste={rest.slice(todos.length)} ctx={ctx} />
      </>
    );
  }
  return (
    <>
      {vorne && (
        <ul>
          <li>{vorne}</li>
        </ul>
      )}
      <Kinder liste={liste} ctx={ctx} />
    </>
  );
}

/**
 * The free text of a Baustein or section; `vorne` is an item merged into a leading bullet list. With
 * images, the notes are split at nested Bausteine (`notizAbschnitte`): each piece of text that has images
 * is a grid with the text on the left and the images stacked in a column on the right.
 */
function Notizen({
  knoten,
  ctx,
  vorne,
}: Readonly<{ knoten: ProtokollKnoten[] | undefined; ctx: Kontext; vorne?: ReactNode }>) {
  const liste = ohneLeereEnden(knoten);
  if (!hatBilder(liste)) return <TextBloecke liste={liste} ctx={ctx} vorne={vorne} />;
  const abschnitte = notizAbschnitte(liste);
  return (
    <>
      {vorne && abschnitte[0]?.art !== 'text' && <TextBloecke liste={[]} ctx={ctx} vorne={vorne} />}
      {abschnitte.map((a, i) => {
        const key = a.art === 'baustein' ? String(a.knoten.attrs?.id ?? i) : i;
        if (a.art === 'baustein') return <Knoten key={key} k={a.knoten} ctx={ctx} />;
        const text = ohneLeereEnden(a.knoten);
        const mitVorne = i === 0 ? vorne : undefined;
        if (a.bilder.length === 0) {
          return <TextBloecke key={key} liste={text} ctx={ctx} vorne={mitVorne} />;
        }
        return (
          <div key={key} className="pk-dok-notiz-bilder">
            <div className="pk-dok-notiz-text">
              <TextBloecke liste={text} ctx={ctx} vorne={mitVorne} />
            </div>
            <div className="pk-dok-notiz-spalte">
              {a.bilder.map((b, j) => (
                <BildFigur key={j} k={b} ctx={ctx} spalte />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

/**
 * An image with its description as a small caption. At section level it has its own row with the width
 * and position of the node; `spalte`: in the image column beside the notes (always the column's width).
 */
function BildFigur({
  k,
  ctx,
  spalte = false,
}: Readonly<{ k: ProtokollKnoten; ctx: Kontext; spalte?: boolean }>) {
  const schluessel = typeof k.attrs?.schluessel === 'string' ? k.attrs.schluessel : '';
  const beschreibung = typeof k.attrs?.beschreibung === 'string' ? k.attrs.beschreibung : '';
  const breite = (BILD_BREITEN as readonly unknown[]).includes(k.attrs?.breite)
    ? (k.attrs?.breite as string)
    : 'voll';
  const ausrichtung = (BILD_AUSRICHTUNGEN as readonly unknown[]).includes(k.attrs?.ausrichtung)
    ? (k.attrs?.ausrichtung as string)
    : 'mitte';
  const nummer = ctx.bildNr.get(k);
  const url = ctx.eingabe.bilder?.[schluessel];
  // One refresh per image: the URL may have expired.
  const erneuert = useRef(false);
  return (
    <figure
      className={spalte ? 'pk-dok-bild pk-dok-bild-spalte' : 'pk-dok-bild'}
      data-breite={spalte ? undefined : breite}
      data-ausrichtung={spalte ? undefined : ausrichtung}
      data-testid="dokument-bild"
    >
      {url ? (
        <img
          src={url}
          alt={beschreibung}
          loading="lazy"
          onError={() => {
            if (erneuert.current) return;
            erneuert.current = true;
            ctx.eingabe.bilderErneuern?.();
          }}
        />
      ) : (
        <p className="pk-dok-klein">Bild nicht verfügbar</p>
      )}
      {nummer !== undefined && (
        <figcaption className="pk-dok-klein">{bildUnterschrift(nummer, beschreibung)}</figcaption>
      )}
    </figure>
  );
}

function PersonName({ p }: Readonly<{ p: Person }>) {
  if (p.farblos) return <>{p.name}</>;
  return <StatusName status={p.status}>{p.name}</StatusName>;
}

/** The vote line and the quorum line ("(13 von 25 Mitgliedern anwesend) – nicht beschlussfähig"). */
function Stimmzeilen({
  stimmen,
  anwesend,
  nicht,
}: Readonly<{ stimmen: string; anwesend: string; nicht: boolean }>) {
  return (
    <>
      {stimmen && <p>{stimmen}</p>}
      {(anwesend || nicht) && (
        <p>
          {anwesend}
          {nicht && <span className="pk-dok-warnung"> – nicht beschlussfähig</span>}
        </p>
      )}
    </>
  );
}

/** "A 5 · B 3 · Enthaltung 1" with the persons in the color of their status. */
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
          <WahlName k={k} ctx={ctx} /> {k.stimmen}
        </Fragment>
      ))}
      {kandidaten.length > 0 && ' · '}Enthaltung {enthaltung}
    </>
  );
}

/** "Anna, Ben, @Alle" of a Todo; those who concern the viewer get the highlighter (the first one the anchor). */
function TodoZustaendige({
  k,
  daten,
  ctx,
}: Readonly<{ k: ProtokollKnoten; daten: unknown; ctx: Kontext }>) {
  const z = todoZeile(daten);
  const ich = ctx.eingabe.ich;
  const anker = ctx.erwIds.get(k);
  const betrifftMich = (zu: (typeof z.zustaendig)[number]) => !!ich && erwaehnungBetrifft(zu, ich);
  const ersteTreffer = z.zustaendig.findIndex(betrifftMich);
  return (
    <>
      {z.zustaendig.map((zu, i) => {
        const p = zu.art === 'person' ? ctx.person(zu.sub) : null;
        const inhalt =
          zu.art === 'gruppe' ? (
            erwaehnungText({ art: 'gruppe', gruppe: zu.gruppe }, () => null)
          ) : p ? (
            <PersonName p={p} />
          ) : (
            'Person offen'
          );
        const betrifft = betrifftMich(zu);
        const id = i === ersteTreffer ? anker : undefined;
        return (
          <Fragment key={zu.art === 'person' ? `p${zu.sub}` : `g${zu.gruppe}`}>
            {i > 0 && ', '}
            {betrifft ? (
              <mark className="pk-dok-erw-ich" id={id} data-testid="erwaehnung-ich">
                {inhalt}
              </mark>
            ) : (
              inhalt
            )}
          </Fragment>
        );
      })}
    </>
  );
}

function WahlName({ k, ctx }: Readonly<{ k: WahlKandidat; ctx: Kontext }>) {
  const p = k.sub ? ctx.person(k.sub) : null;
  return p ? <PersonName p={p} /> : <>{k.name || 'Person offen'}</>;
}

/** `innen`: inside the notes of another Baustein (Abstimmung / Wahl then get no heading of their own). */
function Baustein({
  k,
  ctx,
  innen = false,
}: Readonly<{ k: ProtokollKnoten; ctx: Kontext; innen?: boolean }>) {
  const daten: unknown = k.attrs?.daten;
  const id = typeof k.attrs?.id === 'string' ? k.attrs.id : '';
  const art = ctx.eingabe.sitzung.art;
  // Heading level of this Baustein; its notes (and the headings in them) sit below it. A vote has no
  // heading element when nested, so its notes stay at the level of the enclosing one.
  const h = unterEbene(ctx.ebene);
  const istAbstimmung = istBausteinInNotizen(k.type);
  const ctxIn: Kontext = { ...ctx, ebene: istAbstimmung && innen ? ctx.ebene : h };

  if (k.type === 'bausteinEvent') {
    const d = bausteinEventDatenSchema.safeParse(daten);
    const titel = d.success
      ? eventUeberschrift({
          ...d.data,
          kategorie: bausteinKategorie(k.type, d.data, ctx.eingabe.kategorien),
        })
      : '';
    const verantwortlich =
      d.success && d.data.verantwortlichSub ? ctx.person(d.data.verantwortlichSub) : null;
    return (
      <>
        <Ueberschrift ebene={h} id={ctx.ids.get(k)}>
          {titel || 'Event'}
        </Ueberschrift>
        <Notizen
          knoten={k.content}
          ctx={ctxIn}
          vorne={
            verantwortlich && (
              <>
                Verantwortlich:{' '}
                {ctx.erwIds.has(k) ? (
                  <mark
                    className="pk-dok-erw-ich"
                    id={ctx.erwIds.get(k)}
                    data-testid="erwaehnung-ich"
                  >
                    <PersonName p={verantwortlich} />
                  </mark>
                ) : (
                  <PersonName p={verantwortlich} />
                )}
              </>
            )
          }
        />
      </>
    );
  }
  if (k.type === 'bausteinThema') {
    const d = bausteinThemaDatenSchema.safeParse(daten);
    const titel = d.success ? d.data.titel.trim() : '';
    return (
      <>
        <Ueberschrift ebene={h} id={ctx.ids.get(k)}>
          {titel || 'Thema'}
        </Ueberschrift>
        <Notizen knoten={k.content} ctx={ctxIn} />
      </>
    );
  }
  if (k.type === 'bausteinVergangenesEvent') {
    const d = bausteinVergangenesEventDatenSchema.safeParse(daten);
    const titel = d.success
      ? vergangenesUeberschrift({
          ...d.data,
          kategorie: bausteinKategorie(k.type, d.data, ctx.eingabe.kategorien),
        })
      : '';
    return (
      <>
        <Ueberschrift ebene={h} id={ctx.ids.get(k)}>
          {titel || 'Vergangenes Event'}
        </Ueberschrift>
        <Notizen knoten={k.content} ctx={ctxIn} />
      </>
    );
  }
  if (k.type === 'bausteinAnwaerter') {
    const d = bausteinAnwaerterDatenSchema.safeParse(daten);
    const name = d.success ? `${d.data.vorname} ${d.data.nachname}`.trim() : '';
    return (
      <>
        <Ueberschrift ebene={h} id={ctx.ids.get(k)}>
          {`Neue:r Anwärter:in${name ? `: ${name}` : ''}`}
        </Ueberschrift>
        <Notizen knoten={k.content} ctx={ctxIn} />
      </>
    );
  }
  if (k.type === 'bausteinBeschluss') {
    const z = beschlussZeilen(daten, ctx.verlauf.bausteine[id]);
    return (
      <>
        {!innen && (
          // Styled like a heading but no heading element: votes stay out of the PDF outline.
          <div className={`pk-dok-h${Math.min(h, 5)}`}>
            {z.antrag ? `Abstimmung: ${z.antrag}` : 'Abstimmung'}
          </div>
        )}
        <div className="pk-dok-beschluss">
          {z.wiederholung && <p className="pk-dok-klein">{z.wiederholung}</p>}
          {innen && (
            <p>
              <strong>Abstimmung:</strong> {z.antrag}
            </p>
          )}
          <Stimmzeilen stimmen={z.stimmen} anwesend={z.anwesend} nicht={z.nichtBeschlussfaehig} />
        </div>
        <Notizen knoten={k.content} ctx={ctxIn} />
      </>
    );
  }
  if (k.type === 'bausteinMeinungsbild') {
    const z = meinungsbildZeilen(daten);
    return (
      <>
        <div className="pk-dok-beschluss">
          <p>
            <strong>Meinungsbild:</strong> {z.frage}
          </p>
          {z.optionen && <p>{z.optionen}</p>}
          <p className="pk-dok-klein">(nicht bindend)</p>
        </div>
        <Notizen knoten={k.content} ctx={ctxIn} />
      </>
    );
  }
  if (k.type === 'bausteinWahl') {
    const z = wahlZeilen(daten, ctx.verlauf.bausteine[id]);
    if (!z) return null;
    return (
      <>
        {!innen && (
          <div className={`pk-dok-h${Math.min(h, 5)}`}>
            {`Wahl${z.posten ? `: ${z.posten}` : ''}${z.plaetze ? ` (${z.plaetze})` : ''}`}
          </div>
        )}
        {/* The notes are the discussion before; the vote concludes the point. */}
        <Notizen knoten={k.content} ctx={ctxIn} />
        <div className="pk-dok-beschluss">
          {z.wiederholung && <p className="pk-dok-klein">{z.wiederholung}</p>}
          {innen && (
            <p>
              <strong>Wahl:</strong> {z.posten}
              {z.plaetze && ` (${z.plaetze})`}
            </p>
          )}
          {z.giltAb && <p>{z.giltAb}</p>}
          {z.kandidaten.length > 0 && (
            <p>
              Kandidat:innen:{' '}
              <WahlStimmen kandidaten={z.kandidaten} enthaltung={z.enthaltung} ctx={ctx} />
            </p>
          )}
          {z.stichwahlen.map((r, i) => (
            <p key={i}>
              Stichwahl:{' '}
              <WahlStimmen kandidaten={r.kandidaten} enthaltung={r.enthaltung} ctx={ctx} />
            </p>
          ))}
          {z.nichtAngetreten.length > 0 && (
            <p>
              Nicht angetreten:{' '}
              {z.nichtAngetreten.map((sub, i) => {
                const p = ctx.person(sub);
                return (
                  <Fragment key={sub}>
                    {i > 0 && ', '}
                    {p ? <PersonName p={p} /> : 'Person offen'}
                  </Fragment>
                );
              })}
            </p>
          )}
          {z.offen && <p className="pk-dok-warnung">Noch offen: Stichwahl nötig</p>}
          {wahlAbschnitte(z).map((a, i) =>
            a.art === 'abgelehnt' ? (
              <p key={i}>
                <WahlName k={a.person} ctx={ctx} /> nimmt die Wahl nicht an.
              </p>
            ) : (
              <p key={i}>
                Gewählt:{' '}
                {a.personen.map((g, j) => (
                  <Fragment key={g.id}>
                    {j > 0 && ', '}
                    <WahlName k={g} ctx={ctx} />
                  </Fragment>
                ))}
                {', '}
                {a.personen.map((g, j) => (
                  <Fragment key={g.id}>
                    {j > 0 && ', '}
                    <WahlName k={g} ctx={ctx} /> nimmt die Wahl an
                  </Fragment>
                ))}
                .
              </p>
            ),
          )}
          {(z.anwesend || z.nichtBeschlussfaehig) && (
            <p>
              {z.anwesend}
              {z.nichtBeschlussfaehig && (
                <span className="pk-dok-warnung"> – nicht beschlussfähig</span>
              )}
            </p>
          )}
        </div>
      </>
    );
  }
  if (k.type === 'bausteinAuswahl') {
    const z = auswahlZeilen(daten, ctx.verlauf.bausteine[id]);
    if (!z) return null;
    return (
      <>
        {!innen && (
          <div className={`pk-dok-h${Math.min(h, 5)}`}>
            {z.frage ? `Abstimmung: ${z.frage}` : 'Abstimmung'}
          </div>
        )}
        {/* The notes are the discussion before; the vote concludes the point. */}
        <Notizen knoten={k.content} ctx={ctxIn} />
        <div className="pk-dok-beschluss">
          {z.wiederholung && <p className="pk-dok-klein">{z.wiederholung}</p>}
          {innen && (
            <p>
              <strong>Abstimmung:</strong> {z.frage}
            </p>
          )}
          {z.anzahl && <p>{z.anzahl}</p>}
          {z.moeglichkeiten && <p>Möglichkeiten: {z.moeglichkeiten}</p>}
          {z.stichwahlen.map((r, i) => (
            <p key={i}>Stichwahl: {r}</p>
          ))}
          {z.offen ? (
            <p className="pk-dok-warnung">Noch offen: Stichwahl nötig</p>
          ) : (
            z.ergebnis && <p>Ergebnis: {z.ergebnis}</p>
          )}
          {(z.anwesend || z.nichtBeschlussfaehig) && (
            <p>
              {z.anwesend}
              {z.nichtBeschlussfaehig && (
                <span className="pk-dok-warnung"> – nicht beschlussfähig</span>
              )}
            </p>
          )}
        </div>
      </>
    );
  }
  if (k.type === 'bausteinAufnahme') {
    const z = aufnahmeZeilen(daten, ctx.verlauf.bausteine[id]);
    const p = z.sub ? ctx.person(z.sub) : null;
    return (
      <>
        <Ueberschrift ebene={h} id={ctx.ids.get(k)}>
          Aufnahme
          {p ? (
            <>
              : <PersonName p={p} />
            </>
          ) : (
            z.name && `: ${z.name}`
          )}
        </Ueberschrift>
        {z.wiederholung && <p className="pk-dok-klein">{z.wiederholung}</p>}
        <Stimmzeilen stimmen={z.stimmen} anwesend={z.anwesend} nicht={z.nichtBeschlussfaehig} />
        <Notizen knoten={k.content} ctx={ctxIn} />
      </>
    );
  }
  if (k.type === 'bausteinEm') {
    const z = emZeilen(daten, ctx.verlauf.bausteine[id]);
    const p = z.sub ? ctx.person(z.sub) : null;
    const antrag = z.antragSub ? ctx.person(z.antragSub) : null;
    return (
      <>
        <Ueberschrift ebene={h} id={ctx.ids.get(k)}>
          Austritt
          {p ? (
            <>
              : <PersonName p={p} />
            </>
          ) : (
            z.name && `: ${z.name}`
          )}
        </Ueberschrift>
        {z.wiederholung && <p className="pk-dok-klein">{z.wiederholung}</p>}
        {antrag && (
          <p>
            <PersonName p={antrag} /> beantragt die Ehrenmitgliedschaft
          </p>
        )}
        {z.abstimmung && (
          <p>
            {z.abstimmung}
            {z.nichtBeschlussfaehig && (
              <span className="pk-dok-warnung"> – nicht beschlussfähig</span>
            )}
          </p>
        )}
        <Notizen knoten={k.content} ctx={ctxIn} />
      </>
    );
  }
  if (k.type === 'bausteinAnwesenheit') {
    const z = anwesenheitZeile(daten, art, ctx.verlauf.bausteine[id]);
    if (!z) return null;
    const p = ctx.person(z.sub);
    return (
      <>
        <blockquote className="pk-dok-anwesenheit">
          <p>
            {p ? <PersonName p={p} /> : null}
            {z.nach}
          </p>
          {z.wechsel && <p>{z.wechsel}</p>}
        </blockquote>
      </>
    );
  }
  return <Kinder liste={k.content} ctx={ctx} />;
}

const BAUSTEINE = new Set<string>(BAUSTEIN_TYPEN);

function Abschnitt({ k, ctx }: Readonly<{ k: ProtokollKnoten; ctx: Kontext }>) {
  const art = k.attrs?.art as keyof typeof ABSCHNITT_TITEL;
  const titel = ABSCHNITT_TITEL[art] ?? '';
  const inhalt = ohneLeereEnden(k.content).filter(
    (c, i, alle) => !(istLeererAbsatz(c) && alle.length === 1),
  );
  // "Sonstiges" is optional: it only shows with content.
  if (art === 'sonstiges' && inhalt.length === 0) return null;
  return (
    <section>
      {titel && (
        <h2 className="pk-dok-h1" id={ctx.ids.get(k)}>
          {titel}
        </h2>
      )}
      {inhalt.map((c, i) =>
        BAUSTEINE.has(c.type) ? (
          <Baustein key={String(c.attrs?.id ?? i)} k={c} ctx={ctx} />
        ) : (
          <Knoten key={i} k={c} ctx={ctx} />
        ),
      )}
    </section>
  );
}

function Namen({ liste }: Readonly<{ liste: Person[] }>) {
  return (
    <>
      {liste.map((p, i) => (
        <Fragment key={p.sub}>
          {i > 0 && ', '}
          <PersonName p={p} />
          {p.zusatz && ` ${p.zusatz}`}
        </Fragment>
      ))}
    </>
  );
}

function Zeile({ label, children }: Readonly<{ label: string; children?: ReactNode }>) {
  return (
    <p>
      <span className="pk-dok-label">{label}</span>
      {children ? <> {children}</> : null}
    </p>
  );
}

/**
 * The finished document of the minutes: title, attendance lines, opening, quorum and the four
 * sections with the Bausteine as text. Everything is derived from the given (live) data.
 */
export function ProtokollDokumentAnsicht({
  eingabe,
  ohneGliederung = false,
}: Readonly<{
  eingabe: DokumentEingabe;
  /** Without the outline (aside / button), e.g. inside the preview drawer. */
  ohneGliederung?: boolean;
}>) {
  const kopf = dokumentKopf(eingabe);
  const art = eingabe.sitzung.art;
  const verlauf = anwesenheitsVerlauf(eingabe.inhalt, {
    art,
    teilnahme: eingabe.teilnahme,
    ems: eingabe.ems.filter((m) => m.ausgewaehlt),
    emsFreitext: eingabe.kopf.emsFreitext,
  });
  const alle = alleMitglieder(eingabe);
  const namen = (sub: string) => {
    const m = alle.find((x) => x.sub === sub);
    return m ? personName(m, eingabe.offiziell) : null;
  };
  const { eintraege, ids } = dokumentUeberschriften(eingabe.inhalt, namen, eingabe.kategorien);
  const meine = meineErwaehnungen(eingabe.inhalt, eingabe.ich, namen, eingabe.kategorien);
  const ctx: Kontext = {
    eingabe,
    verlauf,
    ids,
    erwIds: meine.ids,
    bildNr: bildNummern(eingabe.inhalt),
    ebene: 1,
    person: (sub) => {
      const m = alle.find((x) => x.sub === sub);
      return m ? dokumentPerson(m, eingabe.offiziell) : null;
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

  return (
    <DokumentRahmen
      ohneGliederung={ohneGliederung}
      eintraege={eintraege}
      erwaehnungen={meine.eintraege}
      zeigeErwaehnungen={!!eingabe.ich}
    >
      <article className="pk-dok" data-testid="protokoll-dokument">
        <h1 className="pk-dok-titel pk-dok-h1" style={{ marginTop: 0, fontWeight: 700 }}>
          {kopf.titel}
        </h1>
        <div className="pk-dok-kopf">
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
          <div className="pk-dok-luecke" />
          <Zeile label="Sitzungsleitung:">{kopf.leitung && <PersonName p={kopf.leitung} />}</Zeile>
          <Zeile label="Protokoll:">{kopf.protokoll && <PersonName p={kopf.protokoll} />}</Zeile>
          <div className="pk-dok-luecke" />
          {satz && (
            <p>
              {kopf.leitung && <PersonName p={kopf.leitung} />}
              {satz}
            </p>
          )}
          {bf && (
            <p>
              {bf.fakten}{' '}
              {kopf.beschlussfaehigkeit?.beschlussfaehig ? (
                bf.urteil
              ) : (
                <span className="pk-dok-warnung">{bf.urteil}</span>
              )}
            </p>
          )}
        </div>
        {eingabe.inhalt.content.map((a, i) => (
          <Abschnitt key={i} k={a} ctx={ctx} />
        ))}
        {naechste && <p data-testid="naechste-sitzung">{naechste}</p>}
      </article>
    </DokumentRahmen>
  );
}
