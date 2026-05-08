import { writable } from 'svelte/store';

export const options = {
  advanced: writable(false),
  testUiRestore: writable(false),
};
