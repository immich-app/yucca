import env from '@common/server/env';
import { version } from '@futo-org/restic-wrapper';

it('can connect to the restic API', async () => {
  await expect(fetch(`http://localhost:${env.RESTIC_API_PORT}`).then((response) => response.status)).resolves.toBe(404);
});

it('can load restic', async () => {
  await expect(version).resolves.toEqual(
    expect.objectContaining({
      version: '0.18.0',
    }),
  );
});
