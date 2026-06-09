# michael Docker image

ARG ALPINE_VERSION=3.23@sha256:c05ba4b73604069d376c4f41346b05374335b5ca0c46fb6dfede5a59f5196931

FROM golang:1.25-alpine${ALPINE_VERSION} AS builder
WORKDIR /app

COPY packages/michael/go.mod packages/michael/go.sum ./
RUN go mod download

COPY packages/michael/ ./
RUN CGO_ENABLED=0 go build -o /michael .

FROM alpine:${ALPINE_VERSION}

RUN apk add --no-cache dumb-init \
    && addgroup -g 1000 michael && adduser -u 1000 -G michael -s /bin/sh -D michael

USER michael

COPY --from=builder /michael /usr/local/bin/michael

ENV RESTIC_API_PORT=8080
EXPOSE 8080
CMD ["dumb-init", "michael"]
