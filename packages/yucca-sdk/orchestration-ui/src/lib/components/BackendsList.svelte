<script lang="ts">
  import { Badge, Button, Card, CardBody, Heading, HStack } from "@immich/ui";
  import { getProvider } from "$lib/providers";
  import { onMount } from "svelte";
  import { type BackendsResponseDto } from "../fetch-client";

  interface Props {
    initialData?: BackendsResponseDto;
  }

  const { initialData }: Props = $props();

  // svelte-ignore state_referenced_locally
  let backends = $state(initialData?.backends);

  const provider = getProvider();

  onMount(() => {
    if (!backends) {
      provider.getBackends().then((data) => (backends = data.backends));
    }
  });
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-col gap-2">
    <Heading size="medium">Backends</Heading>
    {#each backends as backend (backend.id)}
      <Card>
        <CardBody class="flex flex-col gap-2">
          <HStack>
            <Heading class="break-all"
              >{backend.type}
              <Badge size="tiny" class="inline -mt-2" color="secondary"
                >{backend.id}</Badge
              ></Heading
            >
          </HStack>
          <HStack wrap>
            {#if backend.isOnline}
              <Badge size="tiny" color="success">Online</Badge>
            {:else}
              <Badge size="tiny" color="danger">Offline</Badge>
            {/if}
            {#if backend.error}
              <Badge size="tiny" color="danger"
                >{JSON.stringify(backend.error)}</Badge
              >
            {/if}
          </HStack>
        </CardBody>
      </Card>
    {/each}

    <Button
      class="w-64"
      onclick={() => {
        const loginUrl = new URL("http://localhost:22676/api/auth/oidc/login");
        loginUrl.searchParams.set("next", window.location.href);
        window.location.href = loginUrl.href;
      }}>Login to yucca</Button
    >
  </div>
</div>
