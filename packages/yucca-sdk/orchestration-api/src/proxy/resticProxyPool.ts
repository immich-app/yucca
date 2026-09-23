import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InternalEvent } from '../enum';
import type { ModuleConfig } from '../moduleConfig';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';
import { ResticProxy, ResticProxyThrottle, UNTHROTTLED } from './resticProxy';

@Injectable()
export class ResticProxyPool implements OnApplicationBootstrap, OnApplicationShutdown {
  static pool = new Map<string, Promise<ResticProxy>>();
  static available: Promise<boolean> | undefined;
  static throttle: ResticProxyThrottle = UNTHROTTLED;

  constructor(private readonly moduleConfig?: ModuleConfigRepository) {}

  onApplicationBootstrap() {
    ResticProxyPool.throttle = this.moduleConfig?.get().throttle ?? UNTHROTTLED;
  }

  isAvailable(): Promise<boolean> {
    ResticProxyPool.available ??= ResticProxy.isAvailable();
    return ResticProxyPool.available;
  }

  getProxy(apiUrl: string): Promise<ResticProxy> {
    const existing = ResticProxyPool.pool.get(apiUrl);
    if (existing) {
      return existing;
    }

    const pending = ResticProxy.create(apiUrl, ResticProxyPool.throttle).then((proxy) => {
      proxy.process.once('exit', () => ResticProxyPool.pool.delete(apiUrl));
      return proxy;
    });

    pending.catch(() => ResticProxyPool.pool.delete(apiUrl));

    ResticProxyPool.pool.set(apiUrl, pending);
    return pending;
  }

  @OnEvent(InternalEvent.ModuleConfigUpdated)
  async onModuleConfigUpdate({ throttle }: ModuleConfig) {
    ResticProxyPool.throttle = throttle ?? UNTHROTTLED;

    const running = await this.running();
    for (const proxy of running) {
      proxy.throttle(ResticProxyPool.throttle);
    }
  }

  async onApplicationShutdown() {
    const running = await this.running();
    await Promise.all(running.map((proxy) => proxy.stop()));
  }

  private async running(): Promise<ResticProxy[]> {
    const outcomes = await Promise.allSettled(ResticProxyPool.pool.values());
    return outcomes.filter((outcome) => outcome.status === 'fulfilled').map((outcome) => outcome.value);
  }
}
