<script lang="ts">
  import type { RepositoryListResponseDto } from "$lib/fetch-client";
  import {
    useRepositories,
    useRepositoryEventHandler,
  } from "$lib/services/repository.service";
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
    local?: boolean;
    initialData?: RepositoryListResponseDto;
    onViewBackups?: () => void;
  };

  const { local, initialData, onViewBackups }: Props = $props();

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
      <DashboardBackupHealth
        repositories={query.data}
        {local}
        {onViewBackups}
      />
      <DashboardInstall />
    </Stack>
    <Stack direction="row" gap={4}>
      <DashboardAvgBackupTime repositories={query.data} />
      <DashboardDailyBackupTime repositories={query.data} />
      <DashboardTotalStored repositories={query.data} />
      <DashboardCurrentUsage />
    </Stack>
    <DashboardRecentBackups repositories={query.data} {local} />
  </Stack>
{/if}
