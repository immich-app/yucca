import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsEntryResponseDto, SettingsListResponseDto } from 'src/dto/settings.dto';
import { SettingsRepository } from 'src/repositories/settings.repository';
import { TopologyRepository } from 'src/repositories/topology.repository';
import { configOverridesSchema, parseSettingsScope } from 'src/utils/settings';

@Injectable()
export class SettingsService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly topology: TopologyRepository,
  ) {}

  async list(): Promise<SettingsListResponseDto> {
    return { settings: await this.settings.list() };
  }

  async set(scope: string, value: unknown): Promise<SettingsEntryResponseDto> {
    this.validateScope(scope);

    const parsed = configOverridesSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
    }

    return { entry: await this.settings.set(scope, parsed.data) };
  }

  async delete(scope: string): Promise<void> {
    this.validateScope(scope);
    await this.settings.delete(scope);
  }

  private validateScope(scope: string): void {
    const parsed = parseSettingsScope(scope);
    if (!parsed) {
      throw new BadRequestException(`Invalid scope '${scope}' (expected 'global', 'site:<code>' or 'cluster:<code>')`);
    }

    if (parsed.kind === 'site' && !this.topology.hasSite(parsed.code)) {
      throw new BadRequestException(`Unknown site '${parsed.code}'`);
    }

    if (parsed.kind === 'cluster' && !this.topology.hasCluster(parsed.code)) {
      throw new BadRequestException(`Unknown cluster '${parsed.code}'`);
    }
  }
}
