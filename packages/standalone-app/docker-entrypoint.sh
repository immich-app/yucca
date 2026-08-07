#!/bin/sh
set -e

if [ "$(id -u)" = 0 ]; then
  chown node:node "${YUCCA_STATE_PATH:-/data}"
  exec su-exec node "$@"
fi

exec "$@"
