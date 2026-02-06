<script lang="ts">
  import {
    Badge,
    Button,
    Card,
    CardBody,
    CardFooter,
    CardHeader,
    CardTitle,
    Heading,
    HStack,
    Icon,
    IconButton,
    immichLogo,
    Text,
    VStack,
  } from "@immich/ui";
  import {
    mdiArchive,
    mdiArchiveOutline,
    mdiBackupRestore,
    mdiDatabaseRefreshOutline,
    mdiPlus,
  } from "@mdi/js";
  import { createRepository, createResticUrl } from "yucca-api-client";
  import { t } from "svelte-i18n-lingui";

  const { data } = $props();
  // svelte-ignore state_referenced_locally
  let repositories = $state(data.initialRepositories);

  async function create() {
    repositories.push(
      await createRepository().then(({ repository }) => repository),
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
          aria-label={$t`Create new backup`}
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
                await createResticUrl(repository.id).then(({ url }) => url),
              )}>Test Create URL</Button
          ></CardFooter
        >
      </Card>
    {/each}
  </div>
</div>
