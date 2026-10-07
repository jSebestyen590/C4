import { AppShell, Burger, Button, Group, NavLink, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconHome, IconLogout, IconUsers } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth';

/**
 * Mobile-first shell: header + burger-toggled navbar below `md`, persistent sidebar from `md` up.
 */
export function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { user, can, logout } = useAuth();
  const { pathname } = useLocation();
  const [opened, { toggle, close }] = useDisclosure(false);

  const links = [
    { to: '/', label: 'Startseite', icon: <IconHome size={20} />, show: true },
    { to: '/admin', label: 'Benutzer', icon: <IconUsers size={20} />, show: can('users:manage') },
  ].filter((l) => l.show);

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: 'md', collapsed: { mobile: !opened, desktop: !user } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group wrap="nowrap">
            {user && (
              <Burger
                opened={opened}
                onClick={toggle}
                hiddenFrom="md"
                size="sm"
                aria-label="Menü"
              />
            )}
            <Title order={3}>C4</Title>
          </Group>
          {user && (
            <Button
              variant="subtle"
              size="sm"
              leftSection={<IconLogout size={18} />}
              onClick={logout}
              visibleFrom="xs"
            >
              Abmelden
            </Button>
          )}
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        {links.map((l) => (
          <NavLink
            key={l.to}
            component={Link}
            to={l.to}
            label={l.label}
            leftSection={l.icon}
            active={pathname === l.to}
            onClick={close}
            py="sm"
          />
        ))}
        <NavLink
          label="Abmelden"
          leftSection={<IconLogout size={20} />}
          onClick={logout}
          hiddenFrom="xs"
          py="sm"
          mt="auto"
        />
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
