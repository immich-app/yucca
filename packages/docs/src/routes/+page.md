---
title: Introduction
description: What FUTO Backups is, how it is put together and where to find what you need
---

FUTO Backups is a hosted backup service from [FUTO](https://futo.org). Users sign in with their account, connect a backup client, and their data lands in a [restic](https://restic.net/) repository on object storage that FUTO runs on its own hardware. Internally the project is called **yucca**, which is also the name of the [repository](https://github.com/immich-app/yucca) this site is built from.

## How it fits together

- **Clients** back up into an account through a _connection_. Today that is the backups feature built into Immich, the [standalone container](/getting-started/standalone-docker) for a homelab machine and, behind a feature flag, any restic client using the account as a REST backend. See [Connections](/architecture/connections).
- **Services** run in Kubernetes: `yucca-api` owns authentication, repositories and the database schema, `michael` is the restic REST backend in front of S3, and a metrics worker, an admin API, the web app and the support tooling sit alongside them. See [Services](/development/services).
- **Storage** is Ceph object storage on bare metal, one or more clusters per region, provisioned with Ansible. See [Ceph](/infrastructure/ceph).
- **Fleet**: partitions (prod, staging, dev) contain regions, each with one Kubernetes cluster and its Ceph clusters, all managed as code with OpenTofu, Talos and Flux. See the [infrastructure overview](/infrastructure/overview).

## Where to start

- [Getting started](/getting-started/standalone-docker) shows how to run the standalone container on your own hardware.
- [Development](/development/getting-started) covers running the stack locally, the tooling, the services and how they are released.
- [Architecture](/architecture/connections) documents connections and billing, feature flags, email, the support tooling and the restic client contract.
- [Infrastructure](/infrastructure/overview) describes Terraform, Kubernetes and Flux, Ceph, Talos, the switch fabric, the management hosts and observability.
- [Operations](/operations/yuctl) covers the `yuctl` CLI and the Ceph scrub exporter.

> [!NOTE]
> The service is in beta. Everything on this site is generated from the [yucca](https://github.com/immich-app/yucca) repository; each page links to its source so it can be corrected in a pull request.
