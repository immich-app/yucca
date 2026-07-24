# michael Docker image

ARG ALPINE_VERSION=3.23
# Pinned alpine runtime base. NOTE: this digest is alpine:3.23's, so it must NOT
# be appended to the node/golang base tags (which reuse ${ALPINE_VERSION}).
ARG ALPINE_IMAGE=alpine:3.23@sha256:5b10f432ef3da1b8d4c7eb6c487f2f5a8f096bc91145e68878dd4a5019afde11

FROM golang:1.25-alpine${ALPINE_VERSION} AS dev
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

FROM golang:1.25-alpine${ALPINE_VERSION} AS builder
WORKDIR /app

COPY packages/michael/go.mod packages/michael/go.sum ./
RUN go mod download

COPY packages/michael/ ./
RUN CGO_ENABLED=0 go build -o /michael .

FROM ${ALPINE_IMAGE}

RUN apk add --no-cache dumb-init \
    && addgroup -g 1000 michael && adduser -u 1000 -G michael -s /bin/sh -D michael

USER michael

COPY --from=builder /michael /usr/local/bin/michael

ENV RESTIC_API_PORT=8080
EXPOSE 8080
CMD ["dumb-init", "michael"]
