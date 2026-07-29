// Fallbacks so specs that don't touch RGW (e.g. the revocation reconcile, which
// needs only Postgres + Redis) can import src/env without real RADOS credentials.
// Real values from the environment always win — the RGW spec still requires them
// (the mise task only runs it when RADOS_* are set).
process.env.RADOS_ENDPOINT ??= 'http://localhost:9';
process.env.RADOS_ACCESS_KEY_ID ??= 'unused';
process.env.RADOS_SECRET_ACCESS_KEY ??= 'unused';
process.env.YUCCA_METRICS_WORKER_PORT ??= '3040';
process.env.POSTGRES_HOST ??= 'localhost';
process.env.POSTGRES_PORT ??= '15432';
process.env.POSTGRES_USERNAME ??= 'postgres';
process.env.POSTGRES_PASSWORD ??= 'postgres';
process.env.POSTGRES_DATABASE ??= 'yucca';
process.env.REDIS_URL ??= 'redis://localhost:6379';
