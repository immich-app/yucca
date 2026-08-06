<script lang="ts">
  import UpsellPage from "../../onboarding/upsell/UpsellPage.svelte";
  import ImmichManageBackup from "./ImmichManageBackup.svelte";
  import ImmichOnboardingSetupFlow from "./ImmichOnboardingSetupFlow.svelte";

  type Question = {
    title: string;
    answer: string;
  };

  type Props = {
    price: string;
    includedStorage: string;
    questions: Question[];
  };

  const { price, includedStorage, questions }: Props = $props();
</script>

<ImmichOnboardingSetupFlow>
  {#snippet fallback(onStart)}
    <UpsellPage {price} {includedStorage} {questions} onGetStarted={onStart} />
  {/snippet}

  <ImmichManageBackup />
</ImmichOnboardingSetupFlow>
