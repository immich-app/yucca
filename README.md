## Development Guide

Ensure you have prerequisites installed:

- [Docker](https://docs.docker.com/engine/install/)
- [mise](https://mise.jdx.dev/getting-started.html)
- [1password CLI](https://developer.1password.com/docs/cli/)

If necessary, copy `.env.example` to `.env` and customise.

Then use mise:

```bash
mise dev # install deps, prep environment, start servers

mise check # lint, format check, svelte check

mise test # unit tests
mise test:integration # integration tests
mise test:e2e # e2e tests
mise test:e2e:web # e2e web tests
```
