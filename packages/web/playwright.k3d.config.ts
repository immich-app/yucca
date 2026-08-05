import { defineConfig } from '@playwright/test';

// Web e2e against the LOCAL k3d stack (web port-forwarded to :36033). Unlike the
// default config there is no webServer block — web is already served by the
// cluster. host-resolver-rules lets the browser reach the in-cluster OIDC issuer
// host (yucca-mock-oidc) via the kubectl port-forward on localhost. Driven by
// packages/e2e/k3d/run.sh (mise test:e2e:k3d).
export default defineConfig({
  testDir: 'e2e',
  // yucca-web is a vite DEV server here, so the first visit to a route pays for
  // its compile — more than the stock 5s assertion timeout on a cold, loaded
  // runner, which is exactly when CI runs this.
  expect: { timeout: 30_000 },
  use: {
    launchOptions: {
      args: ['--host-resolver-rules=MAP yucca-mock-oidc 127.0.0.1'],
    },
  },
});
