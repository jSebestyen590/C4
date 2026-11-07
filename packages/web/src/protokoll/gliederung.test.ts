import Blockquote from '@tiptap/extension-blockquote';
import { getSchema } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { history, undo, undoDepth } from '@tiptap/pm/history';
import { EditorState, type Plugin } from '@tiptap/pm/state';
import type { Node as PmNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { bausteinErzeugen, type BausteinTyp, type ProtokollKnoten } from '@c4/shared';
import { BAUSTEIN_KNOTEN } from './BausteinKnoten';
import {
  bausteinInGliederungVerschieben,
  gliederungBauen,
  gliederungTitel,
  gliederungZeilen,
  gliederungZiel,
  type GliederungZiel,
} from './gliederung';
import { AbschnittKnoten, ProtokollAbsicherung, ProtokollDokumentKnoten } from './schema';

const schema = getSchema([
  ProtokollDokumentKnoten,
  AbschnittKnoten,
  StarterKit.configure({ document: false, blockquote: false, link: false }),
  Blockquote.extend({ content: 'paragraph+' }),
  ...BAUSTEIN_KNOTEN,
]);

const absatz = (text?: string): ProtokollKnoten =>
  text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' };
const baustein = (
  typ: BausteinTyp,
  id: string,
  daten: object,
  inhalt: ProtokollKnoten[] = [absatz()],
): ProtokollKnoten => {
  const b = bausteinErzeugen(typ, undefined, inhalt);
  return { ...b, attrs: { id, daten: { ...(b.attrs.daten as object), ...daten } } };
};
const event = (id: string, name: string, inhalt?: ProtokollKnoten[]) =>
  baustein('bausteinEvent', id, { name, datum: '2026-02-11' }, inhalt);
const abstimmung = (id: string, antrag: string) => baustein('bausteinBeschluss', id, { antrag });
const anwaerter = (id: string, vorname: string) =>
  baustein('bausteinAnwaerter', id, { vorname, nachname: 'X' });

const zustand = (...abschnitte: ProtokollKnoten[][]): EditorState => {
  const doc = schema.nodeFromJSON({
    type: 'doc',
    content: ['vergangenes', 'gegenwaertiges', 'zukuenftiges', 'sonstiges'].map((art, i) => ({
      type: 'abschnitt',
      attrs: { art },
      content: abschnitte[i] ?? [absatz()],
    })),
  });
  doc.check();
  return EditorState.create({ doc });
};

/** Compact form: sections joined by "|", text as "t", Bausteine as id, nested ones as id(kind kind). */
const form = (doc: PmNode): string => {
  const knoten = (k: PmNode): string => {
    if (k.type.name === 'paragraph') return k.content.size ? 't' : '_';
    const kinder = k.children.filter((c) => c.type.name.startsWith('baustein'));
    return `${k.attrs.id as string}${kinder.length ? `(${kinder.map(knoten).join(' ')})` : ''}`;
  };
  // The empty "Sonstiges" at the end is left out to keep the expectations short.
  const abschnitte = doc.children.map((a) => a.children.map(knoten).join(' '));
  if (abschnitte.length === 4 && abschnitte[3] === '_') abschnitte.pop();
  return abschnitte.join(' | ');
};
const verschieben = (s: EditorState, id: string, ziel: GliederungZiel) => {
  const tr = bausteinInGliederungVerschieben(s, id, ziel);
  if (!tr) return null;
  const neu = s.apply(tr);
  neu.doc.check();
  return form(neu.doc);
};

describe('gliederungBauen', () => {
  it('lists the Bausteine per section and nested ones below their parent, without free text', () => {
    const s = zustand(
      [absatz('x'), event('e1', 'Superbowl', [absatz(), abstimmung('a1', 'Mehr Bier'), absatz()])],
      [anwaerter('w1', 'Anna'), absatz('y'), absatz()],
    );
    const baum = gliederungBauen(s.doc);
    expect(baum.map((a) => a.titel)).toEqual([
      'Vergangenes',
      'Gegenwärtiges',
      'Zukünftiges',
      'Sonstiges',
    ]);
    expect(baum[0]!.eintraege.map((e) => e.titel)).toEqual(['11.02. Superbowl']);
    expect(baum[0]!.eintraege[0]!.kinder.map((e) => e.titel)).toEqual(['Abstimmung: Mehr Bier']);
    expect(baum[0]!.eintraege[0]!.kannEnthalten).toBe(true);
    expect(baum[0]!.eintraege[0]!.kinder[0]!.verschachtelbar).toBe(true);
    expect(baum[1]!.eintraege.map((e) => e.titel)).toEqual(['Anna X']);
    expect(baum[2]!.eintraege).toEqual([]);
    expect(baum[3]!.eintraege).toEqual([]);
  });
});

describe('gliederungBauen: Thema', () => {
  it('offers the notes row of a Thema and nests a Wahl in it', () => {
    const s = zustand([
      baustein('bausteinThema', 't1', { titel: 'Bar' }, [
        absatz(),
        baustein('bausteinWahl', 'w1', { posten: 'Kasse' }),
        absatz(),
      ]),
    ]);
    const e = gliederungBauen(s.doc)[0]!.eintraege[0]!;
    expect(e.titel).toBe('Bar');
    expect(e.kannEnthalten).toBe(true);
    // A Thema may itself stand in the notes of other Bausteine.
    expect(e.verschachtelbar).toBe(true);
    expect(e.kinder.map((k) => k.titel)).toEqual(['Wahl: Kasse']);
    const zeilen = gliederungZeilen(gliederungBauen(s.doc), null);
    expect(zeilen.some((z) => z.art === 'notizen' && z.elternId === 't1')).toBe(true);
  });
});

describe('gliederungBauen symbols', () => {
  it('gives Erscheint and Geht their own icon', () => {
    const s = zustand([
      baustein('bausteinAnwesenheit', 'a1', { art: 'erscheint' }, []),
      baustein('bausteinAnwesenheit', 'a2', { art: 'geht' }, []),
      absatz(),
    ]);
    const e = gliederungBauen(s.doc)[0]!.eintraege;
    expect(e.map((x) => x.symbol)).toEqual(['erscheint', 'geht']);
  });
});

describe('gliederungTitel', () => {
  it('names people and shortens long texts', () => {
    const name = (sub: string) => (sub === 's1' ? 'Mia' : undefined);
    expect(gliederungTitel('bausteinAnwesenheit', { art: 'geht', sub: 's1' }, name)).toBe(
      'Mia geht',
    );
    expect(gliederungTitel('bausteinAnwesenheit', { art: 'erscheint', sub: null }, name)).toBe(
      'Erscheint',
    );
    expect(gliederungTitel('bausteinWahl', { posten: 'Kassenwart' })).toBe('Wahl: Kassenwart');
    expect(gliederungTitel('bausteinAuswahl', { frage: 'Wohin?' })).toBe('Abstimmung: Wohin?');
    expect(gliederungTitel('bausteinAuswahl', { frage: '' })).toBe('Abstimmung');
    expect(gliederungTitel('bausteinEm', { sub: null, name: 'Karl' })).toBe('Neues EM: Karl');
    expect(gliederungTitel('bausteinAufnahme', { sub: 's1', name: '' }, name)).toBe(
      'Aufnahme: Mia',
    );
    expect(gliederungTitel('bausteinBeschluss', { antrag: '' })).toBe('Abstimmung');
    expect(gliederungTitel('bausteinEvent', { name: '', datum: null })).toBe('Event');
    expect(gliederungTitel('bausteinThema', { titel: ' Hausordnung ' })).toBe('Hausordnung');
    expect(gliederungTitel('bausteinThema', { titel: '' })).toBe('Thema');
    expect(gliederungTitel('bausteinTodo', { titel: ' Putzen ' })).toBe('Todo: Putzen');
    expect(gliederungTitel('bausteinTodo', { titel: '' })).toBe('Todo');
    const lang = gliederungTitel('bausteinBeschluss', { antrag: 'a'.repeat(200) });
    expect(lang.length).toBeLessThan(100);
    expect(lang.endsWith('…')).toBe(true);
  });
});

describe('gliederungZiel (flat drop index to target)', () => {
  const state = () =>
    zustand(
      [
        event('p', 'P', [absatz(), abstimmung('k1', '1'), abstimmung('k2', '2'), absatz()]),
        event('q', 'Q'),
        abstimmung('top', 'T'),
        absatz(),
      ],
      [absatz()],
      [anwaerter('d', 'D'), absatz()],
    );
  const baum = () => gliederungBauen(state().doc);
  const keys = (id: string | null) => gliederungZeilen(baum(), id).map((z) => z.key);
  const zu = (id: string | null) =>
    gliederungZeilen(baum(), id)
      .filter((z) => 'eingeklappt' in z && z.eingeklappt)
      .map((z) => z.key);
  /** Drops `id` directly above the row `vor` (null: at the very end) and returns the new document. */
  const vor = (id: string, vorKey: string | null) => {
    const rest = gliederungZeilen(baum(), id).filter((z) => z.key !== id);
    const i = vorKey === null ? rest.length : rest.findIndex((z) => z.key === vorKey);
    const z = gliederungZiel(gliederungZeilen(baum(), id), id, i);
    return z && verschieben(state(), id, z);
  };

  it('always has the same rows; only the collapsed ones differ', () => {
    const alle = [
      'abschnitt:0',
      'p',
      'k1',
      'k2',
      'notizen:p',
      'q',
      'notizen:q',
      'top',
      'abschnitt:1',
      'abschnitt:2',
      'd',
      'notizen:d',
      'abschnitt:3',
    ];
    for (const id of [null, 'p', 'q', 'top', 'k1', 'd']) expect(keys(id)).toEqual(alle);
    expect(zu(null)).toEqual(['notizen:p', 'notizen:q', 'notizen:d']);
    expect(zu('top')).toEqual([]);
    expect(zu('q')).toEqual(['notizen:p', 'notizen:q', 'notizen:d']);
    // A dragged parent collapses its nested rows.
    expect(zu('p')).toEqual(['k1', 'k2', 'notizen:p', 'notizen:q', 'notizen:d']);
  });
  it('never gives attendance a notes slot', () => {
    const b = gliederungBauen(
      zustand([
        baustein('bausteinAnwesenheit', 'w', { art: 'erscheint' }, []),
        abstimmung('top', 'T'),
        absatz(),
      ]).doc,
    );
    expect(gliederungZeilen(b, 'top').map((z) => z.key)).not.toContain('notizen:w');
  });
  it('nests before a nested row and at the end via the notes slot', () => {
    expect(vor('top', 'k1')).toBe('p(top k1 k2) q _ | _ | d _');
    expect(vor('top', 'k2')).toBe('p(k1 top k2) q _ | _ | d _');
    expect(vor('top', 'notizen:p')).toBe('p(k1 k2 top) q _ | _ | d _');
    expect(vor('top', 'notizen:q')).toBe('p(k1 k2) q(top) _ | _ | d _');
  });
  it('moves out of a parent to top-level and between parents', () => {
    expect(vor('k1', 'q')).toBe('p(k2) k1 q top _ | _ | d _');
    expect(vor('k1', 'abschnitt:1')).toBe('p(k2) q top k1 _ | _ | d _');
    expect(vor('k1', 'notizen:q')).toBe('p(k2) q(k1) top _ | _ | d _');
    expect(vor('k2', 'k1')).toBe('p(k2 k1) q top _ | _ | d _');
  });
  it('drops between sections: behind a header goes first, before a header goes last', () => {
    expect(vor('q', 'abschnitt:2')).toBe('p(k1 k2) top _ | q _ | d _');
    expect(vor('q', 'd')).toBe('p(k1 k2) top _ | _ | q d _');
    // The end of the list is the end of the last section, "Sonstiges".
    expect(vor('q', null)).toBe('p(k1 k2) top _ | _ | d _ | q _');
    expect(vor('d', 'abschnitt:1')).toBe('p(k1 k2) q top d _ | _ | _');
    expect(vor('d', 'p')).toBe('d p(k1 k2) q top _ | _ | _');
  });
  it('a non-nestable Baustein cannot nest: it lands right behind the parent', () => {
    expect(vor('q', 'k1')).toBeNull(); // already right behind its parent
    expect(vor('d', 'k2')).toBe('p(k1 k2) d q top _ | _ | _');
    expect(vor('d', 'k1')).toBe('p(k1 k2) d q top _ | _ | _');
  });
  it('keeps the four sections intact for any drop position', () => {
    for (const id of ['p', 'q', 'top', 'k1', 'd']) {
      const rows = gliederungZeilen(baum(), id);
      for (let i = 0; i < rows.length; i++) {
        const z = gliederungZiel(rows, id, i);
        if (!z) continue;
        const tr = bausteinInGliederungVerschieben(state(), id, z);
        if (tr) expect(state().apply(tr).doc.childCount).toBe(4);
      }
    }
  });
});

describe('bausteinInGliederungVerschieben', () => {
  const s = () =>
    zustand(
      [event('a', 'A'), absatz('x'), event('b', 'B'), event('c', 'C'), absatz()],
      [absatz()],
      [anwaerter('d', 'D'), absatz()],
    );

  it('reorders within a section, keeping the free text where it is', () => {
    expect(verschieben(s(), 'a', { abschnitt: 0, index: 1 })).toBe(
      't b a c _ | _ | d _'.replace('t b a c', 't b a c'),
    );
  });
  it('moves to the front and to the end', () => {
    expect(verschieben(s(), 'c', { abschnitt: 0, index: 0 })).toBe('c a t b _ | _ | d _');
    expect(verschieben(s(), 'a', { abschnitt: 0, index: 2 })).toBe('t b c a _ | _ | d _');
  });
  it('returns null when nothing changes', () => {
    expect(verschieben(s(), 'b', { abschnitt: 0, index: 1 })).toBeNull();
    expect(verschieben(s(), 'c', { abschnitt: 0, index: 2 })).toBeNull();
  });
  it('moves between sections, also into an empty one and before the trailing paragraph', () => {
    expect(verschieben(s(), 'a', { abschnitt: 1, index: 0 })).toBe('t b c _ | a _ | d _');
    expect(verschieben(s(), 'd', { abschnitt: 0, index: 1 })).toBe('a t d b c _ | _ | _');
    expect(verschieben(s(), 'b', { abschnitt: 2, index: 1 })).toBe('a t c _ | _ | d b _');
  });
  it('keeps one undo step', () => {
    const z = s();
    const tr = bausteinInGliederungVerschieben(z, 'a', { abschnitt: 1, index: 0 })!;
    expect(tr.steps.length).toBe(2);
  });

  describe('Notizen', () => {
    const n = () =>
      zustand(
        [
          event('p', 'P', [absatz(), abstimmung('k1', '1'), abstimmung('k2', '2'), absatz()]),
          event('q', 'Q'),
          abstimmung('top', 'T'),
          absatz(),
        ],
        [absatz()],
        [absatz()],
      );

    it('reorders nested Bausteine', () => {
      expect(verschieben(n(), 'k1', { elternId: 'p', index: 1 })).toBe('p(k2 k1) q top _ | _ | _');
    });
    it('moves a nested one into another Baustein and out to a section', () => {
      expect(verschieben(n(), 'k1', { elternId: 'q', index: 0 })).toBe('p(k2) q(k1) top _ | _ | _');
      expect(verschieben(n(), 'k1', { abschnitt: 1, index: 0 })).toBe('p(k2) q top _ | k1 _ | _');
    });
    it('moves a top-level Abstimmung into the Notizen', () => {
      expect(verschieben(n(), 'top', { elternId: 'p', index: 0 })).toBe('p(top k1 k2) q _ | _ | _');
      expect(verschieben(n(), 'top', { elternId: 'q', index: 0 })).toBe(
        'p(k1 k2) q(top) _ | _ | _',
      );
    });
    it('refuses what the schema does not allow', () => {
      // A non-nestable Baustein cannot go into Notizen.
      expect(verschieben(n(), 'q', { elternId: 'p', index: 0 })).toBeNull();
      // Nothing goes into an Abstimmung.
      expect(verschieben(n(), 'top', { elternId: 'k1', index: 0 })).toBeNull();
      expect(verschieben(n(), 'k2', { elternId: 'k1', index: 0 })).toBeNull();
      // Unknown ids.
      expect(verschieben(n(), 'zz', { abschnitt: 0, index: 0 })).toBeNull();
      expect(verschieben(n(), 'k1', { elternId: 'zz', index: 0 })).toBeNull();
    });
    it('carries the nested Bausteine along', () => {
      expect(verschieben(n(), 'p', { abschnitt: 2, index: 0 })).toBe('q top _ | _ | p(k1 k2) _');
    });
  });
});

describe('undo of a Gliederung move', () => {
  it('is one undo step with the history and the structure guard plugins', () => {
    const A = '11111111-1111-4111-8111-111111111111';
    const B = '22222222-2222-4222-8222-222222222222';
    const basis = zustand([event(A, 'A'), event(B, 'B'), absatz()], [absatz()], [absatz()]);
    const plugins = [
      history(),
      ...(ProtokollAbsicherung.config.addProseMirrorPlugins as () => Plugin[]).call({}),
    ];
    const start = EditorState.create({ doc: basis.doc, plugins });
    const tr = bausteinInGliederungVerschieben(start, A, { abschnitt: 1, index: 0 })!;
    const bewegt = start.apply(tr);
    expect(form(bewegt.doc)).toBe(`${B} _ | ${A} _ | _`);
    expect(undoDepth(bewegt)).toBe(1);
    let rueck = bewegt;
    expect(undo(bewegt, (t) => (rueck = bewegt.apply(t)))).toBe(true);
    expect(form(rueck.doc)).toBe(form(start.doc));
  });
});

describe('gliederungZiel with a drag starting right behind a collapsed slot', () => {
  it('moving the Abstimmung one step up from [Event, slot, Abstimmung] nests it into the Event', () => {
    const s = zustand([event('e', 'E'), abstimmung('a', 'A'), absatz()], [absatz()], [absatz()]);
    const rows = gliederungZeilen(gliederungBauen(s.doc), 'a');
    expect(rows.map((z) => z.key)).toEqual([
      'abschnitt:0',
      'e',
      'notizen:e',
      'a',
      'abschnitt:1',
      'abschnitt:2',
      'abschnitt:3',
    ]);
    // The Abstimmung is at index 3; one step up is index 2 (the slot's old index).
    expect(gliederungZiel(rows, 'a', 2)).toEqual({ elternId: 'e', index: 0 });
    // Two steps up (over the Event) is top-level before it.
    expect(gliederungZiel(rows, 'a', 1)).toEqual({ abschnitt: 0, index: 0 });
    // Without the drag state the slot is collapsed: the same index then means "top-level behind the Event".
    const zu = gliederungZeilen(gliederungBauen(s.doc), null);
    expect(gliederungZiel(zu, 'a', 2)).toEqual({ abschnitt: 0, index: 1 });
  });
});

describe('nested Themen in the Gliederung', () => {
  const thema = (id: string, titel: string, inhalt?: ProtokollKnoten[]) =>
    baustein('bausteinThema', id, { titel }, inhalt);
  const wahl = (id: string, posten: string) => baustein('bausteinWahl', id, { posten });
  /** e( t1( t2( w ) ) a ) and a top-level Thema `top`. */
  const state = () =>
    zustand(
      [
        event('e', 'E', [
          absatz(),
          thema('t1', 'Eins', [
            absatz(),
            thema('t2', 'Zwei', [absatz(), wahl('w', 'Kasse'), absatz()]),
            absatz(),
          ]),
          abstimmung('a', 'A'),
          absatz(),
        ]),
        thema('top', 'Oben', [absatz('n')]),
        anwaerter('d', 'D'),
        absatz(),
      ],
      [absatz()],
      [absatz()],
    );
  const baum = () => gliederungBauen(state().doc);
  const zeilen = (id: string | null = null) => gliederungZeilen(baum(), id);

  it('builds the tree to any depth', () => {
    const e = baum()[0]!.eintraege[0]!;
    expect(e.kinder.map((k) => k.titel)).toEqual(['Eins', 'Abstimmung: A']);
    const t1 = e.kinder[0]!;
    expect(t1.kannEnthalten).toBe(true);
    expect(t1.verschachtelbar).toBe(true);
    expect(t1.kinder.map((k) => k.titel)).toEqual(['Zwei']);
    expect(t1.kinder[0]!.kinder.map((k) => k.titel)).toEqual(['Wahl: Kasse']);
    // Votes hold nothing.
    expect(t1.kinder[0]!.kinder[0]!.kannEnthalten).toBe(false);
  });

  it('lists the rows depth first with depth, ancestors and a notes slot at every Thema', () => {
    const z = zeilen();
    expect(z.map((r) => r.key)).toEqual([
      'abschnitt:0',
      'e',
      't1',
      't2',
      'w',
      'notizen:t2',
      'notizen:t1',
      'a',
      'notizen:e',
      'top',
      'notizen:top',
      'd',
      'notizen:d',
      'abschnitt:1',
      'abschnitt:2',
      'abschnitt:3',
    ]);
    const finde = (key: string) => z.find((r) => r.key === key)!;
    expect(finde('t1')).toMatchObject({ art: 'kind', tiefe: 1, elternId: 'e', pfad: ['e'] });
    expect(finde('t2')).toMatchObject({ tiefe: 2, elternId: 't1', pfad: ['e', 't1'] });
    expect(finde('w')).toMatchObject({ tiefe: 3, elternId: 't2', pfad: ['e', 't1', 't2'] });
    expect(finde('notizen:t2')).toMatchObject({ art: 'notizen', tiefe: 3, elternId: 't2' });
    expect(finde('notizen:top')).toMatchObject({ art: 'notizen', tiefe: 1, pfad: ['top'] });
  });

  it('keeps the same rows while dragging, and collapses everything inside the dragged Thema', () => {
    const alle = zeilen().map((r) => r.key);
    for (const id of ['e', 't1', 't2', 'w', 'a', 'top', 'd']) {
      expect(zeilen(id).map((r) => r.key)).toEqual(alle);
    }
    const zu = (id: string | null) =>
      zeilen(id)
        .filter((r) => 'eingeklappt' in r && r.eingeklappt)
        .map((r) => r.key);
    expect(zu(null)).toEqual(['notizen:t2', 'notizen:t1', 'notizen:e', 'notizen:top', 'notizen:d']);
    // A Thema carries its notes: its nested rows and its own slot vanish, the other slots stay.
    expect(zu('t1')).toEqual(['t2', 'w', 'notizen:t2', 'notizen:t1']);
    expect(zu('top')).toEqual(['notizen:top']);
    // A vote can go into every slot.
    expect(zu('w')).toEqual([]);
    // Something that is not nestable has no slots at all.
    expect(zu('e')).toContain('notizen:t2');
  });

  it('drops a Thema into the notes of a nested Thema: before a row and via the slot', () => {
    const rows = zeilen('top');
    const rest = rows.filter((r) => r.key !== 'top');
    const bei = (key: string) =>
      gliederungZiel(
        rows,
        'top',
        rest.findIndex((r) => r.key === key),
      );
    expect(bei('w')).toEqual({ elternId: 't2', index: 0 });
    expect(bei('notizen:t2')).toEqual({ elternId: 't2', index: 1 });
    expect(bei('t2')).toEqual({ elternId: 't1', index: 0 });
    expect(bei('notizen:t1')).toEqual({ elternId: 't1', index: 1 });
    expect(bei('a')).toEqual({ elternId: 'e', index: 1 });
    expect(bei('notizen:e')).toEqual({ elternId: 'e', index: 2 });
    // Right above a top-level row it stays top-level.
    expect(bei('d')).toEqual({ abschnitt: 0, index: 1 });
  });

  it('a non-nestable Baustein above a deep row lands behind the top-level ancestor', () => {
    const rows = zeilen('d');
    const rest = rows.filter((r) => r.key !== 'd');
    expect(
      gliederungZiel(
        rows,
        'd',
        rest.findIndex((r) => r.key === 'w'),
      ),
    ).toEqual({
      abschnitt: 0,
      index: 1,
    });
  });

  it('never targets the dragged Thema or anything inside it', () => {
    const rows = zeilen('t1');
    for (let i = 0; i < rows.length; i++) {
      const z = gliederungZiel(rows, 't1', i);
      expect(z && 'elternId' in z ? ['t1', 't2', 'w'].includes(z.elternId) : false).toBe(false);
    }
    expect(verschieben(state(), 't1', { elternId: 't1', index: 0 })).toBeNull();
    expect(verschieben(state(), 't1', { elternId: 't2', index: 0 })).toBeNull();
    expect(verschieben(state(), 'e', { elternId: 'top', index: 0 })).toBeNull();
  });

  it('moves a Thema with its notes and nested Bausteine into another Thema', () => {
    expect(verschieben(state(), 't1', { elternId: 'top', index: 0 })).toBe(
      'e(a) top(t1(t2(w))) d _ | _ | _',
    );
    expect(verschieben(state(), 'top', { elternId: 't2', index: 0 })).toBe(
      'e(t1(t2(top w)) a) d _ | _ | _',
    );
    expect(verschieben(state(), 'top', { elternId: 't2', index: 1 })).toBe(
      'e(t1(t2(w top)) a) d _ | _ | _',
    );
  });

  it('moves a nested Thema out to a section and back up a level', () => {
    expect(verschieben(state(), 't2', { abschnitt: 1, index: 0 })).toBe(
      'e(t1 a) top d _ | t2(w) _ | _',
    );
    expect(verschieben(state(), 't2', { elternId: 'e', index: 0 })).toBe(
      'e(t2(w) t1 a) top d _ | _ | _',
    );
  });

  it('moves a Thema into the notes of an Anwärter:in, not into a vote or an Anwesenheit', () => {
    expect(verschieben(state(), 'top', { elternId: 'd', index: 0 })).toBe(
      'e(t1(t2(w)) a) d(top) _ | _ | _',
    );
    expect(verschieben(state(), 'top', { elternId: 'a', index: 0 })).toBeNull();
    expect(verschieben(state(), 'top', { elternId: 'w', index: 0 })).toBeNull();
  });

  it('leaves an empty paragraph when the only content of the notes moves away', () => {
    const s = zustand(
      [thema('solo', 'Solo', [wahl('w1', 'X')]), thema('zwei', 'Zwei'), absatz()],
      [absatz()],
      [absatz()],
    );
    expect(verschieben(s, 'w1', { elternId: 'zwei', index: 0 })).toBe('solo zwei(w1) _ | _ | _');
    expect(verschieben(s, 'w1', { abschnitt: 1, index: 0 })).toBe('solo zwei _ | w1 _ | _');
  });

  it('is one undo step including the nested content', () => {
    const tr = bausteinInGliederungVerschieben(state(), 't1', { elternId: 'top', index: 0 })!;
    expect(tr.steps.length).toBe(2);
  });
});
