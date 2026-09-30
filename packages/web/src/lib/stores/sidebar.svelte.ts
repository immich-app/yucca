import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';

class SidebarStore {
  isOpen = $derived(mediaQueryManager.isFullSidebar);

  reset() {
    this.isOpen = mediaQueryManager.isFullSidebar;
  }

  toggle() {
    this.isOpen = mediaQueryManager.isFullSidebar ? true : !this.isOpen;
  }
}

export const sidebarStore = new SidebarStore();
