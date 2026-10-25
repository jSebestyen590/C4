import { Group } from '@mantine/core';
import type { ReactNode } from 'react';

/** Sticky bottom bar with the main actions; keeps clear of the iOS home indicator. */
export function InventurLeiste({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Group
      grow
      gap="sm"
      p="sm"
      pb="calc(var(--mantine-spacing-sm) + env(safe-area-inset-bottom))"
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 10,
        background: 'var(--mantine-color-body)',
        borderTop: '1px solid var(--mantine-color-default-border)',
      }}
    >
      {children}
    </Group>
  );
}
