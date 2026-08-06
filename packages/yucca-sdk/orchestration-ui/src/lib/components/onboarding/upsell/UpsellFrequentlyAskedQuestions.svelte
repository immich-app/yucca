<script lang="ts">
  import Accordion from "$lib/components/ui/Accordion.svelte";
  import { Stack, Text } from "@immich/ui";

  type Question = {
    title: string;
    answer: string;
  };

  type Props = {
    questions: Question[];
  };

  const { questions }: Props = $props();
</script>

<Stack>
  <Text fontWeight="semi-bold">Frequently Asked Questions</Text>

  <Stack gap={0}>
    {#each questions as { title, answer } (title)}
      <Accordion {title}>
        <Text size="small" color="muted">{answer}</Text>
      </Accordion>
    {/each}
  </Stack>
</Stack>
