<script lang="ts">
  import { Field, Switch } from "@immich/ui";

  let hidden = $state(false);
</script>

<Field
  label="Hide backups reminder"
  description="If you already manage backups outside of Immich, you can hide the backup setup reminder."
>
  <Switch bind:checked={hidden} />
</Field>
