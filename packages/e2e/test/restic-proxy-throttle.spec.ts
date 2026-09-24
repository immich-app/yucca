import { backup, init } from '@futo-org/restic-wrapper';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProxiedRepository, startResticProxy } from 'src/restic-proxy.suite';
import { loginWithIdp } from 'src/yucca-auth';

const password = 'password';
const bytesPerSec = 128 * 1024;
const fileSize = 1024 * 1024;
const burst = 32 * 1024;
const throttledFloorMs = ((fileSize - burst) / bytesPerSec) * 1000;

describe('restic proxy throttle (e2e)', () => {
  let accessToken: string | undefined;
  let file: string;

  beforeAll(async () => {
    accessToken = await loginWithIdp('restic-proxy-throttle-e2e');

    const workingDir = await mkdtemp(join(tmpdir(), 'restic-throttle-e2e-'));
    file = join(workingDir, 'incompressible');
    await writeFile(file, randomBytes(fileSize));
  });

  async function timeBackup(name: string, throttle: Record<string, string>) {
    const proxy = await startResticProxy(throttle);

    try {
      const repoUrl = await createProxiedRepository(proxy, accessToken, name, false);
      await init().repository(repoUrl).password(password).run();

      const startedAt = performance.now();
      await backup().repository(repoUrl).password(password).addFile(file).run();
      return performance.now() - startedAt;
    } finally {
      proxy.child.kill();
    }
  }

  it('paces uploads to the configured rate', async () => {
    const elapsedMs = await timeBackup('throttled', {
      RESTIC_PROXY_THROTTLE_BYTES_PER_SEC: String(bytesPerSec),
    });

    expect(elapsedMs).toBeGreaterThanOrEqual(throttledFloorMs);
  }, 30_000);

  it('uploads at full speed inside the quiet hours', async () => {
    const elapsedMs = await timeBackup('quiet-hours', {
      RESTIC_PROXY_THROTTLE_BYTES_PER_SEC: String(bytesPerSec),
      RESTIC_PROXY_THROTTLE_QUIET_HOURS: '00:00-00:00',
    });

    expect(elapsedMs).toBeLessThan(throttledFloorMs);
  }, 30_000);
});
