import { Badge, Group } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { Mitglied } from '@c4/shared';

/** Links to the Posten a member currently holds; renders nothing without any. */
export function PostenLinks({ posten }: Readonly<{ posten: Mitglied['posten'] }>) {
  if (posten.length === 0) return null;
  return (
    <Group gap={4}>
      {posten.map((p) => (
        <Badge
          key={p.id}
          component={Link}
          to={`/posten/${encodeURIComponent(p.id)}`}
          variant="light"
          color="indigo"
          style={{ cursor: 'pointer', textTransform: 'none' }}
        >
          {p.bezeichnung}
        </Badge>
      ))}
    </Group>
  );
}
