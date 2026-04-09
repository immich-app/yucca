import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InternalEvent } from '../enum';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';

@Injectable()
export class ModuleConfigRepository {
  private lock = false;
  private config: ModuleConfig;

  constructor(
    @Inject(ModuleConfigProvider) initial: ModuleConfig,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.config = { ...initial };
  }

  get(): ModuleConfig {
    return this.config;
  }

  update(partial: Partial<ModuleConfig>) {
    this.config = { ...this.config, ...partial };
    this.eventEmitter.emit(InternalEvent.ModuleConfigUpdated, this.config);
  }

  acquireLock() {
    this.lock = true;
  }

  hasLock() {
    return this.lock || !this.config.requireLock;
  }
}
