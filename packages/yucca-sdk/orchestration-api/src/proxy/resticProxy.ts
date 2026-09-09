import { ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, constants } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { Readable } from 'node:stream';

const RESTIC_PROXY_BIN = 'restic-proxy';
const RESTIC_PROXY_READY_FD = 3;
const RESTIC_PROXY_READY_TIMEOUT_MS = 10_000;

type ResticProxyReady = {
  address: string;
  port: number;
};

export class ResticProxy {
  private constructor(
    readonly address: string,
    readonly port: number,
    readonly process: ChildProcess,
  ) {}

  static async isAvailable(): Promise<boolean> {
    for (const directory of (process.env.PATH ?? '').split(delimiter)) {
      try {
        await access(join(directory, RESTIC_PROXY_BIN), constants.X_OK);
        return true;
      } catch {
        continue;
      }
    }

    return false;
  }

  static async create(apiUrl: string): Promise<ResticProxy> {
    const child = spawn(RESTIC_PROXY_BIN, {
      env: {
        ...process.env,
        RESTIC_PROXY_API_URL: apiUrl,
        RESTIC_PROXY_PORT: '0',
        RESTIC_PROXY_READY_FD: String(RESTIC_PROXY_READY_FD),
      },
      stdio: ['ignore', 'inherit', 'inherit', 'pipe'],
    });

    try {
      const { address, port } = await readReady(child);
      return new ResticProxy(address, port, child);
    } catch (error) {
      child.kill();
      throw error;
    }
  }

  createUrl(repositoryId: string, accessToken: string) {
    return `rest:http://${repositoryId}:${accessToken}@${this.address}`;
  }
}

async function readReady(child: ChildProcess): Promise<ResticProxyReady> {
  const pipe = child.stdio[RESTIC_PROXY_READY_FD] as Readable;
  const settled = new AbortController();
  const signal = AbortSignal.any([settled.signal, AbortSignal.timeout(RESTIC_PROXY_READY_TIMEOUT_MS)]);

  try {
    const chunks: Buffer[] = await Promise.race([pipe.toArray({ signal }), rejectOnSpawnError(child, signal)]);
    if (chunks.length === 0) {
      throw new Error(`${RESTIC_PROXY_BIN} exited before reporting an address`);
    }

    return JSON.parse(Buffer.concat(chunks).toString()) as ResticProxyReady;
  } catch (error) {
    throw new Error(`${RESTIC_PROXY_BIN} did not report an address`, { cause: error });
  } finally {
    settled.abort();
  }
}

async function rejectOnSpawnError(child: ChildProcess, signal: AbortSignal): Promise<never> {
  const [error] = await once(child, 'error', { signal });
  throw error;
}
