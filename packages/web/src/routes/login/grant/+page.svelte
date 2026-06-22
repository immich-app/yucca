<script lang="ts">
  import {
    Button,
    Card,
    CardBody,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "@immich/ui";
</script>

<svelte:head><title>Grant access &middot; FUTO Backups</title></svelte:head>

<Card>
  <CardHeader>
    <CardTitle>Grant access to app?</CardTitle>

    <CardBody>App will be able to manage your backups.</CardBody>

    <CardFooter>
      <form method="POST" action="/api/auth/app/callback">
        <Button type="submit">Accept</Button>
      </form>
    </CardFooter>
  </CardHeader>
</Card>
