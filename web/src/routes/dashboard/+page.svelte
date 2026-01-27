<script lang="ts">
  import { Button, Heading } from '@immich/ui';
  import { createRepository, createResticUrl } from 'yucca-sdk';

  const { data } = $props();
  // svelte-ignore state_referenced_locally
  let repositories = $state(data.initialRepositories);

  async function create() {
    repositories.push(await createRepository().then(({ repository }) => repository));
  }
</script>

<span>Logged in as {data.user!.name} ({data.user!.email})</span>

<Heading>Repositories</Heading>

<ul>
  {#each repositories as repository}
    <li class="flex gap-2">
      {repository.id}
      {#if repository.worm}{" (worm)"}{/if}
      <Button
        onclick={async () =>
          alert(await createResticUrl(repository.id).then(({ url }) => url))}
        size="tiny">Create URL</Button
      >
      <span>{repository.metrics.sizeBytes} bytes</span>
      {#if repository.metrics.lastUpload}
        <span
          >Last upload: {Math.floor(
            (Date.now() - +new Date(repository.metrics.lastUpload)) /
              (1000 * 60 * 60 * 24),
          )} days ago</span
        >
      {/if}
    </li>
  {/each}
</ul>

<Button onclick={create}>Create</Button>
