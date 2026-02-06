import { env } from '@common/server/env';
import { KyselyConfig } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import postgres, { Notice } from 'postgres';

export const getKyselyConfig = (
  options: Partial<postgres.Options<Record<string, postgres.PostgresType>>> = {},
): KyselyConfig => {
  return {
    dialect: new PostgresJSDialect({
      postgres: postgres({
        onnotice: (notice: Notice) => {
          if (notice['severity'] !== 'NOTICE') {
            console.warn('Postgres notice:', notice);
          }
        },
        connection: {
          TimeZone: 'UTC',
        },
        host: env.POSTGRES_HOST,
        port: env.POSTGRES_PORT,
        username: env.POSTGRES_USERNAME,
        password: env.POSTGRES_PASSWORD,
        database: env.POSTGRES_DATABASE,
        ssl: env.POSTGRES_SSL,
        ...options,
      }),
    }),
    log(event) {
      if (event.level === 'error') {
        console.error('Query failed:', {
          durationMs: event.queryDurationMillis,
          error: event.error,
          sql: event.query.sql,
          params: event.query.parameters,
        });
      }
    },
  };
};
