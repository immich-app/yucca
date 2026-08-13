<script lang="ts">
  import BackupStatus, {
    type BackupStatusState,
  } from "$lib/components/backups/BackupStatus.svelte";
  import ImmichBackupsAdminNavButton from "$lib/components/integrations/immich/ImmichBackupsAdminNavButton.svelte";
  import ImmichSettingsBackupContents from "$lib/components/integrations/immich/settings/ImmichSettingsBackupContents.svelte";
  import ImmichSettingsSchedule from "$lib/components/integrations/immich/settings/ImmichSettingsSchedule.svelte";
  import ImmichSettingsStorage from "$lib/components/integrations/immich/settings/ImmichSettingsStorage.svelte";
  import OnboardingStepFinishSetup from "$lib/components/onboarding/steps/OnboardingStep1FinishSetup.svelte";
  import OnboardingStepConnectAccount from "$lib/components/onboarding/steps/OnboardingStep2ConnectAccount.svelte";
  import OnboardingStepSaveRecoveryKey from "$lib/components/onboarding/steps/OnboardingStep3SaveRecoveryKey.svelte";
  import OnboardingStepFirstBackup from "$lib/components/onboarding/steps/OnboardingStep4FirstBackup.svelte";
  import UpsellBackupFeatures from "$lib/components/onboarding/upsell/UpsellBackupFeaturesGrid.svelte";
  import UpsellFutoBackups from "$lib/components/onboarding/upsell/UpsellExplainFutoBackups.svelte";
  import UpsellFrequentlyAskedQuestions from "$lib/components/onboarding/upsell/UpsellFrequentlyAskedQuestions.svelte";
  import UpsellHowItWorks from "$lib/components/onboarding/upsell/UpsellHowItWorks.svelte";
  import UpsellProtectImmichLibrary from "$lib/components/onboarding/upsell/UpsellProtectYourImmichLibrary.svelte";
  import SettingsBilling from "$lib/components/settings/SettingsBilling.svelte";
  import SettingsNotifications from "$lib/components/settings/SettingsNotifications.svelte";
  import MockImmichHideBackupsReminder from "$lib/components/test/immich/MockImmichHideBackupsReminder.svelte";
  import MockPagination from "$lib/components/ui/Pagination.svelte";
  import StackList from "$lib/components/ui/StackList.svelte";
  import StackListItem from "$lib/components/ui/StackListItem.svelte";
  import StackListPlaceholder from "$lib/components/ui/StackListPlaceholder.svelte";
  import {
    Badge,
    Button,
    Card,
    CardBody,
    CloseButton,
    Container,
    Heading,
    HStack,
    Icon,
    Input,
    Link,
    Stack,
    Text,
    type ActionItem,
  } from "@immich/ui";
  import {
    mdiArchiveOutline,
    mdiCheckCircle,
    mdiCloseCircle,
    mdiCloudCheckOutline,
    mdiCloudOffOutline,
    mdiCloudUploadOutline,
    mdiFilterVariant,
    mdiHistory,
    mdiInformation,
    mdiMagnify,
    mdiShieldOutline,
    mdiSortVariant,
  } from "@mdi/js";
  import { onDestroy, onMount } from "svelte";
  import FakeModal from "../../test-mocks/FakeModal.svelte";
  import MockImmichSettingsMenu from "../../test-mocks/immich/MockImmichSettingsMenu.svelte";

  let demoState = $state<BackupStatusState>("running");
  let demoProgress = $state(0);
  let demoStart = $state(new Date().toISOString());
  let demoTimer: ReturnType<typeof setInterval> | undefined;
  let demoDelay: ReturnType<typeof setTimeout> | undefined;
  let demoRestart: ReturnType<typeof setTimeout> | undefined;

  const simulateBackup = () => {
    demoState = "running";
    demoProgress = 0;
    demoStart = new Date().toISOString();

    demoDelay = setTimeout(startProgress, 5000);
  };

  const startProgress = () => {
    demoTimer = setInterval(() => {
      demoProgress = Math.min(demoProgress + 0.04, 1);

      if (demoProgress >= 1) {
        clearInterval(demoTimer);
        demoState = "complete";
        demoRestart = setTimeout(simulateBackup, 4000);
      }
    }, 250);
  };

  onMount(simulateBackup);

  onDestroy(() => {
    clearInterval(demoTimer);
    clearTimeout(demoDelay);
    clearTimeout(demoRestart);
  });

  const demoFilePool = [
    "/photos/2026/07/IMG_4821.heic",
    "/photos/2026/07/IMG_4822.heic",
    "/photos/2026/07/VID_0143.mov",
    "/photos/2026/06/IMG_4790.heic",
    "/photos/2026/06/IMG_4791.heic",
    "/library/external/scans/1998-holiday-012.tif",
    "/database/immich-2026-07-30.sql.gz",
  ];

  const demoFiles = $derived(
    demoState === "running" && demoProgress > 0
      ? Array.from({ length: 3 }, (_, offset) => {
          const index =
            Math.floor(demoProgress * demoFilePool.length * 3) + offset;
          return demoFilePool[index % demoFilePool.length];
        })
      : [],
  );

  let attemptsPage = $state(2);
  let snapshotsPage = $state(2);

  const sampleAttempts = Array.from({ length: 9 }, (_, index) => ({
    successful: index !== 4 && index !== 8,
  }));

  const sampleSnapshots = Array.from({ length: 9 }, (_, index) => index);

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

  let settingsSearch = $state("");

  const actions: ActionItem[] = [
    { title: "View details", onAction: () => void 0 },
    { title: "Delete", onAction: () => void 0 },
  ];
