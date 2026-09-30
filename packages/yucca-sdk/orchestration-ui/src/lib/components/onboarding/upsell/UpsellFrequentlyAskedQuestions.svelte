<script lang="ts">
  import Accordion from "$lib/components/ui/Accordion.svelte";
  import { Stack, Text } from "@immich/ui";
  import type { Snippet } from "svelte";
  import { t } from "svelte-i18n-lingui";

  type Question = {
    title: string;
    answer: string | Snippet;
  };

  type Props = {
    questions: Question[];
  };

  const { questions }: Props = $props();
</script>

<Stack>
  <Text fontWeight="semi-bold">{$t`Frequently Asked Questions`}</Text>

  <Stack gap={0}>
    {#each questions as { title, answer } (title)}
      <Accordion {title}>
        {#if typeof answer === "string"}
          <Text size="small" color="muted">{answer}</Text>
        {:else}
          {@render answer()}
        {/if}
      </Accordion>
    {/each}
  </Stack>
</Stack>
