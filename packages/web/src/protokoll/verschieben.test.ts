import { describe, expect, it } from 'vitest';
import { Schema, type Node as PmNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { blockBeiCursor, blockVerschieben } from './verschieben';

const schema = new Schema({
  nodes: {
    doc: { content: 'abschnitt{3}' },
    abschnitt: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    bausteinEvent: { group: 'block', content: 'paragraph+' },
    text: {},
  },
});
const p = (t = '') => schema.nodes.paragraph!.create(null, t ? schema.text(t) : undefined);
const b = (...t: string[]) =>
  schema.nodes.bausteinEvent!.create(
    null,
    t.map((x) => p(x)),
  );
const abschnitt = (...k: PmNode[]) => schema.nodes.abschnitt!.create(null, k);
const zustand = (...a: PmNode[][]) =>
  EditorState.create({
    doc: schema.nodes.doc!.create(
      null,
      a.map((k) => abschnitt(...k)),
    ),
  });

/** Compact text form: sections joined by "|", Bausteine as [..]. */
const form = (doc: PmNode) =>
  doc.children
    .map((a) =>
      a.children
        .map((k) => (k.type.name === 'paragraph' ? k.textContent || '_' : `[${k.textContent}]`))
        .join(' '),
    )
    .join(' | ');
const posVon = (doc: PmNode, text: string) => {
  let gefunden = -1;
  doc.descendants((n, pos) => {
    if (gefunden < 0 && n.isTextblock && n.textContent === text) gefunden = pos;
    return gefunden < 0;
  });
  return gefunden;
};
const anwenden = (s: EditorState, text: string, r: 'hoch' | 'runter') => {
  const tr = blockVerschieben(s, posVon(s.doc, text), r);
  return tr ? s.apply(tr) : null;
};

describe('blockVerschieben', () => {
  const s = () => zustand([p('a'), p('b'), p('c'), p()], [p('d'), p()], [p()]);

  it('swaps with the sibling', () => {
    expect(form(anwenden(s(), 'b', 'hoch')!.doc)).toBe('b a c _ | d _ | _');
    expect(form(anwenden(s(), 'b', 'runter')!.doc)).toBe('a c b _ | d _ | _');
  });
  it('never swaps with the trailing empty paragraph', () => {
    expect(form(anwenden(s(), 'c', 'runter')!.doc)).toBe('a b _ | c d _ | _');
  });
  it('moves across section edges', () => {
    expect(form(anwenden(s(), 'a', 'hoch')?.doc ?? s().doc)).toBe(form(s().doc));
    expect(form(anwenden(s(), 'd', 'hoch')!.doc)).toBe('a b c d _ | _ | _');
  });
  it('returns null at the document edges and for the trailing paragraph', () => {
    expect(anwenden(s(), 'a', 'hoch')).toBeNull();
    const letzte = zustand([p('x'), p()], [p('y'), p()], [p('z'), p()]);
    expect(anwenden(letzte, 'z', 'runter')).toBeNull();
    expect(blockVerschieben(s(), s().doc.child(0).nodeSize - 3, 'hoch')).toBeNull();
  });
  it('moves a Baustein and keeps the cursor inside', () => {
    const z = zustand([p('a'), b('n1', 'n2'), p()], [p()], [p()]);
    const pos = posVon(z.doc, 'n2');
    const mitCursor = z.apply(z.tr.setSelection(TextSelection.create(z.doc, pos + 2)));
    const bausteinPos = posVon(z.doc, 'n1') - 1;
    const erg = mitCursor.apply(blockVerschieben(mitCursor, bausteinPos, 'hoch')!);
    expect(form(erg.doc)).toBe('[n1n2] a _ | _ | _');
    expect(erg.selection.$from.parent.textContent).toBe('n2');
    expect(erg.selection.$from.parentOffset).toBe(1);
  });
  it('keeps blocks inside a Baustein', () => {
    const z = zustand([b('n1', 'n2'), p()], [p()], [p()]);
    expect(form(anwenden(z, 'n1', 'runter')!.doc)).toBe('[n2n1] _ | _ | _');
    expect(anwenden(z, 'n1', 'hoch')).toBeNull();
    expect(anwenden(z, 'n2', 'runter')).toBeNull();
  });
  it('moves the last block down into the next section start', () => {
    const z = zustand([p('x'), p()], [p('y'), p()], [p()]);
    expect(form(anwenden(z, 'x', 'runter')!.doc)).toBe('_ | x y _ | _');
  });
  it('does not empty a section', () => {
    const z = zustand([p('x')], [p()], [p()]);
    expect(anwenden(z, 'x', 'runter')).toBeNull();
  });
});

describe('blockBeiCursor', () => {
  it('finds the top-level block or the block inside the notes', () => {
    const z = zustand([p('a'), b('n1', 'n2'), p()], [p()], [p()]);
    const bei = (t: string) =>
      blockBeiCursor(z.apply(z.tr.setSelection(TextSelection.create(z.doc, posVon(z.doc, t) + 1))));
    expect(bei('a')).toBe(posVon(z.doc, 'a'));
    expect(bei('n2')).toBe(posVon(z.doc, 'n2'));
  });
});
