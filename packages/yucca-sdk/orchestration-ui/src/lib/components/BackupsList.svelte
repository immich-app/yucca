<script lang="ts">
  import {
    Badge,
    Button,
    Card,
    CardBody,
    CardFooter,
    FormatBytes,
    Heading,
    HStack,
    Icon,
    IconButton,
    immichLogo,
    Modal,
    ModalBody,
    ModalFooter,
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHeader,
    TableHeading,
    TableRow,
  } from "@immich/ui";
  import {
    mdiArchiveOutline,
    mdiChevronRight,
    mdiChevronUp,
    mdiMinus,
    mdiPlus,
  } from "@mdi/js";
  import { getProvider } from "$lib/providers";
  import { onMount } from "svelte";
  import {
    type RepositoryListResponseDto,
    type FilesystemListingResponseDto,
    getFileListing,
    setRepositoryConfig,
    type LogsDto,
    type LogDto,
    listRuns,
    getRun,
  } from "$lib/fetch-client";

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

  // editing code temporarily here =)

  let editing: string | undefined = $state();
  let editingRepository = $derived(
    repositories?.find(({ id }) => id === editing),
  );

  // path dialog =)

  let pathSelector: FilesystemListingResponseDto | undefined = $state();

  // logs =)

  let logsRepo: string | undefined = $state();
  let logs: LogsDto | undefined = $state();
  let log: LogDto | undefined = $state();

  // snapshots =)

  let snapshots: string | undefined = $state();
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
              >~ <FormatBytes bytes={repository.metrics.sizeBytes} /></Badge
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
        {#if typeof repository.local !== "undefined"}
          <CardFooter class="flex gap-2"
            >{#if repository.local}
              <Button
                size="tiny"
                onclick={async () => {
                  logsRepo = repository.id;
                  logs = await listRuns(repository.id);
                }}>Logs</Button
              >
              <Button size="tiny" onclick={() => (snapshots = repository.id)}
                >Snapshots</Button
              >
              <Button size="tiny" onclick={() => (editing = repository.id)}
                >Configure</Button
              >
              <Button
                size="tiny"
                onclick={() =>
                  provider
                    .createBackup(repository.id)
                    .then(() => alert("success!"))}>Backup Now</Button
              >
            {:else}
              This backup is setup on a different machine.
            {/if}</CardFooter
          >
        {/if}
      </Card>
    {/each}
  </div>
</div>

{#if typeof editingRepository?.local === "object"}
  <Modal title={editingRepository.id} onClose={() => (editing = undefined)}>
    <ModalBody>
      <Table>
        <TableHeader>
          <TableHeading>Backing up</TableHeading>
        </TableHeader>

        <TableBody>
          {#each editingRepository.local.paths as path (path)}
            <TableRow>
              <TableCell>{path}</TableCell>
              <TableCell class="w-16">
                <IconButton
                  icon={mdiMinus}
                  aria-label="Remove"
                  size="small"
                  onclick={async () => {
                    repositories = repositories?.map((repository) =>
                      repository.id === editing
                        ? {
                            ...repository,
                            local: {
                              ...repository.local,
                              paths: repository.local.paths.filter(
                                (x) => x !== path,
                              ),
                            },
                          }
                        : repository,
                    );

                    await setRepositoryConfig(
                      editing!,
                      repositories!.find((x) => x.id === editing)!.local!,
                    );
                  }}
                />
              </TableCell>
            </TableRow>
          {/each}
        </TableBody>

        <TableFooter>
          <Button
            onclick={async () => {
              pathSelector = await getFileListing();
            }}>Add</Button
          >
        </TableFooter>
      </Table>
    </ModalBody>
  </Modal>
{/if}

{#if pathSelector}
  <Modal title={pathSelector.path} onClose={() => (pathSelector = undefined)}>
    <ModalBody>
      <Table spacing="tiny">
        <TableBody>
          <TableRow>
            <TableCell class="text-left">...</TableCell>
            <TableCell class="w-16">
              <IconButton
                icon={mdiChevronUp}
                aria-label="Go up directory"
                onclick={async () => {
                  pathSelector = await getFileListing(pathSelector!.parent);
                }}
                size="small"
              />
            </TableCell>
            <TableCell class="w-16" />
          </TableRow>

          {#each pathSelector.items as item (item.path)}
            <TableRow>
              <TableCell class="text-left"
                >{item.path.split(/\\|\//).pop()}</TableCell
              >
              <TableCell class="w-16">
                {#if item.isDirectory}
                  <IconButton
                    icon={mdiChevronRight}
                    aria-label="Open folder"
                    onclick={async () => {
                      pathSelector = await getFileListing(item.path);
                    }}
                    size="small"
                  />
                {/if}
              </TableCell>
              <TableCell class="w-16">
                <IconButton
                  icon={mdiPlus}
                  aria-label="Add"
                  size="small"
                  onclick={async () => {
                    repositories = repositories?.map((repository) =>
                      repository.id === editing
                        ? {
                            ...repository,
                            local: {
                              ...repository.local,
                              paths: [...repository.local.paths, item.path],
                            },
                          }
                        : repository,
                    );

                    await setRepositoryConfig(
                      editing!,
                      repositories!.find((x) => x.id === editing)!.local!,
                    );

                    pathSelector = undefined;
                  }}
                />
              </TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </ModalBody>
  </Modal>
{/if}

{#if logs}
  {#if log}
    <Modal title="log" onClose={() => (log = undefined)}>
      <ModalBody>
        This run was started on 2025-02-17 13:24 and finished after 5h 20m.

        <hr class="my-4" />

        <pre><code>{log.log}</code></pre>
      </ModalBody>
    </Modal>
  {:else}
    <Modal title="logs" onClose={() => (logs = undefined)}>
      <ModalBody>
        <Table>
          <TableBody>
            {#each logs.runs as entry (entry)}
              <TableRow>
                <TableCell>{entry}</TableCell>
                <TableCell>
                  {#if entry.endsWith(".failed.txt")}
                    Failed
                  {:else if entry.endsWith(".incomplete.txt")}
                    Incomplete (or running)
                  {:else}
                    Successful
                  {/if}
                </TableCell>
                <IconButton
                  class="w-16"
                  icon={mdiChevronRight}
                  aria-label="View"
                  onclick={async () => {
                    log = await getRun(logsRepo!, entry);
                  }}
                  size="small"
                />
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </ModalBody>
    </Modal>
  {/if}
{/if}
