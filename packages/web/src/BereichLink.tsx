import { Anchor, type AnchorProps } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Link from a Finanzen page into another area (Events, Waren, Mitglieder, ...). Opens in a new tab so
 * the Finanzer:in keeps the work page. Links inside /finanzen use a plain `Anchor`/`Link`.
 */
export function BereichLink({
  to,
  children,
  ...rest
}: Readonly<AnchorProps & { to: string; children: ReactNode }>) {
  return (
    <Anchor component={Link} to={to} target="_blank" rel="noopener" {...rest}>
      {children}
      <IconExternalLink
        size={14}
        aria-label="öffnet in neuem Tab"
        style={{ marginLeft: 3, verticalAlign: '-2px', flexShrink: 0 }}
      >
        <title>öffnet in neuem Tab</title>
      </IconExternalLink>
    </Anchor>
  );
}
