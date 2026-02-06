import { Kysely, sql } from 'kysely';
import { getKyselyConfig } from 'src/utils/database';

const getDatabaseClient = () => {
  return new Kysely<any>(getKyselyConfig());
};

const runQuery = async (query: string) => {
  const db = getDatabaseClient();
  const result = await sql.raw(query).execute(db);
  await db.destroy();
  return result;
};

runQuery('SELECT 1;').then(console.info).catch(console.error);
