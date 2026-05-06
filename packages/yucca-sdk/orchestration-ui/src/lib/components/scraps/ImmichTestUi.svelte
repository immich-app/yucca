<script lang="ts">
  import { orchestrationApiProvider, setProvider } from "$lib/providers";
  import {
    AppShell,
    AppShellHeader,
    AppShellSidebar,
    Logo,
    NavbarGroup,
    NavbarItem,
    ThemeSwitcher,
  } from "@immich/ui";
  import {
    mdiAccountMultipleOutline,
    mdiArchiveArrowDownOutline,
    mdiBackupRestore,
    mdiHeartOutline,
    mdiImageAlbum,
    mdiImageMultipleOutline,
    mdiLockOutline,
    mdiMagnify,
    mdiMapOutline,
    mdiToolboxOutline,
    mdiTrashCanOutline,
  } from "@mdi/js";
  import ImmichBackupsPage from "../integrations/immich/ImmichBackupsPage.svelte";

  type Props = {
    onExit: () => void;
  };

  const { onExit }: Props = $props();

  // svelte-ignore state_referenced_locally
  setProvider(orchestrationApiProvider);
</script>

<AppShell>
  <AppShellHeader>
    <div class="flex items-center justify-between w-full px-4 py-2">
      <Logo variant="inline" class="h-12" />
      <ThemeSwitcher size="medium" color="secondary" />
    </div>
  </AppShellHeader>

  <AppShellSidebar>
    <div class="pt-4 pr-2">
      <NavbarItem href="#" title="Photos" icon={mdiImageMultipleOutline} />
      <NavbarItem href="#" title="Explore" icon={mdiMagnify} />
      <NavbarItem href="#" title="Map" icon={mdiMapOutline} />
      <NavbarItem href="#" title="Sharing" icon={mdiAccountMultipleOutline} />

      <NavbarGroup title="Library" size="tiny" />

      <NavbarItem href="#" title="Favorites" icon={mdiHeartOutline} />
      <NavbarItem
        href="#"
        title="Albums"
        icon={{ icon: mdiImageAlbum, flipped: true }}
      />
      <NavbarItem href="#" title="Backups" icon={mdiBackupRestore} active />
      <NavbarItem href="#" title="Utilities" icon={mdiToolboxOutline} />
      <NavbarItem href="#" title="Archive" icon={mdiArchiveArrowDownOutline} />
      <NavbarItem href="#" title="Locked folder" icon={mdiLockOutline} />
      <NavbarItem href="#" title="Trash" icon={mdiTrashCanOutline} />
    </div>
  </AppShellSidebar>

  <ImmichBackupsPage {onExit} />
</AppShell>
