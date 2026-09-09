import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ResticProxy } from './resticProxy';

@Injectable()
export class ResticProxyPool implements OnApplicationShutdown {
  static pool = new Map<string, Promise<ResticProxy>>();
  static available: Promise<boolean> | undefined;

  isAvailable(): Promise<boolean> {
    ResticProxyPool.available ??= ResticProxy.isAvailable();
    return ResticProxyPool.available;
  }

  getProxy(apiUrl: string): Promise<ResticProxy> {
    const existing = ResticProxyPool.pool.get(apiUrl);
    if (existing) {
      return existing;
    }

    const pending = ResticProxy.create(apiUrl).then((proxy) => {
      proxy.process.once('exit', () => ResticProxyPool.pool.delete(apiUrl));
      return proxy;
    });

    pending.catch(() => ResticProxyPool.pool.delete(apiUrl));

    ResticProxyPool.pool.set(apiUrl, pending);
    return pending;
  }

  async onApplicationShutdown() {
    const outcomes = await Promise.allSettled(ResticProxyPool.pool.values());
    const running = outcomes.filter((outcome) => outcome.status === 'fulfilled').map((outcome) => outcome.value);
    await Promise.all(running.map((proxy) => proxy.stop()));
  }
}
