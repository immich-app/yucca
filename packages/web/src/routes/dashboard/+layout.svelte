<script lang="ts">
  import { page } from '$app/state';
  import {
    AppShell,
    AppShellHeader,
    AppShellSidebar,
    Avatar,
    Button,
    Heading,
    HStack,
    IconButton,
    NavbarItem,
  } from '@immich/ui';
  import { mdiBackupRestore, mdiConnection, mdiMenu, mdiViewDashboard } from '@mdi/js';
  import { configureYucca } from '@futo-org/backups-orchestrator-ui';
  import { t } from 'svelte-i18n-lingui';
  import { defaults } from '@futo-org/backups-api-client';
  import { MediaQuery } from 'svelte/reactivity';
  import { afterNavigate } from '$app/navigation';

  const { data, children } = $props();

  configureYucca({ api: 'customer' });

  const desktop = new MediaQuery('min-width: 768px');
  let open = $derived(desktop.current);

  afterNavigate(() => {
    if (!desktop.current) {
      open = false;
    }
  });
</script>

<AppShell>
  <AppShellHeader>
    <div class="flex w-full h-full items-center justify-between p-4">
      <HStack>
        <IconButton
          icon={mdiMenu}
          aria-label={$t`Toggle navigation`}
          aria-expanded={open}
          aria-controls="dashboard-nav"
          variant="ghost"
          color="secondary"
          shape="round"
          class="md:hidden"
          onclick={() => (open = !open)}
        />
        <Heading size="tiny" tag="h2">FUTO Backups</Heading>
      </HStack>
      <HStack>
        <Avatar name={data.user!.name} />
        <span class="sr-only">{data.user!.name}</span>
        <Button href={defaults.baseUrl + 'api/auth/logout'}>{$t`Logout`}</Button>
      </HStack>
    </div>
  </AppShellHeader>

  <AppShellSidebar {open}>
    <nav id="dashboard-nav" class="pt-4 pr-2" aria-label={$t`Main`} inert={!open}>
      <NavbarItem
        title="Dashboard"
        href="/dashboard"
        icon={mdiViewDashboard}
        active={page.url.pathname === '/dashboard'}
      />
      <NavbarItem
        title="Backups"
        href="/dashboard/backups"
        icon={mdiBackupRestore}
        active={page.url.pathname === '/dashboard/backups'}
      />
      <NavbarItem
        title="Connections"
        href="/dashboard/connections"
        icon={mdiConnection}
        active={page.url.pathname === '/dashboard/connections'}
      />
    </nav>
  </AppShellSidebar>

  <main class="p-4">
    {@render children()}
  </main>
</AppShell>
