<script lang="ts">
  import { AppShell, AppShellHeader, AppShellSidebar, Avatar, Button, Heading, HStack, NavbarItem } from "@immich/ui";
  import { defaults } from "yucca-sdk";
  import { t } from "svelte-i18n-lingui";
  import { page } from '$app/state';
  import { mdiViewDashboard, mdiBackupRestore } from '@mdi/js';

  const { data, children } = $props();

  let open = $state(true);
</script>

<AppShell>
  <AppShellHeader>
    <div class="flex h-full items-center justify-between p-4">
      <Heading size="tiny">FUTO Backups</Heading>
      <HStack>
        <Avatar name={data.user!.name} />
        <Button
          onclick={() => (location.href = defaults.baseUrl + "/auth/logout")}
          >{$t`Logout`}</Button
        >
      </HStack>
    </div>
  </AppShellHeader>

  <AppShellSidebar bind:open>
    <div class="pt-4 pr-2">
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
    </div>
  </AppShellSidebar>

  <div class="p-4">
    {@render children()}
  </div>
</AppShell>
