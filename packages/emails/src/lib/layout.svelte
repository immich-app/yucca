<script lang="ts">
  import { Body, Container, Head, Heading, Hr, Html, Preview, Text } from '@better-svelte-email/components';
  import type { Snippet } from 'svelte';

  let { preview, children }: { preview: string; children: Snippet } = $props();
</script>

<Html>
  <Head />
  <Body class="m-0 bg-neutral-100 p-2 font-sans text-base text-dark">
    <Preview {preview} />
    <Container class="mx-auto my-10 max-w-md">
      <Container class="rounded-3xl border border-solid border-neutral-300 bg-white p-10">
        <Heading as="h1" class="mt-0 mb-6 text-center text-2xl font-semibold text-dark">FUTO Backups</Heading>
        {@render children()}
      </Container>
      <Hr class="mt-8 border-neutral-200" />
      <Text class="text-center text-xs text-subtle">FUTO Backups &middot; automated message, replies are not read</Text>
    </Container>
  </Body>
</Html>
