import { ResticProxy } from './resticProxy';

export class ResticProxyPool {
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
}
