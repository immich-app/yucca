<script lang="ts">
  import { socket } from "$lib/events";
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
  import { mdiBackupRestore, mdiCog, mdiViewDashboard } from "@mdi/js";
  import Dashboard from "./Dashboard.svelte";

  const { mock }: { mock: boolean } = $props();

  // svelte-ignore state_referenced_locally
  if (mock) {
    socket.disconnect();
    setProvider(new MockProvider());
  } else {
    socket.connect();
    setProvider(orchestrationApiProvider);
  }

  let open = $state(true);
  let route = $state("dashboard");
</script>

<AppShell>
  <AppShellHeader>
    <Heading>App Name</Heading>
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

  <div class="p-4 flex flex-col gap-2">
    {#if route === "dashboard"}
      <Dashboard />

      {#if !mock}
        <TasksList />
      {/if}
    {:else if route === "backups"}
      <BackupsList local />
    {:else if route === "config"}
      {#if !mock}
        <BackendsList />
      {/if}
    {/if}
  </div>
</AppShell>
