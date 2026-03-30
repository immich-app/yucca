import { Injectable } from '@nestjs/common';
import { IntegrationsResponseDto } from '../dto/integrations.dto';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';

@Injectable()
export class IntegrationsService {
  constructor(private readonly moduleConfig: ModuleConfigRepository) {}

  getIntegrationsConfig(): IntegrationsResponseDto {
    const { immichIntegration } = this.moduleConfig.get();

    return {
      immich: immichIntegration,
    };
  }
}
