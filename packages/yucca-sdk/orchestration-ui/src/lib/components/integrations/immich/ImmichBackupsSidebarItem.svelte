<script lang="ts">
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import {
    useIntegrationEventHandler,
    useIntegrations,
  } from "$lib/services/integrations.service";
  import {
    useRepositories,
    useRepositoryEventHandler,
  } from "$lib/services/repository.service";
  import ImmichBackupsCard from "./ImmichBackupsCard.svelte";

  type Props = {
    href?: string;
    onclick?: () => void;
    class?: string;
  };

  const { href = "/backups", onclick, class: className }: Props = $props();

  const integrations = useIntegrations();
  const repositories = useRepositories();

  const { onIntegrationUpdate } = useIntegrationEventHandler();
  const { onRepositoryCreate, onRepositoryUpdate, onRepositoryDelete } =
    useRepositoryEventHandler();

  const repository = $derived.by(() => {
    const integration = integrations.data?.immichIntegration;

    return integration
      ? repositories.data?.find((entry) => entry.id === integration.id)
      : undefined;
  });

  const lastBackup = $derived(repository?.metrics.lastBackup ?? undefined);

  const failed = $derived(
    Boolean(
      lastBackup && lastBackup !== repository?.metrics.lastSuccessfulBackup,
    ),
  );

  const sizeBytes = $derived(
    repository?.meter?.sizeBytes ?? repository?.metrics.sizeBytes,
  );
</script>

<OnEvents
  {onIntegrationUpdate}
  {onRepositoryCreate}
  {onRepositoryUpdate}
  {onRepositoryDelete}
/>

{#if !integrations.isLoading && !repositories.isLoading}
  <ImmichBackupsCard
    configured={Boolean(repository)}
    {lastBackup}
    {failed}
    {sizeBytes}
    {href}
    {onclick}
    class={className}
  />
{/if}
