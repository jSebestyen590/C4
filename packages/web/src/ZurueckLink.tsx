import { Anchor, Group } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { aktuellerRueckweg } from './zurueckVerlauf';

/**
 * Back link at the top of a page. Returns to the page the user actually came from (keeping its filters and scroll
 * position); `to` and `children` are the fallback for deep links and fresh tabs. The label stays `children` when the
 * previous page is that fallback, otherwise it reads "Zurück".
 */
export function ZurueckLink({ to, children }: Readonly<{ to: string; children: ReactNode }>) {
  const navigate = useNavigate();
  const location = useLocation();
  const weg = aktuellerRueckweg(location);
  const zielPfad = to.split(/[?#]/)[0];
  const label = !weg || weg.ort.pathname === zielPfad ? children : 'Zurück';
  return (
    <Anchor
      component={Link}
      to={weg ? weg.ort.pathname + weg.ort.search : to}
      size="sm"
      onClick={(e) => {
        if (!weg || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        void navigate(-weg.schritte);
      }}
    >
      <Group gap={4} wrap="nowrap">
        <IconChevronLeft size={16} />
        {label}
      </Group>
    </Anchor>
  );
}
