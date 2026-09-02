ARG ALPINE_IMAGE=alpine:3.23@sha256:fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40
ARG NODE_IMAGE=node:25-alpine3.23@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4
ARG MISE_IMAGE=ghcr.io/jdx/mise:2026.7.18@sha256:ed804bc4b6c6c8db9bbd0883e489db17b70c4a4ee2ef60b1841c43d295ff430e
ARG GOLANG_IMAGE=golang:1.27-alpine3.23@sha256:4441ef16de1cbb69a44ab7c3cadc2c4b85d6e63494a4c0df252c5aae6204b865

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

RUN mkdir -p /data && chown node:node /data /app
VOLUME /data

ENV NODE_ENV="production"
ENV YUCCA_STATE_PATH="/data"
ENV YUCCA_UI_PATH="/app/build"
ENV HOST="0.0.0.0"
ENV PORT=22676
EXPOSE 22676

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD wget -q --spider "http://127.0.0.1:${PORT}/" || exit 1

ENTRYPOINT ["dumb-init", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
