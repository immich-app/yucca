#!/bin/sh
set -e

# ensure correct permissions on data directory
if [ "$(id -u)" = 0 ]; then
  chown node:node "${YUCCA_STATE_PATH:-/data}"
  exec su-exec node "$@"
fi

exec "$@"
