# web Docker image
# Built on/for Alpine Linux
#
# mise is used as a command runner only
# node.js & pnpm pinned in image =(
#   (node.js 26 will remove yarn v1 fixing corepack install)
#
# References:
# ===========
# https://mise.jdx.dev/mise-cookbook/docker.html
# https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md
# https://pnpm.io/cli/deploy

ARG ALPINE_VERSION=3.23
# Pinned alpine runtime base. NOTE: this digest is alpine:3.23's, so it must NOT
# be appended to the node/golang base tags (which reuse ${ALPINE_VERSION}).
ARG ALPINE_IMAGE=alpine:3.23@sha256:5b10f432ef3da1b8d4c7eb6c487f2f5a8f096bc91145e68878dd4a5019afde11

# Manifest stage: keep only package.jsons + workspace files so the pnpm-install
# layer is cached on lockfile/manifest changes only (not every src edit).
FROM ${ALPINE_IMAGE} AS manifests
WORKDIR /src
COPY . ./
RUN find . -type d -name node_modules -prune -exec rm -rf {} + && \
    find . -type f \
      ! -name 'package.json' \
      ! -name 'pnpm-lock.yaml' \
      ! -name 'pnpm-workspace.yaml' \
      ! -name '.npmrc' \
      -delete && \
    find . -type d -empty -delete

FROM node:25-alpine${ALPINE_VERSION} AS dev
WORKDIR /app
RUN apk add --no-cache bash && npm install -g pnpm@10.28.1
ENV NODE_ENV="development"

# 1. Install deps — cached unless lockfile or any package.json changes
COPY --from=manifests /src ./
RUN pnpm install --frozen-lockfile

# 2. Copy sources and pre-build the workspace libs web consumes
COPY . ./
# NOTE: filter by published package names (renamed under @futo-org/*); a stale
# filter silently matches nothing (pnpm exits 0), leaving web's SSR deps unbuilt.
RUN pnpm --filter @common/server build && \
    pnpm --filter @futo-org/backups-api-client build && \
    pnpm --filter @futo-org/backups-orchestrator-ui build && \
    pnpm --filter web lingui:compile

EXPOSE 5173
CMD ["pnpm", "--filter", "web", "dev", "--host", "0.0.0.0"]

FROM node:25-alpine${ALPINE_VERSION} AS builder
WORKDIR /build-stage
COPY . ./

RUN apk add --no-cache curl bash

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ENV MISE_DATA_DIR="/mise"
ENV MISE_CONFIG_DIR="/mise"
ENV MISE_CACHE_DIR="/mise/cache"
ENV MISE_INSTALL_PATH="/usr/local/bin/mise"
ENV MISE_TASK_RUN_AUTO_INSTALL=false
ENV PATH="/mise/shims:$PATH"

RUN npm install -g pnpm@10.28.1
RUN curl https://mise.run | sh
RUN mise trust
RUN pnpm i --frozen-lockfile
RUN NODE_ENV=production mise web:build
RUN pnpm --filter web deploy /deploy --prod --legacy

FROM ${ALPINE_IMAGE}

WORKDIR /usr/src/app

RUN apk add --no-cache libstdc++ dumb-init \
    && addgroup -g 1000 node && adduser -u 1000 -G node -s /bin/sh -D node \
    && chown node:node ./
COPY --from=builder /usr/local/bin/node /usr/local/bin/
COPY --from=builder /usr/local/bin/docker-entrypoint.sh /usr/local/bin/
ENTRYPOINT ["docker-entrypoint.sh"]
USER node

COPY --from=builder /deploy ./

ENV NODE_ENV="production"
ENV PORT=3000
EXPOSE 3000
CMD ["dumb-init", "node", "build/index.js"]