</script>

{#snippet hideReminder()}
  <MockImmichHideBackupsReminder />
{/snippet}

<div class="p-8 flex flex-col gap-8">
  <Heading size="giant">individual previews for the new ui components</Heading>

  <hr />

  <Heading>Upsell Modal</Heading>
  <FakeModal size="giant">
    <HStack class="p-4">
      <UpsellProtectImmichLibrary
        price="$4"
        onGetStarted={() => void 0}
        onLearnMore={() => void 0}
      />

      <UpsellHowItWorks />
    </HStack>
  </FakeModal>

  <hr />

  <Heading>Immich Sidebar Card</Heading>
  <Text>merged into ImmichBackupsSidebarItem</Text>

  <hr />

  <Heading>Immich Settings Menu Button</Heading>
  <MockImmichSettingsMenu>
    <ImmichBackupsAdminNavButton href="#" />
  </MockImmichSettingsMenu>

  <hr />

  <Heading>Immich Settings Menu Button - Current page</Heading>
  <MockImmichSettingsMenu settingsActive={false}>
    <ImmichBackupsAdminNavButton href="#" active />
  </MockImmichSettingsMenu>

  <hr />

  <Heading>Settings Upsell Page</Heading>
  <Container size="large" center>
    <Stack gap={8}>
      <Card color="primary" class="shadow-none">
        <CardBody class="p-8">
          <HStack gap={8} class="justify-between">
            <UpsellFutoBackups
              price="$4"
              includedStorage="50 GB"
              onGetStarted={() => void 0}
            />
            <UpsellHowItWorks color="secondary" />
          </HStack>
        </CardBody>
      </Card>

      <UpsellBackupFeatures />
      <UpsellFrequentlyAskedQuestions
        questions={[
          {
            title: "Already back up your library elsewhere?",
            answer: hideReminder,
          },
          ...sampleQuestions,
        ]}
      />
    </Stack>
  </Container>

  <hr />

  <Heading>Backups Onboarding - Intro</Heading>
  <FakeModal size="small">
    <OnboardingStepFinishSetup onContinue={() => void 0} />
  </FakeModal>

  <hr />

  <Heading>Backups Onboarding - Step 1</Heading>
  <FakeModal size="small">
    <OnboardingStepConnectAccount onConnect={() => void 0} />
  </FakeModal>

  <hr />

  <Heading>Backups Onboarding - Step 2</Heading>
  <FakeModal size="small">
    <OnboardingStepSaveRecoveryKey
      code="DF4B0C72D2FC2DEEA7B0CDDF1DAF4056T3G3NDJEY5H339826KL209132H2J9ML9"
      onContinue={() => void 0}
    />
  </FakeModal>

  <hr />

  <Heading>Backups Onboarding - Step 3</Heading>
  <FakeModal size="small">
    <OnboardingStepFirstBackup
      schedule="Every day at 3:00 AM"
      storageLocation="FUTO Backups"
      onStartBackup={() => void 0}
    />
  </FakeModal>

  {#snippet storedAt(used: string | undefined)}
    <StackList>
      {#snippet title()}
        Where your backup is stored
      {/snippet}

      <StackListItem title="FUTO Backups (primary)">
        {#snippet icon()}
          <Icon icon={mdiShieldOutline} />
        {/snippet}

        Hosted cloud backup storage{used ? ` \u00b7 ${used} used` : ""}

        {#snippet trailing()}
          <Badge color="primary">Active</Badge>
        {/snippet}
      </StackListItem>
    </StackList>
  {/snippet}

  {#snippet listToolbar(placeholder: string)}
    <HStack class="items-center justify-between">
      <Input class="max-w-72" leadingIcon={mdiMagnify} {placeholder} />

      <HStack gap={2}>
        <Button
          variant="outline"
          size="small"
          color="secondary"
          class="whitespace-nowrap"
          onclick={() => void 0}
          leadingIcon={mdiSortVariant}
        >
          Sort by
        </Button>
        <Button
          variant="outline"
          size="small"
          color="secondary"
          class="whitespace-nowrap"
          onclick={() => void 0}
          leadingIcon={mdiFilterVariant}
        >
          Filters
        </Button>
      </HStack>
    </HStack>
  {/snippet}

  {#snippet successfulAttempt(when: string)}
    <StackListItem title="Successful backup" color="success" {actions}>
      {#snippet icon()}
        <Icon icon={mdiCloudCheckOutline} />
      {/snippet}

      Backed up {when}
    </StackListItem>
  {/snippet}

  {#snippet snapshot(date: string, when: string)}
    <StackListItem title={date} {actions}>
      {#snippet icon()}
        <Icon icon={mdiHistory} />
      {/snippet}

      {when} &middot; 98 files &middot; 100 GiB
    </StackListItem>
  {/snippet}

  <hr />

  <Heading>Backups Overview - Setup incomplete</Heading>
  <Container size="medium" center>
    <Stack gap={6}>
      <StackList>
        <StackListItem title="Your library backup" footerColor="warning">
          {#snippet icon()}
            <Icon icon={mdiArchiveOutline} />
          {/snippet}

          0 B &middot; Scheduled daily at 3:00 AM

          {#snippet trailing()}
            <Button
              variant="ghost"
              size="small"
              onclick={() => void 0}
              leadingIcon={mdiCloudUploadOutline}
            >
              Finish setup
            </Button>
          {/snippet}

          {#snippet footer()}
            <Icon icon={mdiInformation} />
            First backup has not run yet.
          {/snippet}
        </StackListItem>
      </StackList>

      {@render storedAt(undefined)}

      <StackList>
        {#snippet title()}
          Recent backup attempts
        {/snippet}

        <StackListPlaceholder>No recent backups</StackListPlaceholder>
      </StackList>

      <StackList>
        {#snippet title()}
          Snapshots
        {/snippet}

        <StackListPlaceholder>No backups yet</StackListPlaceholder>
      </StackList>
    </Stack>
  </Container>

  <hr />

  <Heading>Backups Overview - Last backup successful</Heading>
  <Container size="medium" center>
    <Stack gap={6}>
      <StackList>
        <StackListItem title="Your library backup" footerColor="success">
          {#snippet icon()}
            <Icon icon={mdiArchiveOutline} />
          {/snippet}

          100 GiB &middot; Scheduled daily at 3:00 AM

          {#snippet trailing()}
            <Button
              variant="ghost"
              size="small"
              onclick={() => void 0}
              leadingIcon={mdiCloudUploadOutline}
            >
              Backup now
            </Button>
          {/snippet}

          {#snippet footer()}
            <Icon icon={mdiCheckCircle} />
            Last backup successful 20 seconds ago.
          {/snippet}
        </StackListItem>
      </StackList>

      {@render storedAt("100 GiB")}

      <StackList>
        {#snippet title()}
          Recent backup attempts
        {/snippet}

        {#snippet action()}
          <Button variant="ghost" size="small" onclick={() => void 0}>
            View all
          </Button>
        {/snippet}

        {@render successfulAttempt("20 seconds ago")}
      </StackList>

      <StackList>
        {#snippet title()}
          Snapshots
        {/snippet}

        {#snippet action()}
          <Button variant="ghost" size="small" onclick={() => void 0}>
            View all
          </Button>
        {/snippet}

        {@render snapshot("July 21, 2026", "20 seconds ago")}
      </StackList>
    </Stack>
  </Container>

  <hr />

  <Heading>Backups Overview - Last backup failed</Heading>
  <Container size="medium" center>
    <Stack gap={6}>
      <StackList>
        <StackListItem title="Your library backup" footerColor="danger">
          {#snippet icon()}
            <Icon icon={mdiArchiveOutline} />
          {/snippet}

          100 GiB &middot; Scheduled daily at 3:00 AM

          {#snippet trailing()}
            <Button
              variant="ghost"
              size="small"
              onclick={() => void 0}
              leadingIcon={mdiCloudUploadOutline}
            >
              Backup now
            </Button>
          {/snippet}

          {#snippet footer()}
            <Icon icon={mdiCloseCircle} />
            <span>
              The latest backup could not be completed.
              <Link href="#details">View details</Link>.
            </span>
          {/snippet}
        </StackListItem>
      </StackList>

      {@render storedAt("100 GiB")}

      <StackList>
        {#snippet title()}
          Recent backup attempts
        {/snippet}

        {#snippet action()}
          <Button variant="ghost" size="small" onclick={() => void 0}>
            View all
          </Button>
        {/snippet}

        <StackListItem title="Failed backup" color="danger" {actions}>
          {#snippet icon()}
            <Icon icon={mdiCloudOffOutline} />
          {/snippet}

          Attempted 2 days ago
        </StackListItem>

        {@render successfulAttempt("22 hours ago")}
        {@render successfulAttempt("2 days ago")}
      </StackList>

      <StackList>
        {#snippet title()}
          Snapshots
        {/snippet}

        {#snippet action()}
          <Button variant="ghost" size="small" onclick={() => void 0}>
            View all
          </Button>
        {/snippet}

        {@render snapshot("July 21, 2026", "22 hours ago")}
      </StackList>
    </Stack>
  </Container>

  <hr />

  <Heading>Backup attempts - full page</Heading>
  <Container size="medium" center>
    <Stack gap={4}>
      {@render listToolbar("Search backups")}

      <StackList>
        {#each sampleAttempts as attempt, index (index)}
          {#if attempt.successful}
            {@render successfulAttempt("20 seconds ago")}
          {:else}
            <StackListItem title="Failed backup" color="danger" {actions}>
              {#snippet icon()}
                <Icon icon={mdiCloudOffOutline} />
              {/snippet}

              Attempted 2 days ago
            </StackListItem>
          {/if}
        {/each}
      </StackList>

      <MockPagination
        page={attemptsPage}
        pageCount={8}
        onChange={(page) => (attemptsPage = page)}
      />
    </Stack>
  </Container>

  <hr />

  <Heading>Snapshots - full page</Heading>
  <Container size="medium" center>
    <Stack gap={4}>
      {@render listToolbar("Search snapshots")}

      <StackList>
        {#each sampleSnapshots as _, index (index)}
          {@render snapshot("July 21, 2026", "20 seconds ago")}
        {/each}
      </StackList>

      <MockPagination
        page={snapshotsPage}
        pageCount={8}
        onChange={(page) => (snapshotsPage = page)}
      />
    </Stack>
  </Container>

  <hr />

  <Heading>Backup status - running</Heading>
  <div class="h-96">
    <FakeModal size="medium" bodyClass="px-8 pt-2 pb-8">
      {#snippet header()}
        <HStack fullWidth class="justify-end">
          <CloseButton onclick={() => void 0} />
        </HStack>
      {/snippet}

      <BackupStatus
        title={demoState === "complete"
          ? "Backup complete"
          : "Backing up your library"}
        type="backup"
        state={demoState}
        progress={demoProgress}
        start={demoStart}
        duration="9 minutes"
        currentFiles={demoFiles}
      >
        {#snippet details()}
          1,923 items backed up &middot; 892 new items &middot; 100 GiB
          processed
        {/snippet}
      </BackupStatus>
    </FakeModal>
  </div>

  <hr />

  <Heading>Backup status - complete</Heading>
  <FakeModal size="medium" bodyClass="px-8 pt-2 pb-8">
    {#snippet header()}
      <HStack fullWidth class="justify-end">
        <CloseButton onclick={() => void 0} />
      </HStack>
    {/snippet}

    <BackupStatus
      title="Backup complete"
      type="backup"
      state="complete"
      progress={1}
      duration="9 minutes"
    >
      {#snippet details()}
        1,923 items backed up &middot; 892 new items &middot; 100 GiB processed
      {/snippet}
    </BackupStatus>
  </FakeModal>

  <hr />

  <Heading>Backup status - failed</Heading>
  <FakeModal size="medium" bodyClass="px-8 pt-2 pb-8">
    {#snippet header()}
      <HStack fullWidth class="justify-end">
        <CloseButton onclick={() => void 0} />
      </HStack>
    {/snippet}

    <BackupStatus
      title="Backup failed"
      type="backup"
      state="failed"
      progress={0.61}
      duration="4 minutes"
      errors={["Fatal: unable to open repository: connection refused"]}
      onRetry={() => void 0}
    />
  </FakeModal>

  <hr />

  <Heading>Backup Settings</Heading>
  <Container size="large" center>
    <Input
      shape="semi-round"
      leadingIcon={mdiMagnify}
      placeholder="Search settings"
      bind:value={settingsSearch}
    />

    <ImmichSettingsBackupContents />
    <ImmichSettingsSchedule />
    <ImmichSettingsStorage />
    <SettingsNotifications onSave={() => void 0} />
    <SettingsBilling onManageBilling={() => void 0} />
  </Container>

  <div class="h-screen"></div>
</div>
