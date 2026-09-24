ARG ALPINE_IMAGE=alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b
ARG NODE_IMAGE=node:25-alpine3.23@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4
ARG MISE_IMAGE=ghcr.io/jdx/mise:2026.9.9@sha256:a88f300ef4365494b88f8eefd271bb92ba467d4a41835739a714426207215730
ARG GOLANG_IMAGE=golang:1.27-alpine3.23@sha256:d9e2f2f07b10cc922da3e80e035c3058810b328d5aef82d2c63680967c5e2ec9

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

FROM ${MISE_IMAGE} AS tools
ARG TARGETPLATFORM
WORKDIR /app
COPY .mise/config.toml ./.mise/config.toml
ENV MISE_TRUSTED_CONFIG_PATHS=/app/.mise/config.toml
ENV MISE_DATA_DIR=/mise-data
RUN --mount=type=cache,id=mise-${TARGETPLATFORM},target=/mise-data \
    mise install restic && \
    cp "$(mise which restic)" /usr/local/bin/restic

FROM ${GOLANG_IMAGE} AS proxy
WORKDIR /src
COPY packages/restic-proxy/go.mod packages/restic-proxy/go.sum ./
RUN go mod download
COPY packages/restic-proxy/ ./
RUN CGO_ENABLED=0 go build -o /restic-proxy .

FROM ${NODE_IMAGE} AS builder
WORKDIR /build-stage
ENV PNPM_HOME=/pnpm-store
RUN apk add --no-cache bash python3 build-base && \
    npm install --global pnpm@10.28.1 && \
    pnpm config set store-dir "$PNPM_HOME"

COPY --from=manifests /src ./
RUN --mount=type=cache,id=pnpm-standalone,target=/pnpm-store \
    pnpm install --frozen-lockfile

COPY . ./
RUN --mount=type=cache,id=pnpm-standalone,target=/pnpm-store \
    pnpm --filter @futo-org/backups-api-client build && \
    pnpm --filter @futo-org/backups-orchestrator-api build && \
    pnpm --filter @futo-org/backups-orchestrator-ui build && \
    NODE_ENV=production pnpm --filter @futo-org/backups-standalone build && \
    pnpm --filter @futo-org/backups-standalone deploy /deploy --prod --legacy

FROM ${ALPINE_IMAGE}

WORKDIR /app

RUN apk add --no-cache libstdc++ dumb-init su-exec \
    && addgroup -g 1000 node && adduser -u 1000 -G node -s /bin/sh -D node

COPY --from=builder /usr/local/bin/node /usr/local/bin/
COPY --from=tools /usr/local/bin/restic /usr/local/bin/
COPY --from=proxy /restic-proxy /usr/local/bin/
COPY --from=builder /deploy ./
COPY --chmod=0755 packages/standalone-app/docker-entrypoint.sh /usr/local/bin/

# orchestration-api silently falls back to direct restic when restic-proxy is
# not an executable on PATH. An invalid LOG_LEVEL exits 3 before binding, so
# this proves the binary runs on this platform without starting the proxy.
RUN LOG_LEVEL=invalid restic-proxy; [ $? -eq 3 ]

RUN mkdir -p /data /cache && chown node:node /data /cache /app
VOLUME /data
VOLUME /cache

ENV NODE_ENV="production"
ENV YUCCA_STATE_PATH="/data"
ENV YUCCA_CACHE_PATH="/cache"
ENV YUCCA_UI_PATH="/app/build"
ENV HOST="0.0.0.0"
ENV PORT=22676
EXPOSE 22676

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD wget -q --spider "http://127.0.0.1:${PORT}/" || exit 1

ENTRYPOINT ["dumb-init", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
