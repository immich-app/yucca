<script lang="ts">
  import { siteMetadata } from '$lib';
  import { Button, Heading, SiteMetadata, Text } from '@immich/ui';
</script>

<SiteMetadata site={siteMetadata} page={{ title: 'Page not found', description: 'This page does not exist' }} />

<div class="flex flex-col items-start gap-4 py-16">
  <Heading tag="h1" size="giant">Page not found</Heading>
  <Text color="muted" size="large">The page you are looking for does not exist or has moved.</Text>
  <Button href="/">Back to the introduction</Button>
</div>
