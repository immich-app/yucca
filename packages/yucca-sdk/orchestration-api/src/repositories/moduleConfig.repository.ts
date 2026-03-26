import { Inject, Injectable } from '@nestjs/common';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';

@Injectable()
export class ModuleConfigRepository {
  private config: ModuleConfig;

  constructor(@Inject(ModuleConfigProvider) initial: ModuleConfig) {
    this.config = { ...initial };
  }

  get(): ModuleConfig {
    return this.config;
  }

  update(partial: Partial<ModuleConfig>) {
    this.config = { ...this.config, ...partial };
  }
}
