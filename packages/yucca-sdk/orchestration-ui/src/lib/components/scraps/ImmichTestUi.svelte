<script lang="ts">
  import { orchestrationApiProvider, setProvider } from "$lib/providers";
  import {
    AppShell,
    AppShellHeader,
    AppShellSidebar,
    Avatar,
    Button,
    IconButton,
    Input,
    Logo,
    NavbarGroup,
    NavbarItem,
    ThemeSwitcher,
  } from "@immich/ui";
  import {
    mdiAccountMultipleOutline,
    mdiArchiveArrowDownOutline,
    mdiBackupRestore,
    mdiBellOutline,
    mdiCastVariant,
    mdiHeartOutline,
    mdiImageAlbum,
    mdiImageMultipleOutline,
    mdiLockOutline,
    mdiMagnify,
    mdiMapOutline,
    mdiMenu,
    mdiToolboxOutline,
    mdiTrashCanOutline,
    mdiTrayArrowUp,
    mdiTune,
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
    <div class="grid grid-cols-[--spacing(64)_auto] items-center w-full py-2">
      <div class="flex flex-row gap-1 mx-4 items-center">
        <IconButton
          shape="round"
          color="secondary"
          variant="ghost"
          size="medium"
          aria-label="Main menu"
          icon={mdiMenu}
          onclick={() => {}}
          class="sidebar:hidden"
        />
        <Logo variant="inline" class="h-12" />
      </div>
      <div class="flex justify-between gap-4 lg:gap-8 pe-6">
        <div class="hidden w-full max-w-5xl flex-1 sm:block">
          <Input
            placeholder="Search your photos"
            leadingIcon={mdiMagnify}
            trailingIcon={mdiTune}
            shape="round"
            size="medium"
          />
        </div>

        <section
          class="flex place-items-center justify-end gap-1 md:gap-2 w-full sm:w-auto"
        >
          <IconButton
            color="secondary"
            shape="round"
            variant="ghost"
            size="medium"
            icon={mdiMagnify}
            href="#"
            aria-label="Search"
            class="sm:hidden"
          />

          <Button
            leadingIcon={mdiTrayArrowUp}
            onclick={() => {}}
            class="hidden lg:flex"
            variant="ghost"
            size="medium"
            color="secondary">Upload</Button
          >
          <IconButton
            color="secondary"
            shape="round"
            variant="ghost"
            size="medium"
            onclick={() => {}}
            title="Upload"
            aria-label="Upload"
            icon={mdiTrayArrowUp}
            class="lg:hidden"
          />

          <ThemeSwitcher size="medium" color="secondary" />

          <IconButton
            shape="round"
            color="secondary"
            variant="ghost"
            size="medium"
            icon={mdiBellOutline}
            onclick={() => {}}
            aria-label="Notifications"
          />

          <IconButton
            shape="round"
            color="secondary"
            variant="ghost"
            size="medium"
            icon={mdiCastVariant}
            onclick={() => {}}
            aria-label="Cast"
          />

          <button
            type="button"
            class="flex ps-2"
            onclick={() => {}}
            title="User"
          >
            <Avatar name="FUTO Backups" size="medium" color="primary" />
          </button>
        </section>
      </div>
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
