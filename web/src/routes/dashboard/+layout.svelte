<script lang="ts">
  import { AppShell, AppShellHeader, Avatar, Button, Heading, HStack } from "@immich/ui";
  import { defaults } from "yucca-sdk";

  const { data, children } = $props();
</script>

<AppShell>
  <AppShellHeader>
    <div class="flex h-full items-center justify-between p-4">
      <Heading size="tiny">FUTO Backups</Heading>
      <HStack>
        <Avatar name={data.user!.name} />
        <Button
          onclick={() => (location.href = defaults.baseUrl + "/auth/logout")}
          >Logout</Button
        >
      </HStack>
    </div>
  </AppShellHeader>
  <div class="p-4">
    {@render children()}
  </div>
</AppShell>
