import {
  AppShell,
  Avatar,
  Badge,
  Burger,
  Button,
  Group,
  Indicator,
  Menu,
  NavLink,
  Text,
  UnstyledButton,
  type MantineColorScheme,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import {
  IconBeer,
  IconBell,
  IconBriefcase,
  IconChecklist,
  IconConfetti,
  IconCalendar,
  IconNotes,
  IconPhoto,
  IconCheck,
  IconHistory,
  IconDeviceDesktop,
  IconBuildingWarehouse,
  IconHome,
  IconKey,
  IconListCheck,
  IconBox,
  IconPackage,
  IconLogout,
  IconTimeline,
  IconMoon,
  IconSun,
  IconUser,
  IconUsersGroup,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { Link, useLocation, useNavigationType } from 'react-router-dom';
import { unwrap, useApi } from './api';
import logo from './assets/favicon.png';
import logoDunkel from './assets/logo-dunkel.png';
import { usePushGelesenParam, useUngelesen } from './benachrichtigungVerlauf';
import { useAuth } from './auth';
import { PullToRefresh } from './PullToRefresh';
import { ortMerken } from './zurueckVerlauf';

const FARBMODI: { wert: MantineColorScheme; text: string; icon: ReactNode }[] = [
  { wert: 'light', text: 'Hell', icon: <IconSun size={18} /> },
  { wert: 'dark', text: 'Dunkel', icon: <IconMoon size={18} /> },
  { wert: 'auto', text: 'Systemeinstellung', icon: <IconDeviceDesktop size={18} /> },
];

/** Own profile picture in the header; opens the menu with the profile link and the light/dark/system choice. */
function ProfilMenue() {
  const api = useApi();
  const { can } = useAuth();
  const darfProfil = can('profil:bearbeiten');
  const { colorScheme, setColorScheme } = useMantineColorScheme();
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
  const ungelesen = useUngelesen(darfProfil).data ?? 0;
  return (
    <Menu position="bottom-end" width={260}>
      <Menu.Target>
        <UnstyledButton
          aria-label={ungelesen > 0 ? `Profilmenü, ${ungelesen} ungelesen` : 'Profilmenü'}
          style={{ lineHeight: 0 }}
          p={2}
        >
          <Indicator
            label={ungelesen > 99 ? '99+' : ungelesen}
            disabled={ungelesen === 0}
            color="red"
            size={18}
            offset={4}
            withBorder
          >
            <Avatar
              src={mitglied.data?.profilbildUrl}
              name={me.data?.preferredUsername}
              color="initials"
              size={40}
              radius="xl"
              alt=""
            />
          </Indicator>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {darfProfil && (
          <Menu.Item component={Link} to="/profil" leftSection={<IconUser size={18} />} py="sm">
            Mein Profil
          </Menu.Item>
        )}
        {darfProfil && (
          <Menu.Item
            component={Link}
            to="/benachrichtigungen"
            leftSection={<IconBell size={18} />}
            py="sm"
          >
            Benachrichtigungen
          </Menu.Item>
        )}
        {darfProfil && (
          <Menu.Item
            component={Link}
            to="/benachrichtigungen/verlauf"
            leftSection={<IconHistory size={18} />}
            rightSection={
              ungelesen > 0 ? (
                <Badge color="red" size="sm" circle={ungelesen < 10}>
                  {ungelesen > 99 ? '99+' : ungelesen}
                </Badge>
              ) : undefined
            }
            py="sm"
          >
            Benachrichtigungsverlauf
          </Menu.Item>
        )}
        <Text size="xs" c="dimmed" px="sm" pt="xs" pb={4}>
          Darstellung
        </Text>
        {FARBMODI.map(({ wert, text, icon }) => (
          <Menu.Item
            key={wert}
            closeMenuOnClick={false}
            leftSection={icon}
            rightSection={colorScheme === wert ? <IconCheck size={18} /> : undefined}
            aria-current={colorScheme === wert}
            onClick={() => setColorScheme(wert)}
            py="sm"
          >
            {text}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * Mobile-first shell: header + burger-toggled navbar below `md`, persistent sidebar from `md` up.
 * Logout lives at the bottom of the sidebar; tablets (xs to md) also get it in the header.
 */
export function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { user, can, logout } = useAuth();
  const location = useLocation();
  const { pathname } = location;
  // Runs during render so the pages' back links (rendered below) already see this navigation.
  ortMerken(location, useNavigationType());
  usePushGelesenParam();
  const [opened, { toggle, close }] = useDisclosure(false);
  const mobil = useMediaQuery('(max-width: 61.99em)');
  const menueOffen = opened && !!mobil;

  // Keep the page behind the open mobile menu from scrolling.
  useEffect(() => {
    if (!menueOffen) return;
    const alt = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = alt;
    };
  }, [menueOffen]);
  // Any navigation (sidebar, profile menu, in-page links) closes the mobile menu.
  useEffect(close, [pathname, close]);
  const farbschema = useComputedColorScheme('light');

  const links = [
    { to: '/', label: 'Startseite', icon: <IconHome size={20} />, show: true },
    {
      to: '/mitglieder',
      label: 'Mitglieder',
      icon: <IconUsersGroup size={20} />,
      show: can('mitglieder:lesen'),
    },
    {
      to: '/historie',
      label: 'Historie',
      icon: <IconTimeline size={20} />,
      show: can('mitglieder:lesen'),
    },
    {
      to: '/kalender',
      label: 'Kalender',
      icon: <IconCalendar size={20} />,
      show: can('kalender:lesen'),
    },
    {
      to: '/bilder',
      label: 'Bilder',
      icon: <IconPhoto size={20} />,
      show: can('bilder:lesen'),
    },
    {
      to: '/protokolle',
      label: 'Protokolle',
      icon: <IconNotes size={20} />,
      show: can('protokolle:lesen'),
    },
    {
      to: '/privatpartys',
      label: 'Privatpartys',
      icon: <IconConfetti size={20} />,
      show: can('privatpartys:verwalten'),
    },
    {
      to: '/todos',
      label: 'Todos',
      icon: <IconChecklist size={20} />,
      show: !!user,
    },
    {
      to: '/posten',
      label: 'Posten',
      icon: <IconBriefcase size={20} />,
      show: can('posten:lesen'),
    },
    {
      to: '/schluessel',
      label: 'Schlüssel',
      icon: <IconKey size={20} />,
      show: can('schluessel:lesen'),
    },
    {
      to: '/umfragen',
      label: 'Umfragen',
      icon: <IconListCheck size={20} />,
      show: can('umfragen:lesen'),
    },
    {
      to: '/trichter',
      label: 'Trichter',
      icon: <IconBeer size={20} />,
      show: can('trichter:lesen'),
    },
    {
      to: '/waren',
      label: 'Waren',
      icon: <IconPackage size={20} />,
      show: can('waren:lesen'),
    },
    {
      to: '/lager',
      label: 'Lager',
      icon: <IconBuildingWarehouse size={20} />,
      show: can('waren:lesen'),
    },
    {
      to: '/inventar',
      label: 'Inventar',
      icon: <IconBox size={20} />,
      show: can('inventar:lesen'),
    },
  ].filter((l) => l.show);

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: 'md', collapsed: { mobile: !opened, desktop: !user } }}
      padding="md"
    >
      <PullToRefresh />
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
            <UnstyledButton component={Link} to="/" aria-label="C4 – zur Startseite" lh={0}>
              <img
                // In dark mode the stairs and the shadow are white instead of black.
                src={farbschema === 'dark' ? logoDunkel : logo}
                alt="C4"
                height={40}
                width={40}
                style={{ display: 'block' }}
              />
            </UnstyledButton>
          </Group>
          {user && (
            <Group gap="xs" wrap="nowrap">
              <Button
                variant="subtle"
                size="sm"
                leftSection={<IconLogout size={18} />}
                onClick={logout}
                visibleFrom="xs"
                hiddenFrom="md"
              >
                Abmelden
              </Button>
              <ProfilMenue />
            </Group>
          )}
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <AppShell.Section
          grow
          mih={0}
          style={{
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {links.map((l) => (
            <NavLink
              key={l.to}
              component={Link}
              to={l.to}
              label={l.label}
              leftSection={l.icon}
              active={pathname === l.to || (l.to !== '/' && pathname.startsWith(`${l.to}/`))}
              onClick={close}
              py="sm"
            />
          ))}
        </AppShell.Section>
        <AppShell.Section>
          <NavLink
            label="Abmelden"
            leftSection={<IconLogout size={20} />}
            onClick={logout}
            py="sm"
          />
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
