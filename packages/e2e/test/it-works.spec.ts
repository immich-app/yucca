import { version } from '@futo-org/restic-wrapper';
import { env } from 'src/env';

it('can connect to the restic API', async () => {
  await expect(fetch(`http://localhost:${env.RESTIC_API_PORT}`).then((response) => response.status)).resolves.toBe(404);
});

it('can connect to the yucca API', async () => {
  await expect(fetch(`http://localhost:${env.YUCCA_API_PORT}`).then((response) => response.status)).resolves.toBe(404);
});

it('can connect to the orchestrator API', async () => {
  await expect(fetch(`http://localhost:22676`).then((response) => response.status)).resolves.toBe(404);
});

it('can load restic', async () => {
  await expect(version).resolves.toEqual(
    expect.objectContaining({
      version: '0.19.1',
    }),
  );
});
