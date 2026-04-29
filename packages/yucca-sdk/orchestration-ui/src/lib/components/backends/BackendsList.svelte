<script lang="ts">
  import {
    Alert,
    Button,
    Card,
    CardBody,
    CardFooter,
    Heading,
    HStack,
    LoadingSpinner,
    modalManager,
    Text,
  } from "@immich/ui";
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import { options } from "$lib/options";
  import {
    handleYuccaLogin,
    useBackendEventHandler,
    useBackends,
  } from "$lib/services/backend.service";
  import OnEvents from "../util/OnEvents.svelte";
  import CreateLocalBackend from "./CreateLocalBackend.svelte";
  import OAuthDeviceFlow from "./OAuthDeviceFlow.svelte";

  const { advanced } = options;
  const query = useBackends();
  const { onBackendCreate } = useBackendEventHandler();

  const yuccaBackend = $derived(
    query.data?.find((backend) => backend.type === "yucca"),
  );

  async function getStarted() {
    modalManager.show(OAuthDeviceFlow, await handleYuccaLogin());
  }
</script>

<OnEvents {onBackendCreate} />

{#if query.isLoading}
  <LoadingSpinner />
{:else if query.isError}
  <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
{:else if query.isSuccess}
  {#if yuccaBackend}
    <Card color={yuccaBackend.isOnline ? "success" : "danger"}>
      <CardBody class="flex flex-col gap-2">
        <Heading>FUTO Backups</Heading>
      </CardBody>
      {#if yuccaBackend.isOnline}
        <CardFooter class="flex gap-2">
          <Button size="small" color="secondary">Manage my account (🚧)</Button>
          <Button size="small" color="secondary">Billing (🚧)</Button>
        </CardFooter>
      {:else}
        <CardFooter>
          <Button onclick={getStarted} size="small">Login again</Button>
        </CardFooter>
      {/if}
    </Card>
  {:else}
    <Card color={"info"}>
      <CardBody class="flex flex-col gap-2">
        <Heading>FUTO Backups</Heading>
        <Text>Upsell text here</Text>
      </CardBody>
      <CardFooter>
        <Button onclick={getStarted} size="small">Get started</Button>
      </CardFooter>
    </Card>
  {/if}

  {#each query.data as backend (backend.id)}
    {#if backend.type !== "yucca"}
      <Card color={backend.isOnline ? "success" : "danger"}>
        <CardBody class="flex flex-col gap-2">
          <Heading
            >{backend.type === "local" ? "Local Storage" : "S3 Server"}</Heading
          >
        </CardBody>
        <CardFooter>
          <Button size="small" color="secondary">Configure (🚧)</Button>
        </CardFooter>
      </Card>
    {/if}
  {/each}

  {#if $advanced}
    <HStack>
      <Button
        size="small"
        onclick={() => modalManager.open(CreateLocalBackend, {})}
        >Setup new local storage</Button
      >
      <Button size="small">Setup new S3 storage (🚧)</Button>
    </HStack>
  {/if}
{/if}
