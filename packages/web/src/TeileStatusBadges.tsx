import { Badge } from '@mantine/core';
import { teileStatus } from '@c4/shared';
import { teileStatusBadges } from './inventarAnzeige';
import type { GegenstandEintrag } from './inventarDaten';

/** Lent / reserved badges of a parent made of parts (complete = filled, partial = outline). */
export function TeileStatusBadges({
  eltern,
  teile,
}: Readonly<{ eltern: GegenstandEintrag; teile: GegenstandEintrag[] }>) {
  return teileStatusBadges(eltern, teileStatus(eltern, teile)).map((b) => (
    <Badge key={b.text} color={b.color} variant={b.voll ? 'light' : 'outline'}>
      {b.text}
    </Badge>
  ));
}
