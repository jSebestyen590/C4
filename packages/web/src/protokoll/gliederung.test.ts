import Blockquote from '@tiptap/extension-blockquote';
import { getSchema } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { EditorState } from '@tiptap/pm/state';
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
import { AbschnittKnoten, ProtokollDokumentKnoten } from './schema';

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
    content: ['vergangenes', 'gegenwaertiges', 'zukuenftiges'].map((art, i) => ({
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
  return doc.children.map((a) => a.children.map(knoten).join(' ')).join(' | ');
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
    expect(baum.map((a) => a.titel)).toEqual(['Vergangenes', 'Gegenwärtiges', 'Zukünftiges']);
    expect(baum[0]!.eintraege.map((e) => e.titel)).toEqual(['11.02. Superbowl']);
    expect(baum[0]!.eintraege[0]!.kinder.map((e) => e.titel)).toEqual(['Abstimmung: Mehr Bier']);
    expect(baum[0]!.eintraege[0]!.kannEnthalten).toBe(true);
    expect(baum[0]!.eintraege[0]!.kinder[0]!.verschachtelbar).toBe(true);
    expect(baum[1]!.eintraege.map((e) => e.titel)).toEqual(['Anna X']);
    expect(baum[2]!.eintraege).toEqual([]);
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
    expect(gliederungTitel('bausteinEm', { sub: null, name: 'Karl' })).toBe('Neues EM: Karl');
    expect(gliederungTitel('bausteinAufnahme', { sub: 's1', name: '' }, name)).toBe(
      'Aufnahme: Mia',
    );
    expect(gliederungTitel('bausteinBeschluss', { antrag: '' })).toBe('Abstimmung');
    expect(gliederungTitel('bausteinEvent', { name: '', datum: null })).toBe('Event');
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
    expect(vor('q', null)).toBe('p(k1 k2) top _ | _ | d q _');
    expect(vor('d', 'abschnitt:1')).toBe('p(k1 k2) q top d _ | _ | _');
    expect(vor('d', 'p')).toBe('d p(k1 k2) q top _ | _ | _');
  });
  it('a non-nestable Baustein cannot nest: it lands right behind the parent', () => {
    expect(vor('q', 'k1')).toBeNull(); // already right behind its parent
    expect(vor('d', 'k2')).toBe('p(k1 k2) d q top _ | _ | _');
    expect(vor('d', 'k1')).toBe('p(k1 k2) d q top _ | _ | _');
  });
  it('keeps the three sections intact for any drop position', () => {
    for (const id of ['p', 'q', 'top', 'k1', 'd']) {
      const rows = gliederungZeilen(baum(), id);
      for (let i = 0; i < rows.length; i++) {
        const z = gliederungZiel(rows, id, i);
        if (!z) continue;
        const tr = bausteinInGliederungVerschieben(state(), id, z);
        if (tr) expect(state().apply(tr).doc.childCount).toBe(3);
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
