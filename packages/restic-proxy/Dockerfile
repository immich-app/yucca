ARG ALPINE_VERSION=3.23
ARG ALPINE_IMAGE=alpine:3.23@sha256:fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40

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
