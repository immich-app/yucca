<script lang="ts">
  import BackupOptions from "./stages/BackupOptions.svelte";
  import ConfirmKey from "./stages/ConfirmKey.svelte";
  import KeyIntro from "./stages/KeyIntro.svelte";
  import SaveKey from "./stages/SaveKey.svelte";
  import Welcome from "./stages/Welcome.svelte";

  type Props = {
    onFinish: () => void;
    onCancel: () => void;
  };

  const code = `ABCD EFGH IJKL MNOP
QRST UVWX YZAB CDEF
ABCD EFGH IJKL MNOP
QRST UVWX YZAB CDEF`;

  const { onFinish, onCancel }: Props = $props();
  const onNext = () => stage++;
  const onBack = () => stage--;

  let stage = $state(0);
</script>

{#if stage === 0}
  <Welcome {onNext} {onCancel} />
{:else if stage === 1}
  <KeyIntro {onNext} {onCancel} />
{:else if stage === 2}
  <SaveKey {code} {onNext} {onCancel} />
{:else if stage === 3}
  <ConfirmKey {code} {onNext} {onBack} {onCancel} />
{:else if stage === 4}
  <BackupOptions {onFinish} {onCancel} />
{/if}
