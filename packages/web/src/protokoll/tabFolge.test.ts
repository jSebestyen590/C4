// @vitest-environment jsdom
import { Schema } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import {
  bausteinAnfangTiefe,
  istLetztesFeld,
  letztesFormularFeld,
  tabbareFelder,
} from './tabFolge';

describe('tabbareFelder', () => {
  it('skips disabled, hidden and tabindex -1 elements', () => {
    const div = document.createElement('div');
    div.innerHTML =
      '<input id="a"><button tabindex="-1">x</button><input disabled><input type="hidden"><div hidden><input></div><textarea id="b"></textarea>';
    expect(tabbareFelder(div).map((e) => e.id)).toEqual(['a', 'b']);
    expect(istLetztesFeld(div, div.querySelector('#b')!)).toBe(true);
    expect(istLetztesFeld(div, div.querySelector('#a')!)).toBe(false);
  });

  it('counts only the checked radio of a group as a tab stop', () => {
    const div = document.createElement('div');
    div.innerHTML =
      '<input id="a"><input type="radio" name="r" id="r1"><input type="radio" name="r" id="r2" checked><input type="radio" name="r" id="r3">';
    expect(tabbareFelder(div).map((e) => e.id)).toEqual(['a', 'r2']);
    // Tab from the checked radio leaves the form, although the last radio is behind it.
    expect(istLetztesFeld(div, div.querySelector('#r2')!)).toBe(true);
    expect(istLetztesFeld(div, div.querySelector('#r1')!)).toBe(true);
    expect(istLetztesFeld(div, div.querySelector('#a')!)).toBe(false);
  });

  it('takes the first radio as the stop when none is checked, and ignores an inert part', () => {
    const div = document.createElement('div');
    div.innerHTML =
      '<input id="a"><input type="radio" name="r" id="r1"><input type="radio" name="r" id="r2"><div inert><input id="x"></div>';
    expect(tabbareFelder(div).map((e) => e.id)).toEqual(['a', 'r1']);
    expect(istLetztesFeld(div, div.querySelector('#r1')!)).toBe(true);
  });

  it('finds the last field of the own form only', () => {
    const karte = document.createElement('div');
    karte.innerHTML =
      '<div data-baustein-formular><input id="a"><input id="b"></div><div><div data-baustein-formular><input id="c"></div></div>';
    expect(letztesFormularFeld(karte)?.id).toBe('b');
  });
});

describe('bausteinAnfangTiefe', () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'text*' },
      bulletList: { group: 'block', content: 'item+' },
      item: { content: 'paragraph+' },
      baustein: { group: 'block', content: 'block+' },
      text: {},
    },
  });
  const p = (t: string) => schema.nodes.paragraph!.create(null, schema.text(t));
  const doc = schema.nodes.doc!.create(null, [
    schema.nodes.baustein!.create(null, [
      p('eins'),
      p('zwei'),
      schema.nodes.bulletList!.create(null, [schema.nodes.item!.create(null, p('x'))]),
    ]),
  ]);
  const istB = (n: string) => n === 'baustein';

  it('is set at the start of the first paragraph only', () => {
    expect(bausteinAnfangTiefe(doc.resolve(2), istB)).toBe(1);
    expect(bausteinAnfangTiefe(doc.resolve(3), istB)).toBeNull();
    expect(bausteinAnfangTiefe(doc.resolve(8), istB)).toBeNull(); // start of the second paragraph
    expect(bausteinAnfangTiefe(doc.resolve(14), istB)).toBeNull(); // inside the list
  });
});
