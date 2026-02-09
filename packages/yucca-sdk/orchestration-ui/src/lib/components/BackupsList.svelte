<script lang="ts">
  import {
    Badge,
    Button,
    Card,
    CardBody,
    CardFooter,
    Heading,
    HStack,
    Icon,
    IconButton,
    immichLogo,
  } from "@immich/ui";
  import { mdiArchiveOutline, mdiPlus } from "@mdi/js";
  import { getProvider } from "$lib/providers.ts";
  import { onMount } from "svelte";
  import type { RepositoryListResponseDto } from "yucca-api-client";

  interface Props {
    initialData?: RepositoryListResponseDto;
  }

  const { initialData }: Props = $props();

  // svelte-ignore state_referenced_locally
  let repositories = $state(initialData?.repositories);

  const provider = getProvider();

  onMount(() => {
    if (!repositories) {
      provider
        .getRepositories()
        .then((data) => (repositories = data.repositories));
    }
  });

  async function create() {
    if (!repositories) return; // todo: better handling

    repositories.push(
      await provider.createRepository().then(({ repository }) => repository),
    );
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-col gap-2">
    <Heading size="medium"
      >My Backups <div class="inline-block">
        <IconButton
          shape="round"
          size="tiny"
          icon={mdiPlus}
          variant="outline"
          aria-label={`Create new backup`}
          onclick={create}
        />
      </div></Heading
    >
    <Card>
      <CardBody class="flex flex-col gap-2">
        <HStack class="items-center">
          <img
            src={immichLogo}
            style="width: 32px; height: 32px;"
            alt="Immich Logo"
          />
          <Heading class="break-all">Immich</Heading>
        </HStack>
        <HStack wrap>
          <Badge size="tiny" color="secondary">4.6 GB</Badge>
          <Badge size="tiny" color="warning">Backed up 13 days ago</Badge>
        </HStack>
      </CardBody>
    </Card>
    {#each repositories as repository, index (repository.id)}
      <Card>
        <CardBody class="flex flex-col gap-2">
          <HStack>
            <Icon icon={mdiArchiveOutline} size="32" color="gray" />
            <Heading class="break-all"
              >{[
                "Personal Documents",
                "Music Collection",
                "Emails",
                "Computer",
              ][index] ?? repository.id}</Heading
            >
          </HStack>
          <HStack wrap>
            <Badge size="tiny" color="secondary"
              >{repository.metrics.sizeBytes} B</Badge
            >
            {#if repository.metrics.lastUpload}
              <Badge size="tiny" color="success"
                >Backed up {Math.floor(
                  (Date.now() - +new Date(repository.metrics.lastUpload)) /
                    (1000 * 60 * 60 * 24),
                )} days ago</Badge
              >
            {/if}
          </HStack>
        </CardBody>
        <CardFooter
          ><Button
            size="tiny"
            onclick={async () =>
              alert(
                await provider
                  .createResticUrl(repository.id)
                  .then(({ url }) => url),
              )}>Test Create URL</Button
          ></CardFooter
        >
      </Card>
    {/each}
  </div>
</div>
