import { describe, expect, it } from 'vitest';
import { benachrichtigungKeys } from './benachrichtigungVerlauf';
import { finanzenKeys } from './finanzenDaten';
import { inventarKeys } from './inventarDaten';
import { kalenderKeys } from './kalenderDaten';
import { protokollKeys } from './protokollDaten';
import { historieKeys, inventurKeys, mitgliederKeys, postenKeys } from './queryKeys';
import { todoKeys } from './todoDaten';
import { gebindeKeys, lagerortKeys, warenKeys } from './warenDaten';

// Invalidation works by key prefix, so these arrays must stay exactly as they were before the key
// objects were introduced. Changing one silently breaks cache refreshes.
describe('query keys', () => {
  it('keeps the area prefixes', () => {
    expect(todoKeys.alle).toEqual(['todos']);
    expect(kalenderKeys.alle).toEqual(['kalender']);
    expect(protokollKeys.alle).toEqual(['protokolle']);
    expect(inventarKeys.alle).toEqual(['inventar']);
    expect(finanzenKeys.alle).toEqual(['finanzen']);
    expect(benachrichtigungKeys.alle).toEqual(['benachrichtigung-verlauf']);
    expect(mitgliederKeys.me).toEqual(['me']);
    expect(mitgliederKeys.mitglied).toEqual(['mitglied']);
    expect(mitgliederKeys.alle).toEqual(['mitglieder']);
    expect(postenKeys.alle).toEqual(['posten']);
    expect(warenKeys.alle).toEqual(['waren']);
    expect(lagerortKeys.alle).toEqual(['lagerorte']);
    expect(gebindeKeys.alle).toEqual(['gebinde']);
    expect(inventurKeys.alle).toEqual(['inventuren']);
    expect(historieKeys.alle).toEqual(['historie']);
  });

  it('keeps the keys below the prefixes', () => {
    expect(todoKeys.meine).toEqual(['todos', 'meine']);
    expect(kalenderKeys.events('2026-01-01', '2026-01-31')).toEqual([
      'kalender',
      'events',
      '2026-01-01',
      '2026-01-31',
    ]);
    expect(protokollKeys.detail('p1')).toEqual(['protokolle', 'detail', 'p1']);
    expect(protokollKeys.liste).toEqual(['protokolle', 'liste']);
    expect(inventarKeys.ausleihen(true)).toEqual(['inventar', 'ausleihen', 'offen']);
    expect(inventarKeys.ausleihen(false)).toEqual(['inventar', 'ausleihen', 'alle']);
    expect(inventarKeys.ausleihe('a1')).toEqual(['inventar', 'ausleihen', 'eine', 'a1']);
    expect(inventarKeys.aufraeumen).toEqual(['inventar', 'aufraeumen']);
    expect(finanzenKeys.konten({ archiviert: false })).toEqual([
      'finanzen',
      'konten',
      { archiviert: false },
    ]);
    expect(finanzenKeys.buchung('b1')).toEqual(['finanzen', 'buchung', 'b1']);
    expect(benachrichtigungKeys.listen).toEqual(['benachrichtigung-verlauf', 'liste']);
    expect(benachrichtigungKeys.ungelesen).toEqual(['benachrichtigung-verlauf', 'ungelesen']);
    expect(warenKeys.liste(true)).toEqual(['waren', { archiv: true }]);
    expect(warenKeys.detail('w1')).toEqual(['waren', 'detail', 'w1']);
    expect(lagerortKeys.liste).toEqual(['lagerorte', 'alle']);
    expect(postenKeys.liste(false)).toEqual(['posten', { archiv: false }]);
    expect(postenKeys.eins('p1')).toEqual(['posten', 'p1']);
    expect(mitgliederKeys.liste(false)).toEqual(['mitglieder']);
    expect(mitgliederKeys.liste(true)).toEqual(['mitglieder', { deaktivierte: true }]);
    expect(mitgliederKeys.eins('max')).toEqual(['mitglieder', 'max']);
    expect(inventurKeys.zusammenfassung('i1', 'iso')).toEqual([
      'inventuren',
      'i1',
      'zusammenfassung',
      'iso',
    ]);
  });
});
