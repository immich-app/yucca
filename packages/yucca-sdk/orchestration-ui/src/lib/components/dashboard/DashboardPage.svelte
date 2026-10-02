<script lang="ts">
  import type { RepositoryListResponseDto } from "$lib/fetch-client";
  import {
    useRepositories,
    useRepositoryEventHandler,
  } from "$lib/services/repository.service";
  import { getProvider } from "$lib/providers";
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import {
    Alert,
    Button,
    Heading,
    HStack,
    LoadingSpinner,
    Logo,
    Stack,
  } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";
  import BackupTaskMonitor from "../backups/BackupTaskMonitor.svelte";
  import OnEvents from "../util/OnEvents.svelte";
  import DashboardAvgBackupTime from "./DashboardAvgBackupTime.svelte";
  import DashboardBackupHealth from "./DashboardBackupHealth.svelte";
  import DashboardCurrentUsage from "./DashboardCurrentUsage.svelte";
  import DashboardDailyBackupTime from "./DashboardDailyBackupTime.svelte";
  import DashboardRecentBackups from "./DashboardRecentBackups.svelte";
  import DashboardTotalStored from "./DashboardTotalStored.svelte";
  import Section from "../ui/Section.svelte";

  type Props = {
    initialData?: RepositoryListResponseDto;
    onViewBackups?: () => void;
  };

  const { initialData, onViewBackups }: Props = $props();

  const local = getProvider().api === "orchestrator";

  // svelte-ignore state_referenced_locally
  const query = useRepositories(initialData?.repositories);
  const { onRepositoryCreate, onRepositoryUpdate } =
    useRepositoryEventHandler();
</script>

<OnEvents {onRepositoryCreate} {onRepositoryUpdate} />
<BackupTaskMonitor />

<Stack gap={6}>
  <HStack class="items-center justify-between" wrap>
    <Heading tag="h1" size="medium">{$t`Overview`}</Heading>

    {#if !local}
      <Button
        href="https://my.immich.app/link?target=backups"
        variant="outline"
        size="small"
      >
        <Logo variant="icon" size="tiny" />
        {$t`Setup on Immich`}
      </Button>
    {/if}
  </HStack>

  {#if query.isLoading}
    <LoadingSpinner />
  {:else if query.isError}
    <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
  {:else if query.isSuccess}
    <DashboardBackupHealth repositories={query.data} {onViewBackups} />

    <Section>
      {#snippet title()}
        {$t`Storage & Usage`}
      {/snippet}

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardTotalStored repositories={query.data} />
        <DashboardCurrentUsage />
        <DashboardAvgBackupTime repositories={query.data} />
        <DashboardDailyBackupTime repositories={query.data} />
      </div>
    </Section>

    <DashboardRecentBackups repositories={query.data} />
  {/if}
</Stack>
