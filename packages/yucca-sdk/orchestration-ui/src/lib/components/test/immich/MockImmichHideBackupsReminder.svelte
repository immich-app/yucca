<script lang="ts">
  import { options } from "$lib/options";
  import { Field, Switch } from "@immich/ui";

  const { hideBackupsReminder } = options;
</script>

<Field
  label="Hide backups reminder"
  description="If you already manage backups outside of Immich, you can hide the backup setup reminder."
>
  <Switch bind:checked={$hideBackupsReminder} />
</Field>
