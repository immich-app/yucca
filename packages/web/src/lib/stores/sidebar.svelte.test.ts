import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { page } from 'vitest/browser';
import { sidebarStore } from '$lib/stores/sidebar.svelte';

const observeIsOpen = () => {
  const observed = { isOpen: false };
  const cleanup = $effect.root(() => {
    $effect(() => {
      observed.isOpen = sidebarStore.isOpen;
    });
  });
  flushSync();
  return { observed, cleanup };
};

const resize = async (width: number) => {
  await page.viewport(width, 800);
  await expect.poll(() => window.innerWidth).toBe(width);
  flushSync();
};

describe('sidebarStore', () => {
  it('starts closed and toggles below the md breakpoint', async () => {
    await resize(320);
    const { observed, cleanup } = observeIsOpen();

    expect(observed.isOpen).toBe(false);
    sidebarStore.toggle();
    flushSync();
    expect(observed.isOpen).toBe(true);
    sidebarStore.toggle();
    flushSync();
    expect(observed.isOpen).toBe(false);

    cleanup();
  });

  it('closes on reset below the md breakpoint', async () => {
    await resize(320);
    const { observed, cleanup } = observeIsOpen();

    sidebarStore.toggle();
    sidebarStore.reset();
    flushSync();
    expect(observed.isOpen).toBe(false);

    cleanup();
  });

  it('stays open when toggled at or above the md breakpoint', async () => {
    await resize(1024);
    const { observed, cleanup } = observeIsOpen();

    expect(observed.isOpen).toBe(true);
    sidebarStore.toggle();
    flushSync();
    expect(observed.isOpen).toBe(true);

    cleanup();
  });

  it('follows the breakpoint when the viewport crosses it', async () => {
    await resize(320);
    const { observed, cleanup } = observeIsOpen();

    await resize(1024);
    await expect.poll(() => observed.isOpen).toBe(true);
    await resize(320);
    await expect.poll(() => observed.isOpen).toBe(false);

    cleanup();
  });
});
