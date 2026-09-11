<script lang="ts">
  import type { RepositoryListResponseDto } from "$lib/fetch-client";
  import {
    useRepositories,
    useRepositoryEventHandler,
  } from "$lib/services/repository.service";
  import { getProvider } from "$lib/providers";
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import { Alert, LoadingSpinner, Stack } from "@immich/ui";
  import OnEvents from "../util/OnEvents.svelte";
  import DashboardAvgBackupTime from "./DashboardAvgBackupTime.svelte";
  import DashboardBackupHealth from "./DashboardBackupHealth.svelte";
  import DashboardCurrentUsage from "./DashboardCurrentUsage.svelte";
  import DashboardDailyBackupTime from "./DashboardDailyBackupTime.svelte";
  import DashboardInstall from "./DashboardInstall.svelte";
  import DashboardRecentBackups from "./DashboardRecentBackups.svelte";
  import DashboardTotalStored from "./DashboardTotalStored.svelte";

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

{#if query.isLoading}
  <LoadingSpinner />
{:else if query.isError}
  <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
{:else if query.isSuccess}
  <Stack gap={6}>
    <Stack direction="row" gap={4}>
      <DashboardBackupHealth repositories={query.data} {onViewBackups} />

      {#if !local}
        <DashboardInstall />
      {/if}
    </Stack>
    <Stack direction="row" gap={4}>
      <DashboardAvgBackupTime repositories={query.data} />
      <DashboardDailyBackupTime repositories={query.data} />
      <DashboardTotalStored repositories={query.data} />
      <DashboardCurrentUsage />
    </Stack>
    <DashboardRecentBackups repositories={query.data} />
  </Stack>
{/if}
