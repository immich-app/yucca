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
    price: string;
    includedStorage: string;
    questions: Question[];
    onConfigure: () => void;
    onViewAttempts: () => void;
    onViewSnapshots: () => void;
  };

  const {
    price,
    includedStorage,
    questions,
    onConfigure,
    onViewAttempts,
    onViewSnapshots,
  }: Props = $props();
</script>

<ImmichOnboardingSetupFlow>
  {#snippet fallback(onStart)}
    <UpsellPage {price} {includedStorage} {questions} onGetStarted={onStart} />
  {/snippet}

  <ImmichManageBackupPage {onConfigure} {onViewAttempts} {onViewSnapshots} />
</ImmichOnboardingSetupFlow>
