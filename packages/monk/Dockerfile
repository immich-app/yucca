ARG ALPINE_VERSION=3.23
# The runtime base is the cluster's own ceph image, not alpine: monk execs the
# ceph CLI, and the mon hosts already hold every layer of this base for the
# cluster daemons, so the pull cost is only the binary layer. Bump together
# with the cluster ceph version (ansible ceph_upgrade_target_image).
ARG CEPH_IMAGE=quay.io/ceph/ceph:v20.2.2@sha256:6b4b5ae33acd3d736eb26d2a19238bce71a22f9cfb99cca887ba6312d0957644

FROM golang:1.27-alpine${ALPINE_VERSION} AS builder
WORKDIR /app

COPY packages/monk/go.mod packages/monk/go.sum ./
RUN go mod download

COPY packages/monk/ ./
RUN CGO_ENABLED=0 go build -o /monk .

FROM ${CEPH_IMAGE}

USER ceph

COPY --from=builder /monk /usr/local/bin/monk

EXPOSE 9284
ENTRYPOINT ["/usr/local/bin/monk"]
