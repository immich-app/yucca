<script lang="ts">
  import { Badge, Card, CardBody, HStack, Stack, Text } from "@immich/ui";

  type Segment = {
    value: number;
    label: string;
    color: string;
    badge: "success" | "warning" | "danger" | "secondary";
  };

  type Props = {
    title: string;
    summary: string;
    segments: Segment[];
  };

  const { title, summary, segments }: Props = $props();
</script>

<Card>
  <CardBody>
    <Stack>
      <HStack class="justify-between">
        <Text size="large">{title}</Text>
        <Text color="secondary">{summary}</Text>
      </HStack>

      <div
        style="display: flex; height: 6px; border-radius: 3px; overflow: hidden; gap: 2px;"
      >
        {#each segments as segment (segment.label)}
          {#if segment.value > 0}
            <div
              style="flex: {segment.value}; background: {segment.color}; border-radius: 3px;"
            ></div>
          {/if}
        {/each}
      </div>

      <HStack wrap>
        {#each segments as segment (segment.label)}
          {#if segment.value > 0}
            <Badge size="tiny" color={segment.badge}>
              {segment.value}
              {segment.label}
            </Badge>
          {/if}
        {/each}
      </HStack>
    </Stack>
  </CardBody>
</Card>
