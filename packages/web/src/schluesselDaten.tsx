import { Anchor, Text } from '@mantine/core';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { AnfrageDto, Halter, HalterDto, SchluesselDetailDto, SchluesselDto } from '@c4/shared';
import { unwrap, useApi } from './api';
import { mitgliedLink, mitgliedName } from './mitglied';
import { StatusName } from './StatusAnzeige';

/** Every Schlüssel query lives under this key, so one invalidation refreshes the whole area. */
export const schluesselKeys = {
  alle: ['schluessel'] as const,
  liste: (mitArchiv: boolean) => ['schluessel', 'liste', mitArchiv] as const,
  detail: (id: string | undefined) => ['schluessel', 'detail', id] as const,
  anfragen: ['schluessel', 'anfragen'] as const,
  anfrage: (id: string | undefined) => ['schluessel', 'anfrage', id] as const,
};

export const schluesselInvalidieren = (qc: QueryClient) =>
  qc.invalidateQueries({ queryKey: schluesselKeys.alle });

export const schluesselLink = (id: string) => `/schluessel/${encodeURIComponent(id)}`;

export const anfrageLink = (id: string) => `/schluessel/anfragen/${encodeURIComponent(id)}`;

export function useSchluesselListe(mitArchiv = false) {
  const api = useApi();
  return useQuery({
    queryKey: schluesselKeys.liste(mitArchiv),
    queryFn: async () =>
      (await unwrap(
        await api.schluessel.$get({ query: mitArchiv ? { archiv: '1' } : {} }),
      )) as SchluesselDto[],
  });
}

export function useSchluessel(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: schluesselKeys.detail(id),
    enabled: !!id,
    queryFn: async () =>
      (await unwrap(
        await api.schluessel[':id'].$get({ param: { id: id! } }),
      )) as SchluesselDetailDto,
  });
}

/** Open and current key requests (Bedarf / Abgabe). */
export function useAnfragen() {
  const api = useApi();
  return useQuery({
    queryKey: schluesselKeys.anfragen,
    queryFn: async () => (await unwrap(await api.schluessel.anfragen.$get())) as AnfrageDto[],
  });
}

export function useAnfrage(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: schluesselKeys.anfrage(id),
    enabled: !!id,
    queryFn: async () =>
      (await unwrap(
        await api.schluessel.anfragen[':id'].$get({ param: { id: id! } }),
      )) as AnfrageDto,
  });
}

/** The holder as the API expects it in `von` (without display data). */
export const alsHalter = (h: HalterDto): Halter =>
  h === null
    ? null
    : h.art === 'mitglied'
      ? { art: 'mitglied', sub: h.sub }
      : { art: 'person', name: h.name };

export const istHalter = (h: HalterDto, sub: string | undefined) =>
  !!sub && h?.art === 'mitglied' && h.sub === sub;

/** A holder: members bold in their status color and linked, persons without the app as plain text. */
export function HalterName({ halter }: Readonly<{ halter: HalterDto }>) {
  if (halter === null) return <Text span>niemandem</Text>;
  if (halter.art === 'person') {
    return (
      <Text span style={{ overflowWrap: 'anywhere' }}>
        {halter.name}{' '}
        <Text span c="dimmed">
          (ohne App)
        </Text>
      </Text>
    );
  }
  return (
    <Anchor
      component={Link}
      to={mitgliedLink({ sub: halter.sub, username: halter.username })}
      underline="hover"
    >
      <StatusName status={halter.status}>{mitgliedName(halter)}</StatusName>
    </Anchor>
  );
}
