import { MediaQuery } from 'svelte/reactivity';

const sidebar = new MediaQuery('min-width: 48rem');

export const mediaQueryManager = {
  get isFullSidebar() {
    return sidebar.current;
  },
};
