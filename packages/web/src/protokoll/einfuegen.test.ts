import { describe, expect, it } from 'vitest';
import { Schema, type Node as PmNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { absatzAmEndeEinfuegen } from './schema';
import {
  einfuegeStelle,
  imVerschachtelbaren,
  slashErlaubt,
  stelleAnwenden,
  zitatInPunktVerlassen,
  zitatStelle,
} from './einfuegen';

const TEXT = 'paragraph | bulletList';
const schema = new Schema({
  nodes: {
    doc: { content: 'abschnitt{3}' },
    abschnitt: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    listItem: {
      content: 'paragraph (bulletList | blockquote | innerbaustein | notizbaustein | thema)*',
    },
    blockquote: { group: 'block', content: 'paragraph+' },
    bulletList: { group: 'block', content: 'listItem+' },
    bausteinEvent: { group: 'block', content: `(${TEXT} | innerbaustein | thema)+` },
    bausteinThema: { group: 'block thema', content: `(${TEXT} | innerbaustein | thema)+` },
    bausteinAnwaerter: { group: 'block', content: `(${TEXT} | innerbaustein | thema)+` },
    bausteinBeschluss: { group: 'block innerbaustein', content: `(${TEXT})+` },
    bausteinMeinungsbild: { group: 'block innerbaustein', content: `(${TEXT})+` },
    marke: { group: 'block innerbaustein', content: 'paragraph' },
    bausteinAnwesenheit: { group: 'block innerbaustein', atom: true },
    bausteinTodo: { group: 'notizbaustein', content: 'paragraph' },
    text: {},
  },
});
const n = (typ: string, ...kinder: PmNode[]) => schema.nodes[typ]!.create(null, kinder);
const p = (t = '') => schema.nodes.paragraph!.create(null, t ? schema.text(t) : undefined);
const abschnitte = (a: PmNode[], b: PmNode[] = [p()], c: PmNode[] = [p()]) =>
  schema.nodes.doc!.create(null, [
    n('abschnitt', ...a),
    n('abschnitt', ...b),
    n('abschnitt', ...c),
  ]);

/** Position inside the text of the first paragraph containing `text`. */
function stelle(doc: PmNode, text: string, versatz = 0): number {
  let pos = -1;
  doc.descendants((k, ps) => {
    if (pos === -1 && k.isTextblock && k.textContent === text) pos = ps + 1 + versatz;
    return pos === -1;
  });
  if (pos === -1) throw new Error(`no paragraph ${text}`);
  return pos;
}

/** What `einfuegeStelle` would produce, as text: the inserted node is written as "#". */
function ergebnis(doc: PmNode, position: number, typ: Parameters<typeof einfuegeStelle>[2]) {
  const stelle = einfuegeStelle(doc, position, typ);
  const tr = EditorState.create({ doc }).tr;
  stelleAnwenden(tr, stelle, n('marke', p()), p());
  const text = (k: PmNode): string => {
    if (k.type.name === 'marke') return '#';
    if (k.isText) return k.text!;
    const inner = [...Array(k.childCount).keys()].map((i) => text(k.child(i))).join(' ');
    if (k.type.name === 'paragraph') return inner || '_';
    return k.type.name === 'doc' ? inner : `[${inner}]`;
  };
  return text(tr.doc);
}

describe('einfuegeStelle: top-level Bausteine', () => {
  it('replaces an empty paragraph and goes after any other block', () => {
    const doc = abschnitte([p('a'), p(), p('b')]);
    expect(ergebnis(doc, stelle(doc, ''), 'bausteinEm' as never)).toContain('[a # b]');
    expect(ergebnis(doc, stelle(doc, 'a'), 'bausteinEm' as never)).toContain('[a # _ b]');
  });

  it('goes after the whole Baustein when the cursor is in its notes (also in a nested Abstimmung)', () => {
    const doc = abschnitte([n('bausteinEvent', p('x'), n('bausteinBeschluss', p('y'))), p('z')]);
    expect(ergebnis(doc, stelle(doc, 'x'), 'bausteinAufnahme' as never)).toContain('[[x [y]] # z]');
    expect(ergebnis(doc, stelle(doc, 'y'), 'bausteinAufnahme' as never)).toContain('[[x [y]] # z]');
  });
});

describe('einfuegeStelle: Abstimmung and Meinungsbild', () => {
  const doc = abschnitte([
    p('vor'),
    n('bausteinEvent', p('x'), p(), n('bausteinBeschluss', p('y'))),
    n('bausteinMeinungsbild', p('m')),
    p('nach'),
  ]);

  it('goes into the notes of a Baustein at the cursor, replacing an empty paragraph', () => {
    const leer = stelle(doc, '');
    expect(ergebnis(doc, leer, 'bausteinBeschluss')).toContain('[vor [x # [y]]');
  });

  it('goes after the current block inside the notes, not after the Baustein', () => {
    expect(ergebnis(doc, stelle(doc, 'x'), 'bausteinMeinungsbild')).toContain('[vor [x # _ [y]]');
  });

  it('goes after the Abstimmung / Meinungsbild when the cursor is inside one (no nesting in itself)', () => {
    // Inside the Abstimmung in the Event: after it, still in the Event's notes.
    expect(ergebnis(doc, stelle(doc, 'y'), 'bausteinBeschluss')).toContain('[x _ [y] #]');
    // Inside the top-level Meinungsbild: after it, in the section.
    expect(ergebnis(doc, stelle(doc, 'm'), 'bausteinMeinungsbild')).toContain('[m] # nach]');
  });

  it('works in the section itself like any Baustein', () => {
    expect(ergebnis(doc, stelle(doc, 'vor'), 'bausteinBeschluss')).toContain('[vor # [x');
  });

  it('falls back to the end of the last section without a usable cursor', () => {
    const { von, bis } = einfuegeStelle(doc, 0, 'bausteinBeschluss');
    expect(von).toBe(doc.content.size - 1);
    expect(bis).toBe(von);
  });
});

describe('imVerschachtelbaren', () => {
  it('is true only inside an Abstimmung or Meinungsbild', () => {
    const doc = abschnitte([n('bausteinEvent', p('x'), n('bausteinBeschluss', p('y'))), p('z')]);
    const bei = (t: string) => {
      const s = EditorState.create({ doc });
      return imVerschachtelbaren(
        s.apply(s.tr.setSelection(TextSelection.create(doc, stelle(doc, t)))),
      );
    };
    expect(bei('y')).toBe(true);
    expect(bei('x')).toBe(false);
    expect(bei('z')).toBe(false);
  });
});

describe('absatzAmEndeEinfuegen', () => {
  it('adds a paragraph after an Abstimmung that ends the notes of a Baustein', () => {
    const doc = abschnitte([n('bausteinEvent', p('x'), n('bausteinMeinungsbild', p('m')))]);
    const tr = EditorState.create({ doc }).tr;
    expect(absatzAmEndeEinfuegen(tr)).toBe(true);
    // Event notes get one, and the section (ends with a Baustein) gets one.
    const event = tr.doc.child(0).child(0);
    expect(event.lastChild?.type.name).toBe('paragraph');
    expect(tr.doc.child(0).lastChild?.type.name).toBe('paragraph');
  });

  it('leaves notes that end with text alone', () => {
    const doc = abschnitte([n('bausteinEvent', n('bausteinMeinungsbild', p('m')), p('x')), p()]);
    expect(absatzAmEndeEinfuegen(EditorState.create({ doc }).tr)).toBe(false);
  });
});

const punkt = (...t: string[]) => n('listItem', ...t.map((x) => p(x)).slice(0, 1));
const liste = (...punkte: PmNode[]) => n('bulletList', ...punkte);

describe('einfuegeStelle in lists', () => {
  it('replaces a list that only holds the empty item by a nestable Baustein', () => {
    const doc = abschnitte([n('bausteinEvent', liste(punkt('')))]);
    expect(ergebnis(doc, stelle(doc, ''), 'bausteinBeschluss')).toContain('[[#]]');
  });

  it('keeps an empty last item at its level, holding the Baustein, and adds an empty one behind', () => {
    const doc = abschnitte([n('bausteinEvent', liste(punkt('a'), punkt('')), p('z'))]);
    expect(ergebnis(doc, stelle(doc, ''), 'bausteinMeinungsbild')).toContain(
      '[[[[a] [_ #] [_]] z]]',
    );
  });

  it('puts the Baustein in the same item, below its text, when the item has text', () => {
    const doc = abschnitte([n('bausteinEvent', liste(punkt('a'), punkt('b')), p('z'))]);
    expect(ergebnis(doc, stelle(doc, 'a'), 'bausteinBeschluss')).toContain('[[[[a #] [_] [b]] z]]');
  });

  it('keeps the following items at their level (the example with Unter- and Notizen)', () => {
    const n1 = n('listItem', p('Notiz 1'), liste(punkt('Unter 1'), punkt(''), punkt('Unter 2')));
    const doc = abschnitte([n('bausteinEvent', liste(n1, punkt('Notiz 2')))]);
    expect(ergebnis(doc, stelle(doc, ''), 'bausteinBeschluss')).toContain(
      '[[[[Notiz 1 [[Unter 1] [_ #] [_] [Unter 2]]] [Notiz 2]]]]',
    );
  });

  it('goes in front of the list when the empty item is its first one', () => {
    const doc = abschnitte([n('bausteinEvent', liste(punkt(''), punkt('b')), p('z'))]);
    expect(ergebnis(doc, stelle(doc, ''), 'bausteinBeschluss')).toContain('[[# [[b]] z]]');
  });

  it('keeps the level of the first item of a nested list: the item holds an empty paragraph and the block', () => {
    const n1 = n('listItem', p('Notiz 1'), liste(punkt(''), punkt('Unter 2')));
    const doc = abschnitte([n('bausteinEvent', liste(n1))]);
    expect(ergebnis(doc, stelle(doc, ''), 'bausteinBeschluss')).toContain(
      '[[[[Notiz 1 [[_ #] [_] [Unter 2]]]]]]',
    );
  });

  it('puts erscheint / geht, a Todo and a Thema into the item like a vote', () => {
    for (const typ of ['bausteinAnwesenheit', 'bausteinTodo', 'bausteinThema'] as const) {
      const doc = abschnitte([n('bausteinEvent', liste(punkt('a'), punkt('')))]);
      expect(ergebnis(doc, stelle(doc, ''), typ), typ).toContain('[[[[a] [_ #] [_]]]]');
    }
  });

  it('puts a quote into the empty item or below the text of an item', () => {
    const doc = abschnitte([n('bausteinEvent', liste(punkt('a'), punkt('')), p('z'))]);
    const s = zitatStelle(doc, stelle(doc, ''))!;
    const tr = EditorState.create({ doc }).tr;
    stelleAnwenden(tr, s, n('blockquote', p('q')), p());
    const eintraege = tr.doc.child(0).child(0).child(0);
    expect(eintraege.child(1).child(1).type.name).toBe('blockquote');
    expect(eintraege.childCount).toBe(3);
    // With text: after it in the same item.
    const mitText = abschnitte([liste(punkt('a'), punkt('b'))]);
    const s2 = zitatStelle(mitText, stelle(mitText, 'a'))!;
    const tr2 = EditorState.create({ doc: mitText }).tr;
    stelleAnwenden(tr2, s2, n('blockquote', p('q')), p());
    expect(tr2.doc.child(0).child(0).child(0).child(1).type.name).toBe('blockquote');
    // Not in a list: no list placement.
    const ohne = abschnitte([p('x')]);
    expect(zitatStelle(ohne, stelle(ohne, 'x'))).toBeNull();
  });

  it('adds an empty item behind the block unless the next sibling already is one', () => {
    const doc = abschnitte([n('bausteinEvent', liste(punkt('a'), punkt('b'), punkt('')), p('z'))]);
    expect(ergebnis(doc, stelle(doc, 'a'), 'bausteinBeschluss')).toContain(
      '[[[[a #] [_] [b] [_]] z]]',
    );
    const leer = abschnitte([n('bausteinEvent', liste(punkt('a'), punkt(''), punkt('')), p('z'))]);
    // The first empty item: the block goes to "a", the item behind it already is empty.
    expect(ergebnis(leer, stelle(leer, ''), 'bausteinBeschluss')).toContain(
      '[[[[a] [_ #] [_]] z]]',
    );
    const mitte = abschnitte([n('bausteinEvent', liste(punkt('a'), punkt('')), p('z'))]);
    // Cursor in "a" with an empty item right behind: no second one.
    expect(ergebnis(mitte, stelle(mitte, 'a'), 'bausteinBeschluss')).toContain('[[[[a #] [_]] z]]');
  });

  it('replaces an empty paragraph that follows a Baustein inside an item', () => {
    const item = n('listItem', p('a'), n('bausteinBeschluss', p('m')), p());
    const doc = abschnitte([n('bausteinEvent', liste(item))]);
    expect(ergebnis(doc, stelle(doc, ''), 'bausteinBeschluss')).toContain('[[[[a [m] #] [_]]]]');
  });

  it('still lifts a Baustein inside a vote out of the list in it', () => {
    const doc = abschnitte([
      n('bausteinEvent', n('bausteinBeschluss', liste(punkt('a'), punkt(''))), p('z')),
    ]);
    expect(ergebnis(doc, stelle(doc, ''), 'bausteinMeinungsbild')).toContain('[[[[[a]]] # z]]');
  });

  it('puts a top-level Baustein after the section block and cleans up the item', () => {
    const doc = abschnitte([n('bausteinEvent', liste(punkt('a'), punkt('')), p('z')), p('nach')]);
    expect(ergebnis(doc, stelle(doc, ''), 'bausteinEm' as never)).toContain('[[[a]] z] # nach]');
  });

  it('leaves an empty paragraph when the only list was all the content of a Baustein', () => {
    const doc = abschnitte([n('bausteinEvent', liste(punkt('')))]);
    expect(ergebnis(doc, stelle(doc, ''), 'bausteinEm' as never)).toContain('[[_] #]');
  });

  it('replaces a top-level list that only holds the empty item', () => {
    const doc = abschnitte([liste(punkt(''))]);
    expect(ergebnis(doc, stelle(doc, ''), 'bausteinBeschluss')).toBe('[#] [_] [_]');
  });

  it('handles nested lists: only the nested item or list goes', () => {
    const verschachtelt = (innen: PmNode) => n('listItem', p('a'), innen) as PmNode;
    const doc = abschnitte([n('bausteinEvent', liste(verschachtelt(liste(punkt('')))), p('z'))]);
    expect(ergebnis(doc, stelle(doc, ''), 'bausteinBeschluss')).toContain(
      '[[[[a [[_ #] [_]]]] z]]',
    );
  });
});

describe('slashErlaubt', () => {
  const bei = (doc: PmNode, t: string) => slashErlaubt(doc.resolve(stelle(doc, t)));
  it('opens in paragraphs of a section or Baustein notes and in their list items', () => {
    const doc = abschnitte([
      p('s'),
      n('bausteinEvent', p('e'), liste(punkt('l'), n('listItem', p('m'), liste(punkt('t'))))),
      liste(punkt('o')),
    ]);
    for (const t of ['s', 'e', 'l', 'm', 't', 'o']) expect(bei(doc, t), t).toBe(true);
  });
  it('stays closed inside Abstimmung-less quotes', () => {
    const zitat = new Schema({
      nodes: {
        doc: { content: 'abschnitt{3}' },
        abschnitt: { content: 'block+' },
        paragraph: { group: 'block', content: 'text*' },
        blockquote: { group: 'block', content: 'paragraph+' },
        text: {},
      },
    });
    const absatz = (t: string) => zitat.nodes.paragraph!.create(null, zitat.text(t));
    const abs = (...k: PmNode[]) => zitat.nodes.abschnitt!.create(null, k);
    const doc = zitat.nodes.doc!.create(null, [
      abs(zitat.nodes.blockquote!.create(null, [absatz('q')])),
      abs(absatz('x')),
      abs(absatz('y')),
    ]);
    expect(slashErlaubt(doc.resolve(stelle(doc, 'q')))).toBe(false);
    expect(slashErlaubt(doc.resolve(stelle(doc, 'x')))).toBe(true);
  });
});

describe('einfuegeStelle: Thema', () => {
  const thema = 'bausteinThema';
  it('goes top-level next to a block of the section', () => {
    const doc = abschnitte([p('a'), p(), p('b')]);
    expect(ergebnis(doc, stelle(doc, ''), thema)).toContain('[a # b]');
    expect(ergebnis(doc, stelle(doc, 'a'), thema)).toContain('[a # _ b]');
  });

  it('goes into the notes of a Baustein at the cursor, in front of an empty paragraph', () => {
    const doc = abschnitte([n('bausteinEvent', p('x'), p(), p('y')), p('z')]);
    expect(ergebnis(doc, stelle(doc, ''), thema)).toContain('[[x # y] z]');
    expect(ergebnis(doc, stelle(doc, 'x'), thema)).toContain('[[x # _ y] z]');
  });

  it('goes into the innermost Thema at any depth, not into a vote', () => {
    const doc = abschnitte([
      n(
        'bausteinEvent',
        p('e'),
        n(
          'bausteinThema',
          p('t1'),
          n('bausteinThema', p('t2'), n('bausteinBeschluss', p('v')), p('t3')),
        ),
      ),
      p('z'),
    ]);
    expect(ergebnis(doc, stelle(doc, 't3'), thema)).toContain('[[e [t1 [t2 [v] t3 #]]] z]');
    // Cursor in a vote inside the inner Thema: after the vote, in that Thema.
    expect(ergebnis(doc, stelle(doc, 'v'), thema)).toContain('[t2 [v] # t3]');
    // Cursor in the outer Thema: in the outer one.
    expect(ergebnis(doc, stelle(doc, 't1'), thema)).toContain('[t1 # [t2');
  });

  it('keeps other top-level Bausteine out of Themen: they go after the top-level Baustein', () => {
    const doc = abschnitte([n('bausteinEvent', p('e'), n('bausteinThema', p('t'))), p('z')]);
    expect(ergebnis(doc, stelle(doc, 't'), 'bausteinAnwaerter')).toContain('[[e [t]] # z]');
  });

  it('replaces the empty list item the cursor is in, inside a Thema', () => {
    const doc = abschnitte([
      n('bausteinEvent', p('e'), n('bausteinThema', p('t'), n('bulletList', n('listItem', p())))),
    ]);
    expect(ergebnis(doc, stelle(doc, ''), thema)).toContain('[e [t #]]');
  });

  it('puts a trailing paragraph behind a Thema that ends the notes', () => {
    const doc = abschnitte([n('bausteinEvent', p('e'), n('bausteinThema', p('t')))]);
    const tr = EditorState.create({ doc }).tr;
    expect(absatzAmEndeEinfuegen(tr)).toBe(true);
    expect(tr.doc.child(0).child(0).lastChild!.type.name).toBe('paragraph');
  });
});

describe('zitatInPunktVerlassen', () => {
  const zitatPunkt = (...naechste: PmNode[]) =>
    abschnitte([
      n(
        'bausteinEvent',
        liste(n('listItem', p('a'), n('blockquote', p('q'), p())), ...naechste),
        p('z'),
      ),
    ]);
  const lauf = (doc: PmNode) => {
    const s = EditorState.create({ doc });
    const leer = stelle(doc, '');
    const tr = zitatInPunktVerlassen(s.apply(s.tr.setSelection(TextSelection.create(doc, leer))));
    return tr ? tr : null;
  };
  const zeige = (k: PmNode): string => {
    if (k.isText) return k.text!;
    const inner = [...Array(k.childCount).keys()].map((i) => zeige(k.child(i))).join(' ');
    return k.type.name === 'paragraph' ? inner || '_' : `[${inner}]`;
  };

  it('removes the empty line and moves to a new sibling item at the same level', () => {
    const tr = lauf(zitatPunkt(punkt('b')))!;
    expect(zeige(tr.doc.child(0))).toBe('[[[[a [q]] [_] [b]] z]]');
    const $ = tr.selection.$from;
    expect($.parent.type.name).toBe('paragraph');
    expect($.node($.depth - 1).type.name).toBe('listItem');
    expect($.node($.depth - 1).childCount).toBe(1);
  });

  it('reuses an empty next item', () => {
    const tr = lauf(zitatPunkt(punkt('')))!;
    expect(zeige(tr.doc.child(0))).toBe('[[[[a [q]] [_]] z]]');
  });

  it('leaves everything else to the default Enter', () => {
    const doc = abschnitte([n('bausteinEvent', liste(punkt('a'), punkt('')), p('z'))]);
    expect(lauf(doc)).toBeNull();
  });
});
