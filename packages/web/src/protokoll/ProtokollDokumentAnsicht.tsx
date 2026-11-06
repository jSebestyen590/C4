import { Fragment, type ReactNode } from 'react';
import {
  anwesenheitsVerlauf,
  eventUeberschrift,
  bausteinAnwaerterDatenSchema,
  bausteinEventDatenSchema,
  bausteinVergangenesEventDatenSchema,
  BAUSTEIN_TYPEN,
  vergangenesUeberschrift,
  type ProtokollKnoten,
} from '@c4/shared';
import { StatusName } from '../StatusAnzeige';
import './dokumentAnsicht.css';
import {
  anwesenheitZeile,
  aufnahmeZeilen,
  beschlussZeilen,
  meinungsbildZeilen,
  emZeilen,
  wahlZeilen,
  type WahlKandidat,
  beschlussfaehigkeitText,
  dokumentKopf,
  eroeffnungSatz,
  istLeererAbsatz,
  istQuellenzeile,
  naechsteSitzungSatz,
  naechsteSitzungWert,
  ohneLeereEnden,
  personName,
  type DokumentEingabe,
  type Person,
} from './dokumentDaten';
import { ABSCHNITT_TITEL } from './schema';
import { DokumentRahmen } from './DokumentGliederung';
import { dokumentUeberschriften } from './dokumentUeberschriften';

type Verlauf = ReturnType<typeof anwesenheitsVerlauf>;

