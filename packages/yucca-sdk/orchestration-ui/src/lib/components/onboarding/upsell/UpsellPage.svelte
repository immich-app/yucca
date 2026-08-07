<script lang="ts">
  import { Card, CardBody, Container, HStack, Stack } from "@immich/ui";
  import type { Snippet } from "svelte";
  import UpsellBackupFeaturesGrid from "./UpsellBackupFeaturesGrid.svelte";
  import UpsellExplainFutoBackups from "./UpsellExplainFutoBackups.svelte";
  import UpsellFrequentlyAskedQuestions from "./UpsellFrequentlyAskedQuestions.svelte";
  import UpsellHowItWorks from "./UpsellHowItWorks.svelte";

  type Question = {
    title: string;
    answer: string | Snippet;
  };

  type Props = {
    price: string;
    includedStorage: string;
    questions: Question[];
    onGetStarted: () => void;
  };

  const { price, includedStorage, questions, onGetStarted }: Props = $props();
</script>

<Container size="large" center>
  <Stack gap={8} class="py-4">
    <Card color="primary" class="shadow-none">
      <CardBody class="p-8">
        <HStack gap={8} class="justify-between">
          <UpsellExplainFutoBackups {price} {includedStorage} {onGetStarted} />

          <UpsellHowItWorks color="secondary" />
        </HStack>
      </CardBody>
    </Card>

    <UpsellBackupFeaturesGrid />

    <UpsellFrequentlyAskedQuestions {questions} />
  </Stack>
</Container>
