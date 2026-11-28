import { describe, expect, it } from 'vitest';
import { Schema, type Node as PmNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { punktVerschieben } from './punktVerschieben';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    bulletList: { group: 'block', content: 'listItem+' },
    listItem: { content: 'paragraph bulletList?' },
    text: {},
  },
});
const p = (t: string) => schema.nodes.paragraph!.create(null, schema.text(t));
const li = (t: string, kind?: PmNode) =>
  schema.nodes.listItem!.create(null, kind ? [p(t), kind] : [p(t)]);
const ul = (...k: PmNode[]) => schema.nodes.bulletList!.create(null, k);
const form = (n: PmNode): string =>
  n.type.name === 'paragraph'
    ? n.textContent
    : n.type.name === 'listItem' || n.type.name === 'doc'
      ? n.children.map(form).join('')
      : `(${n.children.map(form).join(' ')})`;

function zustand(doc: PmNode, cursorIn: string) {
  let pos = 0;
  doc.descendants((n, q) => {
    if (n.isText && n.text === cursorIn) pos = q + 1;
  });
  return EditorState.create({ doc, selection: TextSelection.create(doc, pos) });
}

describe('punktVerschieben', () => {
  const doc = schema.nodes.doc!.create(null, [
    p('vor'),
    ul(li('a'), li('b', ul(li('b1'), li('b2'))), li('c')),
  ]);

  it('moves an item with its nested content among its siblings', () => {
    const s = zustand(doc, 'b');
    const tr = punktVerschieben(s, 'hoch')!;
    expect(form(tr.doc)).toBe('vor(b(b1 b2) a c)');
    const runter = punktVerschieben(s, 'runter')!;
    expect(form(runter.doc)).toBe('vor(a c b(b1 b2))');
    // The cursor stays in the moved item.
    expect(runter.selection.$from.parent.textContent).toBe('b');
  });

  it('moves nested items only inside their own list', () => {
    const s = zustand(doc, 'b2');
    expect(form(punktVerschieben(s, 'hoch')!.doc)).toBe('vor(a b(b2 b1) c)');
    expect(punktVerschieben(s, 'runter')).toBeNull();
  });

  it('does nothing at the edge or outside lists', () => {
    expect(punktVerschieben(zustand(doc, 'a'), 'hoch')).toBeNull();
    expect(punktVerschieben(zustand(doc, 'vor'), 'runter')).toBeNull();
  });
});
