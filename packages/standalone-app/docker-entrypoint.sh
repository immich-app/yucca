#!/bin/sh
set -e

if [ "$(id -u)" = 0 ]; then
  chown node:node "${YUCCA_STATE_PATH:-/data}" "${YUCCA_CACHE_PATH:-/cache}"
  exec su-exec node "$@"
fi

exec "$@"
