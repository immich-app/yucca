ARG ALPINE_VERSION=3.23

FROM node:25-alpine${ALPINE_VERSION} AS builder
WORKDIR /build
RUN npm install -g pnpm@10.28.1

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/mock-oidc-provider/package.json ./packages/mock-oidc-provider/
RUN pnpm install --frozen-lockfile --filter mock-oidc-provider

COPY packages/mock-oidc-provider ./packages/mock-oidc-provider
RUN pnpm --filter mock-oidc-provider build
RUN pnpm --filter mock-oidc-provider deploy /deploy --prod --legacy

FROM node:25-alpine${ALPINE_VERSION}
WORKDIR /usr/src/app
COPY --from=builder /deploy ./
USER node
ENV NODE_ENV=production
EXPOSE 80
CMD ["node", "dist/index.js"]
