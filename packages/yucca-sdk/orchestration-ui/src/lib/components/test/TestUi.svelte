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
  import { MediaQuery } from "svelte/reactivity";

  const fullSidebar = new MediaQuery("min-width: 48rem");
  let open = $derived(fullSidebar.current);
  let route = $state("dashboard");
  const routeTitles: Record<string, string> = {
    dashboard: "Dashboard",
    backups: "Backups",
    schedules: "Schedules",
    config: "Configure",
  };
</script>

<AppShell class="h-full">
  <AppShellHeader>
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
    <div class="pt-4 pr-2">
      <div
        onclick={() => (route = "dashboard")}
        onkeydown={() => (route = "dashboard")}
        tabindex={0}
        role="button"
        aria-label="Dashboard"
      >
        <NavbarItem
          href="#"
          title="Dashboard"
          icon={mdiViewDashboard}
          active={route === "dashboard"}
        />
      </div>
      <div
        onclick={() => (route = "backups")}
        onkeydown={() => (route = "backups")}
        tabindex={0}
        role="button"
        aria-label="Backups"
      >
        <NavbarItem
          href="#"
          title="Backups"
          icon={mdiBackupRestore}
          active={route === "backups"}
        />
      </div>
      <div
        onclick={() => (route = "schedules")}
        onkeydown={() => (route = "schedules")}
        tabindex={0}
        role="button"
        aria-label="Schedules"
      >
        <NavbarItem
          href="#"
          title="Schedules"
          icon={mdiClock}
          active={route === "schedules"}
        />
      </div>
      <div
        onclick={() => (route = "config")}
        onkeydown={() => (route = "config")}
        tabindex={0}
        role="button"
        aria-label="Configure"
      >
        <NavbarItem
          href="#"
          title="Configure"
          icon={mdiCog}
          active={route === "config"}
        />
      </div>
    </div>
  </AppShellSidebar>

  <div class="p-4 flex flex-col gap-2 max-w-6xl m-auto">
    <Heading tag="h1" class="sr-only">{routeTitles[route]}</Heading>

    {#if route === "dashboard"}
      <DashboardPage onViewBackups={() => (route = "backups")} />
    {:else if route === "backups"}
      <BackupsList />
    {:else if route === "config"}
      <GlobalSettings />
    {:else if route === "schedules"}
      <ScheduleList />
    {/if}
  </div>
</AppShell>
