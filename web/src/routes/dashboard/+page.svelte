<script lang="ts">
  const { data } = $props();
</script>

<span>Logged in as {data.user!.name} ({data.user!.email})</span>
