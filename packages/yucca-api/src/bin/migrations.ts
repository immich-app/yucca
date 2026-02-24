import '../schema';

import { schemaDiff, schemaFromCode, schemaFromDatabase } from '@immich/sql-tools';
import { writeFile } from 'node:fs/promises';
import { getKyselyConnectionParameters } from 'src/utils/database';

const compare = async () => {
  const source = schemaFromCode({ overrides: true, namingStrategy: 'default' });
  const target = await schemaFromDatabase({
    connection: getKyselyConnectionParameters(),
  });

  console.log(source.warnings.join('\n'));

  const up = schemaDiff(source, target, {
    tables: { ignoreExtra: true },
    functions: { ignoreExtra: false },
    parameters: { ignoreExtra: true },
  });

  const down = schemaDiff(target, source, {
    tables: { ignoreExtra: false, ignoreMissing: true },
    functions: { ignoreExtra: false },
    extensions: { ignoreMissing: true },
    parameters: { ignoreMissing: true },
  });

  return { up, down };
};

const asMigration = (up: string[], down: string[]) => {
  const upSql = up.map((sql) => `  await sql\`${sql}\`.execute(db);`).join('\n');
  const downSql = down.map((sql) => `  await sql\`${sql}\`.execute(db);`).join('\n');

  return `import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
${upSql}
}

export async function down(db: Kysely<any>): Promise<void> {
${downSql}
}
`;
};

async function debug(notice = true) {
  const { up, down } = await compare();

  if (up.items.length === 0) {
    console.info('No changes.');
    return;
  }

  const migration = asMigration(up.asSql(), down.asSql());

  console.info(migration);
  console.info(
    'Migration actions:\n' +
      up
        .asHuman()
        .map((x) => `- ${x}`)
        .join('\n'),
  );

  console.info(
    '\nRollback actions:\n' +
      down
        .asHuman()
        .map((x) => `- ${x}`)
        .join('\n'),
  );

  if (notice) {
    console.info('\nRun `mise yucca-api:migrations save <name>` to save new migration.');
  }

  return migration;
}

async function save() {
  const migration = await debug(false);
  if (!migration) {
    return;
  }

  const now = new Date();
  const filename = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}-${process.argv[3]}.ts`;

  await writeFile(`src/schema/migrations/${filename}`, migration);
  console.info('\nWrote migration to file.');
}

if (process.argv[2] === 'save' && process.argv[3]) {
  void save();
} else {
  void debug();
}
