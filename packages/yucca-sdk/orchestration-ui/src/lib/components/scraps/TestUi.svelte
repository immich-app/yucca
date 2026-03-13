<script lang="ts">
  import {
    MockProvider,
    orchestrationApiProvider,
    setProvider,
  } from "$lib/providers";
  import {
    AppShell,
    AppShellHeader,
    AppShellSidebar,
    Heading,
    NavbarItem,
  } from "@immich/ui";
  import BackendsList from "../backends/BackendsList.svelte";
  import BackupsList from "../backups/BackupsList.svelte";
  import TasksList from "../tasks/TasksList.svelte";
  import {
    mdiBackupRestore,
    mdiClock,
    mdiCog,
    mdiViewDashboard,
  } from "@mdi/js";
  import ScheduleList from "../schedules/ScheduleList.svelte";
  import Dashboard from "../dashboard/Dashboard.svelte";

  const { mock }: { mock: boolean } = $props();

  // svelte-ignore state_referenced_locally
  if (mock) {
    setProvider(new MockProvider());
  } else {
    setProvider(orchestrationApiProvider);
  }

  let open = $state(true);
  let route = $state("dashboard");
</script>

<AppShell>
  <AppShellHeader>
    <Heading
      ><img
        alt="App Name Here"
        src="/app-name-here.png"
        class="inline h-12"
      /></Heading
    >
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
    {#if route === "dashboard"}
      <!-- <Heading>Dashboard (Live) Scrap</Heading>
      <DashboardLive />
      <Heading>Dashboard (Mock) Scrap</Heading>
      <Dashboard /> -->
      <Dashboard onNavigate={(target) => (route = target)} />
    {:else if route === "backups"}
      <BackupsList local />
    {:else if route === "config"}
      {#if !mock}
        <BackendsList />
      {/if}
    {:else if route === "schedules"}
      {#if !mock}
        <ScheduleList />
      {/if}
    {/if}
  </div>
</AppShell>
