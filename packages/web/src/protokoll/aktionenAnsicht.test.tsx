import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ProtokollAktionDto } from '@c4/shared';
import { AktionenAuswahl, AktionenKarte } from './AktionenAnsicht';

const basis: ProtokollAktionDto = {
  id: 'a:event.anlegen',
  bausteinId: 'a',
  art: 'event.anlegen',
  text: 'Event „Sommerfest“ im Kalender anlegen',
  ausfuehrbar: true,
  erledigt: false,
  eventId: null,
  subs: [],
  zustand: 'offen',
  ergebnis: null,
  personen: [],
};
const liste: ProtokollAktionDto[] = [
  basis,
  {
    ...basis,
    id: 'b:aufnahme.status',
    art: 'aufnahme.status',
    text: 'Status auf „Mitglied“ setzen',
    personen: [
      {
        sub: 's1',
        username: 'Niklas',
        vorname: 'N',
        nachname: 'K',
        status: 'mitglied',
        anrede: 'neutral',
      },
    ],
  },
  {
    ...basis,
    id: 'c:em.status',
    art: 'em.status',
    text: 'EM setzen',
    ausfuehrbar: false,
    zustand: 'nicht_ausfuehrbar',
    grund: 'Keine Person gewählt',
  },
  {
    ...basis,
    id: 'd:event.aendern',
    art: 'event.aendern',
    text: 'Event ändern',
    erledigt: true,
    zustand: 'erledigt',
    eventId: 'ev1',
  },
  {
    ...basis,
    id: 'e:wahl.posten',
    art: 'wahl.posten',
    text: 'Posten besetzen',
    zustand: 'fehler',
    ergebnis: {
      status: 'fehler',
      text: 'Posten nicht gefunden',
      am: '2026-01-01T00:00:00Z',
      von: 'x',
    },
  },
];

const rendern = (el: React.ReactNode) =>
  renderToStaticMarkup(
    <MantineProvider>
      <MemoryRouter>{el}</MemoryRouter>
    </MantineProvider>,
  );

describe('AktionenAuswahl', () => {
  const html = rendern(
    <AktionenAuswahl aktionen={liste} auswahl={['a:event.anlegen']} onAuswahl={() => undefined} />,
  );

  it('shows texts, persons and the event link', () => {
    expect(html).toContain('Event „Sommerfest“ im Kalender anlegen');
    expect(html).toContain('Niklas');
    expect(html).toContain('/mitglieder/Niklas');
    expect(html).toContain('/kalender/events/ev1');
  });

  it('checks the selection, disables what cannot run and explains why', () => {
    const boxen = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
    expect(boxen).toHaveLength(4); // the erledigt one has no checkbox
    expect(boxen[0]).toContain('checked');
    expect(boxen[1]).not.toContain('checked=""');
    expect(boxen[2]).toContain('disabled');
    expect(html).toContain('Keine Person gewählt');
    expect(html).toContain('Zuletzt fehlgeschlagen: Posten nicht gefunden');
    expect(html).toContain('aria-label="erledigt"');
  });
});

describe('AktionenKarte', () => {
  it('renders nothing without Aktionen', () => {
    expect(
      rendern(
        <AktionenKarte
          aktionen={[]}
          laeuftId={null}
          gesperrt={false}
          onAusfuehren={() => undefined}
        />,
      ),
    ).not.toContain('Aktionen');
  });

  it('offers Ausführen for open and Erneut versuchen for failed Aktionen only', () => {
    const html = rendern(
      <AktionenKarte
        aktionen={liste}
        laeuftId={null}
        gesperrt={false}
        onAusfuehren={() => undefined}
      />,
    );
    expect(html).toContain('>Aktionen<');
    expect(html.match(/Ausführen</g)).toHaveLength(2); // the two open ones
    expect(html).toContain('Erneut versuchen');
    expect(html).toContain('Nicht ausführbar: Keine Person gewählt');
    expect(html).toContain('Fehlgeschlagen: Posten nicht gefunden');
  });
});
