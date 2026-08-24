<script lang="ts">
  import { Button, Link, Section, Text } from '@better-svelte-email/components';
  import Layout from '../lib/layout.svelte';

  let { inviteCode, inviteUrl }: { inviteCode: string; inviteUrl: string } = $props();
</script>

<Layout preview="You're invited to the FUTO Backups beta">
  <Text>You've been invited to the FUTO Backups beta.</Text>
  <Text>Use this invite code to sign up:</Text>
  <Section class="my-6 rounded-xl bg-neutral-100 px-4 py-5 text-center font-mono text-2xl tracking-widest text-dark">
    {inviteCode}
  </Section>
  <Section class="my-8 text-center">
    <Button href={inviteUrl} class="rounded-lg bg-primary px-6 py-3 text-base font-medium text-white">
      Join the beta
    </Button>
  </Section>
  <Text class="text-sm text-subtle">
    If the button doesn't work, open <Link href={inviteUrl}>{inviteUrl}</Link> and enter the code above.
  </Text>
</Layout>
