<script lang="ts">
  import { getProvider } from "$lib/providers";
  import { onMount } from "svelte";
  import { type BackendDto } from "../../fetch-client";
  import {
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
  import { options } from "$lib/options";

  // svelte-ignore state_referenced_locally
  let backends: BackendDto[] | undefined = $state();

  const provider = getProvider();

  const { advanced } = options;

  onMount(() => {
    if (!backends) {
      provider.getBackends().then((data) => (backends = data.backends));
    }
  });

  const yuccaBackend = $derived(
    backends?.find((backend) => backend.type === "yucca"),
  );

  const login = () => {
    const loginUrl = new URL("http://localhost:22676/api/auth/oidc/login");
    loginUrl.searchParams.set("next", window.location.href);
    window.location.href = loginUrl.href;
  };
</script>

{#if backends}
  {#if yuccaBackend}
    <Card color={yuccaBackend.isOnline ? "success" : "danger"}>
      <CardBody class="flex flex-col gap-2">
        <Heading>FUTO Backups</Heading>
      </CardBody>
      {#if yuccaBackend.isOnline}
        <CardFooter class="flex gap-2">
          <Button size="small" color="secondary">Manage my account</Button>
          <Button size="small" color="secondary">Billing</Button>
        </CardFooter>
      {:else}
        <CardFooter>
          <Button onclick={login} size="small">Login again</Button>
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
        <Button onclick={login} size="small">Get started</Button>
      </CardFooter>
    </Card>
  {/if}

  {#each backends as backend (backend.id)}
    {#if backend.type !== "yucca"}
      <Card color={backend.isOnline ? "success" : "danger"}>
        <CardBody class="flex flex-col gap-2">
          <Heading
            >{backend.type === "local" ? "Local Storage" : "S3 Server"}</Heading
          >
        </CardBody>
        <CardFooter>
          <Button size="small" color="secondary">Configure</Button>
        </CardFooter>
      </Card>
    {/if}
  {/each}

  {#if $advanced}
    <HStack>
      <Button size="small">Setup new local storage</Button>
      <Button size="small">Setup new S3 storage</Button>
    </HStack>
  {/if}
{:else}
  <LoadingSpinner />
{/if}
