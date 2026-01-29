<script lang="ts">
  import { Avatar, Button, Heading, HStack } from "@immich/ui";
  import { defaults } from "yucca-sdk";
  import { t } from "svelte-i18n-lingui";

  const { data, children } = $props();
</script>

<div class="flex h-dvh flex-col overflow-hidden">
  <header class="border-b">
    <div class="flex h-full items-center justify-between p-4">
      <Heading size="tiny">FUTO Backups</Heading>
      <HStack>
        <Avatar name={data.user!.name} />
        <Button
          onclick={() => (location.href = defaults.baseUrl + "/auth/logout")}
          >{$t`Logout`}</Button
        >
      </HStack>
    </div>
  </header>
  <div class="p-4">
    {@render children()}
  </div>
</div>
