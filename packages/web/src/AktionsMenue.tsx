import { ActionIcon, Menu } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import type { ReactNode } from 'react';

export interface Aktion {
  text: string;
  icon: ReactNode;
  onClick: () => void;
  color?: string;
  disabled?: boolean;
  /** Entries that do not apply are left out. */
  sichtbar?: boolean;
  /** Main action, listed first where actions are shown as buttons. */
  primaer?: boolean;
  /** Draws a divider above the entry. */
  trenner?: boolean;
}

/** "…" button (44px touch target) opening a menu of actions; renders nothing without any entry. */
export function AktionsMenue({ aktionen, label }: Readonly<{ aktionen: Aktion[]; label: string }>) {
  const sichtbar = aktionen.filter((a) => a.sichtbar !== false);
  if (sichtbar.length === 0) return null;
  return (
    <Menu position="bottom-end" width={260} withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" size={42} aria-label={label}>
          <IconDots size={22} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {sichtbar.map((a) => (
          <div key={a.text}>
            {a.trenner && <Menu.Divider />}
            <Menu.Item
              leftSection={a.icon}
              color={a.color}
              disabled={a.disabled}
              onClick={a.onClick}
              mih={42}
            >
              {a.text}
            </Menu.Item>
          </div>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
