import Blockquote from '@tiptap/extension-blockquote';
import { getSchema } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import {
  BAUSTEIN_TYPEN,
  bausteinErzeugen,
  istBausteinInNotizen,
  istVerschachtelbar,
  kannBausteineEnthalten,
} from '@c4/shared';
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
      for (const innen of ['bausteinBeschluss', 'bausteinMeinungsbild', 'bausteinWahl'] as const) {
        // Anwesenheit has no free text at all.
        const erlaubt = !istBausteinInNotizen(typ) && typ !== 'bausteinAnwesenheit';
        const knoten = schema.nodeFromJSON(bausteinErzeugen(innen));
        const eltern = schema.nodes[typ]!;
        const passt = eltern.contentMatch.matchType(knoten.type) !== null;
        expect(passt, `${innen} in ${typ}`).toBe(erlaubt);
      }
    }
  });

  it('has no content in Anwesenheit blocks and accepts old ones only without it', () => {
    const typ = schema.nodes.bausteinAnwesenheit!;
    expect(typ.isLeaf).toBe(true);
    expect(() =>
      schema.nodeFromJSON(bausteinErzeugen('bausteinAnwesenheit')).check(),
    ).not.toThrow();
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
      bausteinErzeugen('bausteinWahl'),
      { type: 'paragraph' },
    ]);
    const doc = schema.nodeFromJSON({
      type: 'doc',
      content: ['vergangenes', 'gegenwaertiges', 'zukuenftiges', 'sonstiges'].map((art, i) => ({
        type: 'abschnitt',
        attrs: { art },
        content: i === 1 ? [ereignis, { type: 'paragraph' }] : [{ type: 'paragraph' }],
      })),
    });
    expect(() => doc.check()).not.toThrow();
  });

  it('lets a Thema stand in the notes of every Baustein that can hold others, but not in votes', () => {
    const knoten = schema.nodeFromJSON(bausteinErzeugen('bausteinThema'));
    for (const typ of BAUSTEIN_TYPEN) {
      const erlaubt = kannBausteineEnthalten(typ);
      const passt = schema.nodes[typ]!.contentMatch.matchType(knoten.type) !== null;
      expect(passt, `Thema in ${typ}`).toBe(erlaubt);
    }
  });

  it('keeps every other Baustein out of a Thema, but allows votes in it', () => {
    const thema = schema.nodes.bausteinThema!;
    for (const typ of BAUSTEIN_TYPEN) {
      const passt = thema.contentMatch.matchType(schema.nodes[typ]!) !== null;
      expect(passt, `${typ} in Thema`).toBe(istVerschachtelbar(typ));
    }
  });

  it('accepts a Thema in a Thema in an Event with votes at every level, and old flat documents', () => {
    const wahl = bausteinErzeugen('bausteinWahl');
    const tief = bausteinErzeugen('bausteinThema', { titel: 'A' }, [
      { type: 'paragraph' },
      bausteinErzeugen('bausteinThema', { titel: 'B' }, [{ type: 'paragraph' }, wahl]),
      bausteinErzeugen('bausteinBeschluss'),
      { type: 'paragraph' },
    ]);
    const alt = bausteinErzeugen('bausteinThema', { titel: 'Alt' }, [{ type: 'paragraph' }]);
    const event = bausteinErzeugen('bausteinEvent', undefined, [{ type: 'paragraph' }, tief]);
    const doc = schema.nodeFromJSON({
      type: 'doc',
      content: ['vergangenes', 'gegenwaertiges', 'zukuenftiges', 'sonstiges'].map((art, i) => ({
        type: 'abschnitt',
        attrs: { art },
        content: i === 1 ? [event, alt, { type: 'paragraph' }] : [{ type: 'paragraph' }],
      })),
    });
    expect(() => doc.check()).not.toThrow();
  });

  it('does not allow a Thema inside a list or a quote', () => {
    const thema = schema.nodes.bausteinThema!;
    expect(schema.nodes.listItem!.contentMatch.matchType(thema)).toBeNull();
    expect(schema.nodes.blockquote!.contentMatch.matchType(thema)).toBeNull();
  });
});
