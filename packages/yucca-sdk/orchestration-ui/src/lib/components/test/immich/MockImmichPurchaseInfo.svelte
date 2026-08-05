<script lang="ts">
  import { Icon, Logo } from "@immich/ui";
  import { mdiInformationOutline } from "@mdi/js";
</script>

<div class="license-status text-sm">
  <button
    type="button"
    onclick={() => {}}
    class="flex w-full cursor-pointer place-content-center place-items-center justify-between rounded-lg border border-primary/20 p-2 shadow-md dark:border-primary/10 dark:bg-primary/10"
  >
    <div
      class="flex w-full place-content-center place-items-center justify-between"
    >
      <div class="flex place-content-center place-items-center gap-1">
        <Logo variant="icon" size="tiny" />
        <p class="flex font-medium text-primary">Buy Immich</p>
      </div>

      <div>
        <Icon
          icon={mdiInformationOutline}
          class="flex font-medium text-primary"
          size="18"
        />
      </div>
    </div>
  </button>
</div>
