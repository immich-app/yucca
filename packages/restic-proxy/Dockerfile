ARG ALPINE_VERSION=3.23
ARG ALPINE_IMAGE=alpine:3.24@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6

FROM golang:1.27-alpine${ALPINE_VERSION} AS builder
WORKDIR /app

COPY packages/restic-proxy/go.mod packages/restic-proxy/go.sum ./
RUN go mod download

COPY packages/restic-proxy/ ./
RUN CGO_ENABLED=0 go build -o /restic-proxy .

FROM ${ALPINE_IMAGE}

RUN apk add --no-cache dumb-init \
    && addgroup -g 1000 restic-proxy && adduser -u 1000 -G restic-proxy -s /bin/sh -D restic-proxy

USER restic-proxy

COPY --from=builder /restic-proxy /usr/local/bin/restic-proxy

ENV RESTIC_PROXY_HOST=0.0.0.0
ENV RESTIC_PROXY_PORT=1434
ENV LOG_FORMAT=json

EXPOSE 1434
CMD ["dumb-init", "restic-proxy"]
