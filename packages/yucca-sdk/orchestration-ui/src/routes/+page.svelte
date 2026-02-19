<script>
  import { Button, Heading, HStack } from "@immich/ui";
  import TestUi from "./TestUi.svelte";

  let mock = $state(true);
</script>

<div class="p-8 flex flex-col gap-4">
  <Heading size="giant">Orchestrator Test UI</Heading>

  <HStack>
    <Button onclick={() => (mock = true)} disabled={mock}
      >Use mock provider</Button
    >
    <Button onclick={() => (mock = false)} disabled={!mock}
      >Use orchestration API</Button
    >
    <Button
      onclick={() => {
        const loginUrl = new URL("http://localhost:22676/api/auth/login");
        loginUrl.searchParams.set("next", window.location.href);
        window.location.href = loginUrl.href;
      }}>Login</Button
    >
  </HStack>

  {#key mock}
    <TestUi {mock} />
  {/key}
</div>
