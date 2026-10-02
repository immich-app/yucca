<script lang="ts">
  import { page } from "$app/state";
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
  } from "@immich/ui";
  import {
    mdiBackupRestore,
    mdiConnection,
    mdiMenu,
    mdiViewDashboard,
  } from "@mdi/js";
  import { configureYucca, SkipLink } from "@futo-org/backups-orchestrator-ui";
  import { t } from "svelte-i18n-lingui";
  import { defaults } from "@futo-org/backups-api-client";
  import { sidebarStore } from "$lib/stores/sidebar.svelte";
  import { beforeNavigate } from "$app/navigation";
  import FutoBackupsLogo from "$lib/components/FutoBackupsLogo.svelte";

  const { data, children } = $props();

  configureYucca({ api: "customer" });

  beforeNavigate(() => sidebarStore.reset());
</script>

<AppShell>
  <AppShellHeader>
    <SkipLink target="main-content" />

    <div class="flex w-full h-full items-center justify-between p-4">
      <HStack>
        <IconButton
          icon={mdiMenu}
          aria-label={$t`Toggle navigation`}
          aria-expanded={sidebarStore.isOpen}
          aria-controls="dashboard-nav"
          variant="ghost"
          color="secondary"
          shape="round"
          class="md:hidden"
          onclick={() => sidebarStore.toggle()}
        />
        <Heading size="tiny" tag="h2"><FutoBackupsLogo /></Heading>
      </HStack>
      <HStack>
        <Avatar name={data.user!.name} />
        <span class="sr-only">{data.user!.name}</span>
        <Button href={defaults.baseUrl + "api/auth/logout"}>{$t`Logout`}</Button
        >
      </HStack>
    </div>
  </AppShellHeader>

  <AppShellSidebar bind:open={sidebarStore.isOpen}>
    <nav
      id="dashboard-nav"
      class="pt-4 pr-2"
      aria-label={$t`Main`}
      inert={!sidebarStore.isOpen}
    >
      <NavbarItem
        title="Dashboard"
        href="/dashboard"
        icon={mdiViewDashboard}
        active={page.url.pathname === "/dashboard"}
      />
      <NavbarItem
        title="Backups"
        href="/dashboard/backups"
        icon={mdiBackupRestore}
        active={page.url.pathname === "/dashboard/backups"}
      />
      <NavbarItem
        title="Connections"
        href="/dashboard/connections"
        icon={mdiConnection}
        active={page.url.pathname === "/dashboard/connections"}
      />
    </nav>
  </AppShellSidebar>

  <main id="main-content" tabindex="-1" class="p-4 outline-none">
    {@render children()}
  </main>
</AppShell>
