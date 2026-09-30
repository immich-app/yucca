<script lang="ts">
  import Accordion from "$lib/components/ui/Accordion.svelte";
  import { Heading, Stack, Text } from "@immich/ui";
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
  <Heading tag="h2" size="tiny" fontWeight="semi-bold">{$t`Frequently Asked Questions`}</Heading>

  <Stack gap={0}>
    {#each questions as { title, answer } (title)}
      <Accordion {title} headingTag="h3">
        {#if typeof answer === "string"}
          <Text size="small" color="muted">{answer}</Text>
        {:else}
          {@render answer()}
        {/if}
      </Accordion>
    {/each}
  </Stack>
</Stack>
