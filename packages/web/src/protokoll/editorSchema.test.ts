import Blockquote from '@tiptap/extension-blockquote';
import { getSchema } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { BAUSTEIN_TYPEN, bausteinErzeugen, istBausteinInNotizen } from '@c4/shared';
import { BAUSTEIN_KNOTEN } from './BausteinKnoten';
import { AbschnittKnoten, ProtokollDokumentKnoten } from './schema';

const schema = getSchema([
  ProtokollDokumentKnoten,
  AbschnittKnoten,
  StarterKit.configure({ document: false, blockquote: false, link: false }),
  Blockquote.extend({ content: 'paragraph+' }),
  ...BAUSTEIN_KNOTEN,
]);

describe('editor schema', () => {
  it('has a node for every Baustein type', () => {
    for (const typ of BAUSTEIN_TYPEN) expect(schema.nodes[typ], typ).toBeDefined();
  });

  it('lets Abstimmung and Meinungsbild stand in the notes of other Bausteine, but not in each other', () => {
    for (const typ of BAUSTEIN_TYPEN) {
      for (const innen of ['bausteinBeschluss', 'bausteinMeinungsbild'] as const) {
        const erlaubt = !istBausteinInNotizen(typ);
        const knoten = schema.nodeFromJSON(bausteinErzeugen(innen));
        const eltern = schema.nodes[typ]!;
        const passt = eltern.contentMatch.matchType(knoten.type) !== null;
        expect(passt, `${innen} in ${typ}`).toBe(erlaubt);
      }
    }
  });

  it('keeps the other Bausteine out of the notes', () => {
    const anwaerter = schema.nodes.bausteinAnwaerter!;
    expect(schema.nodes.bausteinEvent!.contentMatch.matchType(anwaerter)).toBeNull();
  });

  it('accepts a document with a nested Abstimmung and Meinungsbild', () => {
    const ereignis = bausteinErzeugen('bausteinEvent', undefined, [
      { type: 'paragraph' },
      bausteinErzeugen('bausteinBeschluss'),
      bausteinErzeugen('bausteinMeinungsbild'),
      { type: 'paragraph' },
    ]);
    const doc = schema.nodeFromJSON({
      type: 'doc',
      content: ['vergangenes', 'gegenwaertiges', 'zukuenftiges'].map((art, i) => ({
        type: 'abschnitt',
        attrs: { art },
        content: i === 1 ? [ereignis, { type: 'paragraph' }] : [{ type: 'paragraph' }],
      })),
    });
    expect(() => doc.check()).not.toThrow();
  });
});
