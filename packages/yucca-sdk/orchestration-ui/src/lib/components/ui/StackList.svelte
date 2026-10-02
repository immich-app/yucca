<script lang="ts">
  import { Card, CardBody } from "@immich/ui";
  import type { Snippet } from "svelte";
  import Section from "./Section.svelte";

  type Props = {
    title?: Snippet;
    action?: Snippet;
    children?: Snippet;
  };

  const { title, action, children }: Props = $props();
</script>

<Section {title} {action}>
  <Card class="border-primary-100 shadow-none">
    <CardBody class="divide-y p-0">
      {@render children?.()}
    </CardBody>
  </Card>
</Section>