interface Kontext {
  eingabe: DokumentEingabe;
  verlauf: Verlauf;
  person: (sub: string) => Person | null;
  /** Anchor ids of the headings (see `dokumentUeberschriften`). */
  ids: Map<ProtokollKnoten, string>;
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

function Kinder({ liste, ctx }: Readonly<{ liste: ProtokollKnoten[] | undefined; ctx: Kontext }>) {
  return (
    <>
      {(liste ?? []).map((k, i) => (
        <Knoten key={k.attrs?.id ? String(k.attrs.id) : i} k={k} ctx={ctx} />
      ))}
    </>
  );
}

/** A block of free text; unknown nodes render their children. */
function Knoten({ k, ctx }: Readonly<{ k: ProtokollKnoten; ctx: Kontext }>) {
  switch (k.type) {
    case 'text':
      return <Marken k={k} />;
    case 'hardBreak':
      return <br />;
    case 'paragraph':
      return (
        <p>
          <Kinder liste={k.content} ctx={ctx} />
        </p>
      );
    case 'heading': {
      const stufe = k.attrs?.level === 3 ? 'pk-dok-h3' : 'pk-dok-h2';
      const Tag = k.attrs?.level === 3 ? 'h5' : 'h4';
      return (
        <Tag className={stufe} id={ctx.ids.get(k)}>
          <Kinder liste={k.content} ctx={ctx} />
        </Tag>
      );
    }
    case 'bulletList':
      return (
        <ul>
          <Kinder liste={k.content} ctx={ctx} />
        </ul>
      );
    case 'orderedList':
      return (
        <ol>
          <Kinder liste={k.content} ctx={ctx} />
        </ol>
      );
    case 'listItem':
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
    case 'bausteinBeschluss':
    case 'bausteinMeinungsbild':
    case 'bausteinWahl':
      // An Abstimmung / Meinungsbild / Wahl inside the free text of another Baustein.
      return (
        <div className="pk-dok-innen">
          <Baustein k={k} ctx={ctx} />
        </div>
      );
    default:
      return <Kinder liste={k.content} ctx={ctx} />;
  }
}

/** The free text of a Baustein or section; `vorne` is an item merged into a leading bullet list. */
function Notizen({
  knoten,
  ctx,
  vorne,
}: Readonly<{ knoten: ProtokollKnoten[] | undefined; ctx: Kontext; vorne?: ReactNode }>) {
  const liste = ohneLeereEnden(knoten);
  const [erstes, ...rest] = liste;
  if (vorne && erstes?.type === 'bulletList') {
    return (
      <>
        <ul>
          <li>{vorne}</li>
          <Kinder liste={erstes.content} ctx={ctx} />
        </ul>
        <Kinder liste={rest} ctx={ctx} />
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

function PersonName({ p }: Readonly<{ p: Person }>) {
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

function WahlName({ k, ctx }: Readonly<{ k: WahlKandidat; ctx: Kontext }>) {
  const p = k.sub ? ctx.person(k.sub) : null;
  return p ? <PersonName p={p} /> : <>{k.name || 'Person offen'}</>;
}

function Baustein({ k, ctx }: Readonly<{ k: ProtokollKnoten; ctx: Kontext }>) {
  const daten: unknown = k.attrs?.daten;
  const id = typeof k.attrs?.id === 'string' ? k.attrs.id : '';
  const art = ctx.eingabe.sitzung.art;

  if (k.type === 'bausteinEvent') {
    const d = bausteinEventDatenSchema.safeParse(daten);
    const titel = d.success ? eventUeberschrift(d.data) : '';
    const verantwortlich =
      d.success && d.data.verantwortlichSub ? ctx.person(d.data.verantwortlichSub) : null;
    return (
      <>
        <h3 className="pk-dok-h2" id={ctx.ids.get(k)}>
          {titel || 'Event'}
        </h3>
        <Notizen
          knoten={k.content}
          ctx={ctx}
          vorne={
            verantwortlich && (
              <>
                Verantwortlich: @<PersonName p={verantwortlich} />
              </>
            )
          }
        />
      </>
    );
  }
  if (k.type === 'bausteinVergangenesEvent') {
    const d = bausteinVergangenesEventDatenSchema.safeParse(daten);
    const titel = d.success ? vergangenesUeberschrift(d.data) : '';
    return (
      <>
        <h3 className="pk-dok-h2" id={ctx.ids.get(k)}>
          {titel || 'Vergangenes Event'}
        </h3>
        <Notizen knoten={k.content} ctx={ctx} />
      </>
    );
  }
  if (k.type === 'bausteinAnwaerter') {
    const d = bausteinAnwaerterDatenSchema.safeParse(daten);
    const name = d.success ? `${d.data.vorname} ${d.data.nachname}`.trim() : '';
    return (
      <>
        <h3 className="pk-dok-h2" id={ctx.ids.get(k)}>
          {`Neue:r Anwärter:in${name ? `: ${name}` : ''}`}
        </h3>
        <Notizen knoten={k.content} ctx={ctx} />
      </>
    );
  }
  if (k.type === 'bausteinBeschluss') {
    const z = beschlussZeilen(daten, ctx.verlauf.bausteine[id]);
    return (
      <>
        <div className="pk-dok-beschluss">
          <p>
            <strong>Abstimmung:</strong> {z.antrag}
          </p>
          <Stimmzeilen stimmen={z.stimmen} anwesend={z.anwesend} nicht={z.nichtBeschlussfaehig} />
        </div>
        <Notizen knoten={k.content} ctx={ctx} />
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
        <Notizen knoten={k.content} ctx={ctx} />
      </>
    );
  }
  if (k.type === 'bausteinWahl') {
    const z = wahlZeilen(daten, ctx.verlauf.bausteine[id]);
    if (!z) return null;
    return (
      <>
        <div className="pk-dok-beschluss">
          <p>
            <strong>Wahl:</strong> {z.posten} ({z.plaetze})
          </p>
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
          {z.offen ? (
            <p className="pk-dok-warnung">Noch offen: Stichwahl nötig</p>
          ) : (
            z.gewaehlt.length > 0 && (
              <p>
                Gewählt:{' '}
                {z.gewaehlt.map((g, i) => (
                  <Fragment key={g.id}>
                    {i > 0 && ', '}
                    <WahlName k={g} ctx={ctx} />
                  </Fragment>
                ))}
              </p>
            )
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
        <Notizen knoten={k.content} ctx={ctx} />
      </>
    );
  }
  if (k.type === 'bausteinAufnahme') {
    const z = aufnahmeZeilen(daten, ctx.verlauf.bausteine[id]);
    const p = z.sub ? ctx.person(z.sub) : null;
    return (
      <>
        <h3 className="pk-dok-h2" id={ctx.ids.get(k)}>
          Aufnahme
          {p ? (
            <>
              : <PersonName p={p} />
            </>
          ) : (
            z.name && `: ${z.name}`
          )}
        </h3>
        <Stimmzeilen stimmen={z.stimmen} anwesend={z.anwesend} nicht={z.nichtBeschlussfaehig} />
        <Notizen knoten={k.content} ctx={ctx} />
      </>
    );
  }
  if (k.type === 'bausteinEm') {
    const z = emZeilen(daten, ctx.verlauf.bausteine[id]);
    const p = z.sub ? ctx.person(z.sub) : null;
    return (
      <>
        <h3 className="pk-dok-h2" id={ctx.ids.get(k)}>
          Neues EM
          {p ? (
            <>
              : <PersonName p={p} />
            </>
          ) : (
            z.name && `: ${z.name}`
          )}
        </h3>
        {z.abstimmung && (
          <p>
            {z.abstimmung}
            {z.nichtBeschlussfaehig && (
              <span className="pk-dok-warnung"> – nicht beschlussfähig</span>
            )}
          </p>
        )}
        <Notizen knoten={k.content} ctx={ctx} />
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
        </blockquote>
        {z.wechsel && (
          <p className={z.wechselBeschlussfaehig ? undefined : 'pk-dok-warnung'}>
            <strong>{z.wechsel}</strong>
          </p>
        )}
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
export function ProtokollDokumentAnsicht({ eingabe }: Readonly<{ eingabe: DokumentEingabe }>) {
  const kopf = dokumentKopf(eingabe);
  const art = eingabe.sitzung.art;
  const verlauf = anwesenheitsVerlauf(eingabe.inhalt, {
    art,
    teilnahme: eingabe.teilnahme,
    ems: eingabe.ems.filter((m) => m.ausgewaehlt),
  });
  const alle = [...eingabe.teilnahme, ...eingabe.ems];
  const { eintraege, ids } = dokumentUeberschriften(eingabe.inhalt, (sub) => {
    const m = alle.find((x) => x.sub === sub);
    return m ? personName(m) : null;
  });
  const ctx: Kontext = {
    eingabe,
    verlauf,
    ids,
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

  return (
    <DokumentRahmen eintraege={eintraege}>
      <article className="pk-dok" data-testid="protokoll-dokument">
        <h2 className="pk-dok-titel pk-dok-h1" style={{ marginTop: 0, fontWeight: 700 }}>
          {kopf.titel}
        </h2>
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
