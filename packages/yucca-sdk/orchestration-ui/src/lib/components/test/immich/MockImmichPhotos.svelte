<script lang="ts">
  import { Stack, Text } from "@immich/ui";

  const groups = [
    { title: "Friday, 31 July 2026", count: 13 },
    { title: "Thursday, 30 July 2026", count: 8 },
    { title: "Sunday, 26 July 2026", count: 17 },
  ];

  const aspects = [1.5, 0.75, 1.33, 1, 0.7, 1.78, 1.2, 0.8, 1.4, 1];
  const greys = [88, 82, 91, 78, 85, 93, 80, 87];

  const seedOf = (group: number, index: number) => group * 7 + index * 3;
  const aspect = (seed: number) => aspects[seed % aspects.length];
  const grey = (seed: number) => greys[seed % greys.length];
</script>

<Stack gap={8} class="p-4">
  {#each groups as group, groupIndex (group.title)}
    <Stack gap={2}>
      <Text size="small" fontWeight="medium" color="muted">{group.title}</Text>

      <div class="flex flex-wrap gap-1">
        {#each Array.from({ length: group.count }, (_, index) => index) as index (index)}
          {@const seed = seedOf(groupIndex, index)}
          <div
            class="h-36 grow rounded-sm"
            style="background-color: hsl(0 0% {grey(seed)}%); flex-basis: {aspect(
              seed,
            ) * 9}rem"
          ></div>
        {/each}
      </div>
    </Stack>
  {/each}
</Stack>
