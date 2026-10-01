ARG ALPINE_VERSION=3.23
# Pinned alpine runtime base. NOTE: this digest is alpine:3.23's, so it must NOT
# be appended to the golang base tag (which reuses ${ALPINE_VERSION}).
ARG ALPINE_IMAGE=alpine:3.24@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6

FROM golang:1.27-alpine${ALPINE_VERSION} AS builder
WORKDIR /app

COPY packages/columbo/go.mod packages/columbo/go.sum ./
RUN go mod download

COPY packages/columbo/ ./
RUN CGO_ENABLED=0 go build -o /columbo .

FROM ${ALPINE_IMAGE}

RUN apk add --no-cache dumb-init \
    && addgroup -g 1000 columbo && adduser -u 1000 -G columbo -s /bin/sh -D columbo

USER columbo

COPY --from=builder /columbo /usr/local/bin/columbo

ENV COLUMBO_PORT=3060
EXPOSE 3060
CMD ["dumb-init", "columbo"]
