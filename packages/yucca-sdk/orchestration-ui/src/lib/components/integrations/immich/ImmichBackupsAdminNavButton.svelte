<script lang="ts">
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import {
    useIntegrationEventHandler,
    useIntegrations,
  } from "$lib/services/integrations.service";
  import { page } from "$app/state";
  import { Icon, Text } from "@immich/ui";
  import { mdiCloudUpload, mdiCloudUploadOutline } from "@mdi/js";

  type Props = {
    href: string;
  };

  const { href }: Props = $props();

  const active = $derived(page.url.pathname.startsWith(href));

  const integrations = useIntegrations();
  const { onIntegrationUpdate } = useIntegrationEventHandler();

  const configured = $derived(
    integrations.data ? Boolean(integrations.data.immichIntegration) : true,
  );

  const shell = $derived(
    configured
      ? `hover:bg-subtle hover:text-primary flex w-full cursor-pointer place-items-center gap-4 rounded-e-full ps-5 py-3 text-start ${active ? "bg-primary/10 text-primary" : ""}`
      : "border-primary/40 from-white via-blue-100 to-purple-100 dark:from-transparent dark:via-blue-500/10 dark:to-purple-500/15 flex w-full cursor-pointer place-items-center gap-4 rounded-xl border bg-gradient-to-r px-4 py-2.5 text-start",
  );
</script>

<OnEvents {onIntegrationUpdate} />

<div class={configured ? "" : "mx-4 mb-2"}>
  <a {href} class={shell}>
    <Icon
      icon={configured ? mdiCloudUploadOutline : mdiCloudUpload}
      size="1.375em"
      class="{configured ? '' : 'text-primary'} shrink-0"
    />

    <Text
      size="small"
      fontWeight="medium"
      color={configured && !active ? undefined : "primary"}
      class="flex-1 truncate"
    >
      {configured ? "Backups" : "Set up Backups"}
    </Text>
  </a>
</div>
