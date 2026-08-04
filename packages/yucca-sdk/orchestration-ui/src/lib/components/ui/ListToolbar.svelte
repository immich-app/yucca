<script lang="ts">
  import {
    Button,
    HStack,
    Input,
    menuManager,
    type ActionItem,
  } from "@immich/ui";
  import { mdiFilterVariant, mdiMagnify, mdiSortVariant } from "@mdi/js";

  type Menu = {
    label: string;
    items: ActionItem[];
    active?: boolean;
  };

  type Props = {
    placeholder: string;
    search: string;
    onSearch: (value: string) => void;
    sort?: Menu;
    filters?: Menu;
  };

  const { placeholder, search, onSearch, sort, filters }: Props = $props();

  const openMenu = (items: ActionItem[]) => (event: Event) =>
    void menuManager.show({
      target: event.currentTarget as HTMLElement,
      position: "bottom-left",
      items,
    });
</script>

<HStack class="items-center justify-between">
  <Input
    class="max-w-72"
    leadingIcon={mdiMagnify}
    {placeholder}
    value={search}
    oninput={(event) => onSearch(event.currentTarget.value)}
  />

  <HStack gap={2}>
    {#each [{ menu: sort, icon: mdiSortVariant }, { menu: filters, icon: mdiFilterVariant }] as { menu, icon } (icon)}
      {#if menu}
        <Button
          variant="outline"
          size="small"
          color={menu.active ? "primary" : "secondary"}
          class="whitespace-nowrap"
          leadingIcon={icon}
          onclick={openMenu(menu.items)}
        >
          {menu.label}
        </Button>
      {/if}
    {/each}
  </HStack>
</HStack>
