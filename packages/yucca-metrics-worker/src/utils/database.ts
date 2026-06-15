import { KyselyConfig } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import postgres, { Notice } from 'postgres';
import { env } from 'src/env';

export const getKyselyConnectionParameters = () => ({
  connectionType: 'parts' as const,
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  username: env.POSTGRES_USERNAME,
  password: env.POSTGRES_PASSWORD,
  database: env.POSTGRES_DATABASE,
});

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
        ...getKyselyConnectionParameters(),
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
