import { Injectable } from '@nestjs/common';
import { ConfigResponseDto, ConfigUpdateRequestDto } from '../dto/config.dto';
import { UNTHROTTLED } from '../proxy/resticProxy';
import { ConfigRepository } from '../repositories/config.repository';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';

@Injectable()
export class ConfigService {
  constructor(
    private readonly config: ConfigRepository,
    private readonly moduleConfig: ModuleConfigRepository,
  ) {}

  async bootstrap() {
    const stored = await this.config.getThrottle();
    if (!stored) {
      return;
    }

    this.moduleConfig.update({ throttle: stored });
  }

  getConfig(): ConfigResponseDto {
    return { bandwidth: this.moduleConfig.get().throttle ?? UNTHROTTLED };
  }

  async updateConfig({ bandwidth }: ConfigUpdateRequestDto): Promise<ConfigResponseDto> {
    await this.config.setThrottle(bandwidth);
    this.moduleConfig.update({ throttle: bandwidth });

    return { bandwidth };
  }
}
