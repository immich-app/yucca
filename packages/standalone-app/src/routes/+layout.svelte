<script lang="ts">
  import { page } from '$app/state';
  import {
    OnboardingGate,
    orchestrationApiProvider,
    setProvider,
    YuccaContext,
  } from '@futo-org/backups-orchestrator-ui';
  import {
    AppShell,
    AppShellHeader,
    AppShellSidebar,
    initializeTheme,
    NavbarItem,
    Text,
    ThemeSwitcher,
    toastManager,
  } from '@immich/ui';
  import { resolve } from '$app/paths';
  import { nav } from '$lib/nav';
  import './layout.css';

  const { children } = $props();

  setProvider(orchestrationApiProvider);

  initializeTheme();

  toastManager.setOptions({
    class: 'fixed top-0 right-0 flex flex-col items-end justify-end gap-2 p-4',
  });

  let sidebarOpen = $state(true);
</script>

<svelte:head><title>FUTO Backups</title></svelte:head>

<div class="bg-light text-dark min-h-dvh">
  <YuccaContext baseUrl="">
    <AppShell>
      <AppShellHeader>
        <div class="flex w-full items-center justify-between px-4 py-2">
          <Text class="text-2xl font-bold">FUTO Backups</Text>
          <ThemeSwitcher size="medium" color="secondary" />
        </div>
      </AppShellHeader>

      <AppShellSidebar bind:open={sidebarOpen}>
        <div class="pt-4 pr-2">
          {#each nav as item (item.id)}
            <NavbarItem
              href={resolve(item.id)}
              title={item.title}
              icon={item.icon}
              active={page.route.id === item.id}
            />
          {/each}
        </div>
      </AppShellSidebar>

      <div class="m-auto flex max-w-6xl flex-col gap-2 p-4">
        <OnboardingGate onExit={() => location.reload()}>
          {@render children()}
        </OnboardingGate>
      </div>
    </AppShell>
  </YuccaContext>
</div>
