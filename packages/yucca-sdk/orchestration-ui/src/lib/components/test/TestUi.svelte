<script lang="ts">
  import {
    AppShell,
    AppShellHeader,
    AppShellSidebar,
    Heading,
    IconButton,
    NavbarItem,
    ThemeSwitcher,
  } from "@immich/ui";
  import {
    mdiBackupRestore,
    mdiClock,
    mdiCog,
    mdiMenu,
    mdiViewDashboard,
  } from "@mdi/js";
  import GlobalSettings from "../settings/GlobalSettings.svelte";
  import BackupsList from "../backups/BackupsList.svelte";
  import DashboardPage from "../dashboard/DashboardPage.svelte";
  import ScheduleList from "../schedules/ScheduleList.svelte";
  import SkipLink from "../ui/SkipLink.svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  const fullSidebar = new MediaQuery("min-width: 48rem");
  let open = $derived(fullSidebar.current);
  const routes = [
    { id: "dashboard", title: "Dashboard", icon: mdiViewDashboard },
    { id: "backups", title: "Backups", icon: mdiBackupRestore },
    { id: "schedules", title: "Schedules", icon: mdiClock },
    { id: "config", title: "Configure", icon: mdiCog },
  ];
  const currentRoute = $derived(
    routes.find(({ id }) => id === page.url.hash.slice(1)) ?? routes[0],
  );
  const route = $derived(currentRoute.id);
</script>

<AppShell class="h-full">
  <AppShellHeader>
    <SkipLink target="main-content" />

    <div class="flex items-center justify-between w-full px-4 py-2">
      <div class="flex items-center gap-1">
        <IconButton
          shape="round"
          color="secondary"
          variant="ghost"
          size="medium"
          aria-label="Main menu"
          aria-expanded={open}
          icon={mdiMenu}
          onclick={() => (open = fullSidebar.current ? true : !open)}
          class="md:hidden"
        />
        <Heading>
          <img
            alt="App Name Here"
            src="/app-name-here.png"
            class="inline h-12"
          />
        </Heading>
      </div>
      <ThemeSwitcher size="medium" color="secondary" />
    </div>
  </AppShellHeader>

  <AppShellSidebar bind:open>
    <nav class="pt-4 pr-2" aria-label="Main">
      {#each routes as { id, title, icon } (id)}
        <NavbarItem href="#{id}" {title} {icon} active={route === id} />
      {/each}
    </nav>
  </AppShellSidebar>

  <main
    id="main-content"
    tabindex="-1"
    class="p-4 flex flex-col gap-2 max-w-6xl m-auto outline-none"
  >
    <Heading tag="h1" class="sr-only">{currentRoute.title}</Heading>

    {#if route === "dashboard"}
      <DashboardPage onViewBackups={() => goto("#backups")} />
    {:else if route === "backups"}
      <BackupsList />
    {:else if route === "config"}
      <GlobalSettings />
    {:else if route === "schedules"}
      <ScheduleList />
    {/if}
  </main>
</AppShell>
