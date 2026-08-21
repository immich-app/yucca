# michael Docker image

ARG ALPINE_VERSION=3.23
# Pinned alpine runtime base. NOTE: this digest is alpine:3.23's, so it must NOT
# be appended to the node/golang base tags (which reuse ${ALPINE_VERSION}).
ARG ALPINE_IMAGE=alpine:3.23@sha256:fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40

FROM golang:1.27-alpine${ALPINE_VERSION} AS dev
WORKDIR /src
# air is pinned: @latest broke the build when v1.67.2 started requiring a newer
# Go than this base image ships (bump air and the golang tag together).
RUN apk add --no-cache bash restic && \
    go install github.com/air-verse/air@v1.67.1
COPY packages/michael/go.mod packages/michael/go.sum ./
RUN go mod download
COPY packages/michael/ ./
EXPOSE 3010
CMD ["air", "-c", ".air.toml"]

FROM golang:1.27-alpine${ALPINE_VERSION} AS builder
WORKDIR /app

COPY packages/michael/go.mod packages/michael/go.sum ./
RUN go mod download

COPY packages/michael/ ./
RUN CGO_ENABLED=0 go build -o /michael .

# IP->ASN database, for labelling traffic with its source network. Baked in
# rather than fetched at pod start: the data plane must not gain a boot-time
# dependency on a third-party host. DB-IP's free ASN database is MaxMind-DB
# format (what internal/geoip reads) and needs no license key, but the monthly
# file has no "latest" alias — so try this month, then last month, in case the
# build runs before the new one is published.
#
# A miss is deliberately NOT fatal: michael starts, logs a warning, and reports
# every source network as "unknown". Blocking every michael deploy on db-ip.com
# being reachable would be the wrong trade.
#
# Contains information from the DB-IP IP to ASN Lite database, licensed CC BY 4.0
# <https://db-ip.com/db/download/ip-to-asn-lite>.
FROM ${ALPINE_IMAGE} AS asndb
RUN apk add --no-cache curl
RUN set -eu; \
    year=$(date -u +%Y); month=$(date -u +%m); \
    prev=$(( ${month#0} - 1 )); prev_year=$year; \
    if [ "$prev" -eq 0 ]; then prev=12; prev_year=$(( year - 1 )); fi; \
    : > /asn.mmdb; \
    for stamp in "$year-$month" "$(printf '%s-%02d' "$prev_year" "$prev")"; do \
      if curl -fsS "https://download.db-ip.com/free/dbip-asn-lite-$stamp.mmdb.gz" | gunzip > /asn.mmdb; then \
        echo "ASN database: dbip-asn-lite-$stamp"; \
        exit 0; \
      fi; \
      : > /asn.mmdb; \
    done; \
    echo "WARNING: no ASN database available; michael will not attribute traffic to source networks" >&2

FROM ${ALPINE_IMAGE}

RUN apk add --no-cache dumb-init \
    && addgroup -g 1000 michael && adduser -u 1000 -G michael -s /bin/sh -D michael

USER michael

COPY --from=builder /michael /usr/local/bin/michael
COPY --from=asndb /asn.mmdb /etc/michael/asn.mmdb

ENV RESTIC_API_PORT=8080
EXPOSE 8080
CMD ["dumb-init", "michael"]
