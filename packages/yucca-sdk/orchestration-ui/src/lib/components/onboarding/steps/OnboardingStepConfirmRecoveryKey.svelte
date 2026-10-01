<script lang="ts">
  import { Field, HelperText, Input } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";
  import OnboardingStepLayout, {
    type OnboardingStepAction,
  } from "./OnboardingStepLayout.svelte";

  type Props = {
    code: string;
    loading?: boolean;
    onConfirm: () => void;
    onBack: () => void;
  };

  const { code, loading = false, onConfirm, onBack }: Props = $props();

  let value = $state("");
  let mismatch = $state(false);

  const normalise = (key: string) => key.replace(/\s/g, "").toLowerCase();

  const confirm = () => {
    mismatch = normalise(value) !== normalise(code);
    if (!mismatch) {
      onConfirm();
    }
  };

  const actions = $derived<OnboardingStepAction[]>([
    { label: $t`Confirm`, onClick: confirm, loading },
    { label: $t`View recovery key`, onClick: onBack },
  ]);
</script>

<OnboardingStepLayout
  description={$t`Enter your recovery key to confirm you saved it correctly.`}
  {actions}
  badge={false}
>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      confirm();
    }}
  >
    <Field label={$t`Recovery Key`} invalid={mismatch}>
      <Input bind:value autocomplete="off" spellcheck={false} />
      {#if mismatch}
        <HelperText color="danger"
          >{$t`Recovery key does not match. Check you entered it exactly as saved.`}</HelperText
        >
      {/if}
    </Field>
  </form>
</OnboardingStepLayout>
