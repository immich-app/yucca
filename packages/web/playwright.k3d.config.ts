import { defineConfig } from '@playwright/test';

// Web e2e against the LOCAL k3d stack (web port-forwarded to :36033), so no webServer block. host-resolver-rules
// maps the in-cluster OIDC issuer host (yucca-mock-oidc) to the kubectl port-forward on localhost. Driven by
// packages/e2e/k3d/run.sh (mise test:e2e:k3d).
export default defineConfig({
  testDir: 'e2e',
  use: {
    launchOptions: {
      args: ['--host-resolver-rules=MAP yucca-mock-oidc 127.0.0.1'],
    },
  },
});
