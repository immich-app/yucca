import { createRepository } from '@futo-org/backups-api-client';
import { ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { describeResticApi } from 'src/restic-api.suite';
import { loginWithIdp, yuccaBaseUrl } from 'src/yucca-auth';

const READY_FD = 3;

type ResticProxy = { child: ChildProcess; address: string };

async function startResticProxy(): Promise<ResticProxy> {
  const child = spawn('restic-proxy', {
    env: {
      ...process.env,
      RESTIC_PROXY_API_URL: `${yuccaBaseUrl}/api`,
      RESTIC_PROXY_PORT: '0',
      RESTIC_PROXY_READY_FD: String(READY_FD),
    },
    stdio: ['ignore', 'inherit', 'inherit', 'pipe'],
  });

  const [line] = await once(createInterface({ input: child.stdio[READY_FD] as Readable }), 'line');
  const { address } = JSON.parse(line as string) as { address: string };

  return { child, address };
}

async function createProxiedRepository(
  proxy: ResticProxy,
  accessToken: string | undefined,
  name: string,
  worm: boolean,
) {
  const { repository } = await createRepository(
    { name, worm },
    { baseUrl: yuccaBaseUrl, headers: { Cookie: `yucca-access-token=${accessToken}` } },
  );

  return `rest:http://${repository.id}:${accessToken}@${proxy.address}`;
}

export function describeResticProxy(name: string, writeOnce: boolean, sub: string) {
  let proxy: ResticProxy;
  let accessToken: string | undefined;

  beforeAll(async () => {
    accessToken = await loginWithIdp(sub);
    proxy = await startResticProxy();
  });

  afterAll(() => {
    proxy?.child.kill();
  });

  describeResticApi(name, writeOnce, (worm) =>
    createProxiedRepository(proxy, accessToken, `${sub}-${worm ? 'worm' : 'plain'}`, worm),
  );
}
