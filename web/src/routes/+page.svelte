<script lang="ts">
  import { SupporterBadge, Logo, Heading, Text, VStack } from "@immich/ui";
  import { onMount } from "svelte";
  import { hello } from "yucca-sdk";

  let value = $state("Loading from API...");

  onMount(() => {
    hello().then((v) => (value = v.data!));
  });
</script>

<main class="p-4">
  <VStack>
    <SupporterBadge effect="always">
      <Logo size="large" variant="icon" />
      <Heading tag="h1" size="large" color="primary">Purchase Immich</Heading>
    </SupporterBadge>

    <Text>From the yucca API: {value}</Text>
  </VStack>
</main>
