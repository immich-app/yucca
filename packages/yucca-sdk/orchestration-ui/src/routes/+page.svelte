<script>
  import { Button } from "@immich/ui";
  import TestUi from "./TestUi.svelte";

  let mock = $state(true);
</script>

<h1>Welcome to your library project</h1>
<p>
  Create your package using @sveltejs/package and preview/showcase your work
  with SvelteKit
</p>
<p>
  Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the
  documentation
</p>

<Button onclick={() => (mock = true)}>Use mock provider</Button>
<Button onclick={() => (mock = false)}>Use orchestration API</Button>

<Button
  onclick={() => {
    const loginUrl = new URL("http://localhost:22676/api/auth/login");
    loginUrl.searchParams.set("next", window.location.href);
    window.location.href = loginUrl.href;
  }}>Login</Button
>

{#key mock}
  <TestUi {mock} />
{/key}
