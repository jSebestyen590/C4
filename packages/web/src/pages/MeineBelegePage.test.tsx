import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { EinreichungDto } from '@c4/shared';
import { EinreichungKarte } from './MeineBelegePage';

const e = (extra: Partial<EinreichungDto> = {}): EinreichungDto => ({
  id: 'e1',
  status: 'eingereicht',
  belegdatum: '2026-11-18',
  betragCent: 1234,
  rechnungssteller: 'Metro',
  notiz: null,
  verworfenGrund: null,
  belegNummer: null,
  eingereichtAm: '2026-11-19T10:00:00Z',
  ...extra,
});

const html = (x: EinreichungDto) =>
  renderToStaticMarkup(
    <MantineProvider>
      <MemoryRouter>
        <EinreichungKarte e={x} />
      </MemoryRouter>
    </MantineProvider>,
  );

describe('EinreichungKarte', () => {
  it('shows date, Rechnungssteller, amount and status as a link', () => {
    const h = html(e());
    expect(h).toContain('Metro');
    expect(h).toContain('18.11.2026');
    expect(h).toContain('Eingereicht');
    expect(h).toContain('href="/belege/e1"');
  });

  it('shows the reason when rejected and the number when booked', () => {
    expect(html(e({ status: 'verworfen', verworfenGrund: 'Unleserlich' }))).toContain(
      'Grund: Unleserlich',
    );
    expect(html(e({ status: 'gebucht', belegNummer: 'B-12' }))).toContain('B-12');
  });
});
