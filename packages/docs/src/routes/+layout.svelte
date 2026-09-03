<script lang="ts">
  import { beforeNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import '../app.css';
  import { getPagesForSection, Links, sections } from '$lib';
  import { getSearchProvider } from '$lib/search';
  import {
    AppShell,
    AppShellHeader,
    AppShellSidebar,
    Button,
    CommandPaletteButton,
    commandPaletteManager,
    CommandPaletteProvider,
    Container,
    ControlBar,
    ControlBarHeader,
    ControlBarOverflow,
    IconButton,
    Link,
    NavbarGroup,
    NavbarItem,
    Text,
    ThemeSwitcher,
    TooltipProvider,
  } from '@immich/ui';
  import { mdiBookOpenPageVariantOutline, mdiGithub, mdiMenu, mdiOpenInNew } from '@mdi/js';
  import type { Snippet } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import type { LayoutData } from './$types';

  type Props = {
    children?: Snippet;
    data: LayoutData;
  };

  const { children, data }: Props = $props();

  const desktop = new MediaQuery('min-width: 48rem');
  let open = $derived(desktop.current);

  beforeNavigate(() => {
    if (!desktop.current) {
      open = false;
    }
  });

  commandPaletteManager.enable();
  commandPaletteManager.setTranslations({
    command_palette_prompt_default: 'Search the documentation',
  });

  const isCurrent = (url: string) => () => page.url.pathname === url;
</script>

<CommandPaletteProvider providers={[getSearchProvider(data.docs)]} />

<TooltipProvider>
  <AppShell>
    <AppShellHeader>
      <ControlBar static variant="ghost">
        <ControlBarHeader class="flex-row items-center gap-1">
          <IconButton
            shape="round"
            color="secondary"
            variant="ghost"
            size="medium"
            aria-label="Main menu"
            icon={mdiMenu}
            onclick={() => (open = !open)}
            class="md:hidden"
          />
          <a href="/" class="flex items-center gap-2 px-2">
            <img src="/favicon.svg" alt="" class="size-7" />
            <Text fontWeight="bold" size="large">FUTO Backups</Text>
            <Text color="muted" size="large" class="hidden sm:block">Docs</Text>
          </a>
        </ControlBarHeader>
        <ControlBarOverflow>
          <Button href={Links.App} color="secondary" variant="ghost" trailingIcon={mdiOpenInNew} class="hidden sm:flex">
            Open app
          </Button>
          <IconButton
            href={Links.Repository}
            icon={mdiGithub}
            aria-label="GitHub repository"
            color="secondary"
            variant="ghost"
            size="medium"
          />
          <CommandPaletteButton />
          <ThemeSwitcher size="medium" />
        </ControlBarOverflow>
      </ControlBar>
    </AppShellHeader>

    <AppShellSidebar bind:open>
      <nav aria-label="Documentation" class="mt-4 me-4 mb-24">
        <NavbarItem href="/" title="Introduction" icon={mdiBookOpenPageVariantOutline} isActive={isCurrent('/')} />
        {#each sections as section (section.id)}
          <NavbarGroup title={section.title} />
          {#each getPagesForSection(data.pages, section) as doc (doc.url)}
            <NavbarItem href={doc.url} title={doc.title} icon={section.icon} isActive={isCurrent(doc.url)} variant="compact" />
          {/each}
        {/each}
      </nav>
    </AppShellSidebar>

    <div class="flex h-full flex-col">
      <main class="w-full grow">
        <Container size="large" center class="w-full p-4 lg:p-8">
          {@render children?.()}
        </Container>
      </main>
      <footer class="text-muted mt-16 flex flex-wrap justify-center gap-4 border-t p-6 text-sm">
        <Link href={Links.Futo}>FUTO</Link>
        <Link href={Links.Repository}>Source code</Link>
      </footer>
    </div>
  </AppShell>
</TooltipProvider>
