<script lang="ts">
  import type { Snippet } from "svelte";
  import UpsellPage from "../../onboarding/upsell/UpsellPage.svelte";
  import ImmichManageBackupPage from "./ImmichManageBackupPage.svelte";
  import ImmichOnboardingSetupFlow from "./ImmichOnboardingSetupFlow.svelte";

  type Question = {
    title: string;
    answer: string | Snippet;
  };

  type Props = {
    questions: Question[];
    onConfigure: () => void;
    onViewAttempts: () => void;
    onViewSnapshots: () => void;
  };

  const {
    questions,
    onConfigure,
    onViewAttempts,
    onViewSnapshots,
  }: Props = $props();
</script>

<ImmichOnboardingSetupFlow>
  {#snippet fallback(onStart)}
    <UpsellPage {questions} onGetStarted={onStart} />
  {/snippet}

  <ImmichManageBackupPage {onConfigure} {onViewAttempts} {onViewSnapshots} />
</ImmichOnboardingSetupFlow>
