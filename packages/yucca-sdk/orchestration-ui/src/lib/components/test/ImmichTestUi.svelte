<script lang="ts">
  import { orchestrationApiProvider, setProvider } from "$lib/providers";
  import {
    AppShell,
    AppShellHeader,
    AppShellSidebar,
    Avatar,
    Button,
    HStack,
    IconButton,
    Input,
    Logo,
    NavbarGroup,
    NavbarItem,
    Stack,
    Text,
    ThemeSwitcher,
  } from "@immich/ui";
  import {
    mdiAccountMultipleOutline,
    mdiArchiveArrowDownOutline,
    mdiBellOutline,
    mdiCastVariant,
    mdiChartBoxOutline,
    mdiCogOutline,
    mdiFormatListBulletedType,
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
  import { options } from "$lib/options";
  import { onDestroy } from "svelte";
  import ImmichBackupsNavButton from "../integrations/immich/ImmichBackupsNavButton.svelte";
  import MockImmichPhotos from "../../../test-mocks/immich/MockImmichPhotos.svelte";
  import MockImmichPurchaseInfo from "../../../test-mocks/immich/MockImmichPurchaseInfo.svelte";
  import MockImmichStorageSpace from "../../../test-mocks/immich/MockImmichStorageSpace.svelte";
  import ImmichBackupsPage from "../integrations/immich/ImmichBackupsPage.svelte";
  import ImmichOnboardingRestoreFlow from "../integrations/immich/ImmichOnboardingRestoreFlow.svelte";
  import OnEvents from "../util/OnEvents.svelte";
  import { useImmichBackupSummary } from "$lib/services/immich.integration.service";

  type Props = {
    onExit: () => void;
  };

  const { onExit }: Props = $props();
  const { testUiRestore, demoPadding } = options;

  let route = $state<"photos" | "settings">("photos");

  const summary = useImmichBackupSummary();

  const sampleQuestions = [
    {
      title: "Is FUTO Backups the same as an Immich product key?",
      answer: "Sample answer copy for the FAQ preview.",
    },
    {
      title: "How is FUTO Backups priced?",
      answer: "Sample answer copy for the FAQ preview.",
    },
    {
      title: "Can I use local storage instead?",
      answer: "Sample answer copy for the FAQ preview.",
    },
  ];

  demoPadding.set(true);
  onDestroy(() => demoPadding.set(false));

  // svelte-ignore state_referenced_locally
  setProvider(orchestrationApiProvider);
</script>

<OnEvents {...summary.events} />

<AppShell class="h-full">
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

          <IconButton
            shape="round"
            color="secondary"
            variant={route === "settings" ? "filled" : "ghost"}
            size="medium"
            icon={mdiCogOutline}
            onclick={() =>
              (route = route === "settings" ? "photos" : "settings")}
            aria-label="Settings"
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
    <div class="flex h-full flex-col pt-4 pr-2">
      {#if route === "settings"}
        <ImmichBackupsNavButton
          configured={summary.configured}
          active
          onclick={() => {}}
        />

        <NavbarItem
          href="#"
          title="Users"
          icon={mdiAccountMultipleOutline}
          isActive={() => false}
        />
        <NavbarItem
          href="#"
          title="Job Queues"
          icon={mdiFormatListBulletedType}
          isActive={() => false}
        />
        <NavbarItem
          href="#"
          title="Server Stats"
          icon={mdiChartBoxOutline}
          isActive={() => false}
        />
        <NavbarItem
          href="#"
          title="Settings"
          icon={mdiCogOutline}
          isActive={() => false}
        />
      {:else}
        <NavbarItem
          href="#"
          title="Photos"
          icon={mdiImageMultipleOutline}
          active
        />
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
        <NavbarItem href="#" title="Utilities" icon={mdiToolboxOutline} />
        <NavbarItem href="#" title="Archive" icon={mdiArchiveArrowDownOutline} />
        <NavbarItem href="#" title="Locked folder" icon={mdiLockOutline} />
        <NavbarItem href="#" title="Trash" icon={mdiTrashCanOutline} />
      {/if}

      <Stack gap={4} class="mt-auto p-4">
        <MockImmichStorageSpace onBackups={() => (route = "settings")} />

        {#if route !== "settings"}
          <MockImmichPurchaseInfo />
        {/if}

        <HStack gap={2}>
          <span class="bg-success size-2 rounded-full"></span>
          <Text size="small" class="flex-1">Server Online</Text>
          <Text size="small" color="muted">v3.0.3</Text>
        </HStack>
      </Stack>
    </div>
  </AppShellSidebar>

  {#if $testUiRestore}
    <ImmichOnboardingRestoreFlow
      {onExit}
      onFinish={() => testUiRestore.set(false)}
    />
  {:else if route === "settings"}
    <ImmichBackupsPage
      price="$1"
      includedStorage="50 GB"
      questions={sampleQuestions}
    />
  {:else}
    <MockImmichPhotos />
  {/if}
</AppShell>
