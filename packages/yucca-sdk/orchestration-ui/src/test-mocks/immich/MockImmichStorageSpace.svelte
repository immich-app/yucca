<script lang="ts">
  import { Icon, Meter, Text } from "@immich/ui";
  import { mdiChevronRight, mdiCloudCheckOutline } from "@mdi/js";

  type Props = {
    onBackups: () => void;
  };

  const { onBackups }: Props = $props();
</script>

<div class="bg-light-100 overflow-hidden rounded-lg text-sm">
  <div class="p-4">
    <Meter
      size="tiny"
      class="bg-light-200"
      containerClass="gap-2 leading-6"
      label="Storage"
      valueLabel="22.1 GiB of 100 GiB used"
      value={0.221}
    />
  </div>

  <button
    type="button"
    onclick={onBackups}
    class="bg-success-50 text-success-700 flex w-full cursor-pointer items-center gap-2 px-3 py-3 text-start"
  >
    <Icon icon={mdiCloudCheckOutline} size="1em" class="shrink-0" />

    <Text size="small" color="success" class="flex-1 truncate">
      Backed up 2 hours ago
    </Text>

    <Icon icon={mdiChevronRight} size="1em" class="shrink-0" />
  </button>
</div>
