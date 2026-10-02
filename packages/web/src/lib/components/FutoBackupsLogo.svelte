<script lang="ts">
  // TODO: switch to SVG variants
  import logo from "$lib/assets/futo-backups-logo.png";
  import logoDark from "$lib/assets/futo-backups-logo-dark.png";

  type Props = {
    class?: string;
  };

  const { class: className = "h-8" }: Props = $props();
</script>

<img src={logo} alt="FUTO Backups" class="w-auto dark:hidden {className}" />
<img
  src={logoDark}
  alt="FUTO Backups"
  class="hidden w-auto dark:block {className}"
/>
