import {
  AppShell,
  Avatar,
  Burger,
  Button,
  Group,
  Menu,
  NavLink,
  Switch,
  Title,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconHome,
  IconLogout,
  IconMoon,
  IconUser,
  IconUsers,
  IconUsersGroup,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { unwrap, useApi } from './api';
import { useAuth } from './auth';

/** Own profile picture in the header; opens the menu with the profile link and the theme switch. */
function ProfilMenue() {
  const api = useApi();
  const { can } = useAuth();
  const darfProfil = can('profil:bearbeiten');
  const { setColorScheme } = useMantineColorScheme();
  const dunkel = useComputedColorScheme('light') === 'dark';
  const me = useQuery({ queryKey: ['me'], queryFn: async () => unwrap(await api.me.$get()) });
  const mitglied = useQuery({
    queryKey: ['mitglied'],
    enabled: darfProfil,
    queryFn: async () => {
      const res = await api.me.mitglied.$get();
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Profil konnte nicht geladen werden');
      return res.json();
    },
  });
  return (
    <Menu position="bottom-end" width={240}>
      <Menu.Target>
        <UnstyledButton aria-label="Profilmenü" style={{ lineHeight: 0 }} p={2}>
          <Avatar
            src={mitglied.data?.profilbildUrl}
            name={me.data?.preferredUsername}
            color="initials"
            size={40}
            radius="xl"
            alt=""
          />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {darfProfil && (
          <Menu.Item component={Link} to="/profil" leftSection={<IconUser size={18} />} py="sm">
            Mein Profil
          </Menu.Item>
        )}
        <Menu.Item
          closeMenuOnClick={false}
          onClick={() => setColorScheme(dunkel ? 'light' : 'dark')}
          leftSection={<IconMoon size={18} />}
          rightSection={
            <Switch
              checked={dunkel}
              onChange={() => {}}
              tabIndex={-1}
              aria-hidden
              style={{ pointerEvents: 'none' }}
            />
          }
          py="sm"
        >
          Dunkler Modus
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * Mobile-first shell: header + burger-toggled navbar below `md`, persistent sidebar from `md` up.
 */
export function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { user, can, logout } = useAuth();
  const { pathname } = useLocation();
  const [opened, { toggle, close }] = useDisclosure(false);

  const links = [
    { to: '/', label: 'Startseite', icon: <IconHome size={20} />, show: true },
    {
      to: '/mitglieder',
      label: 'Mitglieder',
      icon: <IconUsersGroup size={20} />,
      show: can('mitglieder:lesen'),
    },
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
            <Group gap="xs" wrap="nowrap">
              <Button
                variant="subtle"
                size="sm"
                leftSection={<IconLogout size={18} />}
                onClick={logout}
                visibleFrom="xs"
              >
                Abmelden
              </Button>
              <ProfilMenue />
            </Group>
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
