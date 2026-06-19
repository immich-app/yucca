<script lang="ts">
  import Billing from "$lib/components/billing/Billing.svelte";

  const { data } = $props();
</script>

<Billing initialData={data.initialData} />
