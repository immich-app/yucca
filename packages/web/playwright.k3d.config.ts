import { defineConfig } from '@playwright/test';

// host-resolver-rules lets the browser reach the OIDC issuer host via the kubectl port-forward.
export default defineConfig({
  testDir: 'e2e',
  use: {
    launchOptions: {
      args: [
        '--host-resolver-rules=MAP oidc.localhost 127.0.0.1,MAP yucca-mock-oidc 127.0.0.1',
      ],
    },
  },
});
