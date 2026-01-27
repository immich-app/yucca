<script lang="ts">
  import { Button, Heading } from '@immich/ui';
  import { createRepository, createResticUrl } from 'yucca-sdk';

  const { data } = $props();

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
    </li>
  {/each}
</ul>

<Button onclick={create}>Create</Button>
